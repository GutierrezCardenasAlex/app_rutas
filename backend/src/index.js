import cors from "cors";
import express from "express";
import pool from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
const DIRECT_DESTINATION_RADIUS_METERS = 300;
const WALK_ONLY_RADIUS_METERS = 700;
const FINAL_WALK_RADIUS_METERS = 900;
const SINGLE_ROUTE_PREFERRED_FINAL_WALK_METERS = 900;
const ROUTE_ACCESS_RADIUS_METERS = 900;
const TRANSFER_WARNING_RADIUS_METERS = 650;
const TRANSFER_SEARCH_RADIUS_METERS = 1200;
const MAX_ITINERARY_VEHICLES = 3;

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a, b) {
  const earthRadius = 6371000;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function projectPointOnSegment(point, start, end) {
  const referenceLat = toRadians((point.lat + start.lat + end.lat) / 3);
  const scale = Math.cos(referenceLat);
  const px = point.lng * scale;
  const py = point.lat;
  const ax = start.lng * scale;
  const ay = start.lat;
  const bx = end.lng * scale;
  const by = end.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));

  return {
    lat: start.lat + (end.lat - start.lat) * t,
    lng: start.lng + (end.lng - start.lng) * t,
    t,
  };
}

function nearestPointOnRoute(route, point) {
  const coordinates = route.geometry?.coordinates || [];
  let best = null;

  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = { lng: coordinates[index][0], lat: coordinates[index][1] };
    const end = { lng: coordinates[index + 1][0], lat: coordinates[index + 1][1] };
    const projected = projectPointOnSegment(point, start, end);
    const distance = distanceMeters(point, projected);
    const fraction = coordinates.length <= 2 ? projected.t : (index + projected.t) / (coordinates.length - 1);

    if (!best || distance < best.distance_meters) {
      best = {
        point: projected,
        fraction,
        distance_meters: Math.round(distance),
      };
    }
  }

  return best || { point, fraction: 0, distance_meters: Number.POSITIVE_INFINITY };
}

function nearestRoutesPoint(firstRoute, secondRoute) {
  const firstCoordinates = firstRoute.geometry?.coordinates || [];
  const secondCoordinates = secondRoute.geometry?.coordinates || [];
  let best = null;

  for (const coordinate of firstCoordinates) {
    const firstPoint = { lng: coordinate[0], lat: coordinate[1] };
    const nearestOnSecond = nearestPointOnRoute(secondRoute, firstPoint);

    if (!best || nearestOnSecond.distance_meters < best.distance_meters) {
      best = {
        first_point: firstPoint,
        second_point: nearestOnSecond.point,
        distance_meters: nearestOnSecond.distance_meters,
      };
    }
  }

  for (const coordinate of secondCoordinates) {
    const secondPoint = { lng: coordinate[0], lat: coordinate[1] };
    const nearestOnFirst = nearestPointOnRoute(firstRoute, secondPoint);

    if (!best || nearestOnFirst.distance_meters < best.distance_meters) {
      best = {
        first_point: nearestOnFirst.point,
        second_point: secondPoint,
        distance_meters: nearestOnFirst.distance_meters,
      };
    }
  }

  return best || {
    first_point: { lat: 0, lng: 0 },
    second_point: { lat: 0, lng: 0 },
    distance_meters: Number.POSITIVE_INFINITY,
  };
}

function buildRouteLeg(route, boardFraction, alightFraction) {
  return {
    route_id: route.id,
    linea_display: route.linea_display,
    linea_operativa: route.linea_operativa,
    sentido: route.sentido,
    nombre: route.nombre,
    descripcion: route.descripcion,
    referencias: route.referencias,
    reference_points: route.reference_points || [],
    geometry: route.geometry,
    board_fraction: boardFraction,
    alight_fraction: alightFraction,
  };
}

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function requireAdminAuth(req, res, next) {
  const headerPassword = req.headers["x-admin-password"];

  if (!headerPassword || headerPassword !== adminPassword) {
    return res.status(401).json({ error: "Contrasena de administrador invalida." });
  }

  next();
}

