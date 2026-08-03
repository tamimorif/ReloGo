"""Fast hosted-backend validation before the worker installs Chromium.

This intentionally performs only read calls. It catches a stale project URL,
an incompatible/rotated key, a missing schema, or a paused backend in seconds
instead of spending several minutes installing a browser first.
"""

import os
import sys
from urllib.parse import urlsplit

from supabase import create_client

EXPECTED_PRODUCTION_HOST = "yskknolxbxfxakgvrcmg.supabase.co"


def is_expected_production_url(value: str) -> bool:
    """Accept only the intended hosted production project origin."""
    try:
        parsed = urlsplit(value)
        return (
            parsed.scheme == "https"
            and parsed.hostname == EXPECTED_PRODUCTION_HOST
            and parsed.port is None
            and parsed.username is None
            and parsed.password is None
            and parsed.path in ("", "/")
            and not parsed.query
            and not parsed.fragment
        )
    except ValueError:
        return False


def main() -> int:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print("ERROR: worker Supabase configuration is missing", file=sys.stderr)
        return 1
    if not is_expected_production_url(url):
        print(
            "ERROR: worker Supabase URL is not the intended production project",
            file=sys.stderr,
        )
        return 1

    try:
        client = create_client(url.rstrip("/"), key)
        sources = (
            client.table("official_sources")
            .select("id", count="exact")
            .limit(1)
            .execute()
        )
        client.rpc(
            "resolve_corridor_rules",
            {
                "p_origin_province": "ON",
                "p_dest_province": "BC",
            },
        ).execute()
    except Exception:  # noqa: BLE001 - CLI boundary, sanitized below
        # Do not echo exception text: upstream clients may include request
        # headers or URLs. The hosted Actions log needs only a safe diagnosis.
        print(
            "ERROR: worker cannot authenticate to the expected ReloGo schema",
            file=sys.stderr,
        )
        return 1

    count = sources.count if sources.count is not None else "unknown"
    print(f"OK: worker backend/key/schema preflight passed ({count} sources)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
