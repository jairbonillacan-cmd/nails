-- ==============================================================================
-- Nails — Esquema Inicial PostgreSQL / Supabase
-- Incluye:
--  * Prevención matemática de doble booking (EXCLUDE USING gist + slot_holds)
--  * Multi-admin RBAC (owner, admin, specialist) con RLS
--  * Catálogo de servicios, extras (add-ons) y galería
--  * Disponibilidad semanal con tramos partidos y excepciones por fecha
--  * Google Calendar bidireccional, Workflows (Email/WhatsApp/SMS), WhatsApp Booking
--  * Adaptador de pagos preparado (Transferencia manual, Stripe, Mercado Pago)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ------------------------------------------------------------------------------
-- 1. Configuración general y marca del salón (single-tenant)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.salon_settings (
  id text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  name text NOT NULL DEFAULT 'Nails',
  tagline text NOT NULL DEFAULT 'Estudio boutique de uñas y cuidado natural',
  description text NOT NULL DEFAULT 'Agenda tu cita en segundos con disponibilidad real al instante.',
  logo_url text,
  cover_image_url text,
  address text NOT NULL DEFAULT 'Av. Reforma 245, Col. Juárez, CDMX',
  maps_url text NOT NULL DEFAULT 'https://maps.google.com/?q=CDMX',
  instagram_handle text NOT NULL DEFAULT '@nails.studio',
  whatsapp_number text NOT NULL DEFAULT '+525512345678',
  contact_email text NOT NULL DEFAULT 'hola@nails.studio',
  timezone text NOT NULL DEFAULT 'America/Mexico_City',

  -- Personalización de tema Astryx y experiencia de agenda
  brand_accent_light text NOT NULL DEFAULT '#9E5C64',
  brand_accent_dark text NOT NULL DEFAULT '#D89BA3',
  default_public_mode text NOT NULL DEFAULT 'light' CHECK (default_public_mode IN ('light', 'dark', 'system')),
  default_admin_mode text NOT NULL DEFAULT 'system' CHECK (default_admin_mode IN ('light', 'dark', 'system')),
  corner_style text NOT NULL DEFAULT 'soft' CHECK (corner_style IN ('sharp', 'soft', 'rounded', 'pill')),
  default_booking_layout text NOT NULL DEFAULT 'month' CHECK (default_booking_layout IN ('month', 'week', 'column')),
  enabled_booking_layouts text[] NOT NULL DEFAULT ARRAY['month', 'week', 'column'],
  lock_timezone boolean NOT NULL DEFAULT true,
  slot_interval_minutes integer NOT NULL DEFAULT 30 CHECK (slot_interval_minutes IN (15, 30, 60)),
  enable_slot_hold boolean NOT NULL DEFAULT true,
  slot_hold_minutes integer NOT NULL DEFAULT 3 CHECK (slot_hold_minutes BETWEEN 1 AND 15),

  -- Políticas de agenda y cancelación
  min_booking_notice_minutes integer NOT NULL DEFAULT 120,
  max_booking_days_ahead integer NOT NULL DEFAULT 45,
  min_cancel_hours integer NOT NULL DEFAULT 12,
  min_reschedule_hours integer NOT NULL DEFAULT 12,
  cancellation_policy_text text NOT NULL DEFAULT 'Puedes reagendar o cancelar sin costo hasta 12 horas antes de tu cita. Pasado ese tiempo, el anticipo no es reembolsable.',
  booking_instructions_text text NOT NULL DEFAULT 'Por favor llega 5 minutos antes. Si traes acrílico o gel previo de otro salón, agrega el extra de retiro para reservar el tiempo necesario.',

  -- Anticipos y pagos (hook listo para Stripe / Mercado Pago)
  payment_mode text NOT NULL DEFAULT 'manual_transfer' CHECK (payment_mode IN ('none', 'manual_transfer', 'stripe', 'mercadopago')),
  deposit_bank_name text DEFAULT 'BBVA México',
  deposit_account_holder text DEFAULT 'Nails Studio',
  deposit_clabe text DEFAULT '012180001234567890',
  deposit_instructions text DEFAULT 'Envía tu comprobante de transferencia SPEI para confirmar tu espacio.',
  currency text NOT NULL DEFAULT 'MXN',

  -- Contenido editable del landing
  landing_content jsonb NOT NULL DEFAULT '{
    "heroEyebrow": "Citas en línea · Disponibilidad en tiempo real",
    "heroTitle": "Uñas impecables, reservadas sin mensajes interminables.",
    "heroSubtitle": "Elige tu servicio, personaliza tus extras, sube tu foto de inspiración y aparta tu horario en segundos.",
    "aboutTitle": "Un espacio tranquilo dedicado al detalle",
    "aboutBody": "Trabajamos con herramientas esterilizadas en autoclave, productos de grado profesional y tiempos reales para que cada set quede perfecto sin prisas."
  }'::jsonb,

  -- Estado de integraciones opcionales
  whatsapp_booking_enabled boolean NOT NULL DEFAULT true,
  sms_reminders_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 2. Manicuristas / Especialistas y Múltiples Administradores (RBAC)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  role_title text NOT NULL DEFAULT 'Nail Artist',
  bio text NOT NULL DEFAULT '',
  avatar_url text,
  booking_slug text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'specialist')),
  staff_member_id uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  invited_by uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 3. Catálogo de Servicios y Extras (Add-ons)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  buffer_before_minutes integer NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes integer NOT NULL DEFAULT 15 CHECK (buffer_after_minutes >= 0),
  requires_confirmation boolean NOT NULL DEFAULT false,
  deposit_required boolean NOT NULL DEFAULT false,
  deposit_amount_cents integer NOT NULL DEFAULT 0 CHECK (deposit_amount_cents >= 0),
  allow_inspo_photo boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  extra_minutes integer NOT NULL DEFAULT 0 CHECK (extra_minutes >= 0),
  extra_price_cents integer NOT NULL DEFAULT 0 CHECK (extra_price_cents >= 0),
  applies_to_all boolean NOT NULL DEFAULT true,
  service_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.staff_services (
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  custom_duration_minutes integer CHECK (custom_duration_minutes IS NULL OR custom_duration_minutes > 0),
  PRIMARY KEY (staff_id, service_id)
);

