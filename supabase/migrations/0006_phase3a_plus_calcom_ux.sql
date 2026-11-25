-- ==============================================================================
-- Nails — Migración 0006: Phase 3A+ (Cal.com UX & Scheduling Intelligence:
-- C1 optimización continua opt-in, C7 nota pública y redirección OOO en overrides,
-- C9 servicios VIP privados)
-- ==============================================================================

ALTER TABLE public.salon_settings
  ADD COLUMN IF NOT EXISTS optimize_continuous_slots boolean NOT NULL DEFAULT false;

ALTER TABLE public.date_overrides
  ADD COLUMN IF NOT EXISTS public_note text,
  ADD COLUMN IF NOT EXISTS redirect_staff_id uuid REFERENCES public.staff_members(id) ON DELETE SET NULL;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

CREATE OR REPLACE VIEW public.public_busy_overrides
WITH (security_barrier = true)
AS
SELECT
  id,
  staff_id,
  override_date,
  is_unavailable,
  start_time,
  end_time,
  public_note,
  redirect_staff_id
FROM public.date_overrides;

GRANT SELECT ON public.public_busy_overrides TO anon, authenticated;
