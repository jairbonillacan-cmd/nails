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
  getSnapshot,
  listCampaignDispatches,
  logCampaignDispatch,
} from '@/lib/repositories/db';

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
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Permisos insuficientes para campañas de retención.' },
      { status: 403 },
    );
  }

  const db = getSnapshot();
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
  const tz = db.settings.timezone || 'America/Mexico_City';
  const todayKey = getDateKeyInTimezone(now, tz);
  const bookingUrl = `${env.appUrl}/reservar`;
  const serviceNameById = new Map(db.services.map((s) => [s.id, s.name]));

  const birthdays = findUpcomingBirthdayClients(
    db.clients,
    todayKey,
    birthdayWindowDays,
    {
      salonName: db.settings.name,
      bookingUrl,
    },
  );

  const reactivation = findInactiveReactivationClients(
    db.clients,
    db.bookings,
    now.getTime(),
    inactiveDays,
    {
      salonName: db.settings.name,
      bookingUrl,
      serviceNameById,
    },
  );

  return NextResponse.json({
    todayKey,
    birthdayWindowDays,
    inactiveDays,
    birthdays,
    reactivation,
    recentDispatches: listCampaignDispatches(50),
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Permisos insuficientes para enviar campañas.' },
      { status: 403 },
    );
  }

  try {
    const parsed = DispatchCampaignSchema.parse(await request.json());
    const db = getSnapshot();
    const client = db.clients.find((c) => c.id === parsed.clientId);
    if (!client) {
      return NextResponse.json({ error: 'Clienta no encontrada.' }, { status: 404 });
    }

    const env = getRuntimeIntegrationStatus();
    const bookingUrl = `${env.appUrl}/reservar`;
    const defaultMessage =
      parsed.kind === 'birthday'
        ? buildBirthdayWhatsAppMessage({
            clientName: client.fullName,
            salonName: db.settings.name,
            bookingUrl,
            daysUntilBirthday: 0,
          })
        : buildReactivationWhatsAppMessage({
            clientName: client.fullName,
            salonName: db.settings.name,
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

    return NextResponse.json({ dispatch, whatsappUrl }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos inválidos para campaña.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'No se pudo registrar el envío.' }, { status: 500 });
  }
}
