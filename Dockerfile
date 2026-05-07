# Stage 1: Build React frontend inside Docker (no pre-built folder needed)
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# REACT_APP_* vars are baked into the bundle at build time — must be ARG here
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
RUN NODE_OPTIONS=--max-old-space-size=4096 npm run build

# Stage 2: Production image
FROM node:18-alpine
RUN apk add --no-cache nginx supervisor

COPY nginx-combined.conf /etc/nginx/nginx.conf

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server/ ./server/

# Copy built frontend from Stage 1
COPY --from=builder /app/build/ /usr/share/nginx/html

COPY supervisord.conf /etc/supervisord.conf
RUN mkdir -p /etc/supervisor.d
RUN mkdir -p /var/log/supervisor /var/log/nginx /var/run/nginx && \
    chown -R node:node /app /var/log/supervisor /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
