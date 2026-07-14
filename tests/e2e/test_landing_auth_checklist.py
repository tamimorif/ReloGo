import pytest
from supabase import create_client
from postgrest.exceptions import APIError
from conftest import CURRENT_CONSENT_VERSION, SUPABASE_URL, SUPABASE_ANON_KEY

# Helper function simulating the client-side checklist selection engine
def run_checklist_engine(profile, rules, tasks):
    selected = []
    for rule in rules:
        origin_ok = (rule["origin_province"] == profile["origin_prov"] or rule["origin_province"] == "ANY")
        dest_ok = (rule["dest_province"] == profile["dest_prov"] or rule["dest_province"] == "ANY")
        if origin_ok and dest_ok:
            task = next((t for t in tasks if t["id"] == rule["task_id"]), None)
            if task:
                if task.get("requires_vehicle", False) and not profile.get("has_vehicle", False):
                    continue
                if task.get("requires_dependents", False) and not profile.get("has_dependents", False):
                    continue
                selected.append((rule, task))
    return selected

# ============================================================================
# FEATURE 1: WAITLIST (Tests 1-10)
# ============================================================================

def test_waitlist_1_success(anon_client, service_client):
    email = "wait1@example.com"
    # Call waitlist signup RPC
    anon_client.rpc("join_waitlist", {
        "p_email": email,
        "p_origin_province": "ON",
        "p_dest_province": "AB"
    }).execute()
    
    # Verify with service client
    res = service_client.table("waitlist").select("*").eq("email", email).execute()
    assert len(res.data) == 1
    assert res.data[0]["origin_province"] == "ON"
    assert res.data[0]["dest_province"] == "AB"

def test_waitlist_2_invalid_email(anon_client):
    with pytest.raises(APIError) as exc_info:
        anon_client.rpc("join_waitlist", {
            "p_email": "invalid-email",
            "p_origin_province": "ON",
            "p_dest_province": "AB"
        }).execute()
    assert exc_info.value.code in ["23514", "P0001", "42501"]

def test_waitlist_3_invalid_origin_province(anon_client):
    with pytest.raises(APIError) as exc_info:
        anon_client.rpc("join_waitlist", {
            "p_email": "wait3@example.com",
            "p_origin_province": "XX",
            "p_dest_province": "AB"
        }).execute()
    assert exc_info.value.code in ["23514", "P0001", "42501"]

def test_waitlist_4_invalid_dest_province(anon_client):
    with pytest.raises(APIError) as exc_info:
        anon_client.rpc("join_waitlist", {
            "p_email": "wait4@example.com",
            "p_origin_province": "ON",
            "p_dest_province": "YY"
        }).execute()
    assert exc_info.value.code in ["23514", "P0001", "42501"]

def test_waitlist_5_duplicate_email(anon_client, service_client):
    email = "dup@example.com"
    anon_client.rpc("join_waitlist", {"p_email": email, "p_origin_province": "ON", "p_dest_province": "AB"}).execute()
    anon_client.rpc("join_waitlist", {"p_email": email, "p_origin_province": "BC", "p_dest_province": "QC"}).execute()
    
    res = service_client.table("waitlist").select("*").eq("email", email).execute()
    assert len(res.data) == 1
    assert res.data[0]["origin_province"] == "ON"

def test_waitlist_6_throttle_boundary(anon_client, service_client):
    service_client.table("waitlist_signup_throttle").delete().neq("ip_hash", "").execute()
    
    for i in range(5):
        anon_client.rpc("join_waitlist", {
            "p_email": f"throttle_{i}@example.com",
            "p_origin_province": "ON",
            "p_dest_province": "AB"
        }).execute()
        
    res = service_client.table("waitlist").select("*").like("email", "throttle_%").execute()
    assert len(res.data) == 5

def test_waitlist_7_throttle_active(anon_client, service_client):
    service_client.table("waitlist").delete().like("email", "throttle_%").execute()
    
    for i in range(5):
        anon_client.rpc("join_waitlist", {
            "p_email": f"throttle_active_{i}@example.com",
            "p_origin_province": "ON",
            "p_dest_province": "AB"
        }).execute()
        
    anon_client.rpc("join_waitlist", {
        "p_email": "throttle_active_6@example.com",
        "p_origin_province": "ON",
        "p_dest_province": "AB"
    }).execute()
    
    res = service_client.table("waitlist").select("*").eq("email", "throttle_active_6@example.com").execute()
    assert len(res.data) == 0

def test_waitlist_8_case_insensitive(anon_client, service_client):
    email_upper = "UPPERCASE@example.com"
    email_lower = "uppercase@example.com"
    anon_client.rpc("join_waitlist", {"p_email": email_upper}).execute()
    anon_client.rpc("join_waitlist", {"p_email": email_lower}).execute()
    
    res = service_client.table("waitlist").select("*").eq("email", email_lower).execute()
    assert len(res.data) == 1

