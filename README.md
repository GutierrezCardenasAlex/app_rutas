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
docker compose up --build
```

PostgreSQL se publica por defecto en el puerto `5433` del host para evitar choques con otros proyectos. Dentro de Docker el backend sigue usando `db:5432`.

Si necesitas otro puerto externo:

```bash
DB_PUBLIC_PORT=55432 docker compose up --build
```

## URLs

- App local con proxy: `http://localhost`
- Admin local: `http://localhost/#/admin`
- Backend por proxy: `http://localhost/api/health`

## HTTPS en VPS

Para geolocalizacion en produccion necesitas `HTTPS`. Let's Encrypt no emite certificados para una IP publica sola, asi que debes apuntar un dominio o subdominio a tu VPS y definir `APP_DOMAIN` antes de levantar Docker.

Ejemplo:

```bash
export APP_DOMAIN=rutas.tudominio.com
mkdir -p certbot/www certbot/conf
docker compose down --remove-orphans
docker volume rm app_rutas_certbot_webroot app_rutas_letsencrypt 2>/dev/null || true
docker compose up --build -d
```

Luego genera el certificado desde la VPS:

```bash
certbot certonly --webroot -w $(pwd)/certbot/www -d rutas.tudominio.com
docker compose restart nginx
```

Antes de eso debes hacer que el DNS del dominio apunte a la IP de tu VPS y abrir los puertos `80` y `443`.

## Nota de migracion

Si antes levantaste una version del proyecto que usaba los volumenes Docker `app_rutas_certbot_webroot` o `app_rutas_letsencrypt`, eliminarlos evita que Nginx siga leyendo una configuracion vieja. La version actual usa carpetas del proyecto:

- `./certbot/www`
- `./certbot/conf`
