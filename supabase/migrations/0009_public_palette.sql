ALTER TABLE public.salon_settings
  ADD COLUMN IF NOT EXISTS public_palette text NOT NULL DEFAULT 'laikona'
  CHECK (public_palette IN ('laikona', 'monochrome'));
