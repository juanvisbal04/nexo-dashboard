#!/usr/bin/env bash
# NEXO Shield 360 - manual, encrypted PostgreSQL backup.
# NEVER store a plaintext dump, DB URL, or age identity in GitHub.
set -Eeuo pipefail
umask 077

for executable in docker age date; do
  if ! command -v "$executable" >/dev/null 2>&1; then
    printf 'Missing dependency: %s\n' "$executable" >&2
    exit 2
  fi
done

: "${NEXO_DB_URL:?Set NEXO_DB_URL using a secure terminal prompt; never commit it}"
: "${NEXO_AGE_RECIPIENT:?Set NEXO_AGE_RECIPIENT to the public age recipient}"
if [[ ! "$NEXO_AGE_RECIPIENT" =~ ^age1[0-9a-z]{58}$ ]]; then
  echo "Invalid age recipient: expected an age1 public key" >&2
  exit 2
fi

output_dir="${1:-$HOME/nexo-shield-backups}"
mkdir -p -- "$output_dir"
chmod 700 -- "$output_dir"

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
output="$output_dir/nexo-db-$timestamp.dump.age"
partial="$output.partial"
test ! -e "$output" || { echo "Backup filename already exists" >&2; exit 2; }
trap 'rm -f -- "$partial"' EXIT

echo "Creating encrypted backup. No unencrypted dump is written to disk."
# A PostgreSQL 17 client matches NEXO Platform's major server version.
# Database credentials are transmitted only to the Docker process via env.
# Docker needs outbound network access to Supabase.
docker run --rm --env NEXO_DB_URL --env PGSSLMODE=require \
  --env PGCONNECT_TIMEOUT=15 postgres:17-alpine \
  sh -ec 'exec pg_dump --format=custom --no-owner --no-acl --dbname="$NEXO_DB_URL"' \
  | age -r "$NEXO_AGE_RECIPIENT" -o "$partial"

test -s "$partial"
mv -- "$partial" "$output"
if command -v sha256sum >/dev/null 2>&1; then
  (cd "$output_dir" && sha256sum "$(basename "$output")" > "$(basename "$output").sha256")
elif command -v shasum >/dev/null 2>&1; then
  (cd "$output_dir" && shasum -a 256 "$(basename "$output")" > "$(basename "$output").sha256")
else
  echo "Warning: checksum tool unavailable; encrypted archive still produced." >&2
fi
printf 'Encrypted backup created: %s\n' "$output"
printf 'NEXT: copy it to an access-controlled, off-device location and verify a restore.\n'
