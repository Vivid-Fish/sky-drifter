# ── Build stage ──────────────────────────────────────────────────
FROM node:22-alpine AS build
RUN apk add --no-cache bash python3
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN bash build.sh

# ── Runtime ──────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist/index.html /usr/share/nginx/html/index.html
EXPOSE 80
