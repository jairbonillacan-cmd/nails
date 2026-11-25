import { NextRequest, NextResponse } from 'next/server';
import { getDateKeyInTimezone } from '@/lib/format';
import { diagnoseDateSlots } from '@/lib/availability/engine';
import {
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

    if (!serviceId) {
      return NextResponse.json({ error: 'serviceId es requerido' }, { status: 400 });
    }

    if (mode === 'quick') {
      return NextResponse.json({ slots: getNextQuickSlots(serviceId, staffId) });
    }

    if (mode === 'diagnose') {
      const date =
        searchParams.get('date') ||
        getDateKeyInTimezone(new Date(), db.settings.timezone);
      const targetStaffId = staffId || db.staff[0]?.id;
      const service = db.services.find((s) => s.id === serviceId) ?? db.services[0];
      if (!targetStaffId || !service) {
        return NextResponse.json({ diagnostics: [] });
      }
      const diagnostics = diagnoseDateSlots(
        {
          settings: db.settings,
          service,
          addons: [],
          staffMembers: db.staff,
          schedules: db.schedules,
          dateOverrides: db.dateOverrides,
          bookings: db.bookings,
          slotHolds: db.slotHolds,
          calendarConnections: db.calendarConnections,
        },
        date,
        targetStaffId,
      );
      return NextResponse.json({ diagnostics });
    }

    const addonIdsParam = searchParams.get('addonIds') || '';
    const addonIds = addonIdsParam ? addonIdsParam.split(',').filter(Boolean) : [];
    const startDate =
      searchParams.get('startDate') ||
      getDateKeyInTimezone(new Date(), db.settings.timezone);
    const days = Number(searchParams.get('days') || '35');
    const sessionToken = searchParams.get('sessionToken');
    const ignoreBookingId = searchParams.get('ignoreBookingId');

    const data = queryAvailability({
      serviceId,
      addonIds,
      staffId,
      startDate,
      days,
      sessionToken,
      ignoreBookingId,
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
