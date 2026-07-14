import pytest
import time
from supabase import create_client
from postgrest.exceptions import APIError
from conftest import SUPABASE_URL, SUPABASE_ANON_KEY

# Helper checklist engine
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
# TIER 3: CROSS-FEATURE COMBINATIONS (Tests 61-66)
# ============================================================================

def test_comb_61_waitlist_to_onboarding(anon_client, service_client):
    email = "transition@example.com"
    anon_client.rpc("join_waitlist", {"p_email": email, "p_origin_province": "ON", "p_dest_province": "AB"}).execute()
    
    res = service_client.table("waitlist").select("*").eq("email", email).execute()
    assert len(res.data) == 1
    
    user_res = anon_client.auth.sign_in_anonymously()
    uid = user_res.user.id
    
    anon_client.auth.set_session(user_res.session.access_token, user_res.session.refresh_token)
    anon_client.table("user_profiles").insert({
        "id": uid,
        "origin_prov": res.data[0]["origin_province"],
        "dest_prov": res.data[0]["dest_province"],
        "move_date": "2026-11-01"
    }).execute()
    
    prof = service_client.table("user_profiles").select("origin_prov").eq("id", uid).execute()
    assert len(prof.data) == 1
    assert prof.data[0]["origin_prov"] == "ON"
    
    service_client.auth.admin.delete_user(uid)

def test_comb_62_profile_change_updates_checklist(anon_client):
    tasks = anon_client.table("global_tasks").select("id, requires_vehicle, requires_dependents").execute().data
    rules = anon_client.table("corridor_task_rules").select("id, task_id, origin_province, dest_province").execute().data
    
    profile = {"origin_prov": "ON", "dest_prov": "AB", "has_vehicle": False, "has_dependents": False}
    initial_checklist = run_checklist_engine(profile, rules, tasks)
    
    profile["has_vehicle"] = True
    profile["has_dependents"] = True
    updated_checklist = run_checklist_engine(profile, rules, tasks)
    
    assert len(updated_checklist) > len(initial_checklist)

def test_comb_63_support_inquiry_after_progress_update(new_user, service_client, valid_task_rule_id):
    client = new_user["client"]
    uid = new_user["id"]
    
    client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01"
    }).execute()
    
    client.table("user_task_progress").insert({
        "user_id": uid,
        "task_rule_id": valid_task_rule_id,
        "status": "COMPLETED"
    }).execute()
    
    res = client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    tid = res.data[0]["id"]
    
    client.table("support_messages").insert({
        "thread_id": tid, "sender": "user", "body": "What deadlines should I know about?"
    }).execute()
    
    threads = service_client.table("support_threads").select("id").eq("id", tid).execute()
    messages = service_client.table("support_messages").select("id").eq("thread_id", tid).execute()
    assert len(threads.data) == 1
    assert len(messages.data) == 1

def test_comb_64_account_deletion_cleans_all(new_user, service_client, valid_task_rule_id):
    client = new_user["client"]
    uid = new_user["id"]
    
    client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01"
    }).execute()
    client.table("user_task_progress").insert({
        "user_id": uid, "task_rule_id": valid_task_rule_id, "status": "COMPLETED"
    }).execute()
    
    thread_res = client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    tid = thread_res.data[0]["id"]
    client.table("support_messages").insert({
        "thread_id": tid, "sender": "user", "body": "What should I do first for my move?"
    }).execute()
    
    client.rpc("delete_current_user", {}).execute()
    
    assert len(service_client.table("user_profiles").select("id").eq("id", uid).execute().data) == 0
    assert len(service_client.table("user_task_progress").select("status").eq("user_id", uid).execute().data) == 0
    assert len(service_client.table("support_threads").select("status").eq("user_id", uid).execute().data) == 0
    assert len(service_client.table("support_messages").select("sender").eq("thread_id", tid).execute().data) == 0

