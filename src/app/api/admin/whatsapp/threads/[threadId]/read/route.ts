import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import { ADMIN_PRIVATE_HEADERS } from '@/lib/http/admin-headers';
import { getRepository } from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

const PRIVATE_NO_STORE = ADMIN_PRIVATE_HEADERS;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ threadId: string }> },
) {
  const session = await requireAdmin(['owner', 'admin'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'No tienes permisos para actualizar conversaciones de WhatsApp.'
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

  const repo = getRepository();
  const updated = await repo.markWhatsAppThreadRead(cleanThreadId);
  if (!updated) {
    return NextResponse.json(
      { error: 'Conversación no encontrada.' },
      { status: 404, headers: PRIVATE_NO_STORE },
    );
  }

  const summary = await repo.getWhatsAppUnreadSummary({
    role: session.user.role,
    staffMemberId: session.user.staffMemberId,
  });

  return NextResponse.json(
    {
      ok: true,
      thread: updated,
      summary,
    },
    { headers: PRIVATE_NO_STORE },
  );
}
