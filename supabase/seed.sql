-- Seed inicial para LAIKONA NAILS BY KARLA (ejecutar después de 0001..0008)
-- Alineado con src/lib/demo-seed.ts (verificado por scripts/check-seed-parity.mjs)

INSERT INTO public.salon_settings (
  id,
  name,
  tagline,
  description,
  address,
  maps_url,
  instagram_handle,
  sister_studio_handle,
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
  deposit_beneficiary,
  deposit_clabe,
  deposit_amount_cents,
  deposit_instructions,
  currency,
  service_mode,
  business_type,
  team_size_tier,
  onboarding_completed,
  sound_alerts_enabled,
  lock_past_bookings,
  max_active_bookings_per_client,
  privacy_policy_version,
  landing_content,
  whatsapp_booking_enabled,
  sms_reminders_enabled,
  retention_notice_email,
  whatsapp_monthly_quota,
  google_review_url,
  default_commission_percent
)
VALUES (
  'default',
  'LAIKONA NAILS',
  'by Karla · Manicure y nail art en Puebla',
  'Laikona Nails by Karla, estudio de manicure, pedicure y nail art en Puebla. Consulta servicios y agenda tu cita en línea.',
  'Calle 25 Sur 1904, Col. Volcanes, 72410 Puebla, Pue.',
  'https://maps.google.com/?q=Calle+25+Sur+1904+Volcanes+Puebla',
  '@laikona.nailsss',
  '',
  '+522221234567',
  'hola@laikonanails.mx',
  'America/Mexico_City',
  '#8B1E2B',
  '#E57A89',
  'light',
  'system',
  'soft',
  'month',
  ARRAY['month', 'week', 'column'],
  true,
  30,
  true,
  5,
  120,
  45,
  12,
  12,
  'Para apartar tu lugar se requiere anticipo de $200 MXN vía transferencia SPEI a Mercado Pago. Puedes reagendar o cancelar sin perder tu anticipo hasta 12 horas antes de tu cita desde tu link personal.',
  'Te pedimos llegar puntual a tu bloque (10 min de tolerancia). Si traes gel o acrílico previo, agrega el servicio de Retiro o extra para apartar el tiempo exacto.',
  'manual_transfer',
  'Mercado Pago',
  'Karla Patricia Carrillo Rodríguez',
  'Karla Patricia Carrillo Rodríguez',
  '7229 6901 3959 779869',
  20000,
  'Aparta tu cita con $200 MXN por transferencia SPEI a Mercado Pago (CLABE 7229 6901 3959 779869 · Karla Patricia Carrillo Rodríguez). Sube tu comprobante aquí o envíalo por DM a @laikona.nailsss.',
  'MXN',
  'studio',
  'Salón de Manicure y Uñas',
  '3 a 5',
  false,
  true,
  true,
  3,
  '2026-11',
  '{
    "heroEyebrow": "Laikona Nails by Karla · Puebla",
    "heroTitle": "De tu idea a tus uñas.",
    "heroSubtitle": "Trabajo acrílico escultural, Softgel y Rubber. Elige tu técnica y trae una referencia para tu cita.",
    "aboutTitle": "Técnica precisa, higiene clínica y bloques dedicados en Puebla",
    "aboutBody": "En LAIKONA NAILS by Karla cada cita tiene su bloque de horario reservado para trabajar con preparación en seco, instrumental esterilizado y acabados duraderos."
  }'::jsonb,
  true,
  false,
  'hola@laikonanails.mx',
  500,
  'https://g.page/r/laikona-nails-puebla/review',
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
    'Karla',
    'Fundadora & Master Nail Artist',
    'Especialista en acrílico escultural, Softgel, Rubber y diseños editoriales en LAIKONA NAILS Puebla.',
    NULL,
    'karla',
    40.00,
    true,
    0
  ),
  (
    '10000000-0000-4000-8000-000000000102',
    'Paty',
    'Senior Nail Artist',
    'Experta en Rubber, retoques de alta retención, gel semipermanente y PediSpa.',
    NULL,
    'paty',
    35.00,
    true,
    1
  ),
  (
    '10000000-0000-4000-8000-000000000103',
    'Tere',
    'Nail Artist · Turno Vespertino',
    'Especialista en Softgel, acrílico, gel en manos/pies y acabados modernos en horario de tarde.',
    NULL,
    'tere',
    35.00,
    true,
    2
  )
ON CONFLICT (booking_slug) DO NOTHING;

