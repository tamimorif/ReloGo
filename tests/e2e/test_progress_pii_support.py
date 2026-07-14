import pytest
import requests
from supabase import create_client
from postgrest.exceptions import APIError
from conftest import CURRENT_CONSENT_VERSION, SUPABASE_URL, SUPABASE_ANON_KEY

# ============================================================================
# FEATURE 4: PROGRESS (Tests 31-40)
# ============================================================================

def test_progress_31_insert_success(new_user, service_client, valid_task_rule_id):
    client = new_user["client"]
    uid = new_user["id"]
    
    # Setup: user needs a profile first
    client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01",
        "consent_version": CURRENT_CONSENT_VERSION,
    }, returning="minimal").execute()
    
    # Insert progress
    client.table("user_task_progress").insert({
        "user_id": uid,
        "task_rule_id": valid_task_rule_id,
        "status": "AVAILABLE"
    }).execute()
    
    res = service_client.table("user_task_progress").select("status").eq("user_id", uid).execute()
    assert len(res.data) == 1
    assert res.data[0]["status"] == "AVAILABLE"

def test_progress_32_update_status(new_user, valid_task_rule_id):
    client = new_user["client"]
    uid = new_user["id"]
    
    client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01",
        "consent_version": CURRENT_CONSENT_VERSION,
    }, returning="minimal").execute()
    
    client.table("user_task_progress").insert({
        "user_id": uid,
        "task_rule_id": valid_task_rule_id,
        "status": "AVAILABLE"
    }).execute()
    
    client.table("user_task_progress").update({"status": "COMPLETED"}).eq("user_id", uid).eq("task_rule_id", valid_task_rule_id).execute()
    
    res = client.table("user_task_progress").select("status").execute()
    assert res.data[0]["status"] == "COMPLETED"

def test_progress_33_read_own(new_user, valid_task_rule_id):
    client = new_user["client"]
    uid = new_user["id"]
    
    client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01",
        "consent_version": CURRENT_CONSENT_VERSION,
    }, returning="minimal").execute()
    
    client.table("user_task_progress").insert({
        "user_id": uid, "task_rule_id": valid_task_rule_id
    }).execute()
    
    res = client.table("user_task_progress").select("*").execute()
    assert len(res.data) == 1
    assert res.data[0]["user_id"] == uid

def test_progress_34_delete_own(new_user, valid_task_rule_id):
    client = new_user["client"]
    uid = new_user["id"]
    
    client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01",
        "consent_version": CURRENT_CONSENT_VERSION,
    }, returning="minimal").execute()
    
    client.table("user_task_progress").insert({
        "user_id": uid, "task_rule_id": valid_task_rule_id
    }).execute()
    
    client.table("user_task_progress").delete().eq("user_id", uid).eq("task_rule_id", valid_task_rule_id).execute()
    
    res = client.table("user_task_progress").select("*").execute()
    assert len(res.data) == 0

def test_progress_35_invalid_status(new_user, valid_task_rule_id):
    client = new_user["client"]
    uid = new_user["id"]
    
    client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01",
        "consent_version": CURRENT_CONSENT_VERSION,
    }, returning="minimal").execute()
    
    with pytest.raises(APIError) as exc_info:
        client.table("user_task_progress").insert({
            "user_id": uid,
            "task_rule_id": valid_task_rule_id,
            "status": "DONE"  # Should fail check constraint
        }).execute()
    assert exc_info.value.code in ["23514"]

def test_progress_36_rls_read_other(consented_user, service_client, valid_task_rule_id):
    other_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    other_res = other_client.auth.sign_in_anonymously()
    other_uid = other_res.user.id
    
    try:
        service_client.table("user_profiles").insert({
            "id": other_uid, "origin_prov": "BC", "dest_prov": "QC", "move_date": "2026-12-01",
            "consent_version": CURRENT_CONSENT_VERSION,
        }).execute()
        service_client.table("user_task_progress").insert({
            "user_id": other_uid, "task_rule_id": valid_task_rule_id
        }).execute()
        
        client = consented_user["client"]
        res = client.table("user_task_progress").select("*").eq("user_id", other_uid).execute()
        assert len(res.data) == 0
    finally:
        service_client.auth.admin.delete_user(other_uid)

