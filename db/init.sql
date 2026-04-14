CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS rutas (
  id SERIAL PRIMARY KEY,
  linea_display TEXT NOT NULL,
  linea_operativa TEXT NOT NULL,
  sentido TEXT NOT NULL CHECK (sentido IN ('subida', 'bajada', 'ambos')),
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
