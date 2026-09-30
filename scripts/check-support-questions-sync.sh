#!/usr/bin/env bash
# Verify every marked copy of the privacy-safe support allowlist matches.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/mobile/lib/supportQuestions.ts"
EDGE="$ROOT/supabase/functions/support-ai/supportQuestions.ts"
MIGRATIONS="$ROOT/supabase/migrations"
# grep, not rg: GitHub's runners do not ship ripgrep, so an rg-based check
# aborts with "command not found" and never actually compares anything.
SQL_COPIES="$(grep -l -- '-- SUPPORT_QUESTIONS_SQL_START' \
  "$MIGRATIONS"/*.sql | sort || true)"

# These deployed migrations define the boundary. Removing their markers must
# fail the check, rather than silently removing a copy from discovery.
for required in 010_support_question_privacy_boundary.sql 019_policy_reconsent.sql; do
  if ! grep -q -- '-- SUPPORT_QUESTIONS_SQL_START' "$MIGRATIONS/$required"; then
    echo "ERROR: support question markers are missing in $required." >&2
    exit 1
  fi
done

extract_allowlist() {
  awk '
    /\/\/ SUPPORT_QUESTIONS_START/ { in_block = 1 }
    in_block { print }
    /\/\/ SUPPORT_QUESTIONS_END/ { exit }
  ' "$1"
}

mobile_block="$(extract_allowlist "$MOBILE")"
edge_block="$(extract_allowlist "$EDGE")"

if [[ -z "$mobile_block" || -z "$edge_block" || -z "$SQL_COPIES" ]]; then
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
if [[ -z "$ts_values" ]]; then
  echo "ERROR: could not extract TypeScript support questions." >&2
  exit 1
fi

while IFS= read -r migration; do
  if [[ "$(grep -c -- '-- SUPPORT_QUESTIONS_SQL_START' "$migration")" != 1 ||
        "$(grep -c -- '-- SUPPORT_QUESTIONS_SQL_END' "$migration")" != 1 ]]; then
    echo "ERROR: missing or duplicate SQL support markers in $migration." >&2
    exit 1
  fi
  sql_values="$(awk '
  /-- SUPPORT_QUESTIONS_SQL_START/ { in_block = 1; next }
  /-- SUPPORT_QUESTIONS_SQL_END/ { exit }
  in_block { print }
' "$migration" | sed -n "s/^[[:space:]]*'\\(.*\\)'[,]\{0,1\}$/\\1/p")"

  if [[ -z "$sql_values" ]]; then
    echo "ERROR: could not extract SQL support questions from $migration." >&2
    exit 1
  fi

  if diff -u \
    -L "mobile/Edge support questions" \
    -L "${migration#"$ROOT/"}" \
    <(printf '%s\n' "$ts_values") \
    <(printf '%s\n' "$sql_values"); then
    echo "OK: ${migration#"$ROOT/"} matches mobile and Edge exactly."
  else
    echo "ERROR: database support questions have drifted in $migration." >&2
    exit 1
  fi
done <<< "$SQL_COPIES"
