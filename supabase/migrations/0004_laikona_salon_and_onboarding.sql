-- ==============================================================================
-- Nails — Migración 0004: LAIKONA NAILS, horarios fijos, multi-servicio y onboarding
-- ==============================================================================

ALTER TABLE public.availability_rules
  ADD COLUMN IF NOT EXISTS fixed_start_times text[];

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_starting_price boolean NOT NULL DEFAULT false;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS instagram_handle text;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS extra_service_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  ADD COLUMN IF NOT EXISTS client_instagram text,
  ADD COLUMN IF NOT EXISTS custom_duration_minutes integer CHECK (custom_duration_minutes IS NULL OR custom_duration_minutes > 0),
  ADD COLUMN IF NOT EXISTS custom_price_cents integer CHECK (custom_price_cents IS NULL OR custom_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS internal_notes text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS proof_delivery_method text NOT NULL DEFAULT 'none'
    CHECK (proof_delivery_method IN ('web_upload', 'instagram_dm', 'none'));

ALTER TABLE public.salon_settings
  ADD COLUMN IF NOT EXISTS instagram_handle text,
  ADD COLUMN IF NOT EXISTS sister_studio_handle text,
  ADD COLUMN IF NOT EXISTS deposit_bank_name text,
  ADD COLUMN IF NOT EXISTS deposit_beneficiary text,
  ADD COLUMN IF NOT EXISTS deposit_clabe text,
  ADD COLUMN IF NOT EXISTS deposit_amount_cents integer NOT NULL DEFAULT 20000 CHECK (deposit_amount_cents >= 0),
  ADD COLUMN IF NOT EXISTS service_mode text NOT NULL DEFAULT 'studio'
    CHECK (service_mode IN ('studio', 'home', 'online')),
  ADD COLUMN IF NOT EXISTS business_type text,
  ADD COLUMN IF NOT EXISTS team_size_tier text,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sound_alerts_enabled boolean NOT NULL DEFAULT true;
