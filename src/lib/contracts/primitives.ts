import { z } from 'zod';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const PUBLIC_MEDIA_DATA_URL_RE =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/i;
const SAFE_INTERNAL_MEDIA_FILE_RE = /^[a-zA-Z0-9_-]+\.(?:png|jpg|webp)$/;

export const DateKeySchema = z
  .string()
  .regex(DATE_KEY_RE, 'Fecha inválida (YYYY-MM-DD)');

export const TimeHHMMSchema = z
  .string()
  .regex(TIME_HHMM_RE, 'Hora inválida (HH:mm)');

export const NonEmptyIdSchema = z.string().min(1);

export const PhoneInputSchema = z
  .string()
  .min(8, 'Escribe un WhatsApp válido de 10 dígitos');

export const OptionalEmailSchema = z
  .string()
  .trim()
  .pipe(z.union([z.literal(''), z.string().email('Correo inválido')]))
  .optional()
  .nullable();

export const InstagramHandleSchema = z.string().max(120).optional().nullable();

export const CentsNonNegativeSchema = z.number().int().nonnegative();

export function isSafeInternalBookingMediaPath(
  value: string,
  folder?: 'inspo' | 'proofs',
): boolean {
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.includes('..') ||
    trimmed.includes('\\') ||
    trimmed.includes('?') ||
    trimmed.includes('#')
  ) {
    return false;
  }
  const normalized = trimmed.startsWith('/api/media/')
    ? trimmed.slice('/api/media/'.length)
    : trimmed;
  const parts = normalized.split('/');
  if (parts.length !== 2) return false;
  const [segmentFolder, fileName] = parts;
  if (segmentFolder !== 'inspo' && segmentFolder !== 'proofs') {
    return false;
  }
  if (folder && segmentFolder !== folder) {
    return false;
  }
  return Boolean(fileName && SAFE_INTERNAL_MEDIA_FILE_RE.test(fileName));
}

function isAllowedPublicMediaInput(
  value: string,
  folder: 'inspo' | 'proofs',
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (PUBLIC_MEDIA_DATA_URL_RE.test(trimmed)) {
    return true;
  }
  return isSafeInternalBookingMediaPath(trimmed, folder);
}

export function createPublicMediaUrlSchema(folder: 'inspo' | 'proofs') {
  return z
    .string()
    .max(4_000_000)
    .refine((value) => isAllowedPublicMediaInput(value, folder), {
      message: 'Solo se permiten imágenes PNG, JPEG o WEBP subidas directamente.',
    });
}

export const ClientContactFieldsSchema = z.object({
  clientName: z.string().min(2, 'Escribe tu nombre completo'),
  clientPhone: PhoneInputSchema,
  clientEmail: OptionalEmailSchema,
  clientInstagram: InstagramHandleSchema,
  clientBirthday: z.string().optional().nullable(),
});
