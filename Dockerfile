# Same UniqueVocal app, not a second paid App.
# Only use if the existing UniqueVocal card can switch to Docker at 0 extra.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY deploy/timeweb/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/out /srv
EXPOSE 80 443
