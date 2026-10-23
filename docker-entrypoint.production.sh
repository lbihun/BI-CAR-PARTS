#!/bin/sh
set -e
mkdir -p /app/uploads
chown -R bicar:bicar /app/uploads || true
exec su-exec bicar "$@"
