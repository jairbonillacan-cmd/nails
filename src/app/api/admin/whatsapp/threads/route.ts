import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import {
  WhatsAppThreadsQuerySchema,
  type WhatsAppThreadsListResponseDTO,
} from '@/lib/contracts';
import {
  getRuntimeIntegrationStatus,
  isWhatsAppCoexistenceEnabled,
} from '@/lib/env';
import { getWhatsAppMonthKey } from '@/lib/integrations/whatsapp-templates';
import { getRepository } from '@/lib/repositories/db';
import { isSupabaseEnabled } from '@/lib/repositories/supabase-client';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'No tienes permisos para acceder a la bandeja de WhatsApp.'
          : 'No autorizado',
      },
      { status: authenticated ? 403 : 401, headers: PRIVATE_NO_STORE },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = WhatsAppThreadsQuerySchema.safeParse({
    filter: searchParams.get('filter') ?? undefined,
    q: searchParams.get('q') ?? undefined,
    phone: searchParams.get('phone') ?? undefined,
    clientId: searchParams.get('clientId') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: parsedQuery.error.issues[0]?.message || 'Parámetros de búsqueda inválidos.' },
      { status: 400, headers: PRIVATE_NO_STORE },
    );
  }

  const now = new Date();
  const nowMs = now.getTime();
  const repo = getRepository();
  const env = getRuntimeIntegrationStatus();
  const salonSettings = await repo.getSalonSettings();
  const tz = salonSettings.timezone || 'America/Mexico_City';
  const monthKey = getWhatsAppMonthKey(now, tz);

  const [{ threads, summary }, quota] = await Promise.all([
    repo.listWhatsAppThreads({
      filter: parsedQuery.data.filter,
      q: parsedQuery.data.q,
      phone: parsedQuery.data.phone,
      clientId: parsedQuery.data.clientId,
      limit: parsedQuery.data.limit,
      role: session.user.role,
      staffMemberId: session.user.staffMemberId,
      nowMs,
    }),
    repo.getWhatsAppMonthlyUsage(monthKey),
  ]);

  const payload: WhatsAppThreadsListResponseDTO = {
    threads,
    summary,
    mode: isSupabaseEnabled() ? 'supabase' : 'demo',
    cloudConfigured: env.whatsappCloudConfigured,
    coexistenceEnabled: isWhatsAppCoexistenceEnabled(),
    quota,
    serverNowIso: now.toISOString(),
  };

  return NextResponse.json(payload, { headers: PRIVATE_NO_STORE });
}
