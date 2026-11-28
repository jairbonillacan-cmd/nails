import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  CLIENT_PORTAL_COOKIE,
  CLIENT_PORTAL_OTP_CHALLENGE_COOKIE,
  createClientPortalOtpChallenge,
  createClientPortalSessionToken,
  getClientPortalCookieOptions,
  getClientPortalOtpChallengeCookieOptions,
  verifyClientPortalOtp,
} from '@/lib/auth/client-portal-otp';
import { ClientPortalOtpActionSchema } from '@/lib/contracts';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { normalizePhoneE164 } from '@/lib/format';
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
const OTP_REQUEST_PER_PHONE_LIMIT = 4;
const OTP_VERIFY_LIMIT = 25;
const OTP_RATE_WINDOW_MS = 10 * 60 * 1000;

const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };

function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    {
      code: 'RATE_LIMITED',
      error: 'Demasiados intentos. Espera un momento e inténtalo nuevamente.',
    },
    {
      status: 429,
      headers: {
        ...PRIVATE_HEADERS,
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

      const requestedPhone = normalizePhoneE164(parsed.phone);
      const requestedDigits = requestedPhone.replace(/\D/g, '');
      if (!requestedPhone || requestedDigits.length < 10) {
        return NextResponse.json(
          { error: 'Escribe un número de WhatsApp válido de 10 dígitos.' },
          { status: 400, headers: PRIVATE_HEADERS },
        );
      }

      const phoneRate = checkRateLimit({
        bucket: 'client-portal-otp-request-phone',
        key: requestedPhone,
        limit: OTP_REQUEST_PER_PHONE_LIMIT,
        windowMs: OTP_RATE_WINDOW_MS,
      });
      if (!phoneRate.allowed) {
        logWarn('client_portal.otp_request_phone_rate_limited', { phone: requestedPhone });
        return rateLimitedResponse(phoneRate.retryAfterSeconds);
      }

      const canSign = Boolean(createClientPortalSessionToken(requestedPhone));
      if (!canSign) {
        logWarn('client_portal.unconfigured_secret', { phone: requestedPhone });
        return NextResponse.json(
          {
            code: 'PORTAL_UNCONFIGURED',
            error: 'El portal de clientas no está configurado en este entorno.',
          },
          { status: 503, headers: PRIVATE_HEADERS },
        );
      }

      const challenge = createClientPortalOtpChallenge(requestedPhone);
      if (!challenge) {
        return NextResponse.json(
          { error: 'Escribe un número de WhatsApp válido de 10 dígitos.' },
          { status: 400, headers: PRIVATE_HEADERS },
        );
      }

      const repo = getRepository();
      const [settings, portalRecord] = await Promise.all([
        repo.getSalonSettings(),
        repo.getClientPortalRecordByPhone(challenge.phoneE164),
      ]);
      const env = getRuntimeIntegrationStatus();
      const matchedClient = portalRecord.client;
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
          triggerKey: 'client_otp',
          templateParameters: [challenge.code],
          authOtpCode: challenge.code,
          withinServiceWindow: false,
          settingsTimezone: settings.timezone,
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

      const response = NextResponse.json(
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
            'Cache-Control': 'private, no-store',
            'X-RateLimit-Remaining': String(rate.remaining),
          },
        },
      );
      if (challenge.challengeToken) {
        response.cookies.set(
          CLIENT_PORTAL_OTP_CHALLENGE_COOKIE,
          challenge.challengeToken,
          getClientPortalOtpChallengeCookieOptions(),
        );
      }
      return response;
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

    const normalizedVerifyPhone = normalizePhoneE164(parsed.phone);
    if (normalizedVerifyPhone) {
      const phoneVerifyRate = checkRateLimit({
        bucket: 'client-portal-otp-verify-phone',
        key: normalizedVerifyPhone,
        limit: 10,
        windowMs: OTP_RATE_WINDOW_MS,
      });
      if (!phoneVerifyRate.allowed) {
        logWarn('client_portal.otp_verify_phone_rate_limited', {
          phone: normalizedVerifyPhone,
        });
        return rateLimitedResponse(phoneVerifyRate.retryAfterSeconds);
      }
    }

    const challengeCookie = request.cookies.get(CLIENT_PORTAL_OTP_CHALLENGE_COOKIE)?.value;
    const verified = verifyClientPortalOtp(parsed.phone, parsed.code, {
      challengeToken: challengeCookie,
    });
    if (!verified.ok) {
      if (verified.reason === 'unconfigured') {
        return NextResponse.json(
          {
            code: 'PORTAL_UNCONFIGURED',
            error: 'El portal de clientas no está configurado en este entorno.',
          },
          { status: 503, headers: PRIVATE_HEADERS },
        );
      }
      if (verified.reason === 'max_attempts') {
        const res = NextResponse.json(
          {
            code: 'OTP_MAX_ATTEMPTS',
            error: 'Excediste el límite de intentos. Solicita un nuevo código.',
          },
          { status: 429, headers: PRIVATE_HEADERS },
        );
        res.cookies.set(
          CLIENT_PORTAL_OTP_CHALLENGE_COOKIE,
          '',
          getClientPortalOtpChallengeCookieOptions(0),
        );
        return res;
      }
      if (verified.reason === 'expired') {
        const res = NextResponse.json(
          {
            code: 'OTP_EXPIRED',
            error: 'Tu código venció. Solicita uno nuevo para continuar.',
          },
          { status: 400, headers: PRIVATE_HEADERS },
        );
        res.cookies.set(
          CLIENT_PORTAL_OTP_CHALLENGE_COOKIE,
          '',
          getClientPortalOtpChallengeCookieOptions(0),
        );
        return res;
      }
      if (verified.reason === 'invalid_phone') {
        return NextResponse.json(
          { error: 'Escribe un número de WhatsApp válido de 10 dígitos.' },
          { status: 400, headers: PRIVATE_HEADERS },
        );
      }
      return NextResponse.json(
        {
          code: 'OTP_INVALID',
          error: 'Código incorrecto. Revisa los 6 dígitos e intenta de nuevo.',
          attemptsRemaining: verified.attemptsRemaining,
        },
        { status: 401, headers: PRIVATE_HEADERS },
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
        headers: PRIVATE_HEADERS,
      },
    );
    response.cookies.set(
      CLIENT_PORTAL_COOKIE,
      verified.sessionToken,
      getClientPortalCookieOptions(),
    );
    response.cookies.set(
      CLIENT_PORTAL_OTP_CHALLENGE_COOKIE,
      '',
      getClientPortalOtpChallengeCookieOptions(0),
    );
    return response;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos ingresados.' },
        { status: 400, headers: PRIVATE_HEADERS },
      );
    }
    return NextResponse.json(
      { error: 'No se pudo procesar tu solicitud.' },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json(
    { ok: true, authenticated: false },
    {
      status: 200,
      headers: PRIVATE_HEADERS,
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
