import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  CLIENT_PORTAL_COOKIE,
  createClientPortalOtpChallenge,
  createClientPortalSessionToken,
  getClientPortalCookieOptions,
  verifyClientPortalOtp,
} from '@/lib/auth/client-portal-otp';
import { ClientPortalOtpActionSchema } from '@/lib/contracts';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import {
  dispatchSmsNotification,
  dispatchWhatsAppNotification,
} from '@/lib/integrations/notifications';
import { buildClientOtpTemplatePayload } from '@/lib/integrations/resend-templates';
import { logInfo, logWarn } from '@/lib/logger';
import { getRepository } from '@/lib/repositories/db';
import { isSupabaseEnabled } from '@/lib/repositories/supabase-client';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

const OTP_REQUEST_LIMIT = 15;
const OTP_VERIFY_LIMIT = 25;
const OTP_RATE_WINDOW_MS = 10 * 60 * 1000;

function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      code: 'RATE_LIMITED',
      error: 'Demasiados intentos. Espera un momento e inténtalo nuevamente.',
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const parsed = ClientPortalOtpActionSchema.parse(body);
    const ip = getRequestIp(request);

    if (parsed.action === 'request') {
      const rate = checkRateLimit({
        bucket: 'client-portal-otp-request',
        key: ip,
        limit: OTP_REQUEST_LIMIT,
        windowMs: OTP_RATE_WINDOW_MS,
      });
      if (!rate.allowed) {
        logWarn('client_portal.otp_request_rate_limited', { ip });
        return rateLimitedResponse(rate.retryAfterSeconds);
      }

      const challenge = createClientPortalOtpChallenge(parsed.phone);
      if (!challenge) {
        return NextResponse.json(
          { error: 'Escribe un número de WhatsApp válido de 10 dígitos.' },
          { status: 400 },
        );
      }

      const canSign = Boolean(createClientPortalSessionToken(challenge.phoneE164));
      if (!canSign) {
        logWarn('client_portal.unconfigured_secret', { phone: challenge.phoneE164 });
        return NextResponse.json(
          {
            code: 'PORTAL_UNCONFIGURED',
            error: 'El portal de clientas no está configurado en este entorno.',
          },
          { status: 503 },
        );
      }

      const db = await getRepository().getSnapshot();
      const { settings } = db;
      const env = getRuntimeIntegrationStatus();
      const matchedClient = db.clients.find((c) => c.phoneE164 === challenge.phoneE164);
      const fallbackEmail =
        matchedClient?.email && env.resendConfigured
          ? {
              to: matchedClient.email,
              subject: `Tu código de acceso: ${challenge.code} · ${settings.name}`,
              settings,
              appUrl: env.appUrl,
              template: buildClientOtpTemplatePayload({
                clientName: matchedClient.fullName,
                otpCode: challenge.code,
                expiresMinutes: 5,
                settings,
                appUrl: env.appUrl,
              }),
              idempotencyKey: `portal-otp-${challenge.phoneE164}-${challenge.code}`,
            }
          : undefined;
      const messageBody = `Tu código de verificación de ${settings.name} es ${challenge.code}. Válido por 5 minutos. No lo compartas con nadie.`;

      let channel: 'whatsapp' | 'sms' | 'email' = 'whatsapp';
      if (env.whatsappCloudConfigured) {
        const waResult = await dispatchWhatsAppNotification({
          toPhoneE164: challenge.phoneE164,
          bodyText: messageBody,
          fallbackEmail,
        });
        if (waResult.status !== 'sent' && settings.smsRemindersEnabled) {
          const smsResult = await dispatchSmsNotification({
            toPhoneE164: challenge.phoneE164,
            bodyText: messageBody,
          });
          if (smsResult.status === 'sent') {
            channel = 'sms';
          }
        } else if (
          waResult.deliveryMode === 'fallback_email_wame' &&
          fallbackEmail &&
          waResult.status === 'sent'
        ) {
          channel = 'email';
        }
      } else if (settings.smsRemindersEnabled && env.twilioSmsConfigured) {
        const smsResult = await dispatchSmsNotification({
          toPhoneE164: challenge.phoneE164,
          bodyText: messageBody,
        });
        if (smsResult.status === 'sent') {
          channel = 'sms';
        }
      } else if (fallbackEmail) {
        const emailResult = await dispatchWhatsAppNotification({
          toPhoneE164: challenge.phoneE164,
          bodyText: messageBody,
          fallbackEmail,
        });
        if (emailResult.status === 'sent') {
          channel = 'email';
        }
      } else {
        await dispatchWhatsAppNotification({
          toPhoneE164: challenge.phoneE164,
          bodyText: messageBody,
        });
      }

      const allowDemoCode =
        !isSupabaseEnabled() && process.env.NODE_ENV !== 'production';

      logInfo('client_portal.otp_requested', {
        phone: challenge.phoneE164,
        channel,
      });

      return NextResponse.json(
        {
          ok: true,
          phoneE164: challenge.phoneE164,
          expiresInSeconds: 300,
          channel,
          ...(allowDemoCode ? { demoCode: challenge.code } : {}),
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'no-store',
            'X-RateLimit-Remaining': String(rate.remaining),
          },
        },
      );
    }

    const verifyRate = checkRateLimit({
      bucket: 'client-portal-otp-verify',
      key: ip,
      limit: OTP_VERIFY_LIMIT,
      windowMs: OTP_RATE_WINDOW_MS,
    });
    if (!verifyRate.allowed) {
      logWarn('client_portal.otp_verify_rate_limited', { ip });
      return rateLimitedResponse(verifyRate.retryAfterSeconds);
    }

    const verified = verifyClientPortalOtp(parsed.phone, parsed.code);
    if (!verified.ok) {
      if (verified.reason === 'unconfigured') {
        return NextResponse.json(
          {
            code: 'PORTAL_UNCONFIGURED',
            error: 'El portal de clientas no está configurado en este entorno.',
          },
          { status: 503 },
        );
      }
      if (verified.reason === 'max_attempts') {
        return NextResponse.json(
          {
            code: 'OTP_MAX_ATTEMPTS',
            error: 'Excediste el límite de intentos. Solicita un nuevo código.',
          },
          { status: 429 },
        );
      }
      if (verified.reason === 'expired') {
        return NextResponse.json(
          {
            code: 'OTP_EXPIRED',
            error: 'Tu código venció. Solicita uno nuevo para continuar.',
          },
          { status: 400 },
        );
      }
      if (verified.reason === 'invalid_phone') {
        return NextResponse.json(
          { error: 'Escribe un número de WhatsApp válido de 10 dígitos.' },
          { status: 400 },
        );
      }
      return NextResponse.json(
        {
          code: 'OTP_INVALID',
          error: 'Código incorrecto. Revisa los 6 dígitos e intenta de nuevo.',
          attemptsRemaining: verified.attemptsRemaining,
        },
        { status: 401 },
      );
    }

    logInfo('client_portal.otp_verified', { phone: verified.phoneE164 });
    const response = NextResponse.json(
      {
        ok: true,
        authenticated: true,
        phoneE164: verified.phoneE164,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
    response.cookies.set(
      CLIENT_PORTAL_COOKIE,
      verified.sessionToken,
      getClientPortalCookieOptions(),
    );
    return response;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos ingresados.' },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: 'No se pudo procesar tu solicitud.' },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json(
    { ok: true, authenticated: false },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
  response.cookies.set(CLIENT_PORTAL_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
  return response;
}
