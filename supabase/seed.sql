-- Seed inicial para Nails (ejecutar después de 0001_initial_schema.sql y 0002_salon_growth_features.sql)
-- Alineado con src/lib/demo-seed.ts (verificado por scripts/check-seed-parity.mjs)

INSERT INTO public.salon_settings (
  id,
  name,
  tagline,
  description,
  address,
  maps_url,
  instagram_handle,
  whatsapp_number,
  contact_email,
  timezone,
  brand_accent_light,
  brand_accent_dark,
  default_public_mode,
  default_admin_mode,
  corner_style,
  default_booking_layout,
  enabled_booking_layouts,
  lock_timezone,
  slot_interval_minutes,
  enable_slot_hold,
  slot_hold_minutes,
  min_booking_notice_minutes,
  max_booking_days_ahead,
  min_cancel_hours,
  min_reschedule_hours,
  cancellation_policy_text,
  booking_instructions_text,
  payment_mode,
  deposit_bank_name,
  deposit_account_holder,
  deposit_clabe,
  deposit_instructions,
  currency,
  landing_content,
  whatsapp_booking_enabled,
  sms_reminders_enabled,
  google_review_url,
  default_commission_percent
)
VALUES (
  'default',
  'Nails',
  'Estudio boutique de uñas, cuidado natural y nail art editorial',
  'Reserva tu set con disponibilidad en tiempo real, extras personalizados y confirmación inmediata por correo y WhatsApp.',
  'Av. Álvaro Obregón 148, Col. Roma Norte, CDMX',
  'https://maps.google.com/?q=Roma+Norte+CDMX',
  '@nails.studio.mx',
  '+525512345678',
  'hola@nails.studio',
  'America/Mexico_City',
  '#9E5C64',
  '#D89BA3',
  'light',
  'system',
  'soft',
  'month',
  ARRAY['month', 'week', 'column'],
  true,
  30,
  true,
  3,
  120,
  45,
  12,
  12,
  'Puedes reagendar o cancelar sin cargo hasta 12 horas antes de tu cita desde tu link personal. Después de ese límite el anticipo no es reembolsable.',
  'Te pedimos llegar 5 minutos antes. Si traes gel o acrílico de otro estudio, agrega el extra de retiro para reservar el tiempo adecuado.',
  'manual_transfer',
  'BBVA México',
  'Nails Studio MX',
  '012180001234567890',
  'Para servicios largos o esculturales aparta con $150 MXN por transferencia SPEI y sube tu comprobante para confirmación prioritaria.',
  'MXN',
  '{
    "heroEyebrow": "Estudio privado · Agenda en tiempo real",
    "heroTitle": "Uñas diseñadas al detalle, reservadas en segundos.",
    "heroSubtitle": "Elige tu técnica, suma extras o diseño, sube tu foto de inspiración y aparta tu lugar sin esperar respuestas por mensaje.",
    "aboutTitle": "Higiene clínica, tiempos reales y estética atemporal",
    "aboutBody": "Cada cita incluye preparación en seco (manicura rusa), instrumental esterilizado en autoclave y un margen entre clientas para atenderte sin prisas."
  }'::jsonb,
  true,
  false,
  'https://g.page/r/nails-studio-demo/review',
  35.00
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.staff_members (
  id,
  name,
  role_title,
  bio,
  avatar_url,
  booking_slug,
  commission_percent,
  is_active,
  display_order
)
VALUES
  (
    '10000000-0000-4000-8000-000000000101',
    'Valeria Mendoza',
    'Fundadora & Master Nail Artist',
    'Especialista en manicura rusa, rubber base y diseño minimalista editorial.',
    NULL,
    'valeria',
    40.00,
    true,
    0
  ),
  (
    '10000000-0000-4000-8000-000000000102',
    'Camila Rojas',
    'Senior Nail Artist',
    'Experta en Soft Gel, acrílico escultural y acabados chrome / cat eye.',
    NULL,
    'camila',
    35.00,
    true,
    1
  )
ON CONFLICT (booking_slug) DO NOTHING;

