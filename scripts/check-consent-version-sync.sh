#!/usr/bin/env bash
# Verify the mobile policy gate and latest database consent contract agree.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/mobile/lib/legalConsent.ts"
LANDING="$ROOT/landing/lib/legal.ts"
MIGRATIONS="$ROOT/supabase/migrations"
FOUNDATION="$MIGRATIONS/019_policy_reconsent.sql"

mobile_version="$(sed -n \
  's/^export const CURRENT_CONSENT_VERSION = "\([^"]*\)";$/\1/p' \
  "$MOBILE")"

landing_version="$(sed -n \
  's/^export const CURRENT_POLICY_VERSION = "\([^"]*\)";$/\1/p' \
  "$LANDING")"

contract_migration="$(rg -l '^-- CURRENT_CONSENT_VERSION: ' \
  "$MIGRATIONS"/*.sql | sort | tail -n 1)"

if [[ -z "$mobile_version" || -z "$landing_version" || -z "$contract_migration" ]]; then
  echo "ERROR: consent-version contract markers are missing." >&2
  exit 1
fi

declared_sql_version="$(sed -n \
  's/^-- CURRENT_CONSENT_VERSION: \([^[:space:]]*\)$/\1/p' \
  "$contract_migration")"

# Policy versions are implemented once, in current_policy_version(). Every
# trigger/RPC/RLS gate in the foundation migration must reference that function
# rather than carrying another literal that could drift.
implemented_sql_version="$(sed -n \
  "s/^[[:space:]]*SELECT '\([^']*\)'::TEXT$/\1/p" \
  "$contract_migration")"

if [[ -z "$declared_sql_version" || -z "$implemented_sql_version" ]]; then
  echo "ERROR: could not extract the database consent version." >&2
  exit 1
fi

if [[ "$implemented_sql_version" != "$declared_sql_version" ]]; then
  echo "ERROR: the latest consent migration declares one version but implements another." >&2
  exit 1
fi

for required_function in \
  enforce_user_profile_consent_integrity \
  has_current_policy_consent \
  get_policy_consent_state \
  accept_current_policies; do
  if ! rg -q "CREATE OR REPLACE FUNCTION public\.${required_function}" \
    "$FOUNDATION"; then
    echo "ERROR: consent foundation is missing ${required_function}()." >&2
    exit 1
  fi
done

if [[ "$(rg -c 'public\.current_policy_version\(\)' "$FOUNDATION")" -lt 9 ]]; then
  echo "ERROR: consent triggers, RPCs, or RLS gates no longer share the server-current version." >&2
  exit 1
fi

if [[ "$mobile_version" != "$declared_sql_version" ]]; then
  echo "ERROR: mobile and database consent versions have drifted." >&2
  echo "mobile:   $mobile_version" >&2
  echo "database: $declared_sql_version" >&2
  exit 1
fi

if [[ "$landing_version" != "$declared_sql_version" ]]; then
  echo "ERROR: published legal pages and database consent versions have drifted." >&2
  echo "landing:  $landing_version" >&2
  echo "database: $declared_sql_version" >&2
  exit 1
fi

echo "OK: mobile, legal pages, and database consent versions match ($mobile_version)."
