FROM nginx:1.27-alpine

COPY templates /etc/nginx/templates
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