INSERT INTO public.service_categories (id, name, slug, display_order)
VALUES
  ('10000000-0000-4000-8000-000000000201', 'Uñas & Esculturales', 'unas-esculturales', 0),
  ('10000000-0000-4000-8000-000000000202', 'Gel & Retiro', 'gel-retiro', 1),
  ('10000000-0000-4000-8000-000000000203', 'Pies & PediSpa', 'pies-pedispa', 2)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.services (
  id,
  category_id,
  name,
  slug,
  description,
  duration_minutes,
  price_cents,
  is_starting_price,
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
    (SELECT id FROM public.service_categories WHERE slug = 'unas-esculturales'),
    'Rubber',
    'rubber',
    'Nivelación y refuerzo con base Rubber sobre uña natural para máxima resistencia, ápice limpio y acabado duradero.',
    120,
    35000,
    true,
    0,
    0,
    true,
    true,
    20000,
    true,
    true,
    true,
    0,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000302',
    (SELECT id FROM public.service_categories WHERE slug = 'unas-esculturales'),
    'Uñas acrílicas',
    'unas-acrilicas',
    'Set completo de acrílico escultural con forma personalizada, sellado limpio en cutícula y estructura resistente.',
    150,
    45000,
    true,
    0,
    0,
    true,
    true,
    20000,
    true,
    true,
    true,
    1,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000303',
    (SELECT id FROM public.service_categories WHERE slug = 'unas-esculturales'),
    'Uñas Softgel',
    'unas-softgel',
    'Extensiones Softgel ligeras de cobertura completa con retención superior y acabado natural o editorial.',
    120,
    45000,
    true,
    0,
    0,
    true,
    true,
    20000,
    true,
    true,
    true,
    2,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000304',
    (SELECT id FROM public.service_categories WHERE slug = 'unas-esculturales'),
    'Retoque',
    'retoque',
    'Mantenimiento de acrílico o Rubber con relleno de crecimiento, limpieza de cutícula y renovación de diseño.',
    120,
    34000,
    true,
    0,
    0,
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
    (SELECT id FROM public.service_categories WHERE slug = 'gel-retiro'),
    'Gel Semipermanente manos',
    'gel-semipermanente-manos',
    'Preparación de uña natural y esmaltado en gel semipermanente con brillo espejo de larga duración.',
    60,
    15000,
    true,
    0,
    0,
    false,
    true,
    20000,
    true,
    true,
    true,
    4,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000306',
    (SELECT id FROM public.service_categories WHERE slug = 'gel-retiro'),
    'Retiro',
    'retiro',
    'Retiro profesional y cuidadoso de gel, Rubber, Softgel o acrílico cuidando la lámina natural.',
    30,
    8000,
    true,
    0,
    0,
    false,
    false,
    20000,
    false,
    true,
    false,
    5,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000307',
    (SELECT id FROM public.service_categories WHERE slug = 'pies-pedispa'),
    'PediSpa + Gel',
    'pedispa-gel',
    'Pedicure spa completo con exfoliación, hidratación profunda, limpieza detallada y gel semipermanente.',
    90,
    50000,
    false,
    0,
    0,
    true,
    true,
    20000,
    false,
    true,
    true,
    6,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000308',
    (SELECT id FROM public.service_categories WHERE slug = 'pies-pedispa'),
    'PediSpa + Acripie',
    'pedispa-acripie',
    'Pedicure spa completo combinado con reconstrucción estética en acrílico para un acabado pulido y uniforme.',
    105,
    55000,
    false,
    0,
    0,
    true,
    true,
    20000,
    false,
    true,
    false,
    7,
    NULL
  ),
  (
    '10000000-0000-4000-8000-000000000309',
    (SELECT id FROM public.service_categories WHERE slug = 'pies-pedispa'),
    'Gel Pies en seco',
    'gel-pies-en-seco',
    'Limpieza en seco, limado anatómico y esmaltado en gel semipermanente para pies impecables.',
    60,
    25000,
    false,
    0,
    0,
    false,
    true,
    20000,
    false,
    true,
    false,
    8,
    NULL
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.staff_services (staff_id, service_id)
SELECT sm.id, sv.id
FROM public.staff_members sm
CROSS JOIN public.services sv
WHERE sm.booking_slug IN ('karla', 'paty', 'tere')
  AND sv.slug IN (
    'rubber',
    'unas-acrilicas',
    'unas-softgel',
    'retoque',
    'gel-semipermanente-manos',
    'retiro',
    'pedispa-gel',
    'pedispa-acripie',
    'gel-pies-en-seco'
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
      WHERE slug IN ('unas-softgel', 'unas-acrilicas', 'retoque')
    ),
    true,
    4
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.availability_schedules (id, staff_id, name, timezone, is_default)
VALUES
  (
    '10000000-0000-4000-8000-000000000501',
    (SELECT id FROM public.staff_members WHERE booking_slug = 'karla'),
    'Bloques fijos Karla (10:00 · 13:30 · 16:30)',
    'America/Mexico_City',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000502',
    (SELECT id FROM public.staff_members WHERE booking_slug = 'paty'),
    'Bloques fijos Paty (10:00 · 13:30 · 16:30)',
    'America/Mexico_City',
    true
  ),
  (
    '10000000-0000-4000-8000-000000000503',
    (SELECT id FROM public.staff_members WHERE booking_slug = 'tere'),
    'Bloques fijos Tere (14:00 · 16:00 · 18:00)',
    'America/Mexico_City',
    true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.availability_rules (id, schedule_id, day_of_week, start_time, end_time, fixed_start_times)
VALUES
  ('10000000-0000-4000-8000-000000000601', '10000000-0000-4000-8000-000000000501', 1, '10:00', '19:30', ARRAY['10:00', '13:30', '16:30']),
  ('10000000-0000-4000-8000-000000000602', '10000000-0000-4000-8000-000000000501', 2, '10:00', '19:30', ARRAY['10:00', '13:30', '16:30']),
  ('10000000-0000-4000-8000-000000000603', '10000000-0000-4000-8000-000000000501', 3, '10:00', '19:30', ARRAY['10:00', '13:30', '16:30']),
  ('10000000-0000-4000-8000-000000000604', '10000000-0000-4000-8000-000000000501', 4, '10:00', '19:30', ARRAY['10:00', '13:30', '16:30']),
  ('10000000-0000-4000-8000-000000000605', '10000000-0000-4000-8000-000000000501', 5, '10:00', '19:30', ARRAY['10:00', '13:30', '16:30']),
  ('10000000-0000-4000-8000-000000000606', '10000000-0000-4000-8000-000000000501', 6, '10:00', '19:30', ARRAY['10:00', '13:30', '16:30']),
  ('10000000-0000-4000-8000-000000000611', '10000000-0000-4000-8000-000000000502', 1, '10:00', '19:30', ARRAY['10:00', '13:30', '16:30']),
  ('10000000-0000-4000-8000-000000000612', '10000000-0000-4000-8000-000000000502', 2, '10:00', '19:30', ARRAY['10:00', '13:30', '16:30']),
  ('10000000-0000-4000-8000-000000000613', '10000000-0000-4000-8000-000000000502', 3, '10:00', '19:30', ARRAY['10:00', '13:30', '16:30']),
  ('10000000-0000-4000-8000-000000000614', '10000000-0000-4000-8000-000000000502', 4, '10:00', '19:30', ARRAY['10:00', '13:30', '16:30']),
  ('10000000-0000-4000-8000-000000000615', '10000000-0000-4000-8000-000000000502', 5, '10:00', '19:30', ARRAY['10:00', '13:30', '16:30']),
  ('10000000-0000-4000-8000-000000000616', '10000000-0000-4000-8000-000000000502', 6, '10:00', '19:30', ARRAY['10:00', '13:30', '16:30']),
  ('10000000-0000-4000-8000-000000000621', '10000000-0000-4000-8000-000000000503', 1, '14:00', '20:30', ARRAY['14:00', '16:00', '18:00']),
  ('10000000-0000-4000-8000-000000000622', '10000000-0000-4000-8000-000000000503', 2, '14:00', '20:30', ARRAY['14:00', '16:00', '18:00']),
  ('10000000-0000-4000-8000-000000000623', '10000000-0000-4000-8000-000000000503', 3, '14:00', '20:30', ARRAY['14:00', '16:00', '18:00']),
  ('10000000-0000-4000-8000-000000000624', '10000000-0000-4000-8000-000000000503', 4, '14:00', '20:30', ARRAY['14:00', '16:00', '18:00']),
  ('10000000-0000-4000-8000-000000000625', '10000000-0000-4000-8000-000000000503', 5, '14:00', '20:30', ARRAY['14:00', '16:00', '18:00']),
  ('10000000-0000-4000-8000-000000000626', '10000000-0000-4000-8000-000000000503', 6, '14:00', '20:30', ARRAY['14:00', '16:00', '18:00'])
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
    'Rubber',
    '/landing/sets/foto-010.webp',
    (SELECT id FROM public.services WHERE slug = 'rubber'),
    true,
    0
  ),
  (
    '10000000-0000-4000-8000-000000000802',
    'Glazed Pearl Chrome',
    'Softgel efecto perlado traslúcido con acabado espejo luminoso.',
    'Softgel',
    '/landing/sets/foto-004.webp',
    (SELECT id FROM public.services WHERE slug = 'unas-softgel'),
    true,
    1
  ),
  (
    '10000000-0000-4000-8000-000000000803',
    'Cherry Lacquer Velvet',
    'Gel semipermanente tono cereza editorial con brillo espejo.',
    'Gel',
    '/landing/sets/foto-007.webp',
    (SELECT id FROM public.services WHERE slug = 'gel-semipermanente-manos'),
    true,
    2
  ),
  (
    '10000000-0000-4000-8000-000000000804',
    'Sculpted Espresso Tortoise',
    'Acrílico escultural con detalle carey y acento dorado sutil.',
    'Acrílico',
    '/landing/sets/12-rojo-laca-dorado-4x5.webp',
    (SELECT id FROM public.services WHERE slug = 'unas-acrilicas'),
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
    'Hola {{client_name}}, recordatorio de tu cita de {{service_name}} mañana {{date_label}} a las {{time_label}}. Confirma asistencia aquí: {{confirm_url}} o reagenda si lo necesitas: {{reschedule_url}}'
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
    ARRAY['whatsapp', 'email'],
    true,
    '¿Lista para tu retoque en {{salon_name}}?',
    'Hola {{client_name}}, ya casi cumplen 3 semanas tus uñas. Aparta tu retoque con horario sugerido aquí: {{touchup_url}}'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.loyalty_programs (
  id,
  is_active,
  name,
  stamps_required,
  reward_type,
  reward_service_id,
  discount_percent,
  max_discount_cents,
  valid_days
)
VALUES
  (
    '10000000-0000-4000-8000-000000001001',
    true,
    'Tarjeta de Sellos LAIKONA',
    8,
    'percent_discount',
    NULL,
    50,
    25000,
    90
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.recurring_blocks (
  id,
  staff_id,
  reason,
  frequency,
  weekdays,
  day_of_month,
  start_time,
  end_time,
  until_date,
  is_active
)
VALUES
  (
    '10000000-0000-4000-8000-000000001101',
    (SELECT id FROM public.staff_members WHERE booking_slug = 'karla'),
    'Comida y esterilización de instrumental',
    'weekly',
    ARRAY[1, 2, 3, 4, 5, 6],
    NULL,
    '12:30',
    '13:15',
    NULL,
    true
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.whatsapp_templates (
  id,
  trigger_key,
  template_name,
  category,
  language_code,
  is_active
)
VALUES
  (
    '10000000-0000-4000-8000-000000001201',
    'booking_confirmed',
    'laikona_cita_confirmada',
    'UTILITY',
    'es_MX',
    true
  ),
  (
    '10000000-0000-4000-8000-000000001202',
    'reminder_24h',
    'laikona_recordatorio_24h',
    'UTILITY',
    'es_MX',
    true
  ),
  (
    '10000000-0000-4000-8000-000000001203',
    'reminder_2h',
    'laikona_recordatorio_2h',
    'UTILITY',
    'es_MX',
    true
  ),
  (
    '10000000-0000-4000-8000-000000001204',
    'booking_rescheduled',
    'laikona_cita_reagendada',
    'UTILITY',
    'es_MX',
    true
  ),
  (
    '10000000-0000-4000-8000-000000001205',
    'booking_canceled',
    'laikona_cita_cancelada',
    'UTILITY',
    'es_MX',
    true
  ),
  (
    '10000000-0000-4000-8000-000000001206',
    'waitlist_offer',
    'laikona_lista_espera',
    'UTILITY',
    'es_MX',
    true
  )
ON CONFLICT (trigger_key) DO NOTHING;

INSERT INTO public.whatsapp_monthly_usage (
  month_key,
  sent_count,
  quota_limit
)
VALUES (
  to_char(now() AT TIME ZONE 'America/Mexico_City', 'YYYY-MM'),
  0,
  500
)
ON CONFLICT (month_key) DO NOTHING;
