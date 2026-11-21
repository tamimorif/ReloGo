-- Keep client support writes limited to the business fields used by mobile.
-- Row ownership, fixed-question allowlisting, consent, and human-status checks
-- remain enforced by the existing RLS policies.

-- A table-level revoke does not remove the narrow column grants, but restate
-- them here so the intended privilege boundary is explicit after 029 and on
-- every environment that applies this migration.
REVOKE INSERT ON TABLE public.support_messages FROM authenticated;
GRANT INSERT (thread_id, sender, body)
    ON TABLE public.support_messages TO authenticated;

REVOKE INSERT, UPDATE ON TABLE public.support_threads FROM authenticated;
GRANT INSERT (user_id, status)
    ON TABLE public.support_threads TO authenticated;
GRANT UPDATE (status)
    ON TABLE public.support_threads TO authenticated;
