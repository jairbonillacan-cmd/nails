import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import type { WhatsAppThreadDetailResponseDTO } from '@/lib/contracts';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import { buildWhatsAppLink } from '@/lib/format';
import { getWhatsAppMonthKey } from '@/lib/integrations/whatsapp-templates';
import {
  buildWhatsAppQuickReplies,
  WHATSAPP_TEMPLATE_CATALOG,
} from '@/lib/notifications/whatsapp-inbox';
import { ADMIN_PRIVATE_HEADERS } from '@/lib/http/admin-headers';
import { getRepository } from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = ADMIN_PRIVATE_HEADERS;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ threadId: string }> },
) {
  const session = await requireAdmin(['owner', 'admin'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'No tienes permisos para ver conversaciones de WhatsApp.'
          : 'No autorizado',
      },
      { status: authenticated ? 403 : 401, headers: PRIVATE_NO_STORE },
    );
  }

  const { threadId } = await context.params;
  const cleanThreadId = threadId?.trim();
  if (!cleanThreadId || cleanThreadId.length > 128) {
    return NextResponse.json(
      { error: 'Conversación inválida.' },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const now = new Date();
  const nowMs = now.getTime();
  const repo = getRepository();
  const env = getRuntimeIntegrationStatus();
  const rawLimit = Number(new URL(request.url).searchParams.get('limit') ?? '200');
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(500, Math.floor(rawLimit)))
    : 200;

  const detail = await repo.getWhatsAppThreadDetail({
    threadId: cleanThreadId,
    role: session.user.role,
    staffMemberId: session.user.staffMemberId,
    limit,
    nowMs,
  });

  if (!detail) {
    return NextResponse.json(
      { error: 'Conversación no encontrada.' },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }

  const salonSettings = await repo.getSalonSettings();
  const tz = salonSettings.timezone || 'America/Mexico_City';
  const monthKey = getWhatsAppMonthKey(now, tz);

  const [templates, quota] = await Promise.all([
    repo.getWhatsAppTemplates(),
    repo.getWhatsAppMonthlyUsage(monthKey),
  ]);

  const quickReplies = buildWhatsAppQuickReplies({
    clientName: detail.client?.fullName ?? detail.thread.contactName,
    salonName: salonSettings.name,
    address: salonSettings.address,
    timezone: tz,
    nextBooking: detail.thread.nextBooking,
    appUrl: env.appUrl,
  });

  const payload: WhatsAppThreadDetailResponseDTO = {
    thread: detail.thread,
    messages: detail.messages,
    client: detail.client
      ? {
          id: detail.client.id,
          fullName: detail.client.fullName,
          phoneE164: detail.client.phoneE164,
          email: detail.client.email,
          instagramHandle: detail.client.instagramHandle ?? null,
          notes: detail.client.notes,
          noShowCount: detail.client.noShowCount,
        }
      : null,
    bookings: detail.bookings,
    templates,
    templateCatalog: WHATSAPP_TEMPLATE_CATALOG,
    quickReplies,
    quota,
    waMeUrl: buildWhatsAppLink(detail.thread.phoneE164, ''),
    serverNowIso: now.toISOString(),
  };

  return NextResponse.json(payload, { headers: PRIVATE_NO_STORE });
}
