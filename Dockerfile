# Stage 1 — build the React frontend
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY public/ ./public/
COPY src/ ./src/
COPY tsconfig.json ./
COPY craco.config.js ./

# Empty string = relative URLs, Express serves from same origin
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL}

RUN GENERATE_SOURCEMAP=false npm run build

# Stage 2 — production image (Express serves API + static files)
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY server/ ./server/

# React build goes into /app/build so Express can find it at ../build
COPY --from=builder /app/build ./build

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "server/server.js"]