function normalizeReferences(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeReferencePoints(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      nombre: String(item?.nombre || "").trim(),
      lat: Number(item?.lat),
      lng: Number(item?.lng),
    }))
    .filter((item) => item.nombre && Number.isFinite(item.lat) && Number.isFinite(item.lng));
}

async function saveReferencePoints(client, routeId, referencePoints) {
  await client.query("DELETE FROM ruta_referencias WHERE ruta_id = $1", [routeId]);

  for (const point of referencePoints) {
    await client.query(
      `
        INSERT INTO ruta_referencias (ruta_id, nombre, geom)
        VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326))
      `,
      [routeId, point.nombre, point.lng, point.lat]
    );
  }
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
      referencias TEXT[] DEFAULT '{}',
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

    CREATE TABLE IF NOT EXISTS ruta_referencias (
      id SERIAL PRIMARY KEY,
      ruta_id INTEGER NOT NULL REFERENCES rutas(id) ON DELETE CASCADE,
      nombre TEXT NOT NULL,
      geom GEOMETRY(POINT, 4326) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS ruta_referencias_geom_idx
      ON ruta_referencias
      USING GIST (geom);

    CREATE INDEX IF NOT EXISTS ruta_referencias_nombre_idx
      ON ruta_referencias
      USING BTREE (LOWER(nombre));
  `);

  await pool.query(`
    ALTER TABLE rutas
    ADD COLUMN IF NOT EXISTS linea_display TEXT,
    ADD COLUMN IF NOT EXISTS linea_operativa TEXT,
    ADD COLUMN IF NOT EXISTS sentido TEXT,
    ADD COLUMN IF NOT EXISTS referencias TEXT[] DEFAULT '{}';
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
          COALESCE(r.referencias, '{}') AS referencias,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', rr.id,
                  'nombre', rr.nombre,
                  'lat', ST_Y(rr.geom),
                  'lng', ST_X(rr.geom)
                )
                ORDER BY rr.id ASC
              )
              FROM ruta_referencias rr
              WHERE rr.ruta_id = r.id
            ),
            '[]'::json
          ) AS reference_points,
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
          COALESCE(r.referencias, '{}') AS referencias,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', rr.id,
                  'nombre', rr.nombre,
                  'lat', ST_Y(rr.geom),
                  'lng', ST_X(rr.geom)
                )
                ORDER BY rr.id ASC
              )
              FROM ruta_referencias rr
              WHERE rr.ruta_id = r.id
            ),
            '[]'::json
          ) AS reference_points,
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

app.get("/references", async (req, res) => {
  const query = String(req.query.q || "").trim();

  try {
    const params = [];
    const whereClause = query ? "WHERE LOWER(rr.nombre) LIKE LOWER($1)" : "";

    if (query) {
      params.push(`%${query}%`);
    }

    const { rows } = await pool.query(
      `
        SELECT
          rr.id,
          rr.nombre,
          ST_Y(rr.geom) AS lat,
          ST_X(rr.geom) AS lng,
          r.id AS route_id,
          r.linea_display,
          r.linea_operativa,
          r.sentido,
          r.nombre AS route_nombre,
          r.descripcion,
          COALESCE(r.referencias, '{}') AS referencias,
          ST_AsGeoJSON(rg.geom)::json AS geometry
        FROM ruta_referencias rr
        JOIN rutas r ON r.id = rr.ruta_id
        JOIN rutas_geometria rg ON rg.ruta_id = r.id
        ${whereClause}
        ORDER BY LOWER(rr.nombre), r.linea_display, r.linea_operativa
        LIMIT 80
      `,
      params
    );

    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron buscar referencias.", details: error.message });
  }
});

