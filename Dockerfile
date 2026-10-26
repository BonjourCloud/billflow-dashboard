# syntax=docker/dockerfile:1
# BillWill frontend (Vite SPA) served by nginx. Build context = repository root.
# Coolify: Base Directory = /, Dockerfile Location = /Dockerfile, Port = 80.

# ---- build ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# VITE_* values are compiled into the public bundle at build time, so they must
# be BUILD variables in Coolify (tick "Build Variable"). The production build
# fails fast if either one is missing or invalid (see vite.config.ts).
ARG VITE_API_URL
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_API_URL=$VITE_API_URL \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
RUN npm run build

# ---- serve ----
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/healthz || exit 1
