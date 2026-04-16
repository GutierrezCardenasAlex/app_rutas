import cors from "cors";
import express from "express";
import pool from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function requireAdminAuth(req, res, next) {
  const headerPassword = req.headers["x-admin-password"];

  if (!headerPassword || headerPassword !== adminPassword) {
    return res.status(401).json({ error: "Contrasena de administrador invalida." });
  }

  next();
}

async function ensureSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS postgis;

    CREATE TABLE IF NOT EXISTS rutas (
      id SERIAL PRIMARY KEY,
      linea_display TEXT,
      linea_operativa TEXT,
      sentido TEXT,
      nombre TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS rutas_geometria (
      id SERIAL PRIMARY KEY,
      ruta_id INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
      geom GEOMETRY(LINESTRING, 4326) NOT NULL
    );

    CREATE INDEX IF NOT EXISTS rutas_geometria_geom_idx
      ON rutas_geometria
      USING GIST (geom);
  `);

  await pool.query(`
    ALTER TABLE rutas
    ADD COLUMN IF NOT EXISTS linea_display TEXT,
    ADD COLUMN IF NOT EXISTS linea_operativa TEXT,
    ADD COLUMN IF NOT EXISTS sentido TEXT;
  `);

  await pool.query(`
    UPDATE rutas
    SET
      linea_display = COALESCE(NULLIF(linea_display, ''), nombre),
      linea_operativa = COALESCE(NULLIF(linea_operativa, ''), nombre),
      sentido = COALESCE(NULLIF(sentido, ''), 'ambos');
  `);

  await pool.query(`
    ALTER TABLE rutas
    ALTER COLUMN linea_display SET NOT NULL,
    ALTER COLUMN linea_operativa SET NOT NULL,
    ALTER COLUMN sentido SET NOT NULL;
  `);

  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'rutas_sentido_check'
      ) THEN
        ALTER TABLE rutas
        ADD CONSTRAINT rutas_sentido_check
        CHECK (sentido IN ('subida', 'bajada', 'ambos'));
      END IF;
    END
    $$;
  `);
}

async function waitForDatabase(maxAttempts = 15, delayMs = 4000) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await ensureSchema();
      return;
    } catch (error) {
      lastError = error;
      console.warn(`Intento ${attempt}/${maxAttempts}: la base de datos aun no esta lista.`);

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

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
          r.linea_display,
          r.linea_operativa,
          r.sentido,
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
          r.linea_display,
          r.linea_operativa,
          r.sentido,
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

app.get("/admin/session", requireAdminAuth, (_req, res) => {
  res.json({ ok: true });
});

app.post("/admin/routes", requireAdminAuth, async (req, res) => {
  const { lineaDisplay, lineaOperativa, sentido, nombre, descripcion = "", geojson } = req.body;

  if (!lineaDisplay || !lineaOperativa || !sentido || !nombre || !geojson) {
    return res.status(400).json({
      error: "Los campos lineaDisplay, lineaOperativa, sentido, nombre y geojson son obligatorios.",
    });
  }

  if (geojson.type !== "LineString" || !Array.isArray(geojson.coordinates) || geojson.coordinates.length < 2) {
    return res.status(400).json({ error: "La geometria debe ser un GeoJSON LineString valido." });
  }

  if (!["subida", "bajada", "ambos"].includes(sentido)) {
    return res.status(400).json({ error: "El sentido debe ser subida, bajada o ambos." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const routeResult = await client.query(
      `
        INSERT INTO rutas (linea_display, linea_operativa, sentido, nombre, descripcion)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, linea_display, linea_operativa, sentido, nombre, descripcion
      `,
      [lineaDisplay, lineaOperativa, sentido, nombre, descripcion]
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

app.put("/admin/routes/:id", requireAdminAuth, async (req, res) => {
  const routeId = Number(req.params.id);
  const { lineaDisplay, lineaOperativa, sentido, nombre, descripcion = "", geojson } = req.body;

  if (!Number.isInteger(routeId)) {
    return res.status(400).json({ error: "El id de la ruta es invalido." });
  }

  if (!lineaDisplay || !lineaOperativa || !sentido || !nombre || !geojson) {
    return res.status(400).json({
      error: "Los campos lineaDisplay, lineaOperativa, sentido, nombre y geojson son obligatorios.",
    });
  }

  if (geojson.type !== "LineString" || !Array.isArray(geojson.coordinates) || geojson.coordinates.length < 2) {
    return res.status(400).json({ error: "La geometria debe ser un GeoJSON LineString valido." });
  }

  if (!["subida", "bajada", "ambos"].includes(sentido)) {
    return res.status(400).json({ error: "El sentido debe ser subida, bajada o ambos." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const routeResult = await client.query(
      `
        UPDATE rutas
        SET
          linea_display = $1,
          linea_operativa = $2,
          sentido = $3,
          nombre = $4,
          descripcion = $5
        WHERE id = $6
        RETURNING id, linea_display, linea_operativa, sentido, nombre, descripcion
      `,
      [lineaDisplay, lineaOperativa, sentido, nombre, descripcion, routeId]
    );

    if (routeResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "La ruta no existe." });
    }

    await client.query(
      `
        UPDATE rutas_geometria
        SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)
        WHERE ruta_id = $2
      `,
      [JSON.stringify(geojson), routeId]
    );

    await client.query("COMMIT");
    res.json(routeResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "No se pudo actualizar la ruta.", details: error.message });
  } finally {
    client.release();
  }
});

app.delete("/admin/routes/:id", requireAdminAuth, async (req, res) => {
  const routeId = Number(req.params.id);

  if (!Number.isInteger(routeId)) {
    return res.status(400).json({ error: "El id de la ruta es invalido." });
  }

  try {
    const result = await pool.query("DELETE FROM rutas WHERE id = $1 RETURNING id", [routeId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "La ruta no existe." });
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "No se pudo eliminar la ruta.", details: error.message });
  }
});

waitForDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Backend escuchando en puerto ${port}`);
    });
  })
  .catch((error) => {
    console.error("No se pudo inicializar la base de datos:", error);
    process.exit(1);
  });
