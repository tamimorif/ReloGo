-- ============================================================================
-- ReloGo — authenticated support-question privacy boundary
--
-- Users no longer compose arbitrary support text. Authenticated inserts are
-- limited to six exact, general questions that cannot carry names, addresses,
-- dates of birth, or document numbers. Existing transcripts remain readable;
-- server-authored AI/admin messages remain unrestricted by this user policy.
--
-- No helper/definer function is introduced, so there is no new search_path or
-- EXECUTE surface. Ownership and sender checks remain schema-qualified in the
-- policy, and the narrow client INSERT column grant is restated explicitly.
-- ============================================================================

DROP POLICY "support_messages: users can insert own messages"
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
        AND EXISTS (
            SELECT 1
            FROM public.support_threads AS t
            WHERE t.id = thread_id
              AND t.user_id = (SELECT auth.uid())
        )
    );

COMMENT ON POLICY "support_messages: users can insert approved questions"
    ON public.support_messages IS
    'Authenticated users may insert only one exact privacy-safe support question into a thread they own; AI/admin prose remains server-authored.';

REVOKE INSERT ON TABLE public.support_messages FROM authenticated;
GRANT INSERT (thread_id, sender, body)
    ON TABLE public.support_messages TO authenticated;


-- ============================================================================
-- Edge runtime privileges
-- Local fresh schemas do not inherit hosted-platform service_role table grants.
-- Grant only the columns support-ai reads and the one status field it updates;
-- AI reply insertion remains exclusively behind persist_support_ai_reply().
-- ============================================================================
GRANT USAGE ON SCHEMA public TO service_role;

GRANT SELECT (id, user_id, status)
    ON TABLE public.support_threads TO service_role;
GRANT UPDATE (status)
    ON TABLE public.support_threads TO service_role;

GRANT SELECT (id, thread_id, sender, body, created_at)
    ON TABLE public.support_messages TO service_role;

GRANT SELECT (
    id,
    origin_prov,
    dest_prov,
    move_date,
    has_vehicle,
    has_dependents
)
    ON TABLE public.user_profiles TO service_role;

GRANT SELECT (
    id,
    task_id,
    origin_province,
    dest_province,
    days_deadline,
    is_mandatory
)
    ON TABLE public.corridor_task_rules TO service_role;

GRANT SELECT (
    id,
    title_en,
    base_description_en,
    requires_vehicle,
    requires_dependents
)
    ON TABLE public.global_tasks TO service_role;

-- ============================================================================
-- END OF MIGRATION 010_support_question_privacy_boundary.sql
-- ============================================================================