-- ------------------------------------------------------------------------------
-- 4. Disponibilidad Semanal (Tramos Partidos) y Excepciones por Fecha
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.availability_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Horario habitual',
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.availability_schedules(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Domingo .. 6=Sábado
  start_time text NOT NULL CHECK (start_time ~ '^\d{2}:\d{2}$'),
  end_time text NOT NULL CHECK (end_time ~ '^\d{2}:\d{2}$'),
  CHECK (start_time < end_time)
);

CREATE TABLE IF NOT EXISTS public.date_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  override_date date NOT NULL,
  is_unavailable boolean NOT NULL DEFAULT true,
  start_time text CHECK (start_time IS NULL OR start_time ~ '^\d{2}:\d{2}$'),
  end_time text CHECK (end_time IS NULL OR end_time ~ '^\d{2}:\d{2}$'),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_date_overrides_staff_date
  ON public.date_overrides(staff_id, override_date);

-- ------------------------------------------------------------------------------
-- 5. Conexiones Google Calendar (Bidireccional)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL UNIQUE REFERENCES public.staff_members(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google' CHECK (provider IN ('google')),
  account_email text NOT NULL,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  destination_calendar_id text NOT NULL DEFAULT 'primary',
  conflict_calendar_ids text[] NOT NULL DEFAULT ARRAY['primary'],
  watch_channel_id text,
  watch_resource_id text,
  watch_expiration timestamptz,
  is_connected boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 6. Clientas, Bloqueos Temporales (3 min) y Citas (Anti-Colisión Atómica)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone_e164 text NOT NULL UNIQUE,
  email text,
  notes text NOT NULL DEFAULT '',
  no_show_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.slot_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  session_token text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  held_range tstzrange NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_at < end_at)
);

