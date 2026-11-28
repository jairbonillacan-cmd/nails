import { NextRequest, NextResponse } from 'next/server';
import { buildExecutiveReport, type ReportPeriod } from '@/lib/analytics/reports';
import { requireAdmin } from '@/lib/auth/admin-session';
import { ReportPeriodSchema } from '@/lib/contracts';
import { ADMIN_PRIVATE_HEADERS } from '@/lib/http/admin-headers';
import { isMetricDateKey } from '@/lib/metrics';
import { roleCanAccess } from '@/lib/rbac';
import { getRepository } from '@/lib/repositories/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autenticado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  if (!roleCanAccess(session.user.role, 'reports')) {
    return NextResponse.json(
      { error: 'Permisos insuficientes' },
      { status: 403, headers: ADMIN_PRIVATE_HEADERS },
    );
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
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
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

  const now = new Date();
  const isSpecialist = session.user.role === 'specialist';
  const scopeStaffId = isSpecialist ? session.user.staffMemberId : null;

  if (isSpecialist && !scopeStaffId) {
    const settings = await getRepository().getSalonSettings();
    const tz = settings.timezone || 'America/Mexico_City';
    const emptyReport = buildExecutiveReport({
      bookings: [],
      services: [],
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
        currency: settings.currency,
        timezone: tz,
        generatedAt: now.toISOString(),
        ...emptyReport,
      },
      { headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  const reportData = await getRepository().getExecutiveReportData({
    scopeStaffId: isSpecialist ? scopeStaffId : null,
  });
  const tz = reportData.settings.timezone || 'America/Mexico_City';

  const report = buildExecutiveReport({
    bookings: reportData.bookings,
    services: reportData.services,
    staff: reportData.staff,
    schedules: reportData.schedules,
    clients: [],
    reviews: reportData.reviews,
    paymentSplits: reportData.paymentSplits,
    cashEntries: reportData.cashEntries,
    funnelEvents: isSpecialist ? [] : reportData.funnelEvents,
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
        ? (reportData.staff[0]?.name ?? session.user.fullName)
        : null,
      currency: reportData.settings.currency,
      timezone: tz,
      generatedAt: now.toISOString(),
      ...report,
    },
    { headers: ADMIN_PRIVATE_HEADERS },
  );
}
