-- ==============================================================================
-- Nails — Migración 0012: Centro de Control WhatsApp (Inbox, Coexistence,
-- Ventana 24h) y Recordatorios Robustos con Reintentos y Workflows Completos
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Conversaciones de WhatsApp (1 hilo por teléfono canónico E.164)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL UNIQUE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  contact_name text NOT NULL DEFAULT '',
  last_message_at timestamptz,
  last_message_preview text NOT NULL DEFAULT '',
  last_message_direction text
    CHECK (last_message_direction IS NULL OR last_message_direction IN ('inbound', 'outbound', 'echo')),
  last_inbound_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  last_read_at timestamptz,
  has_failed_messages boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  assigned_staff_id uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_threads_last_message
  ON public.whatsapp_threads(last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_whatsapp_threads_client
  ON public.whatsapp_threads(client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_threads_unread
  ON public.whatsapp_threads(unread_count)
  WHERE unread_count > 0;

CREATE INDEX IF NOT EXISTS idx_whatsapp_threads_failed
  ON public.whatsapp_threads(has_failed_messages)
  WHERE has_failed_messages = true;

ALTER TABLE public.whatsapp_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_whatsapp_threads" ON public.whatsapp_threads;
CREATE POLICY "admins_manage_whatsapp_threads" ON public.whatsapp_threads
  FOR ALL TO authenticated
  USING (public.current_admin_role() IN ('owner', 'admin'))
  WITH CHECK (public.current_admin_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "specialists_read_own_whatsapp_threads" ON public.whatsapp_threads;
CREATE POLICY "specialists_read_own_whatsapp_threads" ON public.whatsapp_threads
  FOR SELECT TO authenticated
  USING (
    public.current_admin_role() = 'specialist'
    AND (
      assigned_staff_id = public.current_admin_staff_id()
      OR (
        client_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.bookings b
          WHERE b.client_id = public.whatsapp_threads.client_id
            AND b.staff_id = public.current_admin_staff_id()
        )
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 2. Mensajes de WhatsApp (inbound, outbound, Coexistence echoes y estados)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.whatsapp_threads(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  notification_id uuid REFERENCES public.scheduled_notifications(id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound', 'echo')),
  sender_kind text NOT NULL CHECK (sender_kind IN ('client', 'staff', 'automation', 'coexistence_phone')),
  sender_name text,
  message_type text NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'template', 'interactive', 'button', 'media', 'system')),
  body_text text NOT NULL DEFAULT '',
  template_name text,
  template_trigger_key text,
  template_params jsonb NOT NULL DEFAULT '[]'::jsonb,
  delivery_status text NOT NULL
    CHECK (delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'received')),
  delivery_mode text NOT NULL DEFAULT 'text'
    CHECK (delivery_mode IN ('template', 'text', 'fallback_email_wame', 'demo', 'coexistence', 'inbound')),
  provider_message_id text,
  error_code text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_thread_created
  ON public.whatsapp_messages(thread_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_provider_id_uidx
  ON public.whatsapp_messages(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_booking
  ON public.whatsapp_messages(booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_notification
  ON public.whatsapp_messages(notification_id)
  WHERE notification_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_failed
  ON public.whatsapp_messages(thread_id, delivery_status)
  WHERE delivery_status = 'failed';

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_manage_whatsapp_messages" ON public.whatsapp_messages;
CREATE POLICY "admins_manage_whatsapp_messages" ON public.whatsapp_messages
  FOR ALL TO authenticated
  USING (public.current_admin_role() IN ('owner', 'admin'))
  WITH CHECK (public.current_admin_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "specialists_read_own_whatsapp_messages" ON public.whatsapp_messages;
CREATE POLICY "specialists_read_own_whatsapp_messages" ON public.whatsapp_messages
  FOR SELECT TO authenticated
  USING (
    public.current_admin_role() = 'specialist'
    AND (
      EXISTS (
        SELECT 1
        FROM public.whatsapp_threads t
        WHERE t.id = public.whatsapp_messages.thread_id
          AND t.assigned_staff_id = public.current_admin_staff_id()
      )
      OR (
        client_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.bookings b
          WHERE b.client_id = public.whatsapp_messages.client_id
            AND b.staff_id = public.current_admin_staff_id()
        )
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 3. Mejoras a scheduled_notifications (texto completo, reintentos, delivery)
-- ------------------------------------------------------------------------------
ALTER TABLE public.scheduled_notifications
  ALTER COLUMN booking_id DROP NOT NULL;

ALTER TABLE public.scheduled_notifications
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS body_text text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trigger_key text,
  ADD COLUMN IF NOT EXISTS delivery_status text
    CHECK (delivery_status IS NULL OR delivery_status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts >= 1),
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_retry
  ON public.scheduled_notifications(status, next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_provider_id
  ON public.scheduled_notifications(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_client
  ON public.scheduled_notifications(client_id)
  WHERE client_id IS NOT NULL;

DROP POLICY IF EXISTS "admins_manage_scheduled_notifications" ON public.scheduled_notifications;
CREATE POLICY "admins_manage_scheduled_notifications" ON public.scheduled_notifications
  FOR ALL TO authenticated
  USING (public.current_admin_role() IN ('owner', 'admin'))
  WITH CHECK (public.current_admin_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS "specialists_read_own_scheduled_notifications" ON public.scheduled_notifications;
CREATE POLICY "specialists_read_own_scheduled_notifications" ON public.scheduled_notifications
  FOR SELECT TO authenticated
  USING (
    public.current_admin_role() = 'specialist'
    AND booking_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = public.scheduled_notifications.booking_id
        AND b.staff_id = public.current_admin_staff_id()
    )
  );

-- ------------------------------------------------------------------------------
-- 4. RLS lectura de workflows para admin y 4 workflows faltantes (idempotente)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "admins_read_notification_workflows" ON public.notification_workflows;
CREATE POLICY "admins_read_notification_workflows" ON public.notification_workflows
  FOR SELECT TO authenticated
  USING (public.current_admin_role() IN ('owner', 'admin'));

INSERT INTO public.notification_workflows (
  id,
  name,
  trigger_event,
  offset_minutes,
  channels,
  is_enabled,
  subject_template,
  message_template
)
VALUES
  (
    '10000000-0000-4000-8000-000000000905',
    'Confirmación de anticipo y cita aprobada',
    'booking_confirmed',
    0,
    ARRAY['whatsapp', 'email'],
    true,
    '¡Tu cita en {{salon_name}} quedó confirmada! ({{booking_code}})',
    'Hola {{client_name}}, confirmamos tu anticipo y tu cita de {{service_name}} con {{staff_name}} el {{date_label}} a las {{time_label}}. Consulta detalles o agrega al calendario aquí: {{manage_url}}'
  ),
  (
    '10000000-0000-4000-8000-000000000906',
    'Aviso de cita reagendada',
    'booking_rescheduled',
    0,
    ARRAY['whatsapp', 'email'],
    true,
    'Actualizamos el horario de tu cita en {{salon_name}} ({{booking_code}})',
    'Hola {{client_name}}, actualizamos tu cita de {{service_name}} en {{salon_name}} para el {{date_label}} a las {{time_label}} con {{staff_name}}. Aquí tienes tu enlace actualizado: {{manage_url}}'
  ),
  (
    '10000000-0000-4000-8000-000000000907',
    'Confirmación de cita cancelada',
    'booking_canceled',
    0,
    ARRAY['whatsapp', 'email'],
    true,
    'Confirmamos la cancelación de tu cita ({{booking_code}})',
    'Hola {{client_name}}, confirmamos la cancelación de tu cita de {{service_name}} del {{date_label}} en {{salon_name}}. Tu espacio quedó liberado y cuando gustes puedes volver a agendar aquí: {{booking_url}}'
  ),
  (
    '10000000-0000-4000-8000-000000000908',
    'Encuesta post-cita y reseña Google (2 horas después)',
    'after_booking',
    120,
    ARRAY['whatsapp', 'email'],
    true,
    '¿Qué te parecieron tus uñas en {{salon_name}}?',
    'Hola {{client_name}}, muchas gracias por visitarnos hoy en {{salon_name}} para tu {{service_name}} con {{staff_name}}. Nos encantaría conocer tu opinión aquí: {{manage_url}}'
  )
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. Acciones de auditoría ampliadas para WhatsApp y recordatorios
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
      'media_retention_purged',
      'whatsapp_message_sent',
      'reminder_retried',
      'workflow_updated'
    )
  );