def test_waitlist_9_trim_spaces(anon_client, service_client):
    email_spaced = "  trimmed@example.com  "
    email_clean = "trimmed@example.com"
    anon_client.rpc("join_waitlist", {"p_email": email_spaced}).execute()
    
    res = service_client.table("waitlist").select("*").eq("email", email_clean).execute()
    assert len(res.data) == 1

def test_waitlist_10_rls_direct_insert(anon_client):
    with pytest.raises(APIError) as exc_info:
        anon_client.table("waitlist").insert({
            "email": "direct@example.com",
            "origin_province": "ON",
            "dest_province": "AB"
        }).execute()
    assert exc_info.value.code in ["42501"]

def test_waitlist_11_returns_accepted_status(anon_client, service_client):
    # Migration 022: join_waitlist() now reports an explicit status.
    service_client.table("waitlist_signup_throttle").delete().neq("ip_hash", "").execute()
    res = anon_client.rpc("join_waitlist", {
        "p_email": "feedback_new@example.com",
        "p_origin_province": "ON",
        "p_dest_province": "AB",
    }).execute()
    assert res.data == "accepted"

def test_waitlist_12_duplicate_still_reports_accepted(anon_client, service_client):
    # Enumeration safety: a duplicate email must be indistinguishable from a new
    # one, so both return 'accepted' — the status never reveals membership.
    service_client.table("waitlist_signup_throttle").delete().neq("ip_hash", "").execute()
    email = "feedback_dup@example.com"
    first = anon_client.rpc("join_waitlist", {
        "p_email": email, "p_origin_province": "ON", "p_dest_province": "AB",
    }).execute()
    second = anon_client.rpc("join_waitlist", {
        "p_email": email, "p_origin_province": "BC", "p_dest_province": "QC",
    }).execute()
    assert first.data == "accepted"
    assert second.data == "accepted"

def test_waitlist_13_throttle_reports_throttled(anon_client, service_client):
    # The 6th signup from one IP within the hour is reported as throttled
    # (the cap concerns the caller's IP, not any email address).
    service_client.table("waitlist_signup_throttle").delete().neq("ip_hash", "").execute()
    statuses = []
    for i in range(6):
        r = anon_client.rpc("join_waitlist", {
            "p_email": f"feedback_throttle_{i}@example.com",
            "p_origin_province": "ON",
            "p_dest_province": "AB",
        }).execute()
        statuses.append(r.data)
    assert statuses[:5] == ["accepted"] * 5
    assert statuses[5] == "throttled"

# ============================================================================
# FEATURE 2: AUTH / CONSENT (Tests 11-20)
# ============================================================================

def test_auth_11_anonymous_login(new_user):
    assert new_user["id"] is not None
    assert new_user["token"] is not None

def test_auth_12_profile_creation_success(new_user, service_client):
    client = new_user["client"]
    uid = new_user["id"]
    
    client.table("user_profiles").insert({
        "id": uid,
        "origin_prov": "ON",
        "dest_prov": "AB",
        "move_date": "2026-10-01",
        "has_vehicle": True,
        "has_dependents": True,
        "consent_version": CURRENT_CONSENT_VERSION,
    }, returning="minimal").execute()
    
    res = service_client.table("user_profiles").select("origin_prov, has_vehicle").eq("id", uid).execute()
    assert len(res.data) == 1
    assert res.data[0]["origin_prov"] == "ON"
    assert res.data[0]["has_vehicle"] is True

def test_auth_13_profile_read_own(new_user):
    client = new_user["client"]
    uid = new_user["id"]
    
    client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01",
        "consent_version": CURRENT_CONSENT_VERSION,
    }, returning="minimal").execute()
    
    res = client.table("user_profiles").select("*").execute()
    assert len(res.data) == 1
    assert res.data[0]["id"] == uid

def test_auth_14_profile_update_own(new_user):
    client = new_user["client"]
    uid = new_user["id"]
    
    client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01",
        "consent_version": CURRENT_CONSENT_VERSION,
    }, returning="minimal").execute()
    
    client.table("user_profiles").update({"origin_prov": "BC"}).eq("id", uid).execute()
    
    res = client.table("user_profiles").select("*").execute()
    assert res.data[0]["origin_prov"] == "BC"

def test_auth_15_profile_delete_via_rpc(new_user, service_client):
    client = new_user["client"]
    uid = new_user["id"]
    
    client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01",
        "consent_version": CURRENT_CONSENT_VERSION,
    }, returning="minimal").execute()
    
    client.rpc("delete_current_user", {}).execute()
    
    res = service_client.table("user_profiles").select("id").eq("id", uid).execute()
    assert len(res.data) == 0