INSERT INTO public.service_categories (id, name, slug, display_order)
VALUES
  ('10000000-0000-4000-8000-000000000201', 'Uña Natural & Gel', 'una-natural', 0),
  ('10000000-0000-4000-8000-000000000202', 'Extensiones & Esculturales', 'extensiones', 1),
  ('10000000-0000-4000-8000-000000000203', 'Pies & Spa', 'pies-spa', 2)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.services (
  id,
  category_id,
  name,
  slug,
  description,
  duration_minutes,
  price_cents,
  buffer_before_minutes,
  buffer_after_minutes,
  requires_confirmation,
  deposit_required,
  deposit_amount_cents,
  allow_inspo_photo,
  is_active,
  is_featured,
  display_order,
  image_url
)
VALUES
  (
    '10000000-0000-4000-8000-000000000301',
    (SELECT id FROM public.service_categories WHERE slug = 'una-natural'),
    'Manicura Rusa + Gelish',
    'manicura-rusa-gelish',
    'Limpieza profunda de cutícula en seco, limado preciso y esmaltado en gel liso de larga duración (hasta 3 semanas).',
    60,
    38000,
    0,
    15,
    false,
    false,
    0,
    true,
    true,
    true,
    0,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000302',
    (SELECT id FROM public.service_categories WHERE slug = 'una-natural'),
    'Nivelación Rubber Base / BIAB',
    'rubber-base-biab',
    'Refuerzo estructural flexible sobre uña natural para aportar fuerza, ápice limpio y brillo espejo sin dañar la lámina.',
    75,
    49000,
    0,
    15,
    false,
    false,
    0,
    true,
    true,
    true,
    1,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000303',
    (SELECT id FROM public.service_categories WHERE slug = 'extensiones'),
    'Extensiones Soft Gel (Gel-X)',
    'extensiones-soft-gel',
    'Extensiones ligeras de cobertura completa con acabado natural, ideales para largo S–M con excelente retención.',
    90,
    65000,
    0,
    15,
    true,
    true,
    15000,
    true,
    true,
    true,
    2,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000304',
    (SELECT id FROM public.service_categories WHERE slug = 'extensiones'),
    'Acrílico Escultural Full Set',
    'acrilico-escultural',
    'Esculpido a medida con forma profesional (almond, coffin o square) y sellado perfecto en zona de cutícula.',
    120,
    78000,
    0,
    15,
    true,
    true,
    20000,
    true,
    true,
    true,
    3,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000305',
    (SELECT id FROM public.service_categories WHERE slug = 'extensiones'),
    'Retoque Acrílico / Rubber (2–3 sem)',
    'retoque-acrilico-rubber',
    'Mantenimiento completo con renovación de estructura, limpieza de cutícula y cambio de color.',
    75,
    52000,
    0,
    15,
    false,
    false,
    0,
    true,
    true,
    false,
    4,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000306',
    (SELECT id FROM public.service_categories WHERE slug = 'pies-spa'),
    'Spa Pedicure + Gel',
    'spa-pedicure-gel',
    'Cuidado completo de pies, exfoliación botánica, hidratación profunda y esmaltado en gel.',
    60,
    46000,
    0,
    15,
    false,
    false,
    0,
    false,
    true,
    true,
    5,
    NULL
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.staff_services (staff_id, service_id)
SELECT sm.id, sv.id
FROM public.staff_members sm
JOIN public.services sv
  ON (
    sm.booking_slug = 'valeria'
    AND sv.slug IN (
      'manicura-rusa-gelish',
      'rubber-base-biab',
      'extensiones-soft-gel',
      'acrilico-escultural',
      'retoque-acrilico-rubber',
      'spa-pedicure-gel'
    )
  )
  OR (
    sm.booking_slug = 'camila'
    AND sv.slug IN (
      'manicura-rusa-gelish',
      'rubber-base-biab',
      'extensiones-soft-gel',
      'acrilico-escultural',
      'retoque-acrilico-rubber'
    )
  )
ON CONFLICT (staff_id, service_id) DO NOTHING;

INSERT INTO public.service_addons (
  id,
  name,
  description,
  extra_minutes,
  extra_price_cents,
  applies_to_all,
  service_ids,
  is_active,
  display_order
)
VALUES
  (
    '10000000-0000-4000-8000-000000000401',
    'Retiro de gel o acrílico previo',
    'Retiro seguro sin lastimar la uña natural antes de tu nuevo set.',
    20,
    12000,
    true,
    ARRAY[]::uuid[],
    true,
    0
  ),
  (
    '10000000-0000-4000-8000-000000000402',
    'Nail Art Nivel 1 (French / Minimal)',
    'Micro french, líneas finas, puntos o acento en 2–4 uñas.',
    15,
    11000,
    true,
    ARRAY[]::uuid[],
    true,
    1
  ),
  (
    '10000000-0000-4000-8000-000000000403',
    'Nail Art Nivel 2 (A mano alzada / 3D)',
    'Diseño detallado en varias uñas, relieves en gel 3D o charms.',
    30,
    22000,
    true,
    ARRAY[]::uuid[],
    true,
    2
  ),
  (
    '10000000-0000-4000-8000-000000000404',
    'Efecto Glazed / Chrome / Cat Eye',
    'Acabado perlado, espejo o magnético en las 10 uñas.',
    15,
    9500,
    true,
    ARRAY[]::uuid[],
    true,
    3
  ),
  (
    '10000000-0000-4000-8000-000000000405',
    'Largo Extra (L / XL)',
    'Estructura reforzada para largo #4 en adelante.',
    15,
    13000,
    false,
    ARRAY(
      SELECT id
      FROM public.services
      WHERE slug IN ('extensiones-soft-gel', 'acrilico-escultural', 'retoque-acrilico-rubber')
    ),
    true,
    4
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.availability_schedules (id, staff_id, name, timezone, is_default)
VALUES
  (
    '10000000-0000-4000-8000-000000000501',
    (SELECT id FROM public.staff_members WHERE booking_slug = 'valeria'),
    'Horario habitual',
    'America/Mexico_City',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000502',
    (SELECT id FROM public.staff_members WHERE booking_slug = 'camila'),
    'Horario habitual',
    'America/Mexico_City',
    true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.availability_rules (id, schedule_id, day_of_week, start_time, end_time)
VALUES
  ('10000000-0000-4000-8000-000000000601', '10000000-0000-4000-8000-000000000501', 1, '11:00', '18:00'),
  ('10000000-0000-4000-8000-000000000602', '10000000-0000-4000-8000-000000000501', 2, '10:00', '14:00'),
  ('10000000-0000-4000-8000-000000000603', '10000000-0000-4000-8000-000000000501', 2, '15:00', '19:30'),
  ('10000000-0000-4000-8000-000000000604', '10000000-0000-4000-8000-000000000501', 3, '10:00', '14:00'),
  ('10000000-0000-4000-8000-000000000605', '10000000-0000-4000-8000-000000000501', 3, '15:00', '19:30'),
  ('10000000-0000-4000-8000-000000000606', '10000000-0000-4000-8000-000000000501', 4, '10:00', '14:00'),
  ('10000000-0000-4000-8000-000000000607', '10000000-0000-4000-8000-000000000501', 4, '15:00', '19:30'),
  ('10000000-0000-4000-8000-000000000608', '10000000-0000-4000-8000-000000000501', 5, '10:00', '14:00'),
  ('10000000-0000-4000-8000-000000000609', '10000000-0000-4000-8000-000000000501', 5, '15:00', '19:30'),
  ('10000000-0000-4000-8000-000000000610', '10000000-0000-4000-8000-000000000501', 6, '09:30', '17:30'),
  ('10000000-0000-4000-8000-000000000611', '10000000-0000-4000-8000-000000000502', 1, '10:00', '14:00'),
  ('10000000-0000-4000-8000-000000000612', '10000000-0000-4000-8000-000000000502', 1, '15:00', '19:00'),
  ('10000000-0000-4000-8000-000000000613', '10000000-0000-4000-8000-000000000502', 2, '10:00', '14:00'),
  ('10000000-0000-4000-8000-000000000614', '10000000-0000-4000-8000-000000000502', 2, '15:00', '19:00'),
  ('10000000-0000-4000-8000-000000000615', '10000000-0000-4000-8000-000000000502', 3, '10:00', '14:00'),
  ('10000000-0000-4000-8000-000000000616', '10000000-0000-4000-8000-000000000502', 3, '15:00', '19:00'),
  ('10000000-0000-4000-8000-000000000617', '10000000-0000-4000-8000-000000000502', 4, '10:00', '14:00'),
  ('10000000-0000-4000-8000-000000000618', '10000000-0000-4000-8000-000000000502', 4, '15:00', '19:00'),
  ('10000000-0000-4000-8000-000000000619', '10000000-0000-4000-8000-000000000502', 5, '10:00', '14:00'),
  ('10000000-0000-4000-8000-000000000620', '10000000-0000-4000-8000-000000000502', 5, '15:00', '19:00'),
  ('10000000-0000-4000-8000-000000000621', '10000000-0000-4000-8000-000000000502', 6, '10:00', '16:30')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.coupons (
  id,
  code,
  kind,
  discount_type,
  discount_value,
  remaining_balance_cents,
  max_uses,
  used_count,
  min_subtotal_cents,
  expires_at,
  recipient_name,
  is_active
)
VALUES
  (
    '10000000-0000-4000-8000-000000000701',
    'BIENVENIDA10',
    'coupon',
    'percent',
    10,
    NULL,
    100,
    0,
    30000,
    NULL,
    NULL,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000702',
    'GIFT500',
    'gift_card',
    'fixed_cents',
    50000,
    50000,
    1,
    0,
    0,
    NULL,
    'Regalo de cumpleaños',
    true
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.gallery_items (
  id,
  title,
  caption,
  category,
  image_url,
  service_id,
  is_featured,
  display_order
)
VALUES
  (
    '10000000-0000-4000-8000-000000000801',
    'Milky Micro French',
    'Rubber base lechoso con línea ultra fina blanca sobre almendra corta.',
    'Rubber Base',
    '/gallery/milky-french.svg',
    (SELECT id FROM public.services WHERE slug = 'rubber-base-biab'),
    true,
    0
  ),
  (
    '10000000-0000-4000-8000-000000000802',
    'Glazed Pearl Chrome',
    'Efecto perlado traslúcido con acabado espejo luminoso.',
    'Soft Gel',
    '/gallery/glazed-pearl.svg',
    (SELECT id FROM public.services WHERE slug = 'extensiones-soft-gel'),
    true,
    1
  ),
  (
    '10000000-0000-4000-8000-000000000803',
    'Rosewood Velvet Cat Eye',
    'Tono palo de rosa aterciopelado con pigmento magnético.',
    'Gelish',
    '/gallery/rosewood-velvet.svg',
    (SELECT id FROM public.services WHERE slug = 'manicura-rusa-gelish'),
    true,
    2
  ),
  (
    '10000000-0000-4000-8000-000000000804',
    'Sculpted Espresso Tortoise',
    'Acrílico escultural con detalle carey y acento dorado sutil.',
    'Acrílico',
    '/gallery/espresso-tortoise.svg',
    (SELECT id FROM public.services WHERE slug = 'acrilico-escultural'),
    true,
    3
  )
ON CONFLICT (id) DO NOTHING;

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
    '10000000-0000-4000-8000-000000000901',
    'Confirmación inmediata de cita',
    'booking_created',
    0,
    ARRAY['email', 'whatsapp'],
    true,
    'Tu cita en {{salon_name}} ({{booking_code}})',
    'Hola {{client_name}}, recibimos tu cita de {{service_name}} el {{date_label}} a las {{time_label}}. Gestiona tu cita aquí: {{manage_url}}'
  ),
  (
    '10000000-0000-4000-8000-000000000902',
    'Recordatorio 24 horas antes',
    'before_booking',
    1440,
    ARRAY['email', 'whatsapp'],
    true,
    'Mañana te esperamos en {{salon_name}}',
    'Hola {{client_name}}, recordatorio de tu cita de {{service_name}} mañana {{date_label}} a las {{time_label}}. Si necesitas moverla entra a {{manage_url}}'
  ),
  (
    '10000000-0000-4000-8000-000000000903',
    'Recordatorio 2 horas antes (ahorro inteligente si ya confirmó)',
    'before_booking',
    120,
    ARRAY['whatsapp'],
    true,
    'Nos vemos pronto en {{salon_name}}',
    'Hola {{client_name}}, te esperamos hoy a las {{time_label}} en {{salon_name}} ({{address}}).'
  ),
  (
    '10000000-0000-4000-8000-000000000904',
    'Recordatorio de retoque (18 días después)',
    'after_booking',
    25920,
    ARRAY['whatsapp'],
    false,
    '¿Lista para tu retoque en {{salon_name}}?',
    'Hola {{client_name}}, ya casi cumplen 3 semanas tus uñas. Aparta tu retoque aquí: {{booking_url}}'
  )
ON CONFLICT (id) DO NOTHING;
