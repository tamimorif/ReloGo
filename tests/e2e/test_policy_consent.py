from datetime import datetime

import pytest
from postgrest.exceptions import APIError

from conftest import CURRENT_CONSENT_VERSION


def _profile_payload(user_id, **overrides):
    payload = {
        "id": user_id,
        "origin_prov": "ON",
        "dest_prov": "AB",
        "move_date": "2026-10-01",
        "consent_version": CURRENT_CONSENT_VERSION,
    }
    payload.update(overrides)
    return payload


def test_policy_72_no_profile_state_and_app_data_gate(new_user):
    client = new_user["client"]

    state = client.rpc("get_policy_consent_state").execute().data
    assert state == {
        "has_profile": False,
        "accepted_version": None,
        "current_version": CURRENT_CONSENT_VERSION,
        "has_current_consent": False,
    }

    with pytest.raises(APIError) as exc_info:
        client.table("support_threads").insert({
            "user_id": new_user["id"],
            "status": "AI",
        }).execute()
    assert exc_info.value.code == "42501"


def test_policy_73_current_profile_reports_current_consent(consented_user):
    client = consented_user["client"]

    state = client.rpc("get_policy_consent_state").execute().data
    assert state == {
        "has_profile": True,
        "accepted_version": CURRENT_CONSENT_VERSION,
        "current_version": CURRENT_CONSENT_VERSION,
        "has_current_consent": True,
    }

    profile = client.table("user_profiles").select("id, consent_version").execute().data
    assert profile == [{
        "id": consented_user["id"],
        "consent_version": CURRENT_CONSENT_VERSION,
    }]


def test_policy_74_profile_creation_rejects_missing_and_stale_consent(new_user):
    client = new_user["client"]
    user_id = new_user["id"]

    missing_version = _profile_payload(user_id)
    missing_version.pop("consent_version")
    with pytest.raises(APIError) as exc_info:
        client.table("user_profiles").insert(
            missing_version, returning="minimal"
        ).execute()
    assert exc_info.value.code == "23514"

    with pytest.raises(APIError) as exc_info:
        client.table("user_profiles").insert(
            _profile_payload(user_id, consent_version="1.0"),
            returning="minimal",
        ).execute()
    assert exc_info.value.code == "23514"

    state = client.rpc("get_policy_consent_state").execute().data
    assert state["has_profile"] is False
    assert state["has_current_consent"] is False


def test_policy_74b_first_run_onboarding_write_is_not_an_upsert(new_user):
    """A first-time user must be able to create their profile.

    Regression guard for a real onboarding break. Every other test in this
    suite creates profiles with .insert(), but the app's onboarding screen used
    .upsert(), which emits INSERT ... ON CONFLICT DO UPDATE. Migration 019
    gates user_profiles UPDATE on has_current_policy_consent(), and that is
    false until a profile row already records the current policy version, so
    the upsert is rejected for exactly the user it exists to serve. Anonymous
    sign-in succeeded and then the very first write failed, which surfaced in
    the app as a generic "Couldn't finish setup" alert.

    The insert-then-update shape below is what onboarding.tsx now does. Both
    the first-run path and the retry path must work.
    """
    client = new_user["client"]
    user_id = new_user["id"]

    # An upsert must still be rejected -- if this ever starts succeeding the
    # policy has been loosened and this guard should be re-examined.
    with pytest.raises(APIError) as exc_info:
        client.table("user_profiles").upsert(
            _profile_payload(user_id), returning="minimal"
        ).execute()
    assert exc_info.value.code == "42501"

    # First run: a plain insert is what actually authorises the new row.
    client.table("user_profiles").insert(
        _profile_payload(user_id), returning="minimal"
    ).execute()

    state = client.rpc("get_policy_consent_state").execute().data
    assert state["has_profile"] is True
    assert state["has_current_consent"] is True

    # Retry path: resubmitting onboarding updates the existing row in place
    # rather than silently discarding the newly entered details.
    client.table("user_profiles").update(
        _profile_payload(user_id, origin_prov="BC", dest_prov="NS")
    ).eq("id", user_id).execute()

    profile = (
        client.table("user_profiles")
        .select("origin_prov, dest_prov")
        .execute()
        .data
    )
    assert profile == [{"origin_prov": "BC", "dest_prov": "NS"}]


