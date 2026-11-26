-- ==============================================================================
-- Nails — Migración 0010: Fase 3 (Confirmación 24 h, Rechazo de comprobante y
-- link de recibo, Rollover de lista de espera 30 min, Retoque proactivo 18 d,
-- Embudo de reservas y Auditoría / Endurecimiento completo de RLS)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Confirmación de asistencia 24 h, rechazo de anticipo, link de recibo y retoque
-- ------------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS attendance_status text NOT NULL DEFAULT 'pending'
    CHECK (attendance_status IN ('pending', 'confirmed', 'rescheduled')),
  ADD COLUMN IF NOT EXISTS attendance_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS proof_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS proof_rejection_reason text,
  ADD COLUMN IF NOT EXISTS touchup_invited_at timestamptz;

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
      AND rel.relname = 'bookings'
      AND con.contype = 'c'
      AND pg_catalog.pg_get_constraintdef(con.oid) LIKE '%proof_delivery_method%'
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS %I',
      v_constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_proof_delivery_method_check
  CHECK (proof_delivery_method IN ('web_upload', 'web_link', 'instagram_dm', 'none'));

CREATE INDEX IF NOT EXISTS idx_bookings_touchup_eligible
  ON public.bookings(status, end_at)
  WHERE status = 'completed' AND touchup_invited_at IS NULL;

-- ------------------------------------------------------------------------------
-- 2. Lista de espera con rollover automático (ventana de 30 minutos)
-- ------------------------------------------------------------------------------
ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS priority_offer_staff_id uuid REFERENCES public.staff_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_waitlist_notified_expiry
  ON public.waitlist_entries(status, priority_offer_expires_at)
  WHERE status = 'notified';

CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_offer_token
  ON public.waitlist_entries(priority_offer_token)
  WHERE priority_offer_token IS NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. Embudo mínimo de reservas (sin cookies ni PII)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'page_view',
      'booking_started',
      'slot_held',
      'details_completed',
      'deposit_submitted',
      'booking_confirmed'
    )
  ),
  service_slug text,
  staff_slug text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funnel_events_created_type
  ON public.funnel_events(created_at DESC, event_type);

ALTER TABLE public.funnel_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_funnel_events" ON public.funnel_events;
CREATE POLICY "admins_read_funnel_events" ON public.funnel_events
  FOR SELECT TO authenticated
  USING (public.current_admin_role() IN ('owner', 'admin'));

-- ------------------------------------------------------------------------------
-- 4. Acciones de auditoría ampliadas (rechazo de anticipo y reagenda)
-- ------------------------------------------------------------------------------
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
      'deposit_rejected',
      'booking_rescheduled',
      'loyalty_redeemed',
      'media_retention_warned',
      'media_retention_purged'
    )
  );

-- ------------------------------------------------------------------------------
-- 5. Auditoría y endurecimiento completo de RLS (PostgREST + Realtime + Helpers)
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.current_admin_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_admin_role() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_admin_staff_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_admin_staff_id() TO authenticated, service_role;

DROP POLICY IF EXISTS "public_read_salon_settings" ON public.salon_settings;
DROP POLICY IF EXISTS "admins_read_salon_settings" ON public.salon_settings;
CREATE POLICY "admins_read_salon_settings" ON public.salon_settings
  FOR SELECT TO authenticated
  USING (public.current_admin_role() IS NOT NULL);

DROP POLICY IF EXISTS "public_read_active_staff" ON public.staff_members;
DROP POLICY IF EXISTS "admins_read_staff_members" ON public.staff_members;
CREATE POLICY "admins_read_staff_members" ON public.staff_members
  FOR SELECT TO authenticated
  USING (public.current_admin_role() IS NOT NULL);

DROP POLICY IF EXISTS "staff_update_bookings" ON public.bookings;
CREATE POLICY "staff_update_bookings" ON public.bookings
  FOR UPDATE TO authenticated
  USING (
    public.current_admin_role() IN ('owner', 'admin')
    OR (
      public.current_admin_role() = 'specialist'
      AND staff_id = public.current_admin_staff_id()
    )
  )
  WITH CHECK (
    public.current_admin_role() IN ('owner', 'admin')
    OR (
      public.current_admin_role() = 'specialist'
      AND staff_id = public.current_admin_staff_id()
    )
  );

DROP POLICY IF EXISTS "staff_manage_own_overrides" ON public.date_overrides;
CREATE POLICY "staff_manage_own_overrides" ON public.date_overrides
  FOR ALL TO authenticated
  USING (
    public.current_admin_role() IN ('owner', 'admin')
    OR (
      public.current_admin_role() = 'specialist'
      AND staff_id = public.current_admin_staff_id()
    )
  )
  WITH CHECK (
    public.current_admin_role() IN ('owner', 'admin')
    OR (
      public.current_admin_role() = 'specialist'
      AND staff_id = public.current_admin_staff_id()
    )
  );

DROP POLICY IF EXISTS "staff_manage_own_calendar" ON public.calendar_connections;
CREATE POLICY "staff_manage_own_calendar" ON public.calendar_connections
  FOR ALL TO authenticated
  USING (
    public.current_admin_role() = 'owner'
    OR (
      public.current_admin_role() = 'specialist'
      AND staff_id = public.current_admin_staff_id()
    )
  )
  WITH CHECK (
    public.current_admin_role() = 'owner'
    OR (
      public.current_admin_role() = 'specialist'
      AND staff_id = public.current_admin_staff_id()
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.bookings;
    EXCEPTION WHEN undefined_object OR invalid_parameter_value THEN
      NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.slot_holds;
    EXCEPTION WHEN undefined_object OR invalid_parameter_value THEN
      NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.date_overrides;
    EXCEPTION WHEN undefined_object OR invalid_parameter_value THEN
      NULL;
    END;
    BEGIN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.salon_settings;
    EXCEPTION WHEN undefined_object OR invalid_parameter_value THEN
      NULL;
    END;
  END IF;
END $$;

UPDATE public.notification_workflows
SET is_enabled = true
WHERE id = '10000000-0000-4000-8000-000000000904';
