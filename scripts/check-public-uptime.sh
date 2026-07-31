#!/usr/bin/env bash
# Privacy-safe public availability checks for ReloGo's deployed web surfaces.

set -euo pipefail

LANDING_BASE_URL="${LANDING_BASE_URL:-https://relogo-two.vercel.app}"
ADMIN_BASE_URL="${ADMIN_BASE_URL:-https://relo-go.vercel.app}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_PUBLIC_KEY="${SUPABASE_PUBLIC_KEY:-}"
REQUIRE_SUPABASE_CHECK="${REQUIRE_SUPABASE_CHECK:-false}"
EXPECTED_PRODUCTION_SUPABASE_URL="https://yskknolxbxfxakgvrcmg.supabase.co"

tmp_body="$(mktemp)"
trap 'rm -f "$tmp_body"' EXIT

check_page() {
  local url="$1"
  local expected_text="$2"

  curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --max-time 30 \
    --retry 2 \
    --retry-all-errors \
    --output "$tmp_body" \
    "$url"

  if ! grep -Fq "$expected_text" "$tmp_body"; then
    echo "ERROR: $url did not contain the expected public-page marker." >&2
    return 1
  fi

  echo "OK: $url"
}

check_page "$LANDING_BASE_URL/" "paperwork panic"
check_page "$LANDING_BASE_URL/privacy" "Privacy Policy"
check_page "$LANDING_BASE_URL/terms" "Terms of Service"
check_page "$LANDING_BASE_URL/support" "ReloGo Support"
check_page "$LANDING_BASE_URL/robots.txt" "Sitemap:"
check_page "$LANDING_BASE_URL/sitemap.xml" "$LANDING_BASE_URL"
check_page "$ADMIN_BASE_URL/" "ReloGo Admin"

check_supabase() {
  if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_PUBLIC_KEY" ]; then
    echo "ERROR: Supabase uptime configuration is missing." >&2
    return 1
  fi

  if [ "${SUPABASE_URL%/}" != "$EXPECTED_PRODUCTION_SUPABASE_URL" ]; then
    echo "ERROR: Supabase uptime URL is not the production project." >&2
    return 1
  fi

  curl \
    --fail \
    --silent \
    --show-error \
    --max-time 20 \
    --retry 2 \
    --retry-all-errors \
    --header "apikey: $SUPABASE_PUBLIC_KEY" \
    --output "$tmp_body" \
    "$SUPABASE_URL/auth/v1/settings"

  if ! grep -Eq '"anonymous_users"[[:space:]]*:[[:space:]]*true' "$tmp_body"; then
    echo "ERROR: anonymous mobile sign-in is unavailable." >&2
    return 1
  fi

  curl \
    --fail \
    --silent \
    --show-error \
    --max-time 20 \
    --retry 2 \
    --retry-all-errors \
    --request POST \
    --header "apikey: $SUPABASE_PUBLIC_KEY" \
    --header "Content-Type: application/json" \
    --data '{"p_origin_province":"ON","p_dest_province":"BC"}' \
    --output "$tmp_body" \
    "$SUPABASE_URL/rest/v1/rpc/resolve_corridor_rules"

  if ! grep -Fq '"task_key"' "$tmp_body"; then
    echo "ERROR: checklist resolver returned no task contract." >&2
    return 1
  fi

  echo "OK: $SUPABASE_URL mobile auth + checklist resolver"
}

if [ "$REQUIRE_SUPABASE_CHECK" = "true" ] ||
   [ -n "$SUPABASE_URL" ] ||
   [ -n "$SUPABASE_PUBLIC_KEY" ]; then
  check_supabase
fi
