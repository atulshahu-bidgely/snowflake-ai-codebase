# Multi-stage build for Railway deployment
# Stage 1: Build the React frontend
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN GENERATE_SOURCEMAP=false npm run build

# Stage 2: Production container with nginx + Node backend
FROM node:18-alpine

# Install nginx, supervisor, and gettext (for envsubst)
RUN apk add --no-cache nginx supervisor gettext

# Set up backend
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server/ ./server/

# Copy built frontend from Stage 1
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx config template and supervisord config
COPY nginx-combined.conf /etc/nginx/nginx.conf.template
COPY supervisord.conf /etc/supervisord.conf

# Copy startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Create necessary directories and set permissions
RUN mkdir -p /var/log/supervisor /var/log/nginx /var/run/nginx /etc/supervisor.d && \
    chown -R node:node /app /var/log/supervisor /usr/share/nginx/html

# Expose port (Railway routes to $PORT, defaulting to 8080)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-8080}/health || exit 1

CMD ["/docker-entrypoint.sh"]
