-- ==============================================================================
-- Nails — Migración 0008: Producción Cloudflare R2, Retención 12 Meses,
-- Plantillas/Cuota WhatsApp Cloud API (Coexistence) y Deduplicación de Webhooks
-- ==============================================================================

ALTER TABLE public.salon_settings
  ADD COLUMN IF NOT EXISTS retention_notice_email text,
  ADD COLUMN IF NOT EXISTS whatsapp_monthly_quota integer NOT NULL DEFAULT 500
    CHECK (whatsapp_monthly_quota >= 1);

CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL UNIQUE,
  folder text NOT NULL CHECK (folder IN ('proofs', 'inspo', 'gallery')),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  content_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  retention_warned_30d_at timestamptz,
  retention_warned_7d_at timestamptz,
  purged_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_media_assets_retention
  ON public.media_assets(purged_at, created_at);

CREATE INDEX IF NOT EXISTS idx_media_assets_booking
  ON public.media_assets(booking_id);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_media_assets" ON public.media_assets;
CREATE POLICY "admins_manage_media_assets" ON public.media_assets
  FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));

CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_key text NOT NULL UNIQUE,
  template_name text NOT NULL,
  category text NOT NULL DEFAULT 'UTILITY'
    CHECK (category IN ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  language_code text NOT NULL DEFAULT 'es_MX',
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_manage_whatsapp_templates" ON public.whatsapp_templates;
CREATE POLICY "owner_manage_whatsapp_templates" ON public.whatsapp_templates
  FOR ALL USING (public.current_admin_role() = 'owner');

DROP POLICY IF EXISTS "staff_read_whatsapp_templates" ON public.whatsapp_templates;
CREATE POLICY "staff_read_whatsapp_templates" ON public.whatsapp_templates
  FOR SELECT USING (public.current_admin_role() IN ('admin', 'specialist'));

CREATE TABLE IF NOT EXISTS public.whatsapp_monthly_usage (
  month_key text PRIMARY KEY CHECK (month_key ~ '^\d{4}-\d{2}$'),
  sent_count integer NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  quota_limit integer NOT NULL DEFAULT 500 CHECK (quota_limit >= 1),
  warned_80_at timestamptz,
  warned_100_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_monthly_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_whatsapp_monthly_usage" ON public.whatsapp_monthly_usage;
CREATE POLICY "admins_read_whatsapp_monthly_usage" ON public.whatsapp_monthly_usage
  FOR SELECT USING (public.current_admin_role() IN ('owner', 'admin'));

CREATE OR REPLACE FUNCTION public.increment_whatsapp_usage(
  p_month_key text,
  p_quota_limit integer DEFAULT 500,
  p_increment integer DEFAULT 1
)
RETURNS TABLE (
  month_key text,
  sent_count integer,
  quota_limit integer,
  warned_80_at timestamptz,
  warned_100_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_quota integer;
  v_inc integer;
  v_now timestamptz;
BEGIN
  IF p_month_key IS NULL OR p_month_key !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'INVALID_MONTH_KEY' USING ERRCODE = '22023';
  END IF;

  v_quota := GREATEST(1, COALESCE(p_quota_limit, 500));
  v_inc := GREATEST(0, COALESCE(p_increment, 1));
  v_now := pg_catalog.now();

  INSERT INTO public.whatsapp_monthly_usage (
    month_key,
    sent_count,
    quota_limit,
    warned_80_at,
    warned_100_at,
    updated_at
  )
  VALUES (
    p_month_key,
    v_inc,
    v_quota,
    CASE WHEN v_inc * 100 >= v_quota * 80 THEN v_now ELSE NULL END,
    CASE WHEN v_inc >= v_quota THEN v_now ELSE NULL END,
    v_now
  )
  ON CONFLICT (month_key) DO UPDATE SET
    sent_count = public.whatsapp_monthly_usage.sent_count + v_inc,
    quota_limit = v_quota,
    warned_80_at = COALESCE(
      public.whatsapp_monthly_usage.warned_80_at,
      CASE
        WHEN (public.whatsapp_monthly_usage.sent_count + v_inc) * 100 >= v_quota * 80
          THEN v_now
        ELSE NULL
      END
    ),
    warned_100_at = COALESCE(
      public.whatsapp_monthly_usage.warned_100_at,
      CASE
        WHEN (public.whatsapp_monthly_usage.sent_count + v_inc) >= v_quota
          THEN v_now
        ELSE NULL
      END
    ),
    updated_at = v_now;

  RETURN QUERY
  SELECT
    u.month_key,
    u.sent_count,
    u.quota_limit,
    u.warned_80_at,
    u.warned_100_at,
    u.updated_at
  FROM public.whatsapp_monthly_usage u
  WHERE u.month_key = p_month_key;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_whatsapp_usage(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_whatsapp_usage(text, integer, integer) TO service_role;

CREATE TABLE IF NOT EXISTS public.webhook_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
  ON public.webhook_events(received_at);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_read_webhook_events" ON public.webhook_events;
CREATE POLICY "owner_read_webhook_events" ON public.webhook_events
  FOR SELECT USING (public.current_admin_role() = 'owner');

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  FOR v_constraint_name IN
    SELECT con.conname
    FROM pg_catalog.pg_constraint con
    JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
    JOIN pg_catalog.pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'audit_logs'
      AND con.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(con.oid) LIKE '%action%'
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS %I',
      v_constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_action_check CHECK (
    action IN (
      'booking_canceled',
      'booking_price_override',
      'csv_exported',
      'past_booking_override',
      'deposit_approved',
      'loyalty_redeemed',
      'media_retention_warned',
      'media_retention_purged'
    )
  );
