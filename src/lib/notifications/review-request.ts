import { buildWhatsAppLink } from '@/lib/format';

export function resolveSafeGoogleReviewUrl(
  rawUrl: string | null | undefined,
): string | null {
  const trimmed = rawUrl?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function buildGoogleReviewMessage(params: {
  clientFullName: string;
  salonName: string;
  googleReviewUrl: string;
}): string {
  const firstName = params.clientFullName.trim().split(/\s+/)[0] || '';
  const greeting = firstName ? `Hola ${firstName}` : 'Hola';
  const salon = params.salonName.trim() || 'nuestro estudio';
  return `${greeting}, muchas gracias por visitarnos en ${salon}. Esperamos que te hayan encantado tus uñas. Si tienes un minuto, nos ayudaría muchísimo que nos compartas tu reseña en Google aquí: ${params.googleReviewUrl}`;
}

export function buildGoogleReviewWhatsAppLink(params: {
  phoneE164: string;
  clientFullName: string;
  salonName: string;
  googleReviewUrl: string | null | undefined;
}): string | null {
  const safeUrl = resolveSafeGoogleReviewUrl(params.googleReviewUrl);
  if (!safeUrl) return null;
  const digits = params.phoneE164.replace(/\D/g, '');
  if (!digits) return null;
  const message = buildGoogleReviewMessage({
    clientFullName: params.clientFullName,
    salonName: params.salonName,
    googleReviewUrl: safeUrl,
  });
  return buildWhatsAppLink(params.phoneE164, message);
}