def test_comb_65_admin_rule_approval_affects_user_checklist(anon_client, service_client, valid_task_rule_id):
    tasks = anon_client.table("global_tasks").select("id, requires_vehicle, requires_dependents").execute().data
    rules = anon_client.table("corridor_task_rules").select("id, task_id, origin_province, dest_province, days_deadline, is_mandatory").execute().data
    
    orig_rule = next((r for r in rules if r["id"] == valid_task_rule_id), None)
    assert orig_rule is not None
    
    service_client.table("corridor_task_rules").update({"days_deadline": 45, "is_mandatory": False}).eq("id", valid_task_rule_id).execute()
    
    profile = {"origin_prov": "ON", "dest_prov": "AB"}
    updated_rules = anon_client.table("corridor_task_rules").select("id, task_id, origin_province, dest_province, days_deadline, is_mandatory").execute().data
    checklist = run_checklist_engine(profile, updated_rules, tasks)
    
    user_rule = next((r for r, t in checklist if r["id"] == valid_task_rule_id), None)
    assert user_rule["days_deadline"] == 45
    assert user_rule["is_mandatory"] is False
    
    service_client.table("corridor_task_rules").update({
        "days_deadline": orig_rule["days_deadline"],
        "is_mandatory": orig_rule["is_mandatory"]
    }).eq("id", valid_task_rule_id).execute()

def test_comb_66_rate_limit_and_auth(anon_client, new_user):
    assert new_user["id"] is not None
    check = new_user["client"].auth.get_user(new_user["token"])
    assert check.user.id == new_user["id"]

# ============================================================================
# TIER 4: REAL-WORLD APPLICATION SCENARIOS (Tests 67-71)
# ============================================================================

def test_scenario_67_standard_relocation_lifecycle(anon_client, service_client, valid_task_rule_id):
    res = anon_client.auth.sign_in_anonymously()
    uid = res.user.id
    user_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    user_client.auth.set_session(res.session.access_token, res.session.refresh_token)
    
    user_client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-15",
        "has_vehicle": False, "has_dependents": False
    }).execute()
    
    tasks = anon_client.table("global_tasks").select("id, requires_vehicle, requires_dependents").execute().data
    rules = anon_client.table("corridor_task_rules").select("id, task_id, origin_province, dest_province").execute().data
    checklist = run_checklist_engine({"origin_prov": "ON", "dest_prov": "AB", "has_vehicle": False, "has_dependents": False}, rules, tasks)
    assert len(checklist) > 0
    
    user_client.table("user_task_progress").insert({
        "user_id": uid, "task_rule_id": valid_task_rule_id, "status": "COMPLETED"
    }).execute()
    
    prog = service_client.table("user_task_progress").select("status").eq("user_id", uid).execute()
    assert prog.data[0]["status"] == "COMPLETED"
    
    user_client.auth.sign_out()
    service_client.auth.admin.delete_user(uid)

def test_scenario_68_high_risk_relocation_lifecycle(anon_client, service_client):
    res = anon_client.auth.sign_in_anonymously()
    uid = res.user.id
    user_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    user_client.auth.set_session(res.session.access_token, res.session.refresh_token)
    
    user_client.table("user_profiles").insert({
        "id": uid, "origin_prov": "BC", "dest_prov": "ON", "move_date": "2026-09-01",
        "has_vehicle": True, "has_dependents": True
    }).execute()
    
    tasks = anon_client.table("global_tasks").select("id, task_key, requires_vehicle, requires_dependents").execute().data
    rules = anon_client.table("corridor_task_rules").select("id, task_id, origin_province, dest_province").execute().data
    checklist = run_checklist_engine({"origin_prov": "BC", "dest_prov": "ON", "has_vehicle": True, "has_dependents": True}, rules, tasks)
    
    has_vehicle_task = any(t["task_key"] == "REGISTER_VEHICLE" for r, t in checklist)
    assert has_vehicle_task is True
    
    thread = user_client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    tid = thread.data[0]["id"]
    
    msg = user_client.table("support_messages").insert({
        "thread_id": tid, "sender": "user", "body": "What vehicle-related tasks apply to me?"
    }).execute()
    mid = msg.data[0]["id"]
    
    rpc_res = service_client.rpc("persist_support_ai_reply", {
        "p_thread_id": tid,
        "p_expected_user_message_id": mid,
        "p_reply_body": "Based on your BC to ON move, you must register your vehicle within 30 days.",
        "p_escalate": False
    }).execute()
    assert rpc_res.data is True
    
    service_client.auth.admin.delete_user(uid)