CREATE INDEX IF NOT EXISTS idx_slot_holds_active
  ON public.slot_holds(staff_id, expires_at);

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code text NOT NULL UNIQUE,
  manage_token text NOT NULL UNIQUE,
  idempotency_key text UNIQUE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  staff_id uuid NOT NULL REFERENCES public.staff_members(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  occupied_range tstzrange NOT NULL,
  total_duration_minutes integer NOT NULL CHECK (total_duration_minutes > 0),
  total_price_cents integer NOT NULL CHECK (total_price_cents >= 0),
  deposit_amount_cents integer NOT NULL DEFAULT 0 CHECK (deposit_amount_cents >= 0),
  status text NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending_payment', 'pending_confirmation', 'confirmed', 'completed', 'canceled', 'no_show')),
  source text NOT NULL DEFAULT 'web'
    CHECK (source IN ('web', 'whatsapp', 'manual', 'walk_in')),
  client_notes text NOT NULL DEFAULT '',
  internal_notes text NOT NULL DEFAULT '',
  inspo_photo_url text,
  payment_proof_url text,
  google_event_id text,
  cancellation_reason text,
  rescheduled_from_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_at < end_at),
  CONSTRAINT no_overlapping_active_bookings
    EXCLUDE USING gist (
      staff_id WITH =,
      occupied_range WITH &&
    )
    WHERE (status IN ('pending_payment', 'pending_confirmation', 'confirmed'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_staff_start ON public.bookings(staff_id, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_status_start ON public.bookings(status, start_at);
CREATE INDEX IF NOT EXISTS idx_bookings_client ON public.bookings(client_id);

CREATE TABLE IF NOT EXISTS public.booking_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  addon_id uuid REFERENCES public.service_addons(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  extra_minutes integer NOT NULL DEFAULT 0,
  extra_price_cents integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.booking_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('manual_transfer', 'stripe', 'mercadopago')),
  provider_payment_id text,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL DEFAULT 'MXN',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
  proof_url text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 7. Workflows, Recordatorios Multicanal (Email / WhatsApp / SMS) y WhatsApp Bot
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trigger_event text NOT NULL
    CHECK (trigger_event IN ('booking_created', 'booking_confirmed', 'booking_canceled', 'booking_rescheduled', 'before_booking', 'after_booking')),
  offset_minutes integer NOT NULL DEFAULT 0,
  channels text[] NOT NULL DEFAULT ARRAY['email', 'whatsapp'],
  is_enabled boolean NOT NULL DEFAULT true,
  subject_template text NOT NULL DEFAULT '',
  message_template text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scheduled_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES public.notification_workflows(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'whatsapp', 'sms')),
  recipient text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'canceled')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_due
  ON public.scheduled_notifications(status, scheduled_for)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  phone_e164 text PRIMARY KEY,
  step text NOT NULL DEFAULT 'idle',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

-- ------------------------------------------------------------------------------
-- 8. Galería de Portafolio del Salón
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  caption text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'Gelish',
  image_url text NOT NULL,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  is_featured boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 9. Row Level Security (RLS) con soporte Multi-Admin (owner / admin / specialist)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_admin_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
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
AS $$
  SELECT staff_member_id
  FROM public.admin_users
  WHERE auth_user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

ALTER TABLE public.salon_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.date_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;

-- Lectura pública controlada (solo catálogo, horarios, galería y configuración pública)
CREATE POLICY "public_read_salon_settings" ON public.salon_settings FOR SELECT USING (true);
CREATE POLICY "public_read_active_staff" ON public.staff_members FOR SELECT USING (is_active = true OR public.current_admin_role() IS NOT NULL);
CREATE POLICY "public_read_categories" ON public.service_categories FOR SELECT USING (true);
CREATE POLICY "public_read_services" ON public.services FOR SELECT USING (is_active = true OR public.current_admin_role() IS NOT NULL);
CREATE POLICY "public_read_addons" ON public.service_addons FOR SELECT USING (is_active = true OR public.current_admin_role() IS NOT NULL);
CREATE POLICY "public_read_staff_services" ON public.staff_services FOR SELECT USING (true);
CREATE POLICY "public_read_schedules" ON public.availability_schedules FOR SELECT USING (true);
CREATE POLICY "public_read_rules" ON public.availability_rules FOR SELECT USING (true);
CREATE POLICY "public_read_overrides" ON public.date_overrides FOR SELECT USING (true);
CREATE POLICY "public_read_gallery" ON public.gallery_items FOR SELECT USING (true);

-- Políticas para Owner & Admin
CREATE POLICY "owner_manage_settings" ON public.salon_settings FOR ALL USING (public.current_admin_role() = 'owner');
CREATE POLICY "owner_manage_admin_users" ON public.admin_users FOR ALL USING (public.current_admin_role() = 'owner');
CREATE POLICY "admins_read_admin_users" ON public.admin_users FOR SELECT USING (public.current_admin_role() IN ('owner', 'admin'));
CREATE POLICY "admins_manage_catalog" ON public.services FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));
CREATE POLICY "admins_manage_addons" ON public.service_addons FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));
CREATE POLICY "admins_manage_staff" ON public.staff_members FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));
CREATE POLICY "admins_manage_gallery" ON public.gallery_items FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));
CREATE POLICY "admins_manage_clients" ON public.clients FOR ALL USING (public.current_admin_role() IN ('owner', 'admin'));
CREATE POLICY "admins_manage_workflows" ON public.notification_workflows FOR ALL USING (public.current_admin_role() = 'owner');

-- Políticas para bookings (owner/admin ven todas; specialist solo las suyas)
CREATE POLICY "staff_read_bookings" ON public.bookings FOR SELECT USING (
  public.current_admin_role() IN ('owner', 'admin')
  OR (public.current_admin_role() = 'specialist' AND staff_id = public.current_admin_staff_id())
);
CREATE POLICY "staff_update_bookings" ON public.bookings FOR UPDATE USING (
  public.current_admin_role() IN ('owner', 'admin')
  OR (public.current_admin_role() = 'specialist' AND staff_id = public.current_admin_staff_id())
);

-- Disponibilidad propia para especialistas
CREATE POLICY "staff_manage_own_overrides" ON public.date_overrides FOR ALL USING (
  public.current_admin_role() IN ('owner', 'admin')
  OR (public.current_admin_role() = 'specialist' AND staff_id = public.current_admin_staff_id())
);
CREATE POLICY "staff_manage_own_calendar" ON public.calendar_connections FOR ALL USING (
  public.current_admin_role() = 'owner'
  OR (public.current_admin_role() = 'specialist' AND staff_id = public.current_admin_staff_id())
);

-- ------------------------------------------------------------------------------
-- 10. Publicación Realtime (actualización inmediata de slots y citas)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.slot_holds;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.date_overrides;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.salon_settings;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
