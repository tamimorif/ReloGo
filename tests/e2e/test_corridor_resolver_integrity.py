"""API-level regression coverage for migrations 023-026."""

from uuid import uuid4

import pytest
from postgrest.exceptions import APIError
from supabase import create_client

from conftest import SUPABASE_ANON_KEY, SUPABASE_URL


@pytest.fixture
def resolver_rules(service_client):
    suffix = uuid4().hex[:12].upper()
    task_ids = {name: str(uuid4()) for name in ("exact", "dest", "origin", "global")}
    task_keys = {name: f"E2E_RESOLVE_{name.upper()}_{suffix}" for name in task_ids}

    service_client.table("global_tasks").insert([
        {
            "id": task_ids[name],
            "task_key": task_keys[name],
            "title_en": f"E2E resolver {name} {suffix}",
            "base_description_en": "Resolver API fixture",
        }
        for name in task_ids
    ]).execute()

    rule_ids = {
        "exact_any_any": str(uuid4()),
        "exact_origin_any": str(uuid4()),
        "exact_any_dest": str(uuid4()),
        "exact_exact": str(uuid4()),
        "dest_any_any": str(uuid4()),
        "dest_origin_any": str(uuid4()),
        "dest_any_dest": str(uuid4()),
        "origin_any_any": str(uuid4()),
        "origin_origin_any": str(uuid4()),
        "global_any_any": str(uuid4()),
    }

    service_client.table("corridor_task_rules").insert([
        {"id": rule_ids["exact_any_any"], "task_id": task_ids["exact"], "origin_province": "ANY", "dest_province": "ANY"},
        {"id": rule_ids["exact_origin_any"], "task_id": task_ids["exact"], "origin_province": "ON", "dest_province": "ANY"},
        {"id": rule_ids["exact_any_dest"], "task_id": task_ids["exact"], "origin_province": "ANY", "dest_province": "AB"},
        {"id": rule_ids["exact_exact"], "task_id": task_ids["exact"], "origin_province": "ON", "dest_province": "AB"},
        {"id": rule_ids["dest_any_any"], "task_id": task_ids["dest"], "origin_province": "ANY", "dest_province": "ANY"},
        {"id": rule_ids["dest_origin_any"], "task_id": task_ids["dest"], "origin_province": "ON", "dest_province": "ANY"},
        {"id": rule_ids["dest_any_dest"], "task_id": task_ids["dest"], "origin_province": "ANY", "dest_province": "AB"},
        {"id": rule_ids["origin_any_any"], "task_id": task_ids["origin"], "origin_province": "ANY", "dest_province": "ANY"},
        {"id": rule_ids["origin_origin_any"], "task_id": task_ids["origin"], "origin_province": "ON", "dest_province": "ANY"},
        {"id": rule_ids["global_any_any"], "task_id": task_ids["global"], "origin_province": "ANY", "dest_province": "ANY"},
    ]).execute()

    service_client.table("official_sources").insert([
        {
            "corridor_rule_id": rule_ids["exact_exact"],
            "agency_name": "Agency Z",
            "official_url": "https://z.example.gc.ca/resolver",
        },
        {
            "corridor_rule_id": rule_ids["exact_exact"],
            "agency_name": "Agency A",
            "official_url": "https://a.example.gc.ca/resolver",
        },
        {
            "corridor_rule_id": rule_ids["exact_exact"],
            "agency_name": "Agency HTTP",
            "official_url": "http://insecure.example.gc.ca/resolver",
        },
    ]).execute()

    try:
        yield {
            "task_ids": task_ids,
            "task_keys": task_keys,
            "rule_ids": rule_ids,
        }
    finally:
        # Deleting tasks cascades through rules, sources, and progress rows.
        for task_id in task_ids.values():
            service_client.table("global_tasks").delete().eq("id", task_id).execute()


def _resolved_by_key(client, task_keys):
    rows = client.rpc("resolve_corridor_rules", {
        "p_origin_province": "ON",
        "p_dest_province": "AB",
    }).execute().data
    wanted = set(task_keys.values())
    return {row["task_key"]: row for row in rows if row["task_key"] in wanted}


