FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/
COPY packages/api/package.json packages/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/worker/package.json packages/worker/
RUN npm ci
COPY . .
# Explicit order: npm builds packages/* alphabetically, but api imports worker's dist.
RUN npm run build:packages && npm run build -w packages/api -w apps/admin

FROM node:24-slim AS app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
USER node

FROM caddy:2 AS web
COPY --from=build /app/apps/admin/dist /srv/admin
COPY deploy/Caddyfile /etc/caddy/Caddyfile
