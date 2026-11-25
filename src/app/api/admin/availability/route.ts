import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import { diagnoseDateSlots } from '@/lib/availability/engine';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  addDateOverride,
  deleteDateOverride,
  getSnapshot,
  saveStaffSchedule,
} from '@/lib/repositories/db';
import type { AvailabilityRule } from '@/lib/types';

const hhmmRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const availabilityRuleSchema = z
  .object({
    id: z.string().min(1),
    dayOfWeek: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    startTime: z.string().regex(hhmmRegex, 'Hora de inicio inválida (HH:mm)'),
    endTime: z.string().regex(hhmmRegex, 'Hora de fin inválida (HH:mm)'),
    fixedStartTimes: z
      .array(z.string().regex(hhmmRegex, 'Horario fijo inválido (HH:mm)'))
      .max(24)
      .optional(),
  })
  .refine((rule) => rule.startTime < rule.endTime, {
    message: 'La hora de inicio debe ser menor a la hora de fin.',
  })
  .refine(
    (rule) =>
      !rule.fixedStartTimes ||
      rule.fixedStartTimes.every((t) => t >= rule.startTime && t < rule.endTime),
    {
      message: 'Cada horario fijo debe estar dentro de la ventana laboral.',
    },
  );

const putScheduleSchema = z.object({
  staffId: z.string().min(1),
  rules: z.array(availabilityRuleSchema).max(50),
});

const postOverrideSchema = z.object({
  staffId: z.string().min(1),
  overrideDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  isUnavailable: z.boolean(),
  startTime: z.string().regex(hhmmRegex).nullable().default(null),
  endTime: z.string().regex(hhmmRegex).nullable().default(null),
  reason: z.string().max(240).default(''),
});

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');
  if (mode !== 'diagnose') {
    return NextResponse.json({ error: 'Modo no soportado' }, { status: 400 });
  }

  const db = getSnapshot();
  const date =
    searchParams.get('date')?.trim() ||
    getDateKeyInTimezone(new Date(), db.settings.timezone);
  const serviceId = searchParams.get('serviceId')?.trim() || db.services[0]?.id;
  const requestedStaffId = searchParams.get('staffId')?.trim() || '';

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
    return NextResponse.json({ date, diagnosis: [], diagnostics: [] });
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
      bookings: db.bookings,
      slotHolds: db.slotHolds,
      calendarConnections: db.calendarConnections,
    },
    date,
    targetStaffId,
  );

  return NextResponse.json({ date, diagnosis, diagnostics: diagnosis });
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const parsed = putScheduleSchema.parse(await request.json());
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
    const body = postOverrideSchema.parse(await request.json());
    if (
      session.user.role === 'specialist' &&
      (!session.user.staffMemberId || body.staffId !== session.user.staffMemberId)
    ) {
      return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
    }
    const override = await addDateOverride(body);
    return NextResponse.json({ override });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Excepción de fecha inválida.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'No se pudo guardar la excepción.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) {
    if (session.user.role === 'specialist') {
      const target = getSnapshot().dateOverrides.find((o) => o.id === id);
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
