import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import { executeWhatsAppBookingFlow } from '@/lib/integrations/whatsapp-booking';
import { getRepository } from '@/lib/repositories/db';

const simulateSchema = z.object({
  clientName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(8).max(32).optional(),
  serviceId: z.string().min(1).optional(),
  addonIds: z.array(z.string().min(1)).optional(),
  staffId: z.string().min(1).nullable().optional(),
  startAt: z.string().min(1).optional(),
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
      { status: authenticated ? 403 : 401 },
    );
  }

  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'El simulador de WhatsApp está deshabilitado en producción.' },
      { status: 403 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }

  const parsed = simulateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Datos inválidos' },
      { status: 400 },
    );
  }

  const db = await getRepository().getSnapshot();
  const serviceId = parsed.data.serviceId ?? db.services.find((s) => s.isActive)?.id;
  if (!serviceId) {
    return NextResponse.json(
      { error: 'No hay servicios activos para simular.' },
      { status: 400 },
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

  return NextResponse.json(result, { status: result.ok ? 201 : 409 });
}
