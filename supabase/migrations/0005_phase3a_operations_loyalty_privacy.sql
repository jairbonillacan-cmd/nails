-- ==============================================================================
-- Nails — Migración 0005: Phase 3A (Pagos divididos, bloqueos recurrentes,
-- sellos de lealtad, consentimiento LFPDPPP, políticas operativas y auditoría)
-- ==============================================================================

ALTER TABLE public.salon_settings
  ADD COLUMN IF NOT EXISTS lock_past_bookings boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_active_bookings_per_client integer NOT NULL DEFAULT 3
    CHECK (max_active_bookings_per_client >= 1),
  ADD COLUMN IF NOT EXISTS privacy_policy_version text NOT NULL DEFAULT '2026-11';

ALTER TABLE public.coupon_redemptions
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE TABLE IF NOT EXISTS public.payment_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('cash', 'card', 'transfer', 'giftcard', 'online')),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  tip_cents integer NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  tip_staff_id uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_splits_booking
  ON public.payment_splits(booking_id);

CREATE TABLE IF NOT EXISTS public.recurring_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  weekdays integer[] NOT NULL DEFAULT ARRAY[]::integer[],
  day_of_month integer CHECK (day_of_month IS NULL OR (day_of_month BETWEEN 1 AND 31)),
  start_time text NOT NULL CHECK (start_time ~ '^\d{2}:\d{2}$'),
  end_time text NOT NULL CHECK (end_time ~ '^\d{2}:\d{2}$'),
  until_date date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_recurring_blocks_staff_active
  ON public.recurring_blocks(staff_id, is_active);

CREATE TABLE IF NOT EXISTS public.loyalty_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_active boolean NOT NULL DEFAULT true,
  name text NOT NULL,
  stamps_required integer NOT NULL DEFAULT 8 CHECK (stamps_required >= 1),
  reward_type text NOT NULL CHECK (reward_type IN ('free_service', 'percent_discount')),
  reward_service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  discount_percent integer CHECK (discount_percent IS NULL OR (discount_percent BETWEEN 1 AND 100)),
  max_discount_cents integer CHECK (max_discount_cents IS NULL OR max_discount_cents >= 0),
  valid_days integer CHECK (valid_days IS NULL OR valid_days > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.loyalty_stamps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  program_id uuid NOT NULL REFERENCES public.loyalty_programs(id) ON DELETE CASCADE,
  stamped_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, program_id, stamped_date)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_stamps_client_program
  ON public.loyalty_stamps(client_id, program_id);

CREATE TABLE IF NOT EXISTS public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  policy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  marketing_opt_in boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_consents_client
  ON public.consents(client_id);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  actor_email text NOT NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('owner', 'admin', 'specialist')),
  action text NOT NULL CHECK (
    action IN (
      'booking_canceled',
      'booking_price_override',
      'csv_exported',
      'past_booking_override',
      'deposit_approved',
      'loyalty_redeemed'
    )
  ),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs(created_at DESC);

ALTER TABLE public.payment_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_payment_splits" ON public.payment_splits;
CREATE POLICY "admins_manage_payment_splits" ON public.payment_splits
  FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "specialists_read_own_payment_splits" ON public.payment_splits;
CREATE POLICY "specialists_read_own_payment_splits" ON public.payment_splits
  FOR SELECT USING (
    public.current_admin_role() = 'specialist'
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = payment_splits.booking_id
        AND b.staff_id = public.current_admin_staff_id()
    )
  );

DROP POLICY IF EXISTS "admins_manage_recurring_blocks" ON public.recurring_blocks;
CREATE POLICY "admins_manage_recurring_blocks" ON public.recurring_blocks
  FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "specialists_manage_own_recurring_blocks" ON public.recurring_blocks;
CREATE POLICY "specialists_manage_own_recurring_blocks" ON public.recurring_blocks
  FOR ALL USING (
    public.current_admin_role() = 'specialist'
    AND staff_id = public.current_admin_staff_id()
  );

DROP POLICY IF EXISTS "public_read_active_loyalty_programs" ON public.loyalty_programs;
CREATE POLICY "public_read_active_loyalty_programs" ON public.loyalty_programs
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "owner_manage_loyalty_programs" ON public.loyalty_programs;
CREATE POLICY "owner_manage_loyalty_programs" ON public.loyalty_programs
  FOR ALL USING (public.current_admin_role() = 'owner');

DROP POLICY IF EXISTS "admins_manage_loyalty_stamps" ON public.loyalty_stamps;
CREATE POLICY "admins_manage_loyalty_stamps" ON public.loyalty_stamps
  FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "specialists_read_loyalty_stamps" ON public.loyalty_stamps;
CREATE POLICY "specialists_read_loyalty_stamps" ON public.loyalty_stamps
  FOR SELECT USING (public.current_admin_role() = 'specialist');

DROP POLICY IF EXISTS "admins_read_consents" ON public.consents;
CREATE POLICY "admins_read_consents" ON public.consents
  FOR SELECT USING (public.current_admin_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "owner_read_audit_logs" ON public.audit_logs;
CREATE POLICY "owner_read_audit_logs" ON public.audit_logs
  FOR SELECT USING (public.current_admin_role() = 'owner');
