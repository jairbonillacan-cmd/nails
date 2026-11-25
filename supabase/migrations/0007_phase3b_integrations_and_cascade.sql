-- ==============================================================================
-- Nails — Migración 0007: Phase 3B (Mercado Pago Checkout + Webhook idempotente,
-- Google Calendar OAuth/Watch cifrado, Recordatorios en Cascada N5 y Lista de
-- Espera con oferta prioritaria de 10 minutos U3)
-- ==============================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS confirmed_via text
    CHECK (confirmed_via IS NULL OR confirmed_via IN ('manual', 'email', 'whatsapp', 'payment')),
  ADD COLUMN IF NOT EXISTS checkout_url text;

ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS priority_offer_token text,
  ADD COLUMN IF NOT EXISTS priority_offer_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS priority_offer_slot_start_at timestamptz;

ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS access_token_encrypted text,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS watch_channel_id text,
  ADD COLUMN IF NOT EXISTS watch_resource_id text,
  ADD COLUMN IF NOT EXISTS watch_expiration timestamptz;

ALTER TABLE public.booking_payments
  ADD COLUMN IF NOT EXISTS provider_payment_id text,
  ADD COLUMN IF NOT EXISTS checkout_url text;

CREATE UNIQUE INDEX IF NOT EXISTS booking_payments_provider_payment_id_uidx
  ON public.booking_payments (provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