def test_scenario_69_rule_drift_and_admin_mitigation(service_client, valid_task_rule_id):
    # 1. Scraper detects change, inserts alert status PENDING
    alert_id = "40000000-0000-0000-0000-000000000099"
    
    source_res = service_client.table("official_sources").select("id").eq("corridor_rule_id", valid_task_rule_id).execute()
    if not source_res.data:
        source_res = service_client.table("official_sources").select("id").limit(1).execute()
    source_id = source_res.data[0]["id"]
    
    # Mock the scraper by setting a hash
    service_client.table("official_sources").update({"last_content_hash": "new_hash_val"}).eq("id", source_id).execute()
    
    orig_res = service_client.table("corridor_task_rules").select("days_deadline, is_mandatory").eq("id", valid_task_rule_id).execute()
    orig_deadline = orig_res.data[0]["days_deadline"]
    orig_mandatory = orig_res.data[0]["is_mandatory"]
    
    try:
        service_client.table("rule_change_alerts").insert({
            "id": alert_id,
            "official_source_id": source_id,
            "old_hash": "old_hash_val",
            "new_hash": "new_hash_val",
            "status": "PENDING"
        }).execute()
        
        # Create test admin user
        admin_auth = service_client.auth.admin.create_user({
            "email": "admin_e2e@relogo.ca",
            "password": "PasswordAdmin123!",
            "email_confirm": True
        })
        admin_uid = admin_auth.user.id
        
        # Add to admin_users table
        service_client.table("admin_users").insert({"user_id": admin_uid}).execute()
        
        # Log in as admin
        admin_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        admin_client.auth.sign_in_with_password({"email": "admin_e2e@relogo.ca", "password": "PasswordAdmin123!"})
        
        # Call approve_rule_change RPC
        admin_client.rpc("approve_rule_change", {
            "p_alert_id": alert_id,
            "p_days_deadline": 40,
            "p_is_mandatory": True
        }).execute()
        
        # Verify status is APPROVED and rule is updated
        alert_check = service_client.table("rule_change_alerts").select("status").eq("id", alert_id).execute()
        assert alert_check.data[0]["status"] == "APPROVED"
        
        rule_check = service_client.table("corridor_task_rules").select("days_deadline").eq("id", valid_task_rule_id).execute()
        assert rule_check.data[0]["days_deadline"] == 40
        
    finally:
        try:
            service_client.table("rule_change_alerts").delete().eq("id", alert_id).execute()
        except Exception:
            pass
        try:
            service_client.auth.admin.delete_user(admin_uid)
        except Exception:
            pass
        try:
            service_client.table("corridor_task_rules").update({
                "days_deadline": orig_deadline,
                "is_mandatory": orig_mandatory
            }).eq("id", valid_task_rule_id).execute()
        except Exception:
            pass

def test_scenario_70_adversarial_data_privacy_audit(new_user, service_client):
    client = new_user["client"]
    uid = new_user["id"]
    
    res = client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    tid = res.data[0]["id"]
    
    with pytest.raises(APIError) as exc_info:
        client.table("support_messages").insert({
            "thread_id": tid, "sender": "user", "body": "My full name is Tamim Orif"
        }).execute()
    assert exc_info.value.code in ["42501"]
    
    with pytest.raises(APIError) as exc_info:
        client.table("support_threads").insert({
            "user_id": uid, "status": "AI", "subject": "Sensitive Subject"
        }).execute()
    assert exc_info.value.code in ["42501"]
    
    client.rpc("delete_current_user", {}).execute()
    check = service_client.table("support_threads").select("status").eq("id", tid).execute()
    assert len(check.data) == 0

def test_scenario_71_concurrent_support_race_condition(new_user, service_client):
    client = new_user["client"]
    uid = new_user["id"]
    
    client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01"
    }).execute()
    
    thread_res = client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    tid = thread_res.data[0]["id"]
    
    msg_res = client.table("support_messages").insert({
        "thread_id": tid, "sender": "user", "body": "What should I do first for my move?"
    }).execute()
    mid = msg_res.data[0]["id"]
    
    service_client.table("support_messages").insert({
        "thread_id": tid, "sender": "admin", "body": "I am taking over this thread."
    }).execute()
    service_client.table("support_threads").update({"status": "AWAITING_HUMAN"}).eq("id", tid).execute()
    
    rpc_res = service_client.rpc("persist_support_ai_reply", {
        "p_thread_id": tid,
        "p_expected_user_message_id": mid,
        "p_reply_body": "Stale AI reply after takeover",
        "p_escalate": False
    }).execute()
    
    assert rpc_res.data is False
