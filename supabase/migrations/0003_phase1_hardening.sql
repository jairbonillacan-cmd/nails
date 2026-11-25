-- ==============================================================================
-- Nails — Migración 0003: Phase 1 Hardening (M1, M4, S5, S6, A1, A2, A7, D5)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- M1: Alinear columnas faltantes con src/lib/types.ts y consistencia de rangos
-- ------------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS subtotal_cents integer NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  ADD COLUMN IF NOT EXISTS occupied_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS occupied_end_at timestamptz;

UPDATE public.bookings
SET
  subtotal_cents = CASE
    WHEN subtotal_cents = 0 AND (total_price_cents + discount_cents) > 0
      THEN total_price_cents + discount_cents
    ELSE subtotal_cents
  END,
  occupied_start_at = COALESCE(occupied_start_at, lower(occupied_range), start_at),
  occupied_end_at = COALESCE(occupied_end_at, upper(occupied_range), end_at);

ALTER TABLE public.bookings
  ALTER COLUMN occupied_start_at SET NOT NULL,
  ALTER COLUMN occupied_end_at SET NOT NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_occupied_bounds_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_occupied_bounds_check
  CHECK (
    occupied_start_at <= start_at
    AND occupied_end_at >= end_at
    AND occupied_start_at < occupied_end_at
    AND occupied_range = pg_catalog.tstzrange(occupied_start_at, occupied_end_at, '[)')
  );

CREATE OR REPLACE FUNCTION public.sync_booking_occupied_range()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.occupied_start_at IS NULL THEN
    NEW.occupied_start_at := COALESCE(pg_catalog.lower(NEW.occupied_range), NEW.start_at);
  END IF;
  IF NEW.occupied_end_at IS NULL THEN
    NEW.occupied_end_at := COALESCE(pg_catalog.upper(NEW.occupied_range), NEW.end_at);
  END IF;
  NEW.occupied_range := pg_catalog.tstzrange(NEW.occupied_start_at, NEW.occupied_end_at, '[)');
  IF NEW.subtotal_cents = 0 AND (NEW.total_price_cents + NEW.discount_cents) > 0 THEN
    NEW.subtotal_cents := NEW.total_price_cents + NEW.discount_cents;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_booking_occupied_range ON public.bookings;
CREATE TRIGGER trg_sync_booking_occupied_range
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_booking_occupied_range();

ALTER TABLE public.scheduled_notifications
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS preview_text text NOT NULL DEFAULT '';

ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS available_calendars jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS external_busy_blocks jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ------------------------------------------------------------------------------
-- M4: Exclusión atómica GiST en slot_holds + limpieza de holds expirados
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_slot_hold_range()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.held_range := pg_catalog.tstzrange(NEW.start_at, NEW.end_at, '[)');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_slot_hold_range ON public.slot_holds;
CREATE TRIGGER trg_sync_slot_hold_range
  BEFORE INSERT OR UPDATE ON public.slot_holds
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_slot_hold_range();

DELETE FROM public.slot_holds WHERE expires_at <= now();

ALTER TABLE public.slot_holds
  DROP CONSTRAINT IF EXISTS no_overlapping_slot_holds;

ALTER TABLE public.slot_holds
  ADD CONSTRAINT no_overlapping_slot_holds
  EXCLUDE USING gist (
    staff_id WITH =,
    held_range WITH &&
  );

CREATE INDEX IF NOT EXISTS idx_slot_holds_session_token
  ON public.slot_holds(session_token);

CREATE OR REPLACE FUNCTION public.purge_expired_slot_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.slot_holds
  WHERE expires_at <= pg_catalog.now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_slot_holds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_slot_holds() TO service_role;

-- ------------------------------------------------------------------------------
-- S5: Hardening SECURITY DEFINER (SET search_path = '') y vista sin reason
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_admin_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role
  FROM public.admin_users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_admin_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT staff_member_id
  FROM public.admin_users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

