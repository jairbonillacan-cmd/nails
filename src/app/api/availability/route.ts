import { NextRequest, NextResponse } from 'next/server';
import { readClientSessionToken } from '@/lib/auth/client-session';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  getRepository,
  PolicyError,
  queryAvailabilityWithExtras,
} from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'range';

    if (mode === 'diagnose') {
      return NextResponse.json(
        { error: 'El modo diagnóstico requiere acceso de administrador.' },
        { status: 403 },
      );
    }

    if (mode !== 'range' && mode !== 'quick') {
      return NextResponse.json({ error: 'Modo de consulta inválido' }, { status: 400 });
    }

    const repo = getRepository();
    const rawServiceId = searchParams.get('serviceId')?.trim();
    const rawStartDate = searchParams.get('startDate')?.trim();
    const bootstrap =
      !rawServiceId || (mode === 'range' && !rawStartDate)
        ? await repo.getPublicBootstrap()
        : null;
    const serviceId = rawServiceId || bootstrap?.services[0]?.id;
    const staffId = searchParams.get('staffId') || null;

    if (!serviceId) {
      return NextResponse.json({ error: 'serviceId es requerido' }, { status: 400 });
    }

    if (mode === 'quick') {
      return NextResponse.json({
        slots: await repo.getNextQuickSlots(serviceId, staffId),
      });
    }

    const addonIdsParam = searchParams.get('addonIds') || '';
    const addonIds = addonIdsParam ? addonIdsParam.split(',').filter(Boolean) : [];
    const extraServiceIdsParam = searchParams.get('extraServiceIds') || '';
    const extraServiceIds = Array.from(
      new Set(
        extraServiceIdsParam
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0 && id !== serviceId),
      ),
    );
    if (extraServiceIds.length > 8) {
      return NextResponse.json(
        { error: 'Máximo 8 servicios adicionales por reserva.' },
        { status: 400 },
      );
    }

    const startDate =
      rawStartDate ||
      getDateKeyInTimezone(
        new Date(),
        bootstrap?.settings.timezone || 'America/Mexico_City',
      );
    const days = Number(searchParams.get('days') || '35');
    const cookieSessionToken = await readClientSessionToken(request);
    const sessionToken = cookieSessionToken ?? searchParams.get('sessionToken');
    const manageToken = searchParams.get('manageToken')?.trim();
    const resolvedBooking = manageToken
      ? await repo.getBookingByToken(manageToken)
      : null;

    const data = await queryAvailabilityWithExtras({
      serviceId,
      extraServiceIds,
      addonIds,
      staffId,
      startDate,
      days,
      sessionToken,
      ignoreBookingId: resolvedBooking?.id ?? null,
    });

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Error calculando disponibilidad' },
      { status: 500 },
    );
  }
}
