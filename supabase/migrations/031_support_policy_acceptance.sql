-- The simplified mobile app keeps route and legal acceptance on-device and
-- does not create legacy user_profiles rows. Support still needs a server-side
-- consent predicate, so retain only the anonymous support identity, policy
-- version, and server-authored acceptance time.
CREATE TABLE public.support_policy_acceptances (
    user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    consent_version TEXT NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);

ALTER TABLE public.support_policy_acceptances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_policy_acceptances
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_support_policy_acceptance(
    p_consent_version TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_current_version TEXT := public.current_policy_version();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'record_support_policy_acceptance(): not authenticated'
            USING ERRCODE = '42501';
    END IF;

    IF p_consent_version IS DISTINCT FROM v_current_version THEN
        RAISE EXCEPTION 'record_support_policy_acceptance(): consent version is not current'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.support_policy_acceptances (
        user_id,
        consent_version
    )
    VALUES (v_user_id, v_current_version)
    ON CONFLICT (user_id) DO UPDATE
       SET consent_version = EXCLUDED.consent_version,
           accepted_at = statement_timestamp()
     WHERE public.support_policy_acceptances.consent_version
           IS DISTINCT FROM EXCLUDED.consent_version;

    RETURN v_current_version;
END;
$$;

COMMENT ON FUNCTION public.record_support_policy_acceptance(TEXT) IS
    'Records the current policy version for the authenticated anonymous support identity without storing route or checklist data.';

REVOKE ALL ON FUNCTION public.record_support_policy_acceptance(TEXT)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_support_policy_acceptance(TEXT)
    TO authenticated;

CREATE OR REPLACE FUNCTION public.has_current_support_policy_consent()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT auth.uid() IS NOT NULL
       AND (
            EXISTS (
                SELECT 1
                  FROM public.user_profiles AS p
                 WHERE p.id = auth.uid()
                   AND p.consent_version = public.current_policy_version()
            )
            OR EXISTS (
                SELECT 1
                  FROM public.support_policy_acceptances AS a
                 WHERE a.user_id = auth.uid()
                   AND a.consent_version = public.current_policy_version()
            )
       )
$$;

REVOKE ALL ON FUNCTION public.has_current_support_policy_consent()
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_current_support_policy_consent()
    TO authenticated;

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
        AND (SELECT public.has_current_support_policy_consent())
    );

CREATE POLICY "support_threads: users can read own threads"
    ON public.support_threads FOR SELECT
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND (SELECT public.has_current_support_policy_consent())
    );

CREATE POLICY "support_threads: users can update own threads"
    ON public.support_threads FOR UPDATE
    TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        AND (SELECT public.has_current_support_policy_consent())
    )
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND status <> 'HUMAN'
        AND (SELECT public.has_current_support_policy_consent())
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
            'What should I do first for my move?',
            'Which tasks are mandatory for my move?',
            'What deadlines should I know about?',
            'Which documents should I prepare?',
            'What vehicle-related tasks apply to me?',
            'How do I update my health coverage?'
        ]::TEXT[])
        AND (SELECT public.has_current_support_policy_consent())
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
        (SELECT public.has_current_support_policy_consent())
        AND EXISTS (
            SELECT 1
              FROM public.support_threads AS t
             WHERE t.id = thread_id
               AND t.user_id = (SELECT auth.uid())
        )
    );
