#!/bin/sh
set -e

# Railway injects PORT; default to 8080 if not set
export PORT=${PORT:-8080}

# Substitute $PORT into nginx config
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

exec /usr/bin/supervisord -c /etc/supervisord.conf
