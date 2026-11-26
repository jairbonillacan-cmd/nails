import { NextRequest, NextResponse } from 'next/server';
import { readClientSessionToken } from '@/lib/auth/client-session';
import { PublicAvailabilityQuerySchema } from '@/lib/contracts';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  getRepository,
  PolicyError,
  queryAvailabilityWithExtras,
  quickSearchAvailability,
} from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'public:availability',
    key: getRequestIp(request),
    limit: 120,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        code: 'RATE_LIMITED',
        error: 'Demasiadas consultas de disponibilidad. Espera unos segundos e intenta de nuevo.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rate.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  const rateHeaders = { 'X-RateLimit-Remaining': String(rate.remaining) };

  try {
    const { searchParams } = new URL(request.url);
    const rawMode = searchParams.get('mode') || 'range';

    if (rawMode === 'diagnose') {
      return NextResponse.json(
        { error: 'El modo diagnóstico requiere acceso de administrador.' },
        { status: 403, headers: rateHeaders },
      );
    }

    const rawServiceId = searchParams.get('serviceId')?.trim() || undefined;
    const rawStartDate = searchParams.get('startDate')?.trim() || undefined;
    const rawStaffId = searchParams.get('staffId')?.trim() || null;
    const addonIdsParam = searchParams.get('addonIds') || '';
    const addonIds = addonIdsParam ? addonIdsParam.split(',').filter(Boolean) : [];
    const extraServiceIdsParam = searchParams.get('extraServiceIds') || '';
    const extraServiceIds = Array.from(
      new Set(
        extraServiceIdsParam
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0 && id !== rawServiceId),
      ),
    );
    if (extraServiceIds.length > 8) {
      return NextResponse.json(
        { error: 'Máximo 8 servicios adicionales por reserva.' },
        { status: 400, headers: rateHeaders },
      );
    }

    const rawDaysStr = searchParams.get('days');
    const rawLimitStr = searchParams.get('limit');
    const parsedDaysRaw = rawDaysStr ? Number(rawDaysStr) : undefined;
    const parsedLimitRaw = rawLimitStr ? Number(rawLimitStr) : undefined;
    const clampedDays =
      parsedDaysRaw !== undefined && Number.isFinite(parsedDaysRaw)
        ? Math.min(Math.max(Math.trunc(parsedDaysRaw), 1), 90)
        : undefined;
    const clampedLimit =
      parsedLimitRaw !== undefined && Number.isFinite(parsedLimitRaw)
        ? Math.min(Math.max(Math.trunc(parsedLimitRaw), 1), 30)
        : undefined;

    const queryResult = PublicAvailabilityQuerySchema.safeParse({
      mode: rawMode,
      serviceId: rawServiceId,
      staffId: rawStaffId,
      startDate: rawStartDate,
      days: clampedDays,
      limit: clampedLimit,
      addonIds,
      extraServiceIds,
      manageToken: searchParams.get('manageToken')?.trim() || undefined,
    });
    if (!queryResult.success) {
      const modeIssue = queryResult.error.issues.some((i) => i.path.includes('mode'));
      return NextResponse.json(
        {
          error: modeIssue
            ? 'Modo de consulta inválido'
            : queryResult.error.issues[0]?.message || 'Parámetros de disponibilidad inválidos',
        },
        { status: 400, headers: rateHeaders },
      );
    }

    const query = queryResult.data;
    const repo = getRepository();
    const bootstrap =
      !query.serviceId ||
      ((query.mode === 'range' || query.mode === 'quick_search') && !query.startDate)
        ? await repo.getPublicBootstrap()
        : null;
    const serviceId = query.serviceId || bootstrap?.services[0]?.id;
    const staffId = query.staffId || null;

    if (!serviceId) {
      return NextResponse.json(
        { error: 'serviceId es requerido' },
        { status: 400, headers: rateHeaders },
      );
    }

    if (query.mode === 'quick') {
      return NextResponse.json(
        { slots: await repo.getNextQuickSlots(serviceId, staffId) },
        { headers: rateHeaders },
      );
    }

    const startDate =
      query.startDate ||
      getDateKeyInTimezone(
        new Date(),
        bootstrap?.settings.timezone || 'America/Mexico_City',
      );
    const cookieSessionToken = await readClientSessionToken(request);
    const sessionToken = cookieSessionToken ?? searchParams.get('sessionToken');

    if (query.mode === 'quick_search') {
      const days = Math.min(query.days ?? 14, 45);
      const limit = query.limit ?? 12;
      const quickResult = quickSearchAvailability({
        serviceId,
        extraServiceIds: query.extraServiceIds.filter((id) => id !== serviceId),
        addonIds: query.addonIds,
        staffId,
        startDate,
        days,
        limit,
        sessionToken,
      });
      return NextResponse.json(quickResult, { headers: rateHeaders });
    }

    const days = query.days ?? 35;
    const resolvedBooking = query.manageToken
      ? await repo.getBookingByToken(query.manageToken)
      : null;

    const data = await queryAvailabilityWithExtras({
      serviceId,
      extraServiceIds: query.extraServiceIds.filter((id) => id !== serviceId),
      addonIds: query.addonIds,
      staffId,
      startDate,
      days,
      sessionToken,
      ignoreBookingId: resolvedBooking?.id ?? null,
    });

    return NextResponse.json(data, { headers: rateHeaders });
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400, headers: rateHeaders },
      );
    }
    return NextResponse.json(
      { error: 'Error calculando disponibilidad' },
      { status: 500, headers: rateHeaders },
    );
  }
}
