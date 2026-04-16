#!/bin/sh
set -eu

if [ -z "${APP_DOMAIN:-}" ]; then
  echo "APP_DOMAIN no esta definido"
  exit 1
fi

CERT_DIR="/etc/letsencrypt/live/${APP_DOMAIN}"

if [ -f "${CERT_DIR}/fullchain.pem" ] && [ -f "${CERT_DIR}/privkey.pem" ]; then
  TEMPLATE="/etc/nginx/templates/https.conf.template"
  echo "Usando configuracion HTTPS para ${APP_DOMAIN}"
else
  TEMPLATE="/etc/nginx/templates/http.conf.template"
  echo "Certificado no encontrado para ${APP_DOMAIN}; iniciando solo en HTTP"
fi

envsubst '${APP_DOMAIN}' < "${TEMPLATE}" > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
