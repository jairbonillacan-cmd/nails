import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import { DispatchCampaignSchema } from '@/lib/contracts';
import {
  buildBirthdayWhatsAppMessage,
  buildReactivationWhatsAppMessage,
  findInactiveReactivationClients,
  findUpcomingBirthdayClients,
} from '@/lib/campaigns/retention';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { buildWhatsAppLink, getDateKeyInTimezone } from '@/lib/format';
import {
  ADMIN_PRIVATE_HEADERS,
  withAdminPrivateHeaders,
} from '@/lib/http/admin-headers';
import { logError } from '@/lib/logger';
import {
  getRepository,
  listCampaignDispatches,
  logCampaignDispatch,
} from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

function parseBoundedInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Permisos insuficientes para campañas de retención.' },
      { status: 403, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  const [audience, recentDispatches] = await Promise.all([
    getRepository().getCampaignAudienceData(),
    listCampaignDispatches(50),
  ]);
  const env = getRuntimeIntegrationStatus();
  const { searchParams } = new URL(request.url);
  const birthdayWindowDays = parseBoundedInt(
    searchParams.get('birthdayWindowDays'),
    7,
    1,
    60,
  );
  const inactiveDays = parseBoundedInt(
    searchParams.get('inactiveDays'),
    45,
    14,
    365,
  );

  const now = new Date();
  const tz = audience.settings.timezone || 'America/Mexico_City';
  const todayKey = getDateKeyInTimezone(now, tz);
  const bookingUrl = `${env.appUrl}/reservar`;
  const serviceNameById = new Map(audience.services.map((s) => [s.id, s.name]));

  const birthdays = findUpcomingBirthdayClients(
    audience.clients,
    todayKey,
    birthdayWindowDays,
    {
      salonName: audience.settings.name,
      bookingUrl,
    },
  );

  const reactivation = findInactiveReactivationClients(
    audience.clients,
    audience.bookings,
    now.getTime(),
    inactiveDays,
    {
      salonName: audience.settings.name,
      bookingUrl,
      serviceNameById,
    },
  );

  return NextResponse.json(
    {
      todayKey,
      birthdayWindowDays,
      inactiveDays,
      birthdays,
      reactivation,
      recentDispatches,
    },
    { headers: ADMIN_PRIVATE_HEADERS },
  );
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Permisos insuficientes para enviar campañas.' },
      { status: 403, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  const rate = checkRateLimit({
    bucket: 'admin:campaigns-dispatch',
    key: `${session.user.id}:${getRequestIp(request)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        code: 'RATE_LIMITED',
        error: 'Demasiados envíos de campañas. Espera unos segundos e intenta de nuevo.',
      },
      {
        status: 429,
        headers: withAdminPrivateHeaders({
          'Retry-After': String(rate.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        }),
      },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud JSON inválida.' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  try {
    const parsed = DispatchCampaignSchema.parse(rawBody);
    const repo = getRepository();
    const [client, settings] = await Promise.all([
      repo.getClientById(parsed.clientId),
      repo.getSalonSettings(),
    ]);
    if (!client) {
      return NextResponse.json(
        { error: 'Clienta no encontrada.' },
        { status: 404, headers: ADMIN_PRIVATE_HEADERS },
      );
    }

    const env = getRuntimeIntegrationStatus();
    const bookingUrl = `${env.appUrl}/reservar`;
    const defaultMessage =
      parsed.kind === 'birthday'
        ? buildBirthdayWhatsAppMessage({
            clientName: client.fullName,
            salonName: settings.name,
            bookingUrl,
            daysUntilBirthday: 0,
          })
        : buildReactivationWhatsAppMessage({
            clientName: client.fullName,
            salonName: settings.name,
            bookingUrl,
            daysSinceLastVisit: 45,
          });
    const messagePreview = parsed.messagePreview || defaultMessage;
    const whatsappUrl = buildWhatsAppLink(client.phoneE164, messagePreview);

    const dispatch = await logCampaignDispatch({
      kind: parsed.kind,
      clientId: client.id,
      clientName: client.fullName,
      phoneE164: client.phoneE164,
      channel: 'whatsapp',
      messagePreview,
      dispatchedBy: session.user.fullName,
    });

    return NextResponse.json(
      { dispatch, whatsappUrl },
      { status: 201, headers: ADMIN_PRIVATE_HEADERS },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos inválidos para campaña.' },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    logError('admin_campaigns_post_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'No se pudo registrar el envío.' },
      { status: 500, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
}
