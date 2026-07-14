import pytest
import os
import time
import requests
import subprocess
from supabase import create_client, Client

SUPABASE_URL = "http://127.0.0.1:54321"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
CURRENT_CONSENT_VERSION = "1.1"

@pytest.fixture(scope="session", autouse=True)
def setup_e2e_db():
    """Session fixture that resets the database at the start, waits for Supabase services
    to become healthy, and applies the necessary E2E privileges.
    """
    # 1. Reset database to clean migrations/seed state
    subprocess.run(["supabase", "db", "reset", "--local"], capture_output=True)
    
    # 2. Wait until PostgREST and Auth are healthy
    for _ in range(30):
        try:
            r = requests.get(f"{SUPABASE_URL}/rest/v1/", headers={"apikey": SUPABASE_ANON_KEY})
            if r.status_code in [200, 404, 401]:
                break
        except Exception:
            pass
        time.sleep(1)
        
    time.sleep(2)  # Additional buffer for services to fully stabilize
    
    # 3. Apply baseline and column-level restricted grants
    commands = [
        "GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, anon, authenticated;",
        "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, anon, authenticated;",
        
        # Re-apply 006's official_sources select restriction
        "REVOKE SELECT ON public.official_sources FROM anon, authenticated;",
        "GRANT SELECT (id, corridor_rule_id, agency_name, official_url, last_verified, created_at) ON public.official_sources TO anon, authenticated;",
        
        # Re-apply 008's support message insert restriction
        "REVOKE INSERT ON public.support_messages FROM authenticated;",
        "GRANT INSERT (thread_id, sender, body) ON public.support_messages TO authenticated;",
        
        # Re-apply 008/012's support thread restrictions
        "REVOKE INSERT, UPDATE ON public.support_threads FROM authenticated;",
        "GRANT INSERT (user_id, status) ON public.support_threads TO authenticated;",
        "GRANT UPDATE (status) ON public.support_threads TO authenticated;",
        
        # Re-apply 009's RPC-only rule-review boundary
        "REVOKE UPDATE ON public.corridor_task_rules FROM anon, authenticated;",
        "REVOKE UPDATE ON public.rule_change_alerts FROM anon, authenticated;",
        
        # Reload PostgREST schema cache
        "NOTIFY pgrst, 'reload schema';"
    ]
    for cmd in commands:
        subprocess.run(["supabase", "db", "query", cmd], capture_output=True)
        
    yield
    
    # No teardown reset to avoid leaving container in a state of restart

@pytest.fixture(scope="session")
def supabase_url():
    return SUPABASE_URL

@pytest.fixture(scope="session")
def anon_key():
    return SUPABASE_ANON_KEY

@pytest.fixture(scope="session")
def service_key():
    return SUPABASE_SERVICE_ROLE_KEY

@pytest.fixture(scope="session")
def service_client():
    """Service client bypasses RLS and handles test setup/cleanup."""
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

@pytest.fixture
def anon_client():
    """Fresh anon client representing unauthenticated visitor."""
    return create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

@pytest.fixture
def new_user(service_client):
    """Fixture that creates a temporary anonymous user and returns a dict with details.
    Cleans up the user after the test.
    """
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    res = client.auth.sign_in_anonymously()
    user_id = res.user.id
    token = res.session.access_token
    
    # Return user details and authenticated client
    user_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    user_client.auth.set_session(res.session.access_token, res.session.refresh_token)
    
    yield {
        "id": user_id,
        "client": user_client,
        "token": token
    }
    
    # Teardown: delete the user from auth.users
    try:
        service_client.auth.admin.delete_user(user_id)
    except Exception:
        pass

@pytest.fixture
def consented_user(new_user):
    """Authenticated user with a profile accepting the server-current policies."""
    new_user["client"].table("user_profiles").insert({
        "id": new_user["id"],
        "origin_prov": "ON",
        "dest_prov": "AB",
        "move_date": "2026-10-01",
        "consent_version": CURRENT_CONSENT_VERSION,
    }, returning="minimal").execute()
    return new_user

@pytest.fixture(scope="session")
def valid_task_rule_id(service_client):
    """Retrieves a valid task rule ID dynamically from seeded database rules."""
    res = service_client.table("corridor_task_rules").select("id").limit(1).execute()
    if not res.data:
        return "20000000-0000-0000-0000-000000000001"
    return res.data[0]["id"]

@pytest.fixture(autouse=True)
def clean_db(service_client):
    """Automatically cleans up tables before/after each test run to maintain test isolation."""
    yield
    try:
        service_client.table("waitlist").delete().neq("email", "").execute()
    except Exception:
        pass
    try:
        service_client.table("waitlist_signup_throttle").delete().neq("ip_hash", "").execute()
    except Exception:
        pass
    try:
        service_client.table("user_profiles").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    except Exception:
        pass
    try:
        service_client.table("support_threads").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    except Exception:
        pass
