#!/bin/sh
# Container entrypoint: restore the database from backup if the volume is empty, then run the app
# under Litestream so every change is replicated. Without backup settings, just run the app.
set -e

if [ -n "$LITESTREAM_BUCKET" ]; then
	litestream restore -config /etc/litestream.yml -if-db-not-exists -if-replica-exists "$DATABASE_PATH"
	exec litestream replicate -config /etc/litestream.yml -exec "node build"
fi

echo "LITESTREAM_BUCKET is not set: running WITHOUT backups" >&2
exec node build
