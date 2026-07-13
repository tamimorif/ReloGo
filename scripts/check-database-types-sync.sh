#!/usr/bin/env bash
#
# Verifies the `export interface Database { ... }` block is byte-identical
# between mobile/types/database.ts and admin/src/types/database.ts.
#
# Each file intentionally carries app-specific helper types OUTSIDE the
# interface (PROVINCES / PII keys in mobile; AlertWithSource etc. in admin) —
# those may differ. Only the Database interface block is compared.
#
# Usage: bash scripts/check-database-types-sync.sh (from anywhere)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE="$ROOT/mobile/types/database.ts"
ADMIN="$ROOT/admin/src/types/database.ts"

# Print from `export interface Database {` through the first column-0 `}`.
extract_interface() {
  awk '
    /^export interface Database \{/ { in_block = 1 }
    in_block { print }
    in_block && /^\}/ { exit }
  ' "$1"
}

check_block() {
  local block="$1" file="$2"
  if [ -z "$block" ]; then
    echo "ERROR: could not find 'export interface Database {' in $file" >&2
    exit 1
  fi
  if [ "${block##*$'\n'}" != "}" ]; then
    echo "ERROR: Database interface block in $file has no closing '}' at column 0" >&2
    exit 1
  fi
}

MOBILE_BLOCK="$(extract_interface "$MOBILE")"
ADMIN_BLOCK="$(extract_interface "$ADMIN")"

check_block "$MOBILE_BLOCK" "$MOBILE"
check_block "$ADMIN_BLOCK" "$ADMIN"

if diff -u \
  -L "mobile/types/database.ts (Database interface)" \
  -L "admin/src/types/database.ts (Database interface)" \
  <(printf '%s\n' "$MOBILE_BLOCK") <(printf '%s\n' "$ADMIN_BLOCK"); then
  lines="$(printf '%s\n' "$MOBILE_BLOCK" | wc -l | tr -d ' ')"
  echo "OK: Database interface is byte-identical in mobile and admin ($lines lines)."
else
  echo "" >&2
  echo "ERROR: the Database interface has drifted between mobile/types/database.ts" >&2
  echo "and admin/src/types/database.ts. Apply the same schema change to BOTH files" >&2
  echo "(including table ordering) and re-run this script." >&2
  exit 1
fi
