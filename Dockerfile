# Stage 1 — build the React frontend
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY public/ ./public/
COPY src/ ./src/
COPY tsconfig.json ./
COPY craco.config.js ./

# Empty string = use same origin (nginx proxies /api/ to the backend)
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL}

RUN GENERATE_SOURCEMAP=false npm run build

# Stage 2 — production image (nginx + Node backend)
FROM node:18-alpine

RUN apk add --no-cache nginx supervisor

COPY nginx-combined.conf /etc/nginx/nginx.conf

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server/ ./server/

COPY --from=builder /app/build /usr/share/nginx/html

RUN mkdir -p /etc/supervisor.d
COPY supervisord.conf /etc/supervisord.conf

RUN mkdir -p /var/log/supervisor /var/log/nginx /var/run/nginx && \
    chown -R node:node /app /var/log/supervisor /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["/usr/bin/supervisord", "-c", "/etc/supervisord.conf"]
