-- ============================================================================
-- ReloGo — Canadian Relocation Autopilot
-- Supabase Migration: 001_init.sql
--
-- This single, self-contained migration creates the entire initial schema:
--   1. global_tasks            – canonical task catalogue
--   2. corridor_task_rules     – province-pair-specific deadlines & rules
--   3. official_sources        – government URLs backing each rule
--   4. rule_change_alerts      – automated URL-change audit log
--   5. user_profiles           – authenticated user preferences
--   6. user_task_progress      – per-user task completion tracker
--   7. waitlist                – pre-launch email capture
--
-- RLS is enabled on every table.
-- Seed data covers the Ontario → Alberta corridor (5 tasks).
-- ============================================================================


-- ============================================================================
-- 1. GLOBAL_TASKS
--    The universal task catalogue. Each row is a unique relocation task
--    (e.g., "Exchange Driver's Licence"). Province-specific rules live in
--    corridor_task_rules.
-- ============================================================================
CREATE TABLE global_tasks (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_key          VARCHAR(100) NOT NULL UNIQUE,   -- machine-readable key
    title_en          VARCHAR(255) NOT NULL,           -- human-readable title
    base_description_en TEXT      NOT NULL DEFAULT '', -- markdown-safe description
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  global_tasks IS 'Canonical catalogue of relocation tasks.';
COMMENT ON COLUMN global_tasks.task_key IS 'Stable machine key, e.g. EXCHANGE_DRIVERS_LICENCE.';


-- ============================================================================
-- 2. CORRIDOR_TASK_RULES
--    Province-to-province overrides for each global task.
--    origin_province / dest_province use ISO 3166-2:CA two-letter codes
--    or the wildcard 'ANY' to match all provinces.
-- ============================================================================
CREATE TABLE corridor_task_rules (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id           UUID        NOT NULL REFERENCES global_tasks(id) ON DELETE CASCADE,
    origin_province   VARCHAR(2)  NOT NULL DEFAULT 'ANY',  -- e.g. 'ON', 'ANY'
    dest_province     VARCHAR(2)  NOT NULL DEFAULT 'ANY',  -- e.g. 'AB'
    days_deadline     INTEGER,                              -- NULL = no fixed deadline
    is_mandatory      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  corridor_task_rules IS 'Province-pair-specific deadlines and mandatory flags.';
COMMENT ON COLUMN corridor_task_rules.origin_province IS 'Two-letter origin province code, or ANY for wildcard.';
COMMENT ON COLUMN corridor_task_rules.dest_province   IS 'Two-letter destination province code, or ANY for wildcard.';
COMMENT ON COLUMN corridor_task_rules.days_deadline   IS 'Number of days after move_date by which the task must be completed.';

-- Index: fast corridor lookups
CREATE INDEX idx_corridor_task_rules_corridor
    ON corridor_task_rules (origin_province, dest_province);


-- ============================================================================
-- 3. OFFICIAL_SOURCES
--    Each corridor rule is backed by one or more government / agency URLs.
--    The crawler uses last_verified + hash to detect changes.
-- ============================================================================
CREATE TABLE official_sources (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    corridor_rule_id  UUID        NOT NULL REFERENCES corridor_task_rules(id) ON DELETE CASCADE,
    agency_name       VARCHAR(255) NOT NULL,
    official_url      TEXT         NOT NULL,
    last_verified     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  official_sources IS 'Government / agency URLs backing each corridor rule.';
COMMENT ON COLUMN official_sources.last_verified IS 'Timestamp of the last successful crawl verification.';


-- ============================================================================
-- 4. RULE_CHANGE_ALERTS
--    When the crawler detects that a page hash has changed, it writes a
--    pending alert for human review.  Service-role only — never exposed
--    to end users.
-- ============================================================================
CREATE TABLE rule_change_alerts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    official_source_id  UUID        NOT NULL REFERENCES official_sources(id) ON DELETE CASCADE,
    old_hash            VARCHAR(255) NOT NULL,
    new_hash            VARCHAR(255) NOT NULL,
    diff_summary        TEXT,
    status              VARCHAR(50) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'APPROVED', 'DISMISSED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  rule_change_alerts IS 'Audit log of detected changes to official source pages.';
COMMENT ON COLUMN rule_change_alerts.status IS 'Review workflow state: PENDING → APPROVED or DISMISSED.';

-- Index: quickly surface unresolved alerts
CREATE INDEX idx_rule_change_alerts_status ON rule_change_alerts (status)
    WHERE status = 'PENDING';


-- ============================================================================
-- 5. USER_PROFILES
--    One row per authenticated user. The PK is a direct FK to auth.users(id)
--    so Supabase Auth is the single source of identity.
-- ============================================================================
CREATE TABLE user_profiles (
    id              UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    move_date       DATE,
    origin_prov     VARCHAR(2),
    dest_prov       VARCHAR(2),
    has_vehicle     BOOLEAN     NOT NULL DEFAULT FALSE,
    has_dependents  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  user_profiles IS 'Authenticated user relocation preferences.';
COMMENT ON COLUMN user_profiles.id IS 'FK to auth.users(id); one profile per user.';


-- ============================================================================
-- 6. USER_TASK_PROGRESS
--    Composite PK tracks each user's status for each applicable corridor rule.
-- ============================================================================
CREATE TABLE user_task_progress (
    user_id       UUID        NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    task_rule_id  UUID        NOT NULL REFERENCES corridor_task_rules(id) ON DELETE CASCADE,
    status        VARCHAR(20) NOT NULL DEFAULT 'LOCKED'
                  CHECK (status IN ('LOCKED', 'AVAILABLE', 'COMPLETED')),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, task_rule_id)
);

COMMENT ON TABLE  user_task_progress IS 'Per-user task completion state for their corridor.';
COMMENT ON COLUMN user_task_progress.status IS 'Workflow state: LOCKED → AVAILABLE → COMPLETED.';


-- ============================================================================
-- 7. WAITLIST
--    Pre-launch email capture from the landing page.
--    Anonymous INSERT only; read access limited to service_role.
-- ============================================================================
CREATE TABLE waitlist (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL,
    origin_province VARCHAR(2),
    dest_province   VARCHAR(2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  waitlist IS 'Pre-launch waitlist for the landing page.';


-- ############################################################################
--                        ROW-LEVEL SECURITY (RLS)
-- ############################################################################

-- Enable RLS on EVERY table (Supabase requirement)
ALTER TABLE global_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE corridor_task_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_sources    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_change_alerts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_task_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist            ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------------------------
-- PUBLIC TABLES: global_tasks, corridor_task_rules, official_sources
-- Anyone (anon + authenticated) can SELECT. No INSERT/UPDATE/DELETE.
-- --------------------------------------------------------------------------

-- global_tasks — read-only for everyone
CREATE POLICY "global_tasks: public read"
    ON global_tasks FOR SELECT
    TO anon, authenticated
    USING (true);

-- corridor_task_rules — read-only for everyone
CREATE POLICY "corridor_task_rules: public read"
    ON corridor_task_rules FOR SELECT
    TO anon, authenticated
    USING (true);

-- official_sources — read-only for everyone
CREATE POLICY "official_sources: public read"
    ON official_sources FOR SELECT
    TO anon, authenticated
    USING (true);


-- --------------------------------------------------------------------------
-- ADMIN TABLE: rule_change_alerts
-- Strictly service_role only. No policies for anon/authenticated means
-- they are denied by default (RLS is enabled, no permissive policies).
-- We create an explicit service_role policy for documentation clarity.
-- --------------------------------------------------------------------------

CREATE POLICY "rule_change_alerts: service_role full access"
    ON rule_change_alerts FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- --------------------------------------------------------------------------
-- PRIVATE TABLE: user_profiles
-- Users can only see, create, and update their own row.
-- --------------------------------------------------------------------------

CREATE POLICY "user_profiles: users can read own row"
    ON user_profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

CREATE POLICY "user_profiles: users can insert own row"
    ON user_profiles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

CREATE POLICY "user_profiles: users can update own row"
    ON user_profiles FOR UPDATE
    TO authenticated
    USING  (auth.uid() = id)
    WITH CHECK (auth.uid() = id);


-- --------------------------------------------------------------------------
-- PRIVATE TABLE: user_task_progress
-- Users can only interact with rows where user_id = their auth UID.
-- --------------------------------------------------------------------------

CREATE POLICY "user_task_progress: users can read own rows"
    ON user_task_progress FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "user_task_progress: users can insert own rows"
    ON user_task_progress FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_task_progress: users can update own rows"
    ON user_task_progress FOR UPDATE
    TO authenticated
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- --------------------------------------------------------------------------
-- WAITLIST
-- Anon can INSERT (landing page form). Only service_role can SELECT.
-- --------------------------------------------------------------------------

CREATE POLICY "waitlist: anon can insert"
    ON waitlist FOR INSERT
    TO anon
    WITH CHECK (true);

CREATE POLICY "waitlist: service_role can read"
    ON waitlist FOR SELECT
    TO service_role
    USING (true);


-- ############################################################################
--                           SEED DATA
--      Ontario (ON) → Alberta (AB) corridor — 5 representative tasks
-- ############################################################################

-- ------------------------------------
-- Global Tasks (5 rows)
-- ------------------------------------
INSERT INTO global_tasks (id, task_key, title_en, base_description_en) VALUES
    ('a1000000-0000-0000-0000-000000000001',
     'EXCHANGE_DRIVERS_LICENCE',
     'Exchange Driver''s Licence',
     'Surrender your Ontario driver''s licence and obtain an Alberta Class 5 licence. You must visit an Alberta registry agent in person with valid ID and your Ontario licence.'),

    ('a1000000-0000-0000-0000-000000000002',
     'REGISTER_VEHICLE',
     'Register Vehicle in Alberta',
     'Register your vehicle with an Alberta registry agent within the required timeframe. You will need your existing Ontario registration, proof of Alberta insurance, and an out-of-province vehicle inspection report.'),

    ('a1000000-0000-0000-0000-000000000003',
     'UPDATE_HEALTH_CARD',
     'Update Health Card',
     'Apply for Alberta Health Care Insurance Plan (AHCIP) coverage. There may be a waiting period; keep your Ontario OHIP card active until Alberta coverage begins.'),

    ('a1000000-0000-0000-0000-000000000004',
     'UPDATE_CRA_ADDRESS',
     'Update Mailing Address with CRA',
     'Notify the Canada Revenue Agency of your new address to ensure tax slips, benefit payments (CCB, GST/HST credit), and other correspondence are delivered correctly.'),

    ('a1000000-0000-0000-0000-000000000005',
     'REGISTER_CHILDREN_SCHOOL',
     'Register Children in New School',
     'Contact the local Alberta school board or school to register your children. Bring previous school records, immunization records, and proof of Alberta residency.');


-- ------------------------------------
-- Corridor Task Rules (ON → AB)
-- ------------------------------------
INSERT INTO corridor_task_rules (id, task_id, origin_province, dest_province, days_deadline, is_mandatory) VALUES
    ('b2000000-0000-0000-0000-000000000001',
     'a1000000-0000-0000-0000-000000000001',  -- EXCHANGE_DRIVERS_LICENCE
     'ON', 'AB', 90, TRUE),

    ('b2000000-0000-0000-0000-000000000002',
     'a1000000-0000-0000-0000-000000000002',  -- REGISTER_VEHICLE
     'ON', 'AB', 90, TRUE),

    ('b2000000-0000-0000-0000-000000000003',
     'a1000000-0000-0000-0000-000000000003',  -- UPDATE_HEALTH_CARD
     'ON', 'AB', 90, TRUE),                    -- "within 3 months" ≈ 90 days

    ('b2000000-0000-0000-0000-000000000004',
     'a1000000-0000-0000-0000-000000000004',  -- UPDATE_CRA_ADDRESS
     'ON', 'AB', 30, TRUE),

    ('b2000000-0000-0000-0000-000000000005',
     'a1000000-0000-0000-0000-000000000005',  -- REGISTER_CHILDREN_SCHOOL
     'ON', 'AB', NULL, FALSE);                 -- conditional on has_dependents; no fixed deadline


-- ------------------------------------
-- Official Sources (real Canadian government URLs)
-- ------------------------------------
INSERT INTO official_sources (id, corridor_rule_id, agency_name, official_url, last_verified) VALUES
    -- Driver's Licence
    ('c3000000-0000-0000-0000-000000000001',
     'b2000000-0000-0000-0000-000000000001',
     'Alberta Motor Association / Alberta.ca',
     'https://www.alberta.ca/exchange-non-alberta-licences',
     NOW()),

    -- Vehicle Registration
    ('c3000000-0000-0000-0000-000000000002',
     'b2000000-0000-0000-0000-000000000002',
     'Service Alberta',
     'https://www.alberta.ca/register-vehicle',
     NOW()),

    -- Health Card
    ('c3000000-0000-0000-0000-000000000003',
     'b2000000-0000-0000-0000-000000000003',
     'Alberta Health Care Insurance Plan',
     'https://www.alberta.ca/ahcip-how-to-apply',
     NOW()),

    -- CRA Address Update
    ('c3000000-0000-0000-0000-000000000004',
     'b2000000-0000-0000-0000-000000000004',
     'Canada Revenue Agency',
     'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/change-your-address.html',
     NOW()),

    -- School Registration
    ('c3000000-0000-0000-0000-000000000005',
     'b2000000-0000-0000-0000-000000000005',
     'Alberta Education',
     'https://www.alberta.ca/register-for-school',
     NOW());


-- ============================================================================
-- END OF MIGRATION 001_init.sql
-- ============================================================================