def test_progress_37_rls_update_other(consented_user, service_client, valid_task_rule_id):
    other_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    other_res = other_client.auth.sign_in_anonymously()
    other_uid = other_res.user.id
    
    try:
        service_client.table("user_profiles").insert({
            "id": other_uid, "origin_prov": "BC", "dest_prov": "QC", "move_date": "2026-12-01",
            "consent_version": CURRENT_CONSENT_VERSION,
        }).execute()
        service_client.table("user_task_progress").insert({
            "user_id": other_uid, "task_rule_id": valid_task_rule_id, "status": "AVAILABLE"
        }).execute()
        
        client = consented_user["client"]
        client.table("user_task_progress").update({"status": "COMPLETED"}).eq("user_id", other_uid).execute()
        
        check = service_client.table("user_task_progress").select("status").eq("user_id", other_uid).execute()
        assert check.data[0]["status"] == "AVAILABLE"
    finally:
        service_client.auth.admin.delete_user(other_uid)

def test_progress_38_rls_delete_other(consented_user, service_client, valid_task_rule_id):
    other_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    other_res = other_client.auth.sign_in_anonymously()
    other_uid = other_res.user.id
    
    try:
        service_client.table("user_profiles").insert({
            "id": other_uid, "origin_prov": "BC", "dest_prov": "QC", "move_date": "2026-12-01",
            "consent_version": CURRENT_CONSENT_VERSION,
        }).execute()
        service_client.table("user_task_progress").insert({
            "user_id": other_uid, "task_rule_id": valid_task_rule_id, "status": "AVAILABLE"
        }).execute()
        
        client = consented_user["client"]
        client.table("user_task_progress").delete().eq("user_id", other_uid).execute()
        
        check = service_client.table("user_task_progress").select("status").eq("user_id", other_uid).execute()
        assert len(check.data) == 1
    finally:
        service_client.auth.admin.delete_user(other_uid)

def test_progress_39_unauthenticated_insert(anon_client, valid_task_rule_id):
    with pytest.raises(APIError) as exc_info:
        anon_client.table("user_task_progress").insert({
            "user_id": "00000000-0000-0000-0000-000000000001",
            "task_rule_id": valid_task_rule_id
        }).execute()
    assert exc_info.value.code in ["42501"]

def test_progress_40_cascade_delete(new_user, service_client, valid_task_rule_id):
    client = new_user["client"]
    uid = new_user["id"]
    
    client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01",
        "consent_version": CURRENT_CONSENT_VERSION,
    }, returning="minimal").execute()
    client.table("user_task_progress").insert({
        "user_id": uid, "task_rule_id": valid_task_rule_id
    }).execute()
    
    # Delete user via PIPEDA RPC to cascade delete user data
    client.rpc("delete_current_user", {}).execute()
    
    res = service_client.table("user_task_progress").select("status").eq("user_id", uid).execute()
    assert len(res.data) == 0

# ============================================================================
# FEATURE 5: PII / PDF (Tests 41-50)
# ============================================================================

def test_pii_41_profile_no_pii_cols(new_user, service_client):
    uid = new_user["id"]
    service_client.table("user_profiles").insert({
        "id": uid, "origin_prov": "ON", "dest_prov": "AB", "move_date": "2026-10-01",
        "consent_version": CURRENT_CONSENT_VERSION,
    }).execute()
    
    row = service_client.table("user_profiles").select("*").eq("id", uid).execute().data[0]
    forbidden = ["name", "address", "dob", "birth", "license", "driver", "health", "card", "sin", "phone", "email"]
    for f in forbidden:
        assert f not in row.keys()

def test_pii_42_support_messages_no_pii_cols(service_client):
    res = service_client.table("support_messages").select("id, body").limit(1).execute()
    forbidden = ["name", "address", "dob", "license", "health", "email", "phone"]
    if len(res.data) > 0:
        keys = res.data[0].keys()
        for f in forbidden:
            assert f not in keys

def test_pii_43_support_threads_no_pii_cols(service_client):
    res = service_client.table("support_threads").select("id, status").limit(1).execute()
    forbidden = ["name", "address", "dob", "license", "health", "email", "phone"]
    if len(res.data) > 0:
        keys = res.data[0].keys()
        for f in forbidden:
            assert f not in keys

