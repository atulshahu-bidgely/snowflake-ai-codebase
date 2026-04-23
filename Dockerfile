# Combined Dockerfile for Snowpark Container Services
# This runs both frontend (nginx) and backend (Node.js) in a single container using supervisord for process management
# NOTE: Build the React app locally BEFORE building this Docker image

FROM node:18-alpine

# Install nginx and supervisor
RUN apk add --no-cache nginx supervisor

# Set up nginx
COPY nginx-combined.conf /etc/nginx/nginx.conf

# Set up backend
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server/ ./server/

# Copy pre-built frontend (build locally before docker build)
COPY build/ /usr/share/nginx/html

# Create supervisor configuration
RUN mkdir -p /etc/supervisor.d
COPY supervisord.conf /etc/supervisord.conf

# Create necessary directories and set permissions
RUN mkdir -p /var/log/supervisor /var/log/nginx /var/run/nginx && \
    chown -R node:node /app /var/log/supervisor /usr/share/nginx/html

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start supervisor
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
