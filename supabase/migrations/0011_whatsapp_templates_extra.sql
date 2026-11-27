-- ==============================================================================
-- Nails — Migración 0011: Plantillas adicionales de WhatsApp Business (es_MX)
-- Agrega los 3 disparadores oficiales que no venían en la migración inicial:
--   - deposit_rejected  (UTILITY)
--   - client_otp        (AUTHENTICATION)
--   - touchup_invite    (MARKETING)
-- Mismos IDs, nombres y categorías que supabase/seed.sql. Idempotente.
-- ==============================================================================

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
    '10000000-0000-4000-8000-000000001207',
    'deposit_rejected',
    'laikona_comprobante_rechazado',
    'UTILITY',
    'es_MX',
    true
  ),
  (
    '10000000-0000-4000-8000-000000001208',
    'client_otp',
    'laikona_codigo_acceso',
    'AUTHENTICATION',
    'es_MX',
    true
  ),
  (
    '10000000-0000-4000-8000-000000001209',
    'touchup_invite',
    'laikona_invitacion_retoque',
    'MARKETING',
    'es_MX',
    true
  )
ON CONFLICT (trigger_key) DO NOTHING;
