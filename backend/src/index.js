import cors from "cors";
import express from "express";
import pool from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/routes", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
        SELECT
          r.id,
          r.nombre,
          r.descripcion,
          ST_AsGeoJSON(rg.geom)::json AS geometry
        FROM rutas r
        JOIN rutas_geometria rg ON rg.ruta_id = r.id
        ORDER BY r.id DESC
      `
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron listar las rutas.", details: error.message });
  }
});

app.get("/routes/near", async (req, res) => {
  const { lat, lng } = req.query;
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: "Los parametros lat y lng son obligatorios." });
  }

  try {
    const { rows } = await pool.query(
      `
        SELECT
          r.id,
          r.nombre,
          r.descripcion,
          ROUND(
            ST_Distance(
              rg.geom::geography,
              ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            )
          ) AS distance_meters,
          ST_AsGeoJSON(rg.geom)::json AS geometry
        FROM rutas r
        JOIN rutas_geometria rg ON rg.ruta_id = r.id
        WHERE ST_DWithin(
          rg.geom::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
          500
        )
        ORDER BY distance_meters ASC, r.id DESC
      `,
      [longitude, latitude]
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron obtener las rutas cercanas.", details: error.message });
  }
});

app.post("/admin/routes", async (req, res) => {
  const { nombre, descripcion = "", geojson } = req.body;

  if (!nombre || !geojson) {
    return res.status(400).json({ error: "Los campos nombre y geojson son obligatorios." });
  }

  if (geojson.type !== "LineString" || !Array.isArray(geojson.coordinates) || geojson.coordinates.length < 2) {
    return res.status(400).json({ error: "La geometria debe ser un GeoJSON LineString valido." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const routeResult = await client.query(
      "INSERT INTO rutas (nombre, descripcion) VALUES ($1, $2) RETURNING id, nombre, descripcion",
      [nombre, descripcion]
    );

    await client.query(
      `
        INSERT INTO rutas_geometria (ruta_id, geom)
        VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))
      `,
      [routeResult.rows[0].id, JSON.stringify(geojson)]
    );

    await client.query("COMMIT");
    res.status(201).json(routeResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "No se pudo guardar la ruta.", details: error.message });
  } finally {
    client.release();
  }
});

app.listen(port, () => {
  console.log(`Backend escuchando en puerto ${port}`);
});
