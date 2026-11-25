import { NextRequest, NextResponse } from 'next/server';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  getBookingByToken,
  getNextQuickSlots,
  getSnapshot,
  PolicyError,
  queryAvailability,
} from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const db = getSnapshot();
    const serviceId = searchParams.get('serviceId') || db.services[0]?.id;
    const staffId = searchParams.get('staffId') || null;
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

    if (!serviceId) {
      return NextResponse.json({ error: 'serviceId es requerido' }, { status: 400 });
    }

    if (mode === 'quick') {
      return NextResponse.json({ slots: getNextQuickSlots(serviceId, staffId) });
    }

    const addonIdsParam = searchParams.get('addonIds') || '';
    const addonIds = addonIdsParam ? addonIdsParam.split(',').filter(Boolean) : [];
    const startDate =
      searchParams.get('startDate') ||
      getDateKeyInTimezone(new Date(), db.settings.timezone);
    const days = Number(searchParams.get('days') || '35');
    const sessionToken = searchParams.get('sessionToken');
    const manageToken = searchParams.get('manageToken')?.trim();
    const resolvedBooking = manageToken ? getBookingByToken(manageToken) : null;

    const data = queryAvailability({
      serviceId,
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