def test_auth_16_profile_invalid_origin_prov(new_user):
    client = new_user["client"]
    uid = new_user["id"]
    
    with pytest.raises(APIError) as exc_info:
        client.table("user_profiles").insert({
            "id": uid, "origin_prov": "XX", "dest_prov": "AB", "move_date": "2026-10-01",
            "consent_version": CURRENT_CONSENT_VERSION,
        }, returning="minimal").execute()
    assert exc_info.value.code in ["23514", "42501"]

def test_auth_17_profile_invalid_dest_prov(new_user):
    client = new_user["client"]
    uid = new_user["id"]
    
    with pytest.raises(APIError) as exc_info:
        client.table("user_profiles").insert({
            "id": uid, "origin_prov": "ON", "dest_prov": "YY", "move_date": "2026-10-01",
            "consent_version": CURRENT_CONSENT_VERSION,
        }, returning="minimal").execute()
    assert exc_info.value.code in ["23514", "42501"]

def test_auth_18_profile_rls_isolate_other_user(consented_user, service_client):
    other_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    other_res = other_client.auth.sign_in_anonymously()
    other_uid = other_res.user.id
    
    try:
        service_client.table("user_profiles").insert({
            "id": other_uid, "origin_prov": "BC", "dest_prov": "QC", "move_date": "2026-12-01",
            "consent_version": CURRENT_CONSENT_VERSION,
        }, returning="minimal").execute()
        
        client = consented_user["client"]
        res = client.table("user_profiles").select("*").eq("id", other_uid).execute()
        assert len(res.data) == 0
    finally:
        service_client.auth.admin.delete_user(other_uid)

def test_auth_19_profile_rls_update_other_user(consented_user, service_client):
    other_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    other_res = other_client.auth.sign_in_anonymously()
    other_uid = other_res.user.id
    
    try:
        service_client.table("user_profiles").insert({
            "id": other_uid, "origin_prov": "BC", "dest_prov": "QC", "move_date": "2026-12-01",
            "consent_version": CURRENT_CONSENT_VERSION,
        }, returning="minimal").execute()
        
        client = consented_user["client"]
        res = client.table("user_profiles").update({"origin_prov": "ON"}).eq("id", other_uid).execute()
        assert len(res.data) == 0
        
        check = service_client.table("user_profiles").select("origin_prov").eq("id", other_uid).execute()
        assert check.data[0]["origin_prov"] == "BC"
    finally:
        service_client.auth.admin.delete_user(other_uid)

def test_auth_20_profile_unauthenticated_insert(anon_client):
    with pytest.raises(APIError) as exc_info:
        anon_client.table("user_profiles").insert({
            "id": "00000000-0000-0000-0000-000000000009",
            "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01",
            "consent_version": CURRENT_CONSENT_VERSION,
        }, returning="minimal").execute()
    assert exc_info.value.code in ["42501"]

# ============================================================================
# FEATURE 3: CHECKLIST / DEADLINES (Tests 21-30)
# ============================================================================

def test_checklist_21_any_corridor_matching():
    profile = {"origin_prov": "ON", "dest_prov": "AB", "has_vehicle": False}
    rules = [
        {"id": "r1", "task_id": "t1", "origin_province": "ANY", "dest_province": "ANY"},
        {"id": "r2", "task_id": "t2", "origin_province": "BC", "dest_province": "ANY"}
    ]
    tasks = [
        {"id": "t1", "requires_vehicle": False},
        {"id": "t2", "requires_vehicle": False}
    ]
    matches = run_checklist_engine(profile, rules, tasks)
    assert len(matches) == 1
    assert matches[0][0]["id"] == "r1"

def test_checklist_22_exact_corridor_matching():
    profile = {"origin_prov": "ON", "dest_prov": "AB", "has_vehicle": False}
    rules = [
        {"id": "r1", "task_id": "t1", "origin_province": "ON", "dest_province": "AB"},
        {"id": "r2", "task_id": "t2", "origin_province": "ON", "dest_province": "BC"}
    ]
    tasks = [
        {"id": "t1", "requires_vehicle": False},
        {"id": "t2", "requires_vehicle": False}
    ]
    matches = run_checklist_engine(profile, rules, tasks)
    assert len(matches) == 1
    assert matches[0][0]["id"] == "r1"