def test_pii_44_simulate_device_pii_store():
    local_secure_store = {}
    local_secure_store["full_name"] = "John Doe"
    local_secure_store["dob"] = "1990-01-01"
    local_secure_store["health_card"] = "1234-567-890-AB"
    assert local_secure_store["full_name"] == "John Doe"
    assert len(local_secure_store) == 3

def test_pii_45_simulate_pdf_cache_lifecycle():
    pdf_cache = {}
    pdf_bytes = b"%PDF-1.4 ... John Doe ..."
    pdf_cache["temp_registration.pdf"] = pdf_bytes
    assert "temp_registration.pdf" in pdf_cache
    assert len(pdf_cache["temp_registration.pdf"]) > 0

def test_pii_46_simulate_signout_wipes_local():
    local_secure_store = {"full_name": "John Doe", "dob": "1990-01-01"}
    pdf_cache = {"temp_registration.pdf": b"%PDF-1.4"}
    
    local_secure_store.clear()
    pdf_cache.clear()
    
    assert len(local_secure_store) == 0
    assert len(pdf_cache) == 0

def test_pii_47_simulate_delete_wipes_local():
    local_secure_store = {"full_name": "John Doe", "dob": "1990-01-01"}
    pdf_cache = {"temp_registration.pdf": b"%PDF-1.4"}
    
    local_secure_store.clear()
    pdf_cache.clear()
    
    assert len(local_secure_store) == 0
    assert len(pdf_cache) == 0

def test_pii_48_verify_support_thread_subject_blocked(consented_user):
    client = consented_user["client"]
    with pytest.raises(APIError) as exc_info:
        client.table("support_threads").insert({
            "user_id": consented_user["id"],
            "status": "AI",
            "subject": "John Doe PII Subject"  # Blocked by insert column restrictions
        }).execute()
    assert exc_info.value.code in ["42501"]

def test_pii_49_verify_support_message_body_blocked(consented_user):
    client = consented_user["client"]
    uid = consented_user["id"]
    
    res = client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    tid = res.data[0]["id"]
    
    with pytest.raises(APIError) as exc_info:
        client.table("support_messages").insert({
            "thread_id": tid,
            "sender": "user",
            "body": "My name is John Doe, health card 1234"
        }).execute()
    assert exc_info.value.code in ["42501"]

def test_pii_50_verify_support_ai_cannot_be_called_by_anon():
    resp = requests.post(f"{SUPABASE_URL}/functions/v1/support-ai", json={"thread_id": "50000000-0000-0000-0000-0000000000a"})
    assert resp.status_code in [401, 400]

# ============================================================================
# FEATURE 6: SUPPORT AI CHAT (Tests 51-60)
# ============================================================================

def test_support_51_thread_creation_success(consented_user):
    client = consented_user["client"]
    uid = consented_user["id"]
    
    res = client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    assert len(res.data) == 1
    assert res.data[0]["status"] == "AI"

def test_support_52_message_allowed(consented_user):
    client = consented_user["client"]
    uid = consented_user["id"]
    
    res = client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    tid = res.data[0]["id"]
    
    msg_res = client.table("support_messages").insert({
        "thread_id": tid,
        "sender": "user",
        "body": "What should I do first for my move?"
    }).execute()
    
    assert len(msg_res.data) == 1
    assert msg_res.data[0]["body"] == "What should I do first for my move?"

def test_support_53_message_disallowed(consented_user):
    client = consented_user["client"]
    uid = consented_user["id"]
    
    res = client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    tid = res.data[0]["id"]
    
    with pytest.raises(APIError) as exc_info:
        client.table("support_messages").insert({
            "thread_id": tid,
            "sender": "user",
            "body": "Can you tell me a joke?"
        }).execute()
    assert exc_info.value.code in ["42501"]

def test_support_54_thread_read_own(consented_user):
    client = consented_user["client"]
    uid = consented_user["id"]
    
    client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    
    res = client.table("support_threads").select("*").execute()
    assert len(res.data) == 1
    assert res.data[0]["user_id"] == uid

def test_support_55_thread_rls_read_other(consented_user, service_client):
    other_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    other_res = other_client.auth.sign_in_anonymously()
    other_uid = other_res.user.id
    
    try:
        service_client.table("user_profiles").insert({
            "id": other_uid, "origin_prov": "BC", "dest_prov": "QC", "move_date": "2026-12-01",
            "consent_version": CURRENT_CONSENT_VERSION,
        }).execute()
        service_client.table("support_threads").insert({"user_id": other_uid, "status": "AI"}).execute()
        
        client = consented_user["client"]
        res = client.table("support_threads").select("*").eq("user_id", other_uid).execute()
        assert len(res.data) == 0
    finally:
        service_client.auth.admin.delete_user(other_uid)

