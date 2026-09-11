#!/usr/bin/env bash
# Daily native database, source objects and encryption configuration backup.
set -euo pipefail
umask 077
exec 9>/run/burn-backup.lock
flock -n 9 || exit 1
backup_dir=$(mktemp -d /opt/burn/backup/capture.XXXXXX)
resume() {
  docker unpause burn2-api_server-1 burn2-background-1 >/dev/null 2>&1 || true
  rm -rf "$backup_dir"
}
trap resume EXIT
# Hold native writers while capturing the database and referenced source objects.
docker pause burn2-api_server-1 burn2-background-1 >/dev/null
docker exec burn2-relational_db-1 pg_dump -U postgres -d postgres -Fc > "$backup_dir/postgres.dump"
docker run --rm -v burn2_minio_data:/data:ro -v "$backup_dir:/backup" alpine:3.21 tar -czf /backup/objects.tgz -C /data .
cp -a /opt/burn/app/docs/subconscious/hosting/runtime "$backup_dir/runtime"
docker unpause burn2-api_server-1 burn2-background-1 >/dev/null
capture_name="daily/$(date -u +%Y-%m-%dT%H-%M-%SZ).tar.gz.enc"
tar -czf - -C "$backup_dir" . | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass file:/opt/burn/backup/encryption.key -out "$backup_dir.enc"
node --env-file=/opt/burn/backup/.env /opt/burn/backup/backup.mjs put "$backup_dir.enc" "$capture_name"
rm "$backup_dir.enc"
