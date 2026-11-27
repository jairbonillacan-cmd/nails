import { NextRequest, NextResponse } from 'next/server';
import { buildExecutiveReport, type ReportPeriod } from '@/lib/analytics/reports';
import { requireAdmin } from '@/lib/auth/admin-session';
import { ReportPeriodSchema } from '@/lib/contracts';
import { isMetricDateKey } from '@/lib/metrics';
import { roleCanAccess } from '@/lib/rbac';
import { getRepository } from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  if (!roleCanAccess(session.user.role, 'reports')) {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  }

  const url = new URL(request.url);
  const rawPeriod = url.searchParams.get('period')?.trim() || '30d';
  const parsedPeriod = ReportPeriodSchema.safeParse(rawPeriod);
  if (!parsedPeriod.success) {
    return NextResponse.json(
      {
        error:
          'Período inválido. Usa today, 7d, 30d, 90d, month, last_month, custom o all.',
      },
      { status: 400 },
    );
  }

  const period: ReportPeriod = parsedPeriod.data;
  const fromParam = url.searchParams.get('from')?.trim() || '';
  const toParam = url.searchParams.get('to')?.trim() || '';
  const customRange =
    period === 'custom'
      ? {
          fromKey: isMetricDateKey(fromParam) ? fromParam : '',
          toKey: isMetricDateKey(toParam) ? toParam : '',
        }
      : null;

  const db = await getRepository().getSnapshot();
  const now = new Date();
  const tz = db.settings.timezone || 'America/Mexico_City';
  const isSpecialist = session.user.role === 'specialist';
  const scopeStaffId = isSpecialist ? session.user.staffMemberId : null;

  if (isSpecialist && !scopeStaffId) {
    const emptyReport = buildExecutiveReport({
      bookings: [],
      services: db.services,
      staff: [],
      schedules: [],
      clients: [],
      reviews: [],
      paymentSplits: [],
      cashEntries: [],
      period,
      customRange,
      nowMs: now.getTime(),
      timezone: tz,
      scopeStaffId: '__unassigned__',
    });

    return NextResponse.json(
      {
        scope: 'specialist' as const,
        scopeStaffId: null,
        scopeStaffName: session.user.fullName,
        currency: db.settings.currency,
        timezone: tz,
        generatedAt: now.toISOString(),
        ...emptyReport,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const scopedBookings = isSpecialist
    ? db.bookings.filter((b) => b.staffId === scopeStaffId)
    : db.bookings;
  const scopedBookingIds = new Set(scopedBookings.map((b) => b.id));
  const scopedClientIds = new Set(scopedBookings.map((b) => b.clientId));
  const scopedStaff = isSpecialist
    ? db.staff.filter((s) => s.id === scopeStaffId)
    : db.staff;
  const scopedSchedules = isSpecialist
    ? db.schedules.filter((sc) => sc.staffId === scopeStaffId)
    : db.schedules;
  const scopedClients = isSpecialist
    ? db.clients.filter((c) => scopedClientIds.has(c.id))
    : db.clients;
  const scopedReviews = isSpecialist
    ? db.reviews.filter(
        (r) =>
          r.staffId === scopeStaffId ||
          (r.staffId === null && scopedBookingIds.has(r.bookingId)),
      )
    : db.reviews;
  const allPaymentSplits = db.paymentSplits ?? [];
  const scopedPaymentSplits = isSpecialist
    ? allPaymentSplits.filter((ps) => scopedBookingIds.has(ps.bookingId))
    : allPaymentSplits;
  const allCashEntries = db.cashEntries ?? [];
  const scopedCashEntries = isSpecialist
    ? allCashEntries.filter(
        (entry) =>
          entry.staffId === scopeStaffId ||
          (entry.bookingId !== null && scopedBookingIds.has(entry.bookingId)),
      )
    : allCashEntries;

  const report = buildExecutiveReport({
    bookings: scopedBookings,
    services: db.services,
    staff: scopedStaff,
    schedules: scopedSchedules,
    clients: scopedClients,
    reviews: scopedReviews,
    paymentSplits: scopedPaymentSplits,
    cashEntries: scopedCashEntries,
    funnelEvents: isSpecialist ? [] : (db.funnelEvents ?? []),
    period,
    customRange,
    nowMs: now.getTime(),
    timezone: tz,
    scopeStaffId: isSpecialist ? scopeStaffId : null,
  });

  return NextResponse.json(
    {
      scope: isSpecialist ? ('specialist' as const) : ('studio' as const),
      scopeStaffId: isSpecialist ? scopeStaffId : null,
      scopeStaffName: isSpecialist
        ? (scopedStaff[0]?.name ?? session.user.fullName)
        : null,
      currency: db.settings.currency,
      timezone: tz,
      generatedAt: now.toISOString(),
      ...report,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