def test_checklist_23_mandatory_vs_optional():
    profile = {"origin_prov": "ON", "dest_prov": "AB", "has_vehicle": False}
    rules = [
        {"id": "r1", "task_id": "t1", "origin_province": "ON", "dest_province": "AB", "is_mandatory": True},
        {"id": "r2", "task_id": "t2", "origin_province": "ON", "dest_province": "AB", "is_mandatory": False}
    ]
    tasks = [
        {"id": "t1", "requires_vehicle": False},
        {"id": "t2", "requires_vehicle": False}
    ]
    matches = run_checklist_engine(profile, rules, tasks)
    assert len(matches) == 2
    assert matches[0][0]["is_mandatory"] is True
    assert matches[1][0]["is_mandatory"] is False

def test_checklist_24_vehicle_tasks():
    p_vehicle = {"origin_prov": "ON", "dest_prov": "AB", "has_vehicle": True}
    p_no_vehicle = {"origin_prov": "ON", "dest_prov": "AB", "has_vehicle": False}
    rules = [{"id": "r1", "task_id": "t1", "origin_province": "ON", "dest_province": "AB"}]
    tasks = [{"id": "t1", "requires_vehicle": True}]
    
    assert len(run_checklist_engine(p_vehicle, rules, tasks)) == 1
    assert len(run_checklist_engine(p_no_vehicle, rules, tasks)) == 0

def test_checklist_25_dependent_tasks():
    p_dep = {"origin_prov": "ON", "dest_prov": "AB", "has_dependents": True}
    p_no_dep = {"origin_prov": "ON", "dest_prov": "AB", "has_dependents": False}
    rules = [{"id": "r1", "task_id": "t1", "origin_province": "ON", "dest_province": "AB"}]
    tasks = [{"id": "t1", "requires_dependents": True}]
    
    assert len(run_checklist_engine(p_dep, rules, tasks)) == 1
    assert len(run_checklist_engine(p_no_dep, rules, tasks)) == 0

def test_checklist_26_days_deadline_calculation():
    profile = {"origin_prov": "ON", "dest_prov": "AB"}
    rules = [{"id": "r1", "task_id": "t1", "origin_province": "ON", "dest_province": "AB", "days_deadline": 90}]
    tasks = [{"id": "t1"}]
    
    res = run_checklist_engine(profile, rules, tasks)
    assert res[0][0]["days_deadline"] == 90

def test_checklist_27_negative_days_deadline_check(service_client):
    # Fetch a valid task_id from DB dynamically
    task_res = service_client.table("global_tasks").select("id").limit(1).execute()
    task_id = task_res.data[0]["id"]
    
    with pytest.raises(APIError) as exc_info:
        service_client.table("corridor_task_rules").insert({
            "task_id": task_id,
            "origin_province": "ON",
            "dest_province": "PE",
            "days_deadline": -10,
            "is_mandatory": True
        }).execute()
    assert exc_info.value.code in ["23514"]

def test_checklist_28_duplicate_corridor_rule_uniqueness(service_client):
    task_res = service_client.table("global_tasks").select("id").limit(1).execute()
    task_id = task_res.data[0]["id"]
    
    # Try inserting rule for existing seed task and corridor (origin 'ANY', dest 'AB')
    # First, let's see what corridors already exist for this task_id
    rules_res = service_client.table("corridor_task_rules").select("origin_province, dest_province").eq("task_id", task_id).execute()
    if len(rules_res.data) > 0:
        orig = rules_res.data[0]["origin_province"]
        dest = rules_res.data[0]["dest_province"]
        with pytest.raises(APIError) as exc_info:
            service_client.table("corridor_task_rules").insert({
                "task_id": task_id,
                "origin_province": orig,
                "dest_province": dest,
                "days_deadline": 60,
                "is_mandatory": True
            }).execute()
        assert exc_info.value.code in ["23505"]

def test_checklist_29_no_live_rules_update_by_non_admin(new_user):
    client = new_user["client"]
    with pytest.raises(APIError) as exc_info:
        client.table("corridor_task_rules").update({"days_deadline": 45}).eq("origin_province", "ON").execute()
    assert exc_info.value.code in ["42501"]

def test_checklist_30_admin_can_update_corridor_rules(service_client, valid_task_rule_id):
    # Find original deadline
    orig = service_client.table("corridor_task_rules").select("days_deadline").eq("id", valid_task_rule_id).execute().data[0]
    orig_deadline = orig["days_deadline"]
    
    service_client.table("corridor_task_rules").update({"days_deadline": 80}).eq("id", valid_task_rule_id).execute()
    
    check = service_client.table("corridor_task_rules").select("days_deadline").eq("id", valid_task_rule_id).execute()
    assert check.data[0]["days_deadline"] == 80
    
    # Restore original days_deadline
    service_client.table("corridor_task_rules").update({"days_deadline": orig_deadline}).eq("id", valid_task_rule_id).execute()
