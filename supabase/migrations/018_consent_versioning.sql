-- Migration 018: Consent versioning for mobile onboarding
-- Requires capturing the version of terms/privacy the user agreed to.

ALTER TABLE public.user_profiles
ADD COLUMN consent_version text NOT NULL DEFAULT '1.0',
ADD COLUMN consent_timestamp timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.user_profiles.consent_version IS
    'The version string of the legal policies the user explicitly accepted at onboarding.';
COMMENT ON COLUMN public.user_profiles.consent_timestamp IS
    'The exact UTC timestamp when the user submitted the onboarding form with affirmative consent.';