DROP POLICY IF EXISTS "public_read_overrides" ON public.date_overrides;
DROP POLICY IF EXISTS "admins_read_overrides" ON public.date_overrides;

CREATE POLICY "admins_read_overrides" ON public.date_overrides
  FOR SELECT USING (public.current_admin_role() IS NOT NULL);

CREATE OR REPLACE VIEW public.public_busy_overrides
WITH (security_barrier = true)
AS
SELECT
  id,
  staff_id,
  override_date,
  is_unavailable,
  start_time,
  end_time
FROM public.date_overrides;

GRANT SELECT ON public.public_busy_overrides TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- S6: Tabla pública sin PII para intervalos ocupados + Realtime + Triggers
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_busy_intervals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL CHECK (source_kind IN ('booking', 'slot_hold')),
  source_id uuid NOT NULL,
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  occupied_range tstzrange NOT NULL,
  slot_date date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, source_id)
);

CREATE INDEX IF NOT EXISTS idx_public_busy_intervals_staff_date
  ON public.public_busy_intervals(staff_id, slot_date);

CREATE INDEX IF NOT EXISTS idx_public_busy_intervals_range
  ON public.public_busy_intervals USING gist (staff_id, occupied_range);

ALTER TABLE public.public_busy_intervals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_busy_intervals" ON public.public_busy_intervals;
CREATE POLICY "public_read_busy_intervals" ON public.public_busy_intervals
  FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.sync_public_busy_from_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz text;
  v_slot_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.public_busy_intervals
    WHERE source_kind = 'booking' AND source_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.status NOT IN ('pending_payment', 'pending_confirmation', 'confirmed') THEN
    DELETE FROM public.public_busy_intervals
    WHERE source_kind = 'booking' AND source_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT COALESCE(timezone, 'America/Mexico_City')
  INTO v_tz
  FROM public.salon_settings
  WHERE id = 'default'
  LIMIT 1;

  v_tz := COALESCE(v_tz, 'America/Mexico_City');
  v_slot_date := (NEW.start_at AT TIME ZONE v_tz)::date;

  INSERT INTO public.public_busy_intervals (
    source_kind,
    source_id,
    staff_id,
    occupied_range,
    slot_date,
    updated_at
  )
  VALUES (
    'booking',
    NEW.id,
    NEW.staff_id,
    NEW.occupied_range,
    v_slot_date,
    pg_catalog.now()
  )
  ON CONFLICT (source_kind, source_id) DO UPDATE SET
    staff_id = EXCLUDED.staff_id,
    occupied_range = EXCLUDED.occupied_range,
    slot_date = EXCLUDED.slot_date,
    updated_at = pg_catalog.now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_public_busy_from_booking ON public.bookings;
CREATE TRIGGER trg_sync_public_busy_from_booking
  AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_public_busy_from_booking();

CREATE OR REPLACE FUNCTION public.sync_public_busy_from_slot_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz text;
  v_slot_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.public_busy_intervals
    WHERE source_kind = 'slot_hold' AND source_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.expires_at <= pg_catalog.now() THEN
    DELETE FROM public.public_busy_intervals
    WHERE source_kind = 'slot_hold' AND source_id = NEW.id;
    RETURN NEW;
  END IF;

  SELECT COALESCE(timezone, 'America/Mexico_City')
  INTO v_tz
  FROM public.salon_settings
  WHERE id = 'default'
  LIMIT 1;

  v_tz := COALESCE(v_tz, 'America/Mexico_City');
  v_slot_date := (NEW.start_at AT TIME ZONE v_tz)::date;

  INSERT INTO public.public_busy_intervals (
    source_kind,
    source_id,
    staff_id,
    occupied_range,
    slot_date,
    updated_at
  )
  VALUES (
    'slot_hold',
    NEW.id,
    NEW.staff_id,
    NEW.held_range,
    v_slot_date,
    pg_catalog.now()
  )
  ON CONFLICT (source_kind, source_id) DO UPDATE SET
    staff_id = EXCLUDED.staff_id,
    occupied_range = EXCLUDED.occupied_range,
    slot_date = EXCLUDED.slot_date,
    updated_at = pg_catalog.now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_public_busy_from_slot_hold ON public.slot_holds;
