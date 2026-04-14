# Sistema de Movilidad (Trufis)

Proyecto MVP con React, Express, PostgreSQL/PostGIS y Docker para registrar y visualizar rutas de transporte publico informal de Potosi.

## Servicios

- `frontend`: interfaz React con mapa Leaflet y panel admin.
- `backend`: API Express para listar, guardar y consultar rutas cercanas.
- `db`: PostgreSQL con PostGIS e inicializacion automatica.

## Modelo de lineas

- `linea_display`: nombre visible del grupo de linea, por ejemplo `G-L`, `CH`, `010`.
- `linea_operativa`: linea concreta de la ruta dibujada, por ejemplo `G`, `L`, `CH`.
- `sentido`: `subida`, `bajada` o `ambos`.

## Ejecutar

```bash
docker-compose up --build
```

## URLs

- Frontend: `http://localhost:5173`
- Admin: `http://localhost:5173/admin`
- Backend: `http://localhost:3001`
