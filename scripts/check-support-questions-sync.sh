#!/usr/bin/env bash
# Verify the mobile and Edge copies of the privacy-safe support allowlist match.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/mobile/lib/supportQuestions.ts"
EDGE="$ROOT/supabase/functions/support-ai/supportQuestions.ts"
MIGRATIONS="$ROOT/supabase/migrations"
# grep, not rg: GitHub's runners do not ship ripgrep, so an rg-based check
# aborts with "command not found" and never actually compares anything.
MIGRATION="$(grep -l -- '-- SUPPORT_QUESTIONS_SQL_START' \
  "$MIGRATIONS"/*.sql | sort | tail -n 1)"

extract_allowlist() {
  awk '
    /\/\/ SUPPORT_QUESTIONS_START/ { in_block = 1 }
    in_block { print }
    /\/\/ SUPPORT_QUESTIONS_END/ { exit }
  ' "$1"
}

mobile_block="$(extract_allowlist "$MOBILE")"
edge_block="$(extract_allowlist "$EDGE")"

if [[ -z "$mobile_block" || -z "$edge_block" || -z "$MIGRATION" ]]; then
  echo "ERROR: support question markers are missing." >&2
  exit 1
fi

if diff -u \
  -L "mobile/lib/supportQuestions.ts" \
  -L "supabase/functions/support-ai/supportQuestions.ts" \
  <(printf '%s\n' "$mobile_block") \
  <(printf '%s\n' "$edge_block"); then
  echo "OK: mobile and Edge support questions are byte-identical."
else
  echo "ERROR: support question allowlists have drifted." >&2
  exit 1
fi

ts_values="$(printf '%s\n' "$mobile_block" | sed -n 's/^  "\(.*\)",$/\1/p')"
sql_values="$(awk '
  /-- SUPPORT_QUESTIONS_SQL_START/ { in_block = 1; next }
  /-- SUPPORT_QUESTIONS_SQL_END/ { exit }
  in_block { print }
' "$MIGRATION" | sed -n "s/^[[:space:]]*'\\(.*\\)'[,]\{0,1\}$/\\1/p")"

if [[ -z "$ts_values" || -z "$sql_values" ]]; then
  echo "ERROR: could not extract TypeScript or SQL support questions." >&2
  exit 1
fi

if diff -u \
  -L "mobile/Edge support questions" \
  -L "latest database support questions" \
  <(printf '%s\n' "$ts_values") \
  <(printf '%s\n' "$sql_values"); then
  echo "OK: database support questions match mobile and Edge exactly."
else
  echo "ERROR: the latest database support questions have drifted." >&2
  exit 1
fi
