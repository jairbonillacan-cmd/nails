-- ==============================================================================
-- Nails — Migración 0002: Funcionalidades Avanzadas de Operación y Crecimiento
-- (Caja diaria + Propinas + Comisiones, Lista de espera, Encuestas + Google Maps,
--  Meta Pixel + GA4, Cumpleaños + Cupones/Gift Cards, Inventario con alertas)
-- ==============================================================================

-- 1. Extensiones a salon_settings (Analytics, Reseñas Google, PWA)
ALTER TABLE public.salon_settings
  ADD COLUMN IF NOT EXISTS meta_pixel_id text,
  ADD COLUMN IF NOT EXISTS ga4_measurement_id text,
  ADD COLUMN IF NOT EXISTS google_review_url text,
  ADD COLUMN IF NOT EXISTS default_commission_percent numeric(5,2) NOT NULL DEFAULT 30.00;

-- 2. Comisión por manicurista
ALTER TABLE public.staff_members
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2) NOT NULL DEFAULT 30.00;

-- 3. Cumpleaños de clientas
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birthday date;

-- 4. Cupones y Gift Cards digitales
CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'coupon' CHECK (kind IN ('coupon', 'gift_card')),
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed_cents')),
  discount_value integer NOT NULL CHECK (discount_value > 0),
  remaining_balance_cents integer, -- usado cuando kind = 'gift_card'
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  min_subtotal_cents integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  recipient_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS coupon_code text,
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;

-- 5. Lista de espera (Waitlist) cuando un día está lleno
CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  preferred_staff_id uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  desired_date date NOT NULL,
  preferred_window text NOT NULL DEFAULT 'any' CHECK (preferred_window IN ('morning', 'afternoon', 'any')),
  client_name text NOT NULL,
  client_phone_e164 text NOT NULL,
  client_email text,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'notified', 'booked', 'expired')),
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_date_status
  ON public.waitlist_entries(desired_date, status);

-- 6. Encuesta post-cita y seguimiento de reseñas en Google Maps
CREATE TABLE IF NOT EXISTS public.booking_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.bookings(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  clicked_google_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Control de Inventario (insumos y productos de reventa)
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Insumo' CHECK (category IN ('Insumo', 'Gel / Esmalte', 'Acrílico', 'Decoración', 'Reventa')),
  unit text NOT NULL DEFAULT 'pza',
  stock_quantity numeric(10,2) NOT NULL DEFAULT 0,
  min_stock_alert numeric(10,2) NOT NULL DEFAULT 3,
  cost_cents integer NOT NULL DEFAULT 0,
  retail_price_cents integer NOT NULL DEFAULT 0,
  is_for_retail boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  delta numeric(10,2) NOT NULL,
  reason text NOT NULL CHECK (reason IN ('restock', 'service_usage', 'retail_sale', 'adjustment')),
  notes text NOT NULL DEFAULT '',
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Caja diaria, Propinas y Comisiones por Manicurista
CREATE TABLE IF NOT EXISTS public.cash_register_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('service_income', 'product_sale', 'deposit', 'expense', 'gift_card_sale')),
  description text NOT NULL,
  amount_cents integer NOT NULL,
  tip_cents integer NOT NULL DEFAULT 0,
  commission_cents integer NOT NULL DEFAULT 0,
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'transfer', 'card', 'gift_card')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_register_occurred
  ON public.cash_register_entries(occurred_at DESC);

-- RLS para nuevas tablas
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_register_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_manage_coupons" ON public.coupons FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));
CREATE POLICY "admins_manage_waitlist" ON public.waitlist_entries FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));
CREATE POLICY "admins_read_reviews" ON public.booking_reviews FOR SELECT USING (public.current_admin_role() IS NOT NULL);
CREATE POLICY "admins_manage_inventory" ON public.inventory_items FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));
CREATE POLICY "admins_manage_inventory_moves" ON public.inventory_movements FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));
CREATE POLICY "admins_manage_cash" ON public.cash_register_entries FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));
CREATE POLICY "specialist_read_own_cash" ON public.cash_register_entries FOR SELECT USING (
  public.current_admin_role() = 'specialist' AND staff_id = public.current_admin_staff_id()
);
