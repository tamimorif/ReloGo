#!/usr/bin/env python3
"""Privacy-safe hosted Supabase smoke test using only a public client key.

The test creates one anonymous account, verifies the consent gate, and removes
the account through the same deletion RPC exposed to the mobile app. Response
bodies, identifiers, tokens, and keys are never printed.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


def request_json(
    url: str,
    public_key: str,
    *,
    method: str = "GET",
    token: str | None = None,
    body: object | None = None,
    extra_headers: dict[str, str] | None = None,
    timeout: int = 20,
) -> object:
    headers = {"apikey": public_key}
    if extra_headers:
        headers.update(extra_headers)
    payload = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        headers["Content-Type"] = "application/json"
        payload = json.dumps(body).encode("utf-8")

    request = urllib.request.Request(
        url,
        data=payload,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"hosted smoke request failed with HTTP {error.code}") from None
    except urllib.error.URLError:
        raise RuntimeError("hosted smoke request could not reach the backend") from None

    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        raise RuntimeError("hosted smoke request returned invalid JSON") from None


def main() -> int:
    base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    public_key = os.environ.get("SUPABASE_PUBLIC_KEY", "").strip()
    check_support_ai = os.environ.get("CHECK_SUPPORT_AI", "false") == "true"
    if not base_url.startswith("https://") or not public_key:
        print("ERROR: hosted smoke configuration is missing or unsafe", file=sys.stderr)
        return 1

    token: str | None = None
    failure: str | None = None
    cleanup_failed = False
    try:
        settings = request_json(f"{base_url}/auth/v1/settings", public_key)
        assert isinstance(settings, dict)
        external = settings.get("external")
        assert isinstance(external, dict) and external.get("anonymous_users") is True

        resolved = request_json(
            f"{base_url}/rest/v1/rpc/resolve_corridor_rules",
            public_key,
            method="POST",
            body={"p_origin_province": "ON", "p_dest_province": "BC"},
        )
        assert isinstance(resolved, list) and resolved
        task_ids = [row["task_id"] for row in resolved]
        assert len(task_ids) == len(set(task_ids))
        sources = [
            source
            for row in resolved
            for source in row.get("official_sources", [])
        ]
        assert all(
            isinstance(source.get("official_url"), str)
            and source["official_url"].startswith("https://")
            for source in sources
        )

        signup = request_json(
            f"{base_url}/auth/v1/signup",
            public_key,
            method="POST",
            body={},
        )
        assert isinstance(signup, dict) and isinstance(signup.get("access_token"), str)
        token = signup["access_token"]
        user = signup.get("user")
        assert isinstance(user, dict) and isinstance(user.get("id"), str)
        user_id = user["id"]

        consent = request_json(
            f"{base_url}/rest/v1/rpc/get_policy_consent_state",
            public_key,
            method="POST",
            token=token,
            body={},
        )
        assert isinstance(consent, dict)
        assert consent.get("has_profile") is False
        assert consent.get("profile") is None

        # Exercise the same first-run boundary as mobile onboarding: the
        # insert is deliberately return=minimal, then the consent RPC confirms
        # and returns the authoritative allowlisted profile in a new statement.
        request_json(
            f"{base_url}/rest/v1/user_profiles",
            public_key,
            method="POST",
            token=token,
            body={
                "id": user_id,
                "origin_prov": "ON",
                "dest_prov": "BC",
                "move_date": "2027-01-15",
                "has_vehicle": False,
                "has_dependents": False,
                "consent_version": "1.1",
            },
            extra_headers={"Prefer": "return=minimal"},
        )
        confirmed_consent = request_json(
            f"{base_url}/rest/v1/rpc/get_policy_consent_state",
            public_key,
            method="POST",
            token=token,
            body={},
        )
        assert isinstance(confirmed_consent, dict)
        assert confirmed_consent.get("has_profile") is True
        assert confirmed_consent.get("has_current_consent") is True
        confirmed_profile = confirmed_consent.get("profile")
        assert isinstance(confirmed_profile, dict)
        assert confirmed_profile.get("id") == user_id

        if check_support_ai:
            threads = request_json(
                f"{base_url}/rest/v1/support_threads",
                public_key,
                method="POST",
                token=token,
                body={"user_id": user_id, "status": "AI"},
                extra_headers={"Prefer": "return=representation"},
            )
            assert isinstance(threads, list) and len(threads) == 1
            thread_id = threads[0].get("id")
            assert isinstance(thread_id, str)

            request_json(
                f"{base_url}/rest/v1/support_messages",
                public_key,
                method="POST",
                token=token,
                body={
                    "thread_id": thread_id,
                    "sender": "user",
                    "body": "What should I do first for my move?",
                },
                extra_headers={"Prefer": "return=minimal"},
            )
            support = request_json(
                f"{base_url}/functions/v1/support-ai",
                public_key,
                method="POST",
                token=token,
                body={"thread_id": thread_id},
                timeout=50,
            )
            assert isinstance(support, dict)
            reply = support.get("reply")
            assert isinstance(reply, str) and reply.strip()
            fallback_prefix = "Thanks for reaching out. I'm having trouble answering that right now"
            assert not reply.startswith(fallback_prefix)
    except (AssertionError, KeyError, TypeError, RuntimeError) as error:
        failure = (
            str(error)
            if isinstance(error, RuntimeError)
            else "unexpected response contract"
        )
    finally:
        if token:
            try:
                request_json(
                    f"{base_url}/rest/v1/rpc/delete_current_user",
                    public_key,
                    method="POST",
                    token=token,
                    body={},
                )
            except RuntimeError:
                cleanup_failed = True

    if cleanup_failed:
        print("ERROR: hosted smoke account cleanup failed", file=sys.stderr)
        return 1
    if failure:
        print(f"ERROR: hosted Supabase smoke failed: {failure}", file=sys.stderr)
        return 1

    support_label = ", support AI" if check_support_ai else ""
    print(
        "OK: hosted auth, resolver, HTTPS sources, onboarding consent, and cleanup passed "
        f"({len(resolved)} tasks, {len(sources)} sources{support_label})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
