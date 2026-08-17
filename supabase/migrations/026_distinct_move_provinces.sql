-- ============================================================================
-- ReloGo — origin and destination must differ
--
-- Product flows already reject same-province moves. Enforce the invariant at
-- the database boundary as well. NOT VALID deliberately preserves any legacy
-- hosted rows instead of rewriting or deleting user/waitlist data; PostgreSQL
-- still enforces each constraint for every new or updated row.
-- ============================================================================

ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_distinct_provinces_check
    CHECK (
        origin_prov IS NULL
        OR dest_prov IS NULL
        OR origin_prov <> dest_prov
    ) NOT VALID;

ALTER TABLE public.waitlist
    ADD CONSTRAINT waitlist_distinct_provinces_check
    CHECK (
        origin_province IS NULL
        OR dest_province IS NULL
        OR origin_province <> dest_province
    ) NOT VALID;

COMMENT ON CONSTRAINT user_profiles_distinct_provinces_check
    ON public.user_profiles IS
    'New or updated profiles must describe an interprovincial move; NOT VALID preserves pre-migration legacy rows.';

COMMENT ON CONSTRAINT waitlist_distinct_provinces_check
    ON public.waitlist IS
    'New or updated waitlist rows must describe an interprovincial move when both provinces are supplied; NOT VALID preserves pre-migration legacy rows.';

-- ============================================================================
-- END OF MIGRATION 026_distinct_move_provinces.sql
-- ============================================================================