CREATE TRIGGER trg_sync_public_busy_from_slot_hold
  AFTER INSERT OR UPDATE OR DELETE ON public.slot_holds
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_public_busy_from_slot_hold();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.public_busy_intervals;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ------------------------------------------------------------------------------
-- A2 & D5: Tablas outbox_events y coupon_redemptions
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_pending
  ON public.outbox_events(status, available_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_outbox_events" ON public.outbox_events;
CREATE POLICY "admins_read_outbox_events" ON public.outbox_events
  FOR SELECT USING (public.current_admin_role() IN ('owner', 'admin'));

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, booking_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_status
  ON public.coupon_redemptions(coupon_id, status);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_booking
  ON public.coupon_redemptions(booking_id);

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_coupon_redemptions" ON public.coupon_redemptions;
CREATE POLICY "admins_manage_coupon_redemptions" ON public.coupon_redemptions
  FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));

-- ------------------------------------------------------------------------------
-- A1 & A7: RPC transaccional create_booking_atomic()
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
  p_booking_code text,
  p_manage_token text,
  p_idempotency_key text,
  p_service_id uuid,
  p_staff_id uuid,
  p_client_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_occupied_start_at timestamptz,
  p_occupied_end_at timestamptz,
  p_total_duration_minutes integer,
  p_subtotal_cents integer,
  p_discount_cents integer,
  p_total_price_cents integer,
  p_deposit_amount_cents integer,
  p_coupon_code text,
  p_coupon_id uuid,
  p_status text,
  p_source text,
  p_client_notes text,
  p_inspo_photo_url text,
  p_payment_proof_url text,
  p_hold_id uuid,
  p_session_token text,
  p_addons jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_id uuid;
  v_booking_id uuid;
  v_occupied_range tstzrange;
  v_hold_match_id uuid;
  v_other_hold_id uuid;
  v_coupon public.coupons%ROWTYPE;
  v_addon jsonb;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.bookings
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;
    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
  END IF;

  DELETE FROM public.slot_holds
  WHERE staff_id = p_staff_id AND expires_at <= pg_catalog.now();

  v_occupied_range := pg_catalog.tstzrange(p_occupied_start_at, p_occupied_end_at, '[)');

  IF p_hold_id IS NOT NULL THEN
    SELECT id INTO v_hold_match_id
    FROM public.slot_holds
    WHERE id = p_hold_id
      AND staff_id = p_staff_id
      AND p_session_token IS NOT NULL
      AND session_token = p_session_token
      AND expires_at > pg_catalog.now()
      AND held_range @> v_occupied_range
    FOR UPDATE;

    IF v_hold_match_id IS NULL THEN
      RAISE EXCEPTION 'HOLD_OWNERSHIP_MISMATCH' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT id INTO v_other_hold_id
  FROM public.slot_holds
  WHERE staff_id = p_staff_id
    AND expires_at > pg_catalog.now()
    AND held_range && v_occupied_range
    AND (p_session_token IS NULL OR session_token <> p_session_token)
  LIMIT 1;

  IF v_other_hold_id IS NOT NULL THEN
    RAISE EXCEPTION 'SLOT_HELD_BY_OTHER_SESSION' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.bookings (
    booking_code,
    manage_token,
    idempotency_key,
    service_id,
    staff_id,
    client_id,
    start_at,
    end_at,
    occupied_start_at,
    occupied_end_at,
    occupied_range,
    total_duration_minutes,
    subtotal_cents,
    discount_cents,
    total_price_cents,
    deposit_amount_cents,
    coupon_code,
    status,
    source,
    client_notes,
    inspo_photo_url,
    payment_proof_url
  )
  VALUES (
    p_booking_code,
    p_manage_token,
    p_idempotency_key,
    p_service_id,
    p_staff_id,
    p_client_id,
    p_start_at,
    p_end_at,
    p_occupied_start_at,
    p_occupied_end_at,
    v_occupied_range,
    p_total_duration_minutes,
    p_subtotal_cents,
    p_discount_cents,
    p_total_price_cents,
    p_deposit_amount_cents,
    p_coupon_code,
    p_status,
    p_source,
    COALESCE(p_client_notes, ''),
    p_inspo_photo_url,
    p_payment_proof_url
  )
  RETURNING id INTO v_booking_id;

  IF p_addons IS NOT NULL AND pg_catalog.jsonb_typeof(p_addons) = 'array' THEN
    FOR v_addon IN SELECT * FROM pg_catalog.jsonb_array_elements(p_addons)
    LOOP
      INSERT INTO public.booking_addons (
        booking_id,
        addon_id,
        name_snapshot,
        extra_minutes,
        extra_price_cents
      )
      VALUES (
        v_booking_id,
        NULLIF(v_addon->>'addon_id', '')::uuid,
        COALESCE(v_addon->>'name_snapshot', ''),
        COALESCE((v_addon->>'extra_minutes')::integer, 0),
        COALESCE((v_addon->>'extra_price_cents')::integer, 0)
      );
    END LOOP;
  END IF;

  IF p_hold_id IS NOT NULL THEN
    DELETE FROM public.slot_holds WHERE id = p_hold_id;
  ELSIF p_session_token IS NOT NULL THEN
    DELETE FROM public.slot_holds
    WHERE staff_id = p_staff_id AND session_token = p_session_token;
  END IF;

  IF p_coupon_id IS NOT NULL AND p_discount_cents > 0 THEN
    SELECT * INTO v_coupon
    FROM public.coupons
    WHERE id = p_coupon_id AND is_active = true
    FOR UPDATE;

    IF v_coupon.id IS NULL THEN
      RAISE EXCEPTION 'COUPON_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;

    IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at <= pg_catalog.now() THEN
      RAISE EXCEPTION 'COUPON_EXPIRED' USING ERRCODE = 'P0001';
    END IF;

    IF p_subtotal_cents < v_coupon.min_subtotal_cents THEN
      RAISE EXCEPTION 'COUPON_MIN_SUBTOTAL' USING ERRCODE = 'P0001';
    END IF;

    IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
      RAISE EXCEPTION 'COUPON_EXHAUSTED' USING ERRCODE = 'P0001';
    END IF;

    IF v_coupon.kind = 'gift_card' AND COALESCE(v_coupon.remaining_balance_cents, v_coupon.discount_value) < p_discount_cents THEN
      RAISE EXCEPTION 'GIFT_CARD_INSUFFICIENT_BALANCE' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.coupon_redemptions (
      coupon_id,
      booking_id,
      client_id,
      amount_cents,
      status
    )
    VALUES (
      v_coupon.id,
      v_booking_id,
      p_client_id,
      p_discount_cents,
      'active'
    );

    UPDATE public.coupons
    SET
      used_count = used_count + 1,
      remaining_balance_cents = CASE
        WHEN kind = 'gift_card'
          THEN GREATEST(0, COALESCE(remaining_balance_cents, discount_value) - p_discount_cents)
        ELSE remaining_balance_cents
      END
    WHERE id = v_coupon.id;
  END IF;

  INSERT INTO public.outbox_events (
    event_type,
    payload,
    status,
    available_at
  )
  VALUES (
    'booking_created',
    pg_catalog.jsonb_build_object(
      'bookingId', v_booking_id,
      'staffId', p_staff_id,
      'startAt', p_start_at,
      'status', p_status,
      'source', p_source
    ),
    'pending',
    pg_catalog.now()
  );

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking_atomic(
  text, text, text, uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz,
  integer, integer, integer, integer, integer, text, uuid, text, text, text, text, text,
  uuid, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_booking_atomic(
  text, text, text, uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, timestamptz,
  integer, integer, integer, integer, integer, text, uuid, text, text, text, text, text,
  uuid, text, jsonb
) TO service_role;
