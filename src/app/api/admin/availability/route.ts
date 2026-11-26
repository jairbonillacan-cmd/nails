import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import { diagnoseDateSlots } from '@/lib/availability/engine';
import {
  PostOverrideRangeSchema,
  PostOverrideSchema,
  PostRecurringBlockSchema,
  PreloadHolidaysSchema,
  PutScheduleSchema,
  ToggleRecurringBlockSchema,
} from '@/lib/contracts';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  addDateOverride,
  addDateOverrideRange,
  deleteDateOverride,
  deleteRecurringBlock,
  getRepository,
  PolicyError,
  preloadMexicoHolidays,
  saveStaffSchedule,
  toggleRecurringBlock,
  upsertRecurringBlock,
} from '@/lib/repositories/db';
import type { AvailabilityRule } from '@/lib/types';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');
  const db = await getRepository().getSnapshot();
  const requestedStaffId = searchParams.get('staffId')?.trim() || '';

  const allBlocks = db.recurringBlocks ?? [];
  const scopedBlocks =
    session.user.role === 'specialist'
      ? session.user.staffMemberId
        ? allBlocks.filter((b) => b.staffId === session.user.staffMemberId)
        : []
      : requestedStaffId
        ? allBlocks.filter((b) => b.staffId === requestedStaffId)
        : allBlocks;

  if (!mode || mode === 'blocks') {
    return NextResponse.json({ recurringBlocks: scopedBlocks });
  }

  if (mode !== 'diagnose') {
    return NextResponse.json({ error: 'Modo no soportado' }, { status: 400 });
  }

  const date =
    searchParams.get('date')?.trim() ||
    getDateKeyInTimezone(new Date(), db.settings.timezone);
  const serviceId = searchParams.get('serviceId')?.trim() || db.services[0]?.id;

  let targetStaffId: string;
  if (session.user.role === 'specialist') {
    if (!session.user.staffMemberId) {
      return NextResponse.json(
        { error: 'Tu usuario no tiene especialista vinculada.' },
        { status: 403 },
      );
    }
    if (requestedStaffId && requestedStaffId !== session.user.staffMemberId) {
      return NextResponse.json(
        { error: 'Solo puedes diagnosticar tu propia disponibilidad.' },
        { status: 403 },
      );
    }
    targetStaffId = session.user.staffMemberId;
  } else {
    targetStaffId = requestedStaffId || db.staff[0]?.id || '';
  }

  const service = db.services.find((s) => s.id === serviceId);
  if (!targetStaffId || !service) {
    return NextResponse.json({
      date,
      diagnosis: [],
      diagnostics: [],
      recurringBlocks: scopedBlocks,
    });
  }

  const addonIdsParam = searchParams.get('addonIds') || '';
  const addonIds = addonIdsParam ? addonIdsParam.split(',').filter(Boolean) : [];
  const addons = db.addons.filter((a) => addonIds.includes(a.id) && a.isActive);

  const extraServiceIdsParam = searchParams.get('extraServiceIds') || '';
  const extraServiceIds = Array.from(
    new Set(
      extraServiceIdsParam
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0 && id !== service.id),
    ),
  );
  const extraServices = db.services.filter(
    (s) => extraServiceIds.includes(s.id) && s.isActive,
  );

  const diagnosis = diagnoseDateSlots(
    {
      settings: db.settings,
      service,
      extraServices,
      addons,
      staffMembers: db.staff,
      schedules: db.schedules,
      dateOverrides: db.dateOverrides,
      recurringBlocks: db.recurringBlocks ?? [],
      bookings: db.bookings,
      slotHolds: db.slotHolds,
      calendarConnections: db.calendarConnections,
    },
    date,
    targetStaffId,
  );

  return NextResponse.json({
    date,
    diagnosis,
    diagnostics: diagnosis,
    recurringBlocks: scopedBlocks,
  });
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const parsed = PutScheduleSchema.parse(await request.json());
    if (
      session.user.role === 'specialist' &&
      (!session.user.staffMemberId || parsed.staffId !== session.user.staffMemberId)
    ) {
      return NextResponse.json(
        { error: 'Solo puedes modificar tu propia disponibilidad.' },
        { status: 403 },
      );
    }

    const normalizedRules: AvailabilityRule[] = parsed.rules.map((rule) => ({
      id: rule.id,
      dayOfWeek: rule.dayOfWeek,
      startTime: rule.startTime,
      endTime: rule.endTime,
      ...(rule.fixedStartTimes && rule.fixedStartTimes.length > 0
        ? {
            fixedStartTimes: Array.from(new Set(rule.fixedStartTimes)).toSorted(),
          }
        : {}),
    }));

    await saveStaffSchedule(parsed.staffId, normalizedRules);
    return NextResponse.json({ ok: true, rules: normalizedRules });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Reglas de horario inválidas.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'No se pudo guardar el horario.' }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const raw = (await request.json()) as unknown;
    const rawKind =
      typeof raw === 'object' && raw !== null && 'kind' in raw
        ? (raw as { kind?: unknown }).kind
        : undefined;

    if (rawKind === 'recurring_block') {
      const parsed = PostRecurringBlockSchema.parse(raw);
      if (session.user.role === 'specialist') {
        if (!session.user.staffMemberId || parsed.staffId !== session.user.staffMemberId) {
          return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
        }
        if (parsed.id) {
          const snapshot = await getRepository().getSnapshot();
          const existing = (snapshot.recurringBlocks ?? []).find(
            (b) => b.id === parsed.id,
          );
          if (!existing || existing.staffId !== session.user.staffMemberId) {
            return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
          }
        }
      }
      const block = await upsertRecurringBlock({
        id: parsed.id,
        staffId: parsed.staffId,
        reason: parsed.reason,
        frequency: parsed.frequency,
        weekdays: Array.from(new Set(parsed.weekdays)).toSorted((a, b) => a - b),
        dayOfMonth: parsed.dayOfMonth,
        startTime: parsed.startTime,
        endTime: parsed.endTime,
        untilDate: parsed.untilDate,
        isActive: parsed.isActive,
      });
      return NextResponse.json({ block }, { status: 201 });
    }

    if (rawKind === 'recurring_block_toggle') {
      const parsed = ToggleRecurringBlockSchema.parse(raw);
      if (session.user.role === 'specialist') {
        const snapshot = await getRepository().getSnapshot();
        const target = (snapshot.recurringBlocks ?? []).find((b) => b.id === parsed.id);
        if (
          !session.user.staffMemberId ||
          !target ||
          target.staffId !== session.user.staffMemberId
        ) {
          return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
        }
      }
      const block = await toggleRecurringBlock(parsed.id, parsed.isActive);
      return NextResponse.json({ block });
    }

    if (rawKind === 'override_range') {
      const parsed = PostOverrideRangeSchema.parse(raw);
      if (
        session.user.role === 'specialist' &&
        (!session.user.staffMemberId || parsed.staffId !== session.user.staffMemberId)
      ) {
        return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
      }
      const isClosed = parsed.isClosed ?? parsed.isUnavailable ?? true;
      const overrides = await addDateOverrideRange({
        staffId: parsed.staffId,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        isUnavailable: isClosed,
        startTime: isClosed ? null : parsed.startTime,
        endTime: isClosed ? null : parsed.endTime,
        reason: parsed.reason,
        publicNote: parsed.publicNote,
        redirectStaffId: parsed.redirectStaffId ?? null,
      });
      return NextResponse.json({ overrides }, { status: 201 });
    }

    if (rawKind === 'preload_mx_holidays') {
      const parsed = PreloadHolidaysSchema.parse(raw);
      if (
        session.user.role === 'specialist' &&
        (!session.user.staffMemberId || parsed.staffId !== session.user.staffMemberId)
      ) {
        return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
      }
      const result = await preloadMexicoHolidays({
        year: parsed.year,
        staffId: parsed.staffId,
        publicNote: parsed.publicNote,
        redirectStaffId: parsed.redirectStaffId ?? null,
      });
      return NextResponse.json(result, { status: 201 });
    }

    const body = PostOverrideSchema.parse(raw);
    if (
      session.user.role === 'specialist' &&
      (!session.user.staffMemberId || body.staffId !== session.user.staffMemberId)
    ) {
      return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
    }
    const override = await addDateOverride({
      staffId: body.staffId,
      overrideDate: body.overrideDate,
      isUnavailable: body.isUnavailable,
      startTime: body.startTime,
      endTime: body.endTime,
      reason: body.reason,
      ...(body.publicNote !== undefined ? { publicNote: body.publicNote } : {}),
      ...(body.redirectStaffId !== undefined
        ? { redirectStaffId: body.redirectStaffId }
        : {}),
    });
    return NextResponse.json({ override });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status = err.code === 'BLOCK_NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos de bloqueo inválidos.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'No se pudo guardar el bloqueo.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const blockId = searchParams.get('blockId')?.trim();
  if (blockId) {
    if (session.user.role === 'specialist') {
      const snapshot = await getRepository().getSnapshot();
      const target = (snapshot.recurringBlocks ?? []).find((b) => b.id === blockId);
      if (
        !session.user.staffMemberId ||
        !target ||
        target.staffId !== session.user.staffMemberId
      ) {
        return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
      }
    }
    await deleteRecurringBlock(blockId);
    return NextResponse.json({ ok: true });
  }

  const id = searchParams.get('id');
  if (id) {
    if (session.user.role === 'specialist') {
      const snapshot = await getRepository().getSnapshot();
      const target = snapshot.dateOverrides.find((o) => o.id === id);
      if (
        !session.user.staffMemberId ||
        !target ||
        target.staffId !== session.user.staffMemberId
      ) {
        return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
      }
    }
    await deleteDateOverride(id);
  }
  return NextResponse.json({ ok: true });
}
