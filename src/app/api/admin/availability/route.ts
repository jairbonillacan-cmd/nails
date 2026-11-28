import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  PostOverrideRangeSchema,
  PostOverrideSchema,
  PostRecurringBlockSchema,
  PreloadHolidaysSchema,
  PutScheduleSchema,
  ToggleRecurringBlockSchema,
} from '@/lib/contracts';
import { ADMIN_PRIVATE_HEADERS } from '@/lib/http/admin-headers';
import { logError } from '@/lib/logger';
import {
  addDateOverride,
  addDateOverrideRange,
  deleteDateOverride,
  deleteRecurringBlock,
  getDateOverrideStaffOwnerAsync,
  getRecurringBlockStaffOwnerAsync,
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
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');
  const requestedStaffId = searchParams.get('staffId')?.trim() || '';
  const repo = getRepository();

  if (!mode || mode === 'blocks') {
    if (session.user.role === 'specialist' && !session.user.staffMemberId) {
      return NextResponse.json(
        { recurringBlocks: [] },
        { headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    const blockStaffId =
      session.user.role === 'specialist'
        ? session.user.staffMemberId
        : requestedStaffId || null;
    const recurringBlocks = await repo.listRecurringBlocks(blockStaffId);
    return NextResponse.json({ recurringBlocks }, { headers: ADMIN_PRIVATE_HEADERS });
  }

  if (mode !== 'diagnose') {
    return NextResponse.json(
      { error: 'Modo no soportado' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  if (session.user.role === 'specialist') {
    if (!session.user.staffMemberId) {
      return NextResponse.json(
        { error: 'Tu usuario no tiene profesional vinculada.' },
        { status: 403, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    if (requestedStaffId && requestedStaffId !== session.user.staffMemberId) {
      return NextResponse.json(
        { error: 'Solo puedes diagnosticar tu propia disponibilidad.' },
        { status: 403, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
  }

  const addonIdsParam = searchParams.get('addonIds') || '';
  const addonIds = addonIdsParam ? addonIdsParam.split(',').filter(Boolean) : [];
  const extraServiceIdsParam = searchParams.get('extraServiceIds') || '';
  const extraServiceIds = extraServiceIdsParam
    ? extraServiceIdsParam
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : [];

  const result = await repo.diagnoseAvailability({
    date: searchParams.get('date')?.trim() || undefined,
    serviceId: searchParams.get('serviceId')?.trim() || undefined,
    staffId: requestedStaffId || null,
    addonIds,
    extraServiceIds,
    role: session.user.role,
    staffMemberId: session.user.staffMemberId,
  });

  return NextResponse.json(
    {
      date: result.date,
      diagnosis: result.diagnosis,
      diagnostics: result.diagnosis,
      recurringBlocks: result.recurringBlocks,
    },
    { headers: ADMIN_PRIVATE_HEADERS },
  );
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud JSON inválida.' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  try {
    const parsed = PutScheduleSchema.parse(rawBody);
    if (
      session.user.role === 'specialist' &&
      (!session.user.staffMemberId || parsed.staffId !== session.user.staffMemberId)
    ) {
      return NextResponse.json(
        { error: 'Solo puedes modificar tu propia disponibilidad.' },
        { status: 403, headers: ADMIN_PRIVATE_HEADERS },
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
    return NextResponse.json(
      { ok: true, rules: normalizedRules },
      { headers: ADMIN_PRIVATE_HEADERS },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Reglas de horario inválidas.' },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    logError('admin_availability_put_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'No se pudo guardar el horario.' },
      { status: 500, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud JSON inválida.' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  try {
    const rawKind =
      typeof raw === 'object' && raw !== null && 'kind' in raw
        ? (raw as { kind?: unknown }).kind
        : undefined;

    if (rawKind === 'recurring_block') {
      const parsed = PostRecurringBlockSchema.parse(raw);
      if (session.user.role === 'specialist') {
        if (!session.user.staffMemberId || parsed.staffId !== session.user.staffMemberId) {
          return NextResponse.json(
            { error: 'Permisos insuficientes' },
            { status: 403, headers: ADMIN_PRIVATE_HEADERS },
          );
        }
        if (parsed.id) {
          const ownerStaffId = await getRecurringBlockStaffOwnerAsync(parsed.id);
          if (!ownerStaffId || ownerStaffId !== session.user.staffMemberId) {
            return NextResponse.json(
              { error: 'Permisos insuficientes' },
              { status: 403, headers: ADMIN_PRIVATE_HEADERS },
            );
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
      return NextResponse.json(
        { block },
        { status: 201, headers: ADMIN_PRIVATE_HEADERS },
      );
    }

    if (rawKind === 'recurring_block_toggle') {
      const parsed = ToggleRecurringBlockSchema.parse(raw);
      if (session.user.role === 'specialist') {
        const ownerStaffId = await getRecurringBlockStaffOwnerAsync(parsed.id);
        if (
          !session.user.staffMemberId ||
          !ownerStaffId ||
          ownerStaffId !== session.user.staffMemberId
        ) {
          return NextResponse.json(
            { error: 'Permisos insuficientes' },
            { status: 403, headers: ADMIN_PRIVATE_HEADERS },
          );
        }
      }
      const block = await toggleRecurringBlock(parsed.id, parsed.isActive);
      return NextResponse.json({ block }, { headers: ADMIN_PRIVATE_HEADERS });
    }

    if (rawKind === 'override_range') {
      const parsed = PostOverrideRangeSchema.parse(raw);
      if (
        session.user.role === 'specialist' &&
        (!session.user.staffMemberId || parsed.staffId !== session.user.staffMemberId)
      ) {
        return NextResponse.json(
          { error: 'Permisos insuficientes' },
          { status: 403, headers: ADMIN_PRIVATE_HEADERS },
        );
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
      return NextResponse.json(
        { overrides },
        { status: 201, headers: ADMIN_PRIVATE_HEADERS },
      );
    }

    if (rawKind === 'preload_mx_holidays') {
      const parsed = PreloadHolidaysSchema.parse(raw);
      if (
        session.user.role === 'specialist' &&
        (!session.user.staffMemberId || parsed.staffId !== session.user.staffMemberId)
      ) {
        return NextResponse.json(
          { error: 'Permisos insuficientes' },
          { status: 403, headers: ADMIN_PRIVATE_HEADERS },
        );
      }
      const result = await preloadMexicoHolidays({
        year: parsed.year,
        staffId: parsed.staffId,
        publicNote: parsed.publicNote,
        redirectStaffId: parsed.redirectStaffId ?? null,
      });
      return NextResponse.json(result, { status: 201, headers: ADMIN_PRIVATE_HEADERS });
    }

    const body = PostOverrideSchema.parse(raw);
    if (
      session.user.role === 'specialist' &&
      (!session.user.staffMemberId || body.staffId !== session.user.staffMemberId)
    ) {
      return NextResponse.json(
        { error: 'Permisos insuficientes' },
        { status: 403, headers: ADMIN_PRIVATE_HEADERS },
      );
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
    return NextResponse.json({ override }, { headers: ADMIN_PRIVATE_HEADERS });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status = err.code === 'BLOCK_NOT_FOUND' ? 404 : 400;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos de bloqueo inválidos.' },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    logError('admin_availability_post_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'No se pudo guardar el bloqueo.' },
      { status: 500, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  const { searchParams } = new URL(request.url);
  const blockId = searchParams.get('blockId')?.trim();
  if (blockId) {
    if (session.user.role === 'specialist') {
      const ownerStaffId = await getRecurringBlockStaffOwnerAsync(blockId);
      if (
        !session.user.staffMemberId ||
        !ownerStaffId ||
        ownerStaffId !== session.user.staffMemberId
      ) {
        return NextResponse.json(
          { error: 'Permisos insuficientes' },
          { status: 403, headers: ADMIN_PRIVATE_HEADERS },
        );
      }
    }
    await deleteRecurringBlock(blockId);
    return NextResponse.json({ ok: true }, { headers: ADMIN_PRIVATE_HEADERS });
  }

  const id = searchParams.get('id');
  if (id) {
    if (session.user.role === 'specialist') {
      const ownerStaffId = await getDateOverrideStaffOwnerAsync(id);
      if (
        !session.user.staffMemberId ||
        !ownerStaffId ||
        ownerStaffId !== session.user.staffMemberId
      ) {
        return NextResponse.json(
          { error: 'Permisos insuficientes' },
          { status: 403, headers: ADMIN_PRIVATE_HEADERS },
        );
      }
    }
    await deleteDateOverride(id);
  }
  return NextResponse.json({ ok: true }, { headers: ADMIN_PRIVATE_HEADERS });
}
