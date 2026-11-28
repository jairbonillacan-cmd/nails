import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import { ADMIN_PRIVATE_HEADERS } from '@/lib/http/admin-headers';
import { executeWhatsAppBookingFlow } from '@/lib/integrations/whatsapp-booking';
import { getRepository } from '@/lib/repositories/db';

const simulateSchema = z.object({
  clientName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(8).max(32).optional(),
  serviceId: z.string().trim().min(1).max(128).optional(),
  addonIds: z.array(z.string().trim().min(1).max(128)).max(30).optional(),
  staffId: z.string().trim().min(1).max(128).nullable().optional(),
  startAt: z.string().trim().min(1).max(64).optional(),
});

export async function POST(request: NextRequest) {
  const session = await requireAdmin(['owner'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      {
        error: authenticated
          ? 'Solo la dueña puede ejecutar el simulador de WhatsApp.'
          : 'No autorizado',
      },
      { status: authenticated ? 403 : 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'El simulador de WhatsApp está deshabilitado en producción.' },
      { status: 403, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud inválida' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  const parsed = simulateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Datos inválidos' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  let serviceId = parsed.data.serviceId;
  if (!serviceId) {
    const activeServices = await getRepository().listActiveServices(1);
    serviceId = activeServices[0]?.id;
  }
  if (!serviceId) {
    return NextResponse.json(
      { error: 'No hay servicios activos para simular.' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  const result = await executeWhatsAppBookingFlow({
    phone: parsed.data.phone ?? '+525599887766',
    clientName: parsed.data.clientName ?? 'Clienta WhatsApp',
    serviceId,
    addonIds: parsed.data.addonIds ?? [],
    staffId: parsed.data.staffId ?? null,
    startAt: parsed.data.startAt,
  });

  return NextResponse.json(result, {
    status: result.ok ? 201 : 409,
    headers: ADMIN_PRIVATE_HEADERS,
  });
}
