-- Seed inicial para Nails (ejecutar después de 0001_initial_schema.sql)
INSERT INTO public.salon_settings (id, name)
VALUES ('default', 'Nails')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.notification_workflows (name, trigger_event, offset_minutes, channels, is_enabled, subject_template, message_template)
VALUES
  (
    'Confirmación inmediata de cita',
    'booking_created',
    0,
    ARRAY['email', 'whatsapp'],
    true,
    'Tu cita en {{salon_name}} está lista ({{booking_code}})',
    'Hola {{client_name}}, registramos tu cita de {{service_name}} para el {{date_label}} a las {{time_label}}. Gestiona tu cita aquí: {{manage_url}}'
  ),
  (
    'Recordatorio 24 horas antes',
    'before_booking',
    1440,
    ARRAY['email', 'whatsapp'],
    true,
    'Recordatorio: mañana te esperamos en {{salon_name}}',
    'Hola {{client_name}}, te recordamos tu cita de {{service_name}} mañana {{date_label}} a las {{time_label}}. Si necesitas moverla hazlo aquí: {{manage_url}}'
  ),
  (
    'Recordatorio 2 horas antes',
    'before_booking',
    120,
    ARRAY['whatsapp'],
    true,
    'En 2 horas nos vemos en {{salon_name}}',
    'Hola {{client_name}}, te esperamos hoy a las {{time_label}} en {{salon_name}} ({{address}}).'
  ),
  (
    'Seguimiento de retoque (18 días después)',
    'after_booking',
    25920,
    ARRAY['whatsapp'],
    false,
    '¿Lista para tu retoque en {{salon_name}}?',
    'Hola {{client_name}}, ya pasaron casi 3 semanas desde tu último set. Reserva tu retoque aquí: {{booking_url}}'
  )
ON CONFLICT DO NOTHING;
