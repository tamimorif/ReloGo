-- ============================================================================
-- ReloGo — hosted support-ai least-privilege parity
--
-- Fresh hosted Supabase projects provision service_role with broad table
-- privileges before project migrations run. Migration 010 added the narrow
-- support-ai grants required by the Edge Function, but GRANT is additive: it
-- did not remove those pre-existing hosted privileges. Local fresh databases
-- therefore had the intended boundary while hosted databases still allowed
-- direct writes and unrelated column reads.
--
-- Revoke the platform baseline on every table support-ai touches, then restore
-- only the columns used by its authenticated checks, transcript scan,
-- non-PII grounding, and status-only escalation. AI message insertion remains
-- exclusively behind persist_support_ai_reply().
--
-- `service_role` is shared by the Edge Function and worker, so this migration
-- narrows their aggregate server capability set; it does not create
-- workload-specific credential isolation.
-- ============================================================================

GRANT USAGE ON SCHEMA public TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.support_threads FROM service_role;
GRANT SELECT (id, user_id, status, human_takeover_at)
    ON TABLE public.support_threads TO service_role;
GRANT UPDATE (status)
    ON TABLE public.support_threads TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.support_messages FROM service_role;
GRANT SELECT (id, thread_id, sender, body, created_at)
    ON TABLE public.support_messages TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.user_profiles FROM service_role;
GRANT SELECT (
    id,
    origin_prov,
    dest_prov,
    move_date,
    has_vehicle,
    has_dependents
)
    ON TABLE public.user_profiles TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.corridor_task_rules FROM service_role;
GRANT SELECT (
    id,
    task_id,
    origin_province,
    dest_province,
    days_deadline,
    is_mandatory
)
    ON TABLE public.corridor_task_rules TO service_role;

REVOKE ALL PRIVILEGES ON TABLE public.global_tasks FROM service_role;
GRANT SELECT (
    id,
    title_en,
    base_description_en,
    requires_vehicle,
    requires_dependents
)
    ON TABLE public.global_tasks TO service_role;

-- ============================================================================
-- END OF MIGRATION 015_hosted_support_ai_least_privilege.sql
-- ============================================================================