def test_policy_75_accept_current_policies_uses_server_version_and_timestamp(
    new_user, service_client
):
    client = new_user["client"]
    user_id = new_user["id"]
    spoofed_timestamp = "2000-01-01T00:00:00+00:00"

    client.table("user_profiles").insert(
        _profile_payload(user_id, consent_timestamp=spoofed_timestamp),
        returning="minimal",
    ).execute()
    before = service_client.table("user_profiles").select(
        "consent_timestamp"
    ).eq("id", user_id).single().execute().data["consent_timestamp"]
    assert datetime.fromisoformat(before) > datetime.fromisoformat(spoofed_timestamp)

    accepted_version = client.rpc("accept_current_policies").execute().data
    after = service_client.table("user_profiles").select(
        "consent_version, consent_timestamp"
    ).eq("id", user_id).single().execute().data

    assert accepted_version == CURRENT_CONSENT_VERSION
    assert after["consent_version"] == CURRENT_CONSENT_VERSION
    assert datetime.fromisoformat(after["consent_timestamp"]) > datetime.fromisoformat(
        before
    )


def test_policy_76_consent_rpcs_reject_unauthenticated_and_missing_profile(
    anon_client, new_user
):
    for rpc_name in ("get_policy_consent_state", "accept_current_policies"):
        with pytest.raises(APIError) as exc_info:
            anon_client.rpc(rpc_name).execute()
        assert exc_info.value.code == "42501"

    with pytest.raises(APIError) as exc_info:
        new_user["client"].rpc("accept_current_policies").execute()
    assert exc_info.value.code == "P0001"


def test_policy_77_no_consent_gate_blocks_own_progress(new_user, valid_task_rule_id):
    # Migration 019 gates own-data access on has_current_policy_consent(). A
    # signed-in user with no profile has no current consent, so even their OWN
    # progress rows are unreachable — not just other users' rows.
    client = new_user["client"]

    with pytest.raises(APIError) as exc_info:
        client.table("user_task_progress").insert({
            "user_id": new_user["id"],
            "task_rule_id": valid_task_rule_id,
        }).execute()
    assert exc_info.value.code == "42501"

    assert client.table("user_task_progress").select("*").execute().data == []


def test_policy_78_has_current_policy_consent_tracks_profile(new_user):
    client = new_user["client"]

    # No profile → no current consent.
    assert client.rpc("has_current_policy_consent").execute().data is False

    # Creating a profile at the server-current version grants consent.
    client.table("user_profiles").insert(
        _profile_payload(new_user["id"]), returning="minimal"
    ).execute()
    assert client.rpc("has_current_policy_consent").execute().data is True


def test_policy_79_has_current_policy_consent_rejects_anonymous(anon_client):
    with pytest.raises(APIError) as exc_info:
        anon_client.rpc("has_current_policy_consent").execute()
    assert exc_info.value.code == "42501"


def test_policy_80_user_cannot_self_assign_human_status(consented_user):
    # The re-consent policy also forbids a client from opening a thread already
    # marked HUMAN, which would impersonate a human-takeover transcript.
    client = consented_user["client"]

    with pytest.raises(APIError) as exc_info:
        client.table("support_threads").insert({
            "user_id": consented_user["id"],
            "status": "HUMAN",
        }).execute()
    assert exc_info.value.code == "42501"


def test_policy_81_accept_current_policies_is_idempotent(consented_user, service_client):
    client = consented_user["client"]
    user_id = consented_user["id"]

    first = client.rpc("accept_current_policies").execute().data
    ts_first = service_client.table("user_profiles").select(
        "consent_timestamp"
    ).eq("id", user_id).single().execute().data["consent_timestamp"]

    second = client.rpc("accept_current_policies").execute().data
    ts_second = service_client.table("user_profiles").select(
        "consent_version, consent_timestamp"
    ).eq("id", user_id).single().execute().data

    assert first == CURRENT_CONSENT_VERSION
    assert second == CURRENT_CONSENT_VERSION
    assert ts_second["consent_version"] == CURRENT_CONSENT_VERSION
    # Re-attesting keeps the version and never moves the audit timestamp
    # backwards; the server, not the client, authors it each time.
    assert datetime.fromisoformat(ts_second["consent_timestamp"]) >= datetime.fromisoformat(
        ts_first
    )


def test_policy_82_consent_gate_opens_after_profile_creation(
    new_user, valid_task_rule_id
):
    client = new_user["client"]
    user_id = new_user["id"]

    # Closed: no profile, own progress unreachable.
    with pytest.raises(APIError) as exc_info:
        client.table("user_task_progress").insert({
            "user_id": user_id,
            "task_rule_id": valid_task_rule_id,
        }).execute()
    assert exc_info.value.code == "42501"

    # Accepting the server-current policy version (via profile creation) opens
    # the gate for the same user's own data.
    client.table("user_profiles").insert(
        _profile_payload(user_id), returning="minimal"
    ).execute()
    client.table("user_task_progress").insert({
        "user_id": user_id,
        "task_rule_id": valid_task_rule_id,
    }).execute()

    rows = client.table("user_task_progress").select("*").execute().data
    assert len(rows) == 1
    assert rows[0]["user_id"] == user_id
