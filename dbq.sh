#!/bin/sh
# dbq.sh — jalankan query langsung ke Postgres MugaMind tanpa docker exec.
# Contoh:
#   ./dbq.sh "select count(*) from pengguna;"
#   ./dbq.sh "select email, peran from pengguna limit 5;"
#   ./dbq.sh            (masuk psql interaktif)
#   ./dbq.sh -f seed.sql
set -e
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PW=$(grep -m1 '^POSTGRES_PASSWORD=' "$DIR/.env" 2>/dev/null | cut -d= -f2-)
PW=${PW:-bemai_lokal_dev}
if [ $# -eq 0 ]; then
  exec env PGPASSWORD="$PW" psql -h 127.0.0.1 -p 5434 -U bemai -d bemai
fi
exec env PGPASSWORD="$PW" psql -h 127.0.0.1 -p 5434 -U bemai -d bemai -c "$@"
