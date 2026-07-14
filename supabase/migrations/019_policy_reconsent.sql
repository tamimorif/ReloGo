-- ============================================================================
-- ReloGo — server-authored legal-policy re-consent
--
-- Migration 018 added a combined policy version and acceptance timestamp to
-- user_profiles. This migration makes the timestamp a server-authored audit
-- value and exposes one narrow authenticated RPC for future re-consent.
--
-- When the published Privacy Policy or Terms version changes, a later
-- migration replaces current_policy_version(). Every trigger, RPC, and RLS
-- gate below reads that one server-side value, so older clients fail closed.
-- ============================================================================
-- CURRENT_CONSENT_VERSION: 1.1

CREATE OR REPLACE FUNCTION public.current_policy_version()
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT '1.1'::TEXT
$$;

REVOKE ALL ON FUNCTION public.current_policy_version()
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_policy_version()
    TO authenticated, service_role;

-- Migration 018's 1.0 default would become an invalid hidden value as soon as
-- the current version advances. Callers must now attest explicitly, while the
-- trigger below verifies that the supplied version is server-current.
ALTER TABLE public.user_profiles
    ALTER COLUMN consent_version DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.enforce_user_profile_consent_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_current_version TEXT := public.current_policy_version();
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.consent_version IS DISTINCT FROM v_current_version THEN
            RAISE EXCEPTION 'unsupported consent version'
                USING ERRCODE = '23514';
        END IF;

        NEW.consent_timestamp := statement_timestamp();
        RETURN NEW;
    END IF;

    IF NEW.consent_version IS DISTINCT FROM OLD.consent_version THEN
        IF NEW.consent_version IS DISTINCT FROM v_current_version THEN
            RAISE EXCEPTION 'unsupported consent version'
                USING ERRCODE = '23514';
        END IF;

        NEW.consent_timestamp := statement_timestamp();
    ELSIF NEW.consent_timestamp IS DISTINCT FROM OLD.consent_timestamp THEN
        -- A client may re-attest to the current version, but it cannot choose
        -- the audit timestamp that is persisted.
        NEW.consent_timestamp := statement_timestamp();
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_user_profile_consent_integrity()
    FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trg_user_profiles_consent_integrity
    BEFORE INSERT OR UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_user_profile_consent_integrity();

CREATE OR REPLACE FUNCTION public.has_current_policy_consent()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT auth.uid() IS NOT NULL
       AND EXISTS (
            SELECT 1
              FROM public.user_profiles AS p
             WHERE p.id = auth.uid()
               AND p.consent_version = public.current_policy_version()
       )
$$;

REVOKE ALL ON FUNCTION public.has_current_policy_consent()
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_current_policy_consent()
    TO authenticated;

CREATE OR REPLACE FUNCTION public.get_policy_consent_state()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_accepted_version TEXT;
    v_current_version TEXT := public.current_policy_version();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'get_policy_consent_state(): not authenticated';
    END IF;

    SELECT p.consent_version
      INTO v_accepted_version
      FROM public.user_profiles AS p
     WHERE p.id = v_user_id;

    RETURN jsonb_build_object(
        'has_profile', FOUND,
        'accepted_version', v_accepted_version,
        'current_version', v_current_version,
        'has_current_consent',
            v_accepted_version IS NOT DISTINCT FROM v_current_version
            AND FOUND
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_policy_consent_state()
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_policy_consent_state()
    TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_current_policies()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_current_version TEXT := public.current_policy_version();
    v_consent_version TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'accept_current_policies(): not authenticated';
    END IF;

    UPDATE public.user_profiles
       SET consent_version = v_current_version,
           consent_timestamp = statement_timestamp()
     WHERE id = auth.uid()
     RETURNING consent_version INTO v_consent_version;

    IF v_consent_version IS NULL THEN
        RAISE EXCEPTION 'accept_current_policies(): profile not found';
    END IF;

    RETURN v_consent_version;
END;
$$;

COMMENT ON FUNCTION public.accept_current_policies() IS
    'Records the calling user''s acceptance of the currently published Privacy Policy and Terms using a server-authored timestamp.';

REVOKE ALL ON FUNCTION public.accept_current_policies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_current_policies() TO authenticated;

-- Normal app data is available only after accepting the server-current
-- policy version. The narrow state/acceptance/deletion RPCs remain reachable,
-- so a new client can re-consent and a user who declines can still erase the
-- account. Admin policies are separate and remain unaffected.
DROP POLICY "user_profiles: users can read own row"
    ON public.user_profiles;
DROP POLICY "user_profiles: users can insert own row"
    ON public.user_profiles;
DROP POLICY "user_profiles: users can update own row"
    ON public.user_profiles;

CREATE POLICY "user_profiles: users can read own row"
    ON public.user_profiles FOR SELECT
    TO authenticated
    USING (
        (SELECT auth.uid()) = id
        AND (SELECT public.has_current_policy_consent())
    );

CREATE POLICY "user_profiles: users can insert own row"
    ON public.user_profiles FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = id
        AND consent_version = (SELECT public.current_policy_version())
    );

