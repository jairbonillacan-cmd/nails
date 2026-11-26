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

function isPrivateOrLocalHostname(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!lower) return true;
  if (
    lower === 'localhost' ||
    lower.endsWith('.localhost') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal') ||
    lower === '::1' ||
    lower === '0:0:0:0:0:0:0:1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    lower.startsWith('fe80:')
  ) {
    return true;
  }
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return !lower.includes('.');
}

const SAFE_PROOF_LINK_HOST_SUFFIXES = [
  'mercadopago.com.mx',
  'mercadopago.com',
  'mpago.la',
  'stripe.com',
  'banxico.org.mx',
  'bbva.mx',
  'bbva.com',
  'santander.com.mx',
  'banamex.com',
  'citibanamex.com',
  'banorte.com',
  'hsbc.com.mx',
  'scotiabank.com.mx',
  'nu.com.mx',
  'nubank.com.br',
  'hey.inc',
  'stpmex.com',
  'clip.mx',
  'paypal.com',
  'drive.google.com',
  'icloud.com',
] as const;

const UNSAFE_TRACKING_IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i;

function isTrustedProofHostname(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase().replace(/\.$/, '');
  return SAFE_PROOF_LINK_HOST_SUFFIXES.some(
    (suffix) => lower === suffix || lower.endsWith(`.${suffix}`),
  );
}

export function isSafeExternalProofUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (isPrivateOrLocalHostname(parsed.hostname)) return false;
    if (!isTrustedProofHostname(parsed.hostname)) return false;
    if (UNSAFE_TRACKING_IMAGE_EXT_RE.test(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function createPublicMediaUrlSchema(folder: 'inspo' | 'proofs') {
  return z
    .string()
    .max(4_000_000)
    .refine((value) => isAllowedPublicMediaInput(value, folder), {
      message: 'Solo se permiten imágenes PNG, JPEG o WEBP subidas directamente.',
    });
}

export function createDepositProofInputSchema() {
  return z
    .string()
    .max(4_000_000)
    .refine(
      (value) => {
        const trimmed = value.trim();
        if (!trimmed) return true;
        return (
          isAllowedPublicMediaInput(trimmed, 'proofs') ||
          isSafeExternalProofUrl(trimmed)
        );
      },
      {
        message:
          'Sube una imagen PNG, JPEG o WEBP, o pega un enlace HTTPS válido de tu comprobante.',
      },
    );
}

export const ClientContactFieldsSchema = z.object({
  clientName: z.string().min(2, 'Escribe tu nombre completo'),
  clientPhone: PhoneInputSchema,
  clientEmail: OptionalEmailSchema,
  clientInstagram: InstagramHandleSchema,
  clientBirthday: z.string().optional().nullable(),
});
