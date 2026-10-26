# syntax=docker/dockerfile:1
# BillWill API (Express 5 + TypeScript). Build context = the server/ folder.
# Coolify: Base Directory = /server, Dockerfile Location = /Dockerfile.

# ---- build: compile TypeScript (needs devDependencies) ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- deps: production-only node_modules ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- runtime ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=5001
WORKDIR /app
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist         ./dist
COPY package.json ./
USER node
EXPOSE 5001

# /api/ready returns 200 only when MongoDB is connected (503 otherwise).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5001)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