CREATE POLICY "user_profiles: users can update own row"
    ON public.user_profiles FOR UPDATE
    TO authenticated
    USING (
        (SELECT auth.uid()) = id
        AND (SELECT public.has_current_policy_consent())
    )
    WITH CHECK (
        (SELECT auth.uid()) = id
        AND consent_version = (SELECT public.current_policy_version())
        AND (SELECT public.has_current_policy_consent())
    );

DROP POLICY "user_task_progress: users can read own rows"
    ON public.user_task_progress;
DROP POLICY "user_task_progress: users can insert own rows"
    ON public.user_task_progress;
DROP POLICY "user_task_progress: users can update own rows"
    ON public.user_task_progress;
DROP POLICY "user_task_progress: users can delete own rows"
    ON public.user_task_progress;

CREATE POLICY "user_task_progress: users can read own rows"
    ON public.user_task_progress FOR SELECT
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND (SELECT public.has_current_policy_consent())
    );

CREATE POLICY "user_task_progress: users can insert own rows"
    ON public.user_task_progress FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND (SELECT public.has_current_policy_consent())
    );

CREATE POLICY "user_task_progress: users can update own rows"
    ON public.user_task_progress FOR UPDATE
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND (SELECT public.has_current_policy_consent())
    )
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND (SELECT public.has_current_policy_consent())
    );

CREATE POLICY "user_task_progress: users can delete own rows"
    ON public.user_task_progress FOR DELETE
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND (SELECT public.has_current_policy_consent())
    );

DROP POLICY "support_threads: users can insert own threads"
    ON public.support_threads;
DROP POLICY "support_threads: users can read own threads"
    ON public.support_threads;
DROP POLICY "support_threads: users can update own threads"
    ON public.support_threads;

CREATE POLICY "support_threads: users can insert own threads"
    ON public.support_threads FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND status <> 'HUMAN'
        AND (SELECT public.has_current_policy_consent())
    );

CREATE POLICY "support_threads: users can read own threads"
    ON public.support_threads FOR SELECT
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND (SELECT public.has_current_policy_consent())
    );

CREATE POLICY "support_threads: users can update own threads"
    ON public.support_threads FOR UPDATE
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND (SELECT public.has_current_policy_consent())
    )
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND status <> 'HUMAN'
        AND (SELECT public.has_current_policy_consent())
    );

DROP POLICY "support_messages: users can insert approved questions"
    ON public.support_messages;
DROP POLICY "support_messages: users can read own thread messages"
    ON public.support_messages;

CREATE POLICY "support_messages: users can insert approved questions"
    ON public.support_messages FOR INSERT
    TO authenticated
    WITH CHECK (
        sender = 'user'
        AND body = ANY (ARRAY[
            -- SUPPORT_QUESTIONS_SQL_START
            'What should I do first for my move?',
            'Which tasks are mandatory for my move?',
            'What deadlines should I know about?',
            'Which documents should I prepare?',
            'What vehicle-related tasks apply to me?',
            'How do I update my health coverage?'
            -- SUPPORT_QUESTIONS_SQL_END
        ]::TEXT[])
        AND (SELECT public.has_current_policy_consent())
        AND EXISTS (
            SELECT 1
              FROM public.support_threads AS t
             WHERE t.id = thread_id
               AND t.user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "support_messages: users can read own thread messages"
    ON public.support_messages FOR SELECT
    TO authenticated
    USING (
        (SELECT public.has_current_policy_consent())
        AND EXISTS (
            SELECT 1
              FROM public.support_threads AS t
             WHERE t.id = thread_id
               AND t.user_id = (SELECT auth.uid())
        )
    );

COMMENT ON COLUMN public.user_profiles.consent_timestamp IS
    'Server-authored UTC timestamp of the latest explicit acceptance of consent_version.';

-- ============================================================================
-- END OF MIGRATION 019_policy_reconsent.sql
-- ============================================================================
