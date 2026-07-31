-- ============================================================================
-- ReloGo — remove the unused LOCKED checklist state
--
-- No unlock engine exists and every missing task is already presented as
-- AVAILABLE. Convert any legacy LOCKED rows before narrowing the constraint,
-- then make AVAILABLE the database default so omitted statuses match the app.
-- ============================================================================

UPDATE public.user_task_progress
SET status = 'AVAILABLE'
WHERE status = 'LOCKED';

ALTER TABLE public.user_task_progress
    ALTER COLUMN status SET DEFAULT 'AVAILABLE',
    DROP CONSTRAINT user_task_progress_status_check,
    ADD CONSTRAINT user_task_progress_status_check
        CHECK (status IN ('AVAILABLE', 'COMPLETED'));

COMMENT ON COLUMN public.user_task_progress.status IS
    'Checklist state: AVAILABLE or COMPLETED. Missing rows are also interpreted as AVAILABLE.';

-- ============================================================================
-- END OF MIGRATION 025_available_only_progress.sql
-- ============================================================================
