# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ARG LITESTREAM_VERSION=0.3.13
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl \
	&& curl -fsSL "https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-v${LITESTREAM_VERSION}-linux-amd64.tar.gz" \
		| tar -xz -C /usr/local/bin litestream \
	&& apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY src/lib/server/db/migrations ./migrations
COPY litestream.yml /etc/litestream.yml
COPY scripts/start.sh ./start.sh

ENV NODE_ENV=production \
	PORT=3000 \
	DATABASE_PATH=/data/budget.db \
	MIGRATIONS_DIR=/app/migrations \
	BODY_SIZE_LIMIT=10M
EXPOSE 3000
CMD ["/app/start.sh"]