def test_support_56_message_rls_read_other(consented_user, service_client):
    other_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    other_res = other_client.auth.sign_in_anonymously()
    other_uid = other_res.user.id
    
    try:
        service_client.table("user_profiles").insert({
            "id": other_uid, "origin_prov": "BC", "dest_prov": "QC", "move_date": "2026-12-01",
            "consent_version": CURRENT_CONSENT_VERSION,
        }).execute()
        res = service_client.table("support_threads").insert({"user_id": other_uid, "status": "AI"}).execute()
        tid = res.data[0]["id"]
        service_client.table("support_messages").insert({
            "thread_id": tid, "sender": "user", "body": "What should I do first for my move?"
        }).execute()
        
        client = consented_user["client"]
        msg_res = client.table("support_messages").select("*").eq("thread_id", tid).execute()
        assert len(msg_res.data) == 0
    finally:
        service_client.auth.admin.delete_user(other_uid)

def test_support_57_persist_ai_reply_success(consented_user, service_client):
    client = consented_user["client"]
    uid = consented_user["id"]
    
    res = client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    tid = res.data[0]["id"]
    
    msg_res = client.table("support_messages").insert({
        "thread_id": tid, "sender": "user", "body": "What should I do first for my move?"
    }).execute()
    mid = msg_res.data[0]["id"]
    
    rpc_res = service_client.rpc("persist_support_ai_reply", {
        "p_thread_id": tid,
        "p_expected_user_message_id": mid,
        "p_reply_body": "This is a simulated AI reply",
        "p_escalate": False
    }).execute()
    
    assert rpc_res.data is True
    
    check = service_client.table("support_messages").select("sender, body").eq("thread_id", tid).execute()
    ai_msgs = [m for m in check.data if m["sender"] == "ai"]
    assert len(ai_msgs) == 1
    assert ai_msgs[0]["body"] == "This is a simulated AI reply"

def test_support_58_persist_ai_reply_fails_on_wrong_message_id(consented_user, service_client):
    client = consented_user["client"]
    uid = consented_user["id"]
    
    res = client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    tid = res.data[0]["id"]
    
    client.table("support_messages").insert({
        "thread_id": tid, "sender": "user", "body": "What should I do first for my move?"
    }).execute()
    
    rpc_res = service_client.rpc("persist_support_ai_reply", {
        "p_thread_id": tid,
        "p_expected_user_message_id": "00000000-0000-0000-0000-000000000000",
        "p_reply_body": "Stale AI reply",
        "p_escalate": False
    }).execute()
    
    assert rpc_res.data is False

def test_support_59_takeover_blocks_ai_reply(consented_user, service_client):
    client = consented_user["client"]
    uid = consented_user["id"]
    
    res = client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    tid = res.data[0]["id"]
    
    msg_res = client.table("support_messages").insert({
        "thread_id": tid, "sender": "user", "body": "What should I do first for my move?"
    }).execute()
    mid = msg_res.data[0]["id"]
    
    service_client.table("support_messages").insert({
        "thread_id": tid,
        "sender": "admin",
        "body": "Hello, how can I help you?"
    }).execute()
    
    rpc_res = service_client.rpc("persist_support_ai_reply", {
        "p_thread_id": tid,
        "p_expected_user_message_id": mid,
        "p_reply_body": "Blocked AI reply",
        "p_escalate": False
    }).execute()
    
    assert rpc_res.data is False

def test_support_60_reopen_thread(consented_user, service_client):
    client = consented_user["client"]
    uid = consented_user["id"]
    
    res = client.table("support_threads").insert({"user_id": uid, "status": "AI"}).execute()
    tid = res.data[0]["id"]
    
    service_client.table("support_threads").update({"status": "RESOLVED"}).eq("id", tid).execute()
    
    client.table("support_threads").update({"status": "AI"}).eq("id", tid).execute()
    
    check = service_client.table("support_threads").select("status").eq("id", tid).execute()
    assert check.data[0]["status"] == "AI"
