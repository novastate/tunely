#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma db push --skip-generate 2>&1 || echo "Migration warning (may be first run)"

echo "Starting application..."
exec node server.js
