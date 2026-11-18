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

# Production-only deps for the backend workspaces. admin's package.json is still copied because npm ci validates every workspace against the lockfile.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/
COPY packages/api/package.json packages/api/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/worker/package.json packages/worker/
RUN npm ci --omit=dev -w packages/api -w packages/worker -w packages/db -w packages/contracts

FROM node:24-slim AS app
WORKDIR /app
ENV NODE_ENV=production
# Whole /app, not just node_modules: npm may nest version-conflicting deps under packages/*/node_modules.
COPY --from=deps /app ./
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/db/migrations packages/db/migrations
COPY --from=build /app/packages/worker/dist packages/worker/dist
COPY --from=build /app/packages/api/dist packages/api/dist
# Read from disk at runtime by mockDataset.route.ts.
COPY --from=build /app/packages/api/mock-datasets packages/api/mock-datasets
USER node

FROM caddy:2 AS web
COPY --from=build /app/apps/admin/dist /srv/admin
COPY deploy/Caddyfile /etc/caddy/Caddyfile