def test_resolver_api_precedence_and_https_sources(anon_client, resolver_rules):
    rows = _resolved_by_key(anon_client, resolver_rules["task_keys"])
    keys = resolver_rules["task_keys"]
    ids = resolver_rules["rule_ids"]

    assert len(rows) == 4
    assert rows[keys["exact"]]["id"] == ids["exact_exact"]
    assert rows[keys["dest"]]["id"] == ids["dest_any_dest"]
    assert rows[keys["origin"]]["id"] == ids["origin_origin_any"]
    assert rows[keys["global"]]["id"] == ids["global_any_any"]

    sources = rows[keys["exact"]]["official_sources"]
    assert [source["agency_name"] for source in sources] == ["Agency A", "Agency Z"]
    assert all(source["official_url"].startswith("https://") for source in sources)
    assert set(sources[0]) == {"id", "agency_name", "official_url", "last_verified"}


def test_authenticated_user_can_call_resolver(consented_user, resolver_rules):
    rows = _resolved_by_key(consented_user["client"], resolver_rules["task_keys"])
    assert len(rows) == 4


def test_admin_rpcs_reuse_resolver_and_return_source_array(
    consented_user,
    resolver_rules,
    service_client,
):
    client = consented_user["client"]
    keys = resolver_rules["task_keys"]
    ids = resolver_rules["rule_ids"]

    # Progress on the losing ANY/ANY row must not affect resolved counts.
    client.table("user_task_progress").insert({
        "user_id": consented_user["id"],
        "task_rule_id": ids["exact_any_any"],
        "status": "COMPLETED",
    }).execute()

    admin_uid = None
    admin_email = f"resolver-admin-{uuid4().hex}@test.local"
    admin_password = "ResolverAdmin123!"
    try:
        created = service_client.auth.admin.create_user({
            "email": admin_email,
            "password": admin_password,
            "email_confirm": True,
        })
        admin_uid = created.user.id
        service_client.table("admin_users").insert({"user_id": admin_uid}).execute()

        admin = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        admin.auth.sign_in_with_password({
            "email": admin_email,
            "password": admin_password,
        })

        listed = admin.rpc("admin_list_users", {
            "p_limit": 200,
            "p_offset": 0,
        }).execute().data
        user_row = next(row for row in listed if row["user_id"] == consented_user["id"])
        assert user_row["tasks_completed"] == 0

        detail = admin.rpc("admin_get_user_detail", {
            "p_user_id": consented_user["id"],
        }).execute().data
        task = next(item for item in detail["tasks"] if item["task_key"] == keys["exact"])
        assert task["task_rule_id"] == ids["exact_exact"]
        assert "official_url" not in task
        assert [source["agency_name"] for source in task["official_sources"]] == [
            "Agency A",
            "Agency Z",
        ]
    finally:
        if admin_uid is not None:
            service_client.auth.admin.delete_user(admin_uid)


def test_progress_defaults_available_and_rejects_locked(
    consented_user,
    valid_task_rule_id,
):
    client = consented_user["client"]
    inserted = client.table("user_task_progress").insert({
        "user_id": consented_user["id"],
        "task_rule_id": valid_task_rule_id,
    }).execute().data
    assert inserted[0]["status"] == "AVAILABLE"

    client.table("user_task_progress").delete().eq(
        "task_rule_id", valid_task_rule_id
    ).execute()
    with pytest.raises(APIError) as exc_info:
        client.table("user_task_progress").insert({
            "user_id": consented_user["id"],
            "task_rule_id": valid_task_rule_id,
            "status": "LOCKED",
        }).execute()
    assert exc_info.value.code == "23514"


def test_same_province_profile_and_waitlist_are_rejected(
    consented_user,
    anon_client,
):
    with pytest.raises(APIError) as exc_info:
        consented_user["client"].table("user_profiles").update({
            "dest_prov": "ON",
        }).eq("id", consented_user["id"]).execute()
    assert exc_info.value.code == "23514"

    with pytest.raises(APIError) as exc_info:
        anon_client.rpc("join_waitlist", {
            "p_email": f"same-corridor-{uuid4().hex}@test.local",
            "p_origin_province": "BC",
            "p_dest_province": "BC",
        }).execute()
    assert exc_info.value.code == "23514"