app.get("/routes/plan", async (req, res) => {
  const { originLat, originLng, destLat, destLng } = req.query;
  const originLatitude = Number(originLat);
  const originLongitude = Number(originLng);
  const destinationLatitude = Number(destLat);
  const destinationLongitude = Number(destLng);

  if (
    !Number.isFinite(originLatitude) ||
    !Number.isFinite(originLongitude) ||
    !Number.isFinite(destinationLatitude) ||
    !Number.isFinite(destinationLongitude)
  ) {
    return res.status(400).json({
      error: "Los parametros originLat, originLng, destLat y destLng son obligatorios.",
    });
  }

  try {
    const origin = { lat: originLatitude, lng: originLongitude };
    const destination = { lat: destinationLatitude, lng: destinationLongitude };
    const { rows: routes } = await pool.query(
      `
        SELECT
          r.id,
          r.linea_display,
          r.linea_operativa,
          r.sentido,
          r.nombre,
          r.descripcion,
          COALESCE(r.referencias, '{}') AS referencias,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'id', rr.id,
                  'nombre', rr.nombre,
                  'lat', ST_Y(rr.geom),
                  'lng', ST_X(rr.geom)
                )
                ORDER BY rr.id ASC
              )
              FROM ruta_referencias rr
              WHERE rr.ruta_id = r.id
            ),
            '[]'::json
          ) AS reference_points,
          ST_AsGeoJSON(rg.geom)::json AS geometry
        FROM rutas r
        JOIN rutas_geometria rg ON rg.ruta_id = r.id
      `
    );

    const measuredRoutes = routes
      .map((route) => {
        const originMeasure = nearestPointOnRoute(route, origin);
        const destinationMeasure = nearestPointOnRoute(route, destination);

        return {
          ...route,
          origin_distance_meters: originMeasure.distance_meters,
          destination_distance_meters: destinationMeasure.distance_meters,
          origin_fraction: originMeasure.fraction,
          destination_fraction: destinationMeasure.fraction,
        };
      })
      .filter((route) => Number.isFinite(route.origin_distance_meters) && Number.isFinite(route.destination_distance_meters));

    const direct = measuredRoutes
      .filter(
        (route) =>
          route.origin_distance_meters <= ROUTE_ACCESS_RADIUS_METERS &&
          route.destination_distance_meters <= DIRECT_DESTINATION_RADIUS_METERS
      )
      .sort(
        (first, second) =>
          first.origin_distance_meters +
          first.destination_distance_meters -
          (second.origin_distance_meters + second.destination_distance_meters)
      )
      .slice(0, 3)
      .map((route) => ({
        type: "direct",
        ...route,
      }));

    const originRoutes = measuredRoutes.filter((route) => route.origin_distance_meters <= ROUTE_ACCESS_RADIUS_METERS);
    const destinationRoutes = measuredRoutes.filter((route) => route.destination_distance_meters <= FINAL_WALK_RADIUS_METERS);

    const transfers = [];

    for (const firstRoute of originRoutes) {
      for (const secondRoute of destinationRoutes) {
        if (firstRoute.id === secondRoute.id || firstRoute.linea_operativa === secondRoute.linea_operativa) {
          continue;
        }

        const transfer = nearestRoutesPoint(firstRoute, secondRoute);

        if (!Number.isFinite(transfer.distance_meters) || transfer.distance_meters > TRANSFER_SEARCH_RADIUS_METERS) {
          continue;
        }

        const firstTransfer = nearestPointOnRoute(firstRoute, transfer.first_point);
        const secondTransfer = nearestPointOnRoute(secondRoute, transfer.second_point);
        const score =
          firstRoute.origin_distance_meters +
          secondRoute.destination_distance_meters +
          transfer.distance_meters;

        transfers.push({
          type: "transfer",
          first_route_id: firstRoute.id,
          first_linea_display: firstRoute.linea_display,
          first_linea_operativa: firstRoute.linea_operativa,
          first_sentido: firstRoute.sentido,
          first_nombre: firstRoute.nombre,
          first_descripcion: firstRoute.descripcion,
          first_referencias: firstRoute.referencias,
          origin_distance_meters: firstRoute.origin_distance_meters,
          first_geometry: firstRoute.geometry,
          second_route_id: secondRoute.id,
          second_linea_display: secondRoute.linea_display,
          second_linea_operativa: secondRoute.linea_operativa,
          second_sentido: secondRoute.sentido,
          second_nombre: secondRoute.nombre,
          second_descripcion: secondRoute.descripcion,
          second_referencias: secondRoute.referencias,
          destination_distance_meters: secondRoute.destination_distance_meters,
          second_geometry: secondRoute.geometry,
          transfer_distance_meters: transfer.distance_meters,
          transfer_point: {
            type: "Point",
            coordinates: [transfer.first_point.lng, transfer.first_point.lat],
          },
          first_transfer_fraction: firstTransfer.fraction,
          second_transfer_fraction: secondTransfer.fraction,
          destination_fraction: secondRoute.destination_fraction,
          transfer_is_close: transfer.distance_meters <= TRANSFER_WARNING_RADIUS_METERS,
          score_meters: Math.round(score),
        });
      }
    }

    const transferRows = transfers.sort((first, second) => first.score_meters - second.score_meters).slice(0, 5);
    const destinationCandidates = measuredRoutes.filter(
      (route) => route.destination_distance_meters <= FINAL_WALK_RADIUS_METERS
    );
    const transferCache = new Map();
    const getTransfer = (firstRoute, secondRoute) => {
      const key = `${firstRoute.id}:${secondRoute.id}`;

      if (!transferCache.has(key)) {
        const transfer = nearestRoutesPoint(firstRoute, secondRoute);
        const firstTransfer = nearestPointOnRoute(firstRoute, transfer.first_point);
        const secondTransfer = nearestPointOnRoute(secondRoute, transfer.second_point);

        transferCache.set(key, {
          distance_meters: transfer.distance_meters,
          point: {
            type: "Point",
            coordinates: [transfer.first_point.lng, transfer.first_point.lat],
          },
          from_fraction: firstTransfer.fraction,
          to_fraction: secondTransfer.fraction,
          is_close: transfer.distance_meters <= TRANSFER_WARNING_RADIUS_METERS,
        });
      }

      return transferCache.get(key);
    };

    const routeToDestinationLeg = (route, boardFraction = route.origin_fraction) =>
      buildRouteLeg(route, boardFraction, route.destination_fraction);
    const itineraries = [];
    const itineraryByKey = new Map();
    const walkingDistanceToDestination = Math.round(distanceMeters(origin, destination));
    const vehiclePenaltyMeters = 260;

    const buildWalkSegments = ({ originWalk = 0, transferWalks = [], finalWalk = 0 }) =>
      [
        originWalk > 0
          ? {
              type: "boarding",
              label: "Camina hasta donde pasa la primera linea",
              distance_meters: Math.round(originWalk),
            }
          : null,
        ...transferWalks.map((distance, index) => ({
          type: "transfer",
          label: `Camina al punto para tomar la siguiente linea ${index + 1}`,
          distance_meters: Math.round(distance),
        })),
        finalWalk > 0
          ? {
              type: "final",
              label: "Camina desde la ultima parada hasta el destino",
              distance_meters: Math.round(finalWalk),
            }
          : null,
      ].filter(Boolean);

    const addItinerary = (itinerary) => {
      const key = itinerary.route_ids.length > 0 ? itinerary.route_ids.join(">") : "walk";
      const current = itineraryByKey.get(key);

      if (!current || itinerary.score_meters < current.score_meters) {
        itineraryByKey.set(key, {
          ...itinerary,
          score_meters: Math.round(itinerary.score_meters),
        });
      }
    };

    if (walkingDistanceToDestination <= WALK_ONLY_RADIUS_METERS) {
      addItinerary({
        type: "walk",
        vehicle_count: 0,
        route_ids: [],
        title: "Camina al destino",
        legs: [],
        transfers: [],
        walk_segments: buildWalkSegments({ finalWalk: walkingDistanceToDestination }),
        destination_distance_meters: 0,
        score_meters: walkingDistanceToDestination,
      });
    }

    for (const route of direct) {
      addItinerary({
        type: "direct",
        vehicle_count: 1,
        route_ids: [route.id],
        title: `Toma ${route.linea_display}`,
        legs: [routeToDestinationLeg(route)],
        transfers: [],
        walk_segments: buildWalkSegments({
          originWalk: route.origin_distance_meters,
          finalWalk: route.destination_distance_meters,
        }),
        destination_distance_meters: route.destination_distance_meters,
        score_meters: route.origin_distance_meters + route.destination_distance_meters + vehiclePenaltyMeters,
      });
    }

    for (const route of originRoutes) {
      if (route.destination_distance_meters <= DIRECT_DESTINATION_RADIUS_METERS) {
        continue;
      }

      if (route.destination_distance_meters > FINAL_WALK_RADIUS_METERS) {
        continue;
      }

      addItinerary({
        type: "ride_walk",
        vehicle_count: 1,
        route_ids: [route.id],
        title: `Toma ${route.linea_display} y camina al destino`,
        legs: [routeToDestinationLeg(route)],
        transfers: [],
        walk_segments: buildWalkSegments({
          originWalk: route.origin_distance_meters,
          finalWalk: route.destination_distance_meters,
        }),
        destination_distance_meters: route.destination_distance_meters,
        score_meters: route.origin_distance_meters + route.destination_distance_meters + vehiclePenaltyMeters,
      });
    }

    const hasPreferredSimpleOption = [...itineraryByKey.values()].some(
      (itinerary) =>
        itinerary.vehicle_count === 0 ||
        (itinerary.vehicle_count === 1 &&
          itinerary.destination_distance_meters <= SINGLE_ROUTE_PREFERRED_FINAL_WALK_METERS)
    );

    if (!hasPreferredSimpleOption) {
      for (const firstRoute of originRoutes) {
        for (const secondRoute of destinationCandidates) {
          if (firstRoute.id === secondRoute.id || firstRoute.linea_operativa === secondRoute.linea_operativa) {
            continue;
          }

          const transfer = getTransfer(firstRoute, secondRoute);

          if (!Number.isFinite(transfer.distance_meters) || transfer.distance_meters > TRANSFER_SEARCH_RADIUS_METERS) {
            continue;
          }

          addItinerary({
            type: "multi",
            vehicle_count: 2,
            route_ids: [firstRoute.id, secondRoute.id],
            title: `Toma ${firstRoute.linea_display} y luego ${secondRoute.linea_display}`,
            legs: [
              buildRouteLeg(firstRoute, firstRoute.origin_fraction, transfer.from_fraction),
              routeToDestinationLeg(secondRoute, transfer.to_fraction),
            ],
            transfers: [transfer],
            walk_segments: buildWalkSegments({
              originWalk: firstRoute.origin_distance_meters,
              transferWalks: [transfer.distance_meters],
              finalWalk: secondRoute.destination_distance_meters,
            }),
            destination_distance_meters: secondRoute.destination_distance_meters,
            score_meters:
              firstRoute.origin_distance_meters +
              transfer.distance_meters +
              secondRoute.destination_distance_meters +
              vehiclePenaltyMeters * 2,
          });
        }
      }

      for (const firstRoute of originRoutes) {
        for (const middleRoute of measuredRoutes) {
          if (firstRoute.id === middleRoute.id || firstRoute.linea_operativa === middleRoute.linea_operativa) {
            continue;
          }

          const firstTransfer = getTransfer(firstRoute, middleRoute);

          if (
            !Number.isFinite(firstTransfer.distance_meters) ||
            firstTransfer.distance_meters > TRANSFER_SEARCH_RADIUS_METERS
          ) {
            continue;
          }

          for (const finalRoute of destinationCandidates) {
            const routeIds = new Set([firstRoute.id, middleRoute.id, finalRoute.id]);
            const lineNames = new Set([
              firstRoute.linea_operativa,
              middleRoute.linea_operativa,
              finalRoute.linea_operativa,
            ]);

            if (routeIds.size < MAX_ITINERARY_VEHICLES || lineNames.size < MAX_ITINERARY_VEHICLES) {
              continue;
            }

            const secondTransfer = getTransfer(middleRoute, finalRoute);

            if (
              !Number.isFinite(secondTransfer.distance_meters) ||
              secondTransfer.distance_meters > TRANSFER_SEARCH_RADIUS_METERS
            ) {
              continue;
            }

            addItinerary({
              type: "multi",
              vehicle_count: 3,
              route_ids: [firstRoute.id, middleRoute.id, finalRoute.id],
              title: `Toma ${firstRoute.linea_display}, luego ${middleRoute.linea_display} y luego ${finalRoute.linea_display}`,
              legs: [
                buildRouteLeg(firstRoute, firstRoute.origin_fraction, firstTransfer.from_fraction),
                buildRouteLeg(middleRoute, firstTransfer.to_fraction, secondTransfer.from_fraction),
                routeToDestinationLeg(finalRoute, secondTransfer.to_fraction),
              ],
              transfers: [firstTransfer, secondTransfer],
              walk_segments: buildWalkSegments({
                originWalk: firstRoute.origin_distance_meters,
                transferWalks: [firstTransfer.distance_meters, secondTransfer.distance_meters],
                finalWalk: finalRoute.destination_distance_meters,
              }),
              destination_distance_meters: finalRoute.destination_distance_meters,
              score_meters:
                firstRoute.origin_distance_meters +
                firstTransfer.distance_meters +
                secondTransfer.distance_meters +
                finalRoute.destination_distance_meters +
                vehiclePenaltyMeters * 3,
            });
          }
        }
      }
    }

    itineraries.push(...itineraryByKey.values());

    const itineraryRows = itineraries
      .sort((first, second) => first.score_meters - second.score_meters || first.vehicle_count - second.vehicle_count)
      .slice(0, 8);

    res.json({
      direct,
      transfers: transferRows,
      itineraries: itineraryRows,
      direct_destination_radius_meters: DIRECT_DESTINATION_RADIUS_METERS,
      walk_only_radius_meters: WALK_ONLY_RADIUS_METERS,
      final_walk_radius_meters: FINAL_WALK_RADIUS_METERS,
      single_route_preferred_final_walk_meters: SINGLE_ROUTE_PREFERRED_FINAL_WALK_METERS,
      route_access_radius_meters: ROUTE_ACCESS_RADIUS_METERS,
      transfer_warning_radius_meters: TRANSFER_WARNING_RADIUS_METERS,
      transfer_search_radius_meters: TRANSFER_SEARCH_RADIUS_METERS,
      max_itinerary_vehicles: MAX_ITINERARY_VEHICLES,
      counts: {
        direct: direct.length,
        transfers: transferRows.length,
        itineraries: itineraryRows.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "No se pudo calcular como llegar.", details: error.message });
  }
});

app.get("/admin/session", requireAdminAuth, (_req, res) => {
  res.json({ ok: true });
});

app.post("/admin/routes", requireAdminAuth, async (req, res) => {
  const { lineaDisplay, lineaOperativa, sentido, nombre, descripcion = "", referencias = [], referencePoints = [], geojson } = req.body;
  const normalizedReferences = normalizeReferences(referencias);
  const normalizedReferencePoints = normalizeReferencePoints(referencePoints);

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
        INSERT INTO rutas (linea_display, linea_operativa, sentido, nombre, descripcion, referencias)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, linea_display, linea_operativa, sentido, nombre, descripcion, referencias
      `,
      [lineaDisplay, lineaOperativa, sentido, nombre, descripcion, normalizedReferences]
    );

    await client.query(
      `
        INSERT INTO rutas_geometria (ruta_id, geom)
        VALUES ($1, ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))
      `,
      [routeResult.rows[0].id, JSON.stringify(geojson)]
    );

    await saveReferencePoints(client, routeResult.rows[0].id, normalizedReferencePoints);

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
  const { lineaDisplay, lineaOperativa, sentido, nombre, descripcion = "", referencias = [], referencePoints = [], geojson } = req.body;
  const normalizedReferences = normalizeReferences(referencias);
  const normalizedReferencePoints = normalizeReferencePoints(referencePoints);

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
          descripcion = $5,
          referencias = $6
        WHERE id = $7
        RETURNING id, linea_display, linea_operativa, sentido, nombre, descripcion, referencias
      `,
      [lineaDisplay, lineaOperativa, sentido, nombre, descripcion, normalizedReferences, routeId]
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

    await saveReferencePoints(client, routeId, normalizedReferencePoints);

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
