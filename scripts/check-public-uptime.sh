#!/usr/bin/env bash
# Privacy-safe public availability checks for ReloGo's deployed web surfaces.

set -euo pipefail

LANDING_BASE_URL="${LANDING_BASE_URL:-https://relogo-two.vercel.app}"
ADMIN_BASE_URL="${ADMIN_BASE_URL:-https://relo-go.vercel.app}"

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
