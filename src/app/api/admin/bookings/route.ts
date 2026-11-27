import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  AdminCheckInBookingSchema,
  AdminCreateBookingSchema,
  AdminPatchBookingStatusSchema,
  AdminRejectDepositSchema,
  AdminRescheduleBookingSchema,
  CheckoutSplitSchema,
  RequestRescheduleSchema,
  SendReminderSchema,
} from '@/lib/contracts';
import { diffMetricCalendarDaysInclusive } from '@/lib/metrics';
import { roleCanAccess } from '@/lib/rbac';
import {
  checkInBookingAdmin,
  createBookingAtomic,
  createRecurringBookingSeries,
  getAddonsByIdsAsync,
  getBookingStaffOwnerAsync,
  getRepository,
  getServicesByIdsAsync,
  PolicyError,
  recordBookingCheckoutAtomic,
  rejectBookingDeposit,
  requestBookingReschedule,
  rescheduleBookingAdmin,
  sendManualBookingReminder,
  SlotConflictError,
  updateBookingStatus,
  verifyStoredOwnerPinAsync,
} from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

const MAX_BOOKINGS_RANGE_DAYS = 366;

function isValidCalendarDateKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const BookingsRangeQuerySchema = z.object({
  from: z
    .string()
    .trim()
    .refine(isValidCalendarDateKey, 'Parámetro "from" inválido. Usa formato YYYY-MM-DD.')
    .optional(),
  to: z
    .string()
    .trim()
    .refine(isValidCalendarDateKey, 'Parámetro "to" inválido. Usa formato YYYY-MM-DD.')
    .optional(),
  staff: z.string().trim().max(120).optional(),
});

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!roleCanAccess(session.user.role, 'bookings')) {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawFrom = searchParams.get('from')?.trim();
  const rawTo = searchParams.get('to')?.trim();
  const rawStaff = searchParams.get('staff')?.trim();

  const parsedQuery = BookingsRangeQuerySchema.safeParse({
    ...(rawFrom ? { from: rawFrom } : {}),
    ...(rawTo ? { to: rawTo } : {}),
    ...(rawStaff ? { staff: rawStaff } : {}),
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: parsedQuery.error.issues[0]?.message || 'Parámetros de rango inválidos.' },
      { status: 400 },
    );
  }

  const from = parsedQuery.data.from;
  const to = parsedQuery.data.to;
  if (from && to) {
    if (from > to) {
      return NextResponse.json(
        { error: 'La fecha inicial no puede ser posterior a la fecha final.' },
        { status: 400 },
      );
    }
    if (diffMetricCalendarDaysInclusive(from, to) > MAX_BOOKINGS_RANGE_DAYS) {
      return NextResponse.json(
        { error: `El rango máximo permitido es de ${MAX_BOOKINGS_RANGE_DAYS} días.` },
        { status: 400 },
      );
    }
  }

  const isSpecialist = session.user.role === 'specialist';
  const requestedStaffId =
    parsedQuery.data.staff && parsedQuery.data.staff !== 'all'
      ? parsedQuery.data.staff
      : null;

  if (isSpecialist && !session.user.staffMemberId) {
    const settings = await getRepository().getSalonSettings();
    return NextResponse.json(
      {
        bookings: [],
        paymentSplits: [],
        cashEntries: [],
        range: { from: from ?? null, to: to ?? null, staffId: null },
        timezone: settings.timezone || 'America/Mexico_City',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const effectiveStaffId = isSpecialist
    ? session.user.staffMemberId
    : requestedStaffId;

  const result = await getRepository().getAdminBookingsRange({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    staffId: effectiveStaffId,
    role: session.user.role,
    staffMemberId: session.user.staffMemberId,
  });

  return NextResponse.json(
    {
      bookings: result.bookings,
      paymentSplits: result.paymentSplits,
      cashEntries: result.cashEntries,
      range: {
        from: from ?? null,
        to: to ?? null,
        staffId: effectiveStaffId,
      },
      timezone: result.timezone,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

async function checkOwnerPinGate(
  request: NextRequest,
  actorId: string,
  bodyPin?: string,
): Promise<NextResponse | null> {
  const settings = await getRepository().getSalonSettings();
  const providedPin = bodyPin ?? request.headers.get('x-owner-pin') ?? undefined;
  const gateActive = Boolean(
    (settings.ownerPinEnabled && settings.ownerPinHash) || providedPin?.trim(),
  );
  if (gateActive) {
    const pinRate = checkRateLimit({
      bucket: 'admin:owner-pin',
      key: `${actorId}:${getRequestIp(request)}`,
      limit: 10,
      windowMs: 5 * 60_000,
    });
    if (!pinRate.allowed) {
      return NextResponse.json(
        {
          code: 'RATE_LIMITED',
          error:
            'Demasiados intentos de PIN de autorización. Espera unos minutos e intenta de nuevo.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(pinRate.retryAfterSeconds),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }
  }

  const check = await verifyStoredOwnerPinAsync(providedPin);
  if (!check.required || check.valid) return null;
  const hasAttempt = Boolean(providedPin?.trim());
  return NextResponse.json(
    {
      code: hasAttempt ? 'OWNER_PIN_INVALID' : 'OWNER_PIN_REQUIRED',
      error: hasAttempt
        ? 'El PIN de autorización de dueña es incorrecto.'
        : 'Esta acción requiere el PIN de autorización de dueña.',
    },
    { status: 403 },
  );
}

async function assertSpecialistOwnsBooking(
  session: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>,
  bookingId: string,
  forbiddenMessage: string,
): Promise<NextResponse | null> {
  if (session.user.role !== 'specialist') return null;
  if (!session.user.staffMemberId) {
    return NextResponse.json({ error: forbiddenMessage }, { status: 403 });
  }
  const ownerStaffId = await getBookingStaffOwnerAsync(bookingId);
  if (!ownerStaffId || ownerStaffId !== session.user.staffMemberId) {
    return NextResponse.json({ error: forbiddenMessage }, { status: 403 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin', 'specialist'], request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const parsed = AdminCreateBookingSchema.parse(await request.json());

    let effectiveStaffId: string | null = parsed.staffId ?? null;
    if (session.user.role === 'specialist') {
      if (!session.user.staffMemberId) {
        return NextResponse.json(
          { error: 'Tu usuario no tiene profesional vinculada.' },
          { status: 403 },
        );
      }
      if (parsed.staffId && parsed.staffId !== session.user.staffMemberId) {
        return NextResponse.json(
          { error: 'No tienes permiso para crear citas en la agenda de otra profesional.' },
          { status: 403 },
        );
      }
      effectiveStaffId = session.user.staffMemberId;
    }

    if (typeof parsed.customPriceCents === 'number') {
      const serviceIds = [parsed.serviceId, ...parsed.extraServiceIds];
      const [services, addons] = await Promise.all([
        getServicesByIdsAsync(serviceIds),
        getAddonsByIdsAsync(parsed.addonIds),
      ]);
      const baseService = services.find((s) => s.id === parsed.serviceId);
      const extras = services.filter(
        (s) => parsed.extraServiceIds.includes(s.id) && s.id !== parsed.serviceId,
      );
      const catalogSubtotal = baseService
        ? baseService.priceCents +
          extras.reduce((sum, s) => sum + s.priceCents, 0) +
          addons.reduce((sum, a) => sum + a.extraPriceCents, 0)
        : -1;
      if (parsed.customPriceCents !== catalogSubtotal) {
        const pinDenied = await checkOwnerPinGate(request, session.user.id, parsed.ownerPin);
        if (pinDenied) return pinDenied;
      }
    }

    const { recurrence, ownerPin: _pin, ...bookingInput } = parsed;
    const basePayload = {
      ...bookingInput,
      staffId: effectiveStaffId,
      clientEmail: parsed.clientEmail || null,
      idempotencyKey: request.headers.get('Idempotency-Key'),
      source: parsed.source,
      forceConfirmed: parsed.forceConfirmed,
      actor: {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        fullName: session.user.fullName,
      },
    };

    if (recurrence) {
      const series = await createRecurringBookingSeries({
        ...basePayload,
        recurrence,
      });
      return NextResponse.json(
        {
          booking: series.created[0],
          bookings: series.created,
          seriesId: series.seriesId,
          skippedConflicts: series.skippedConflicts,
        },
        { status: 201 },
      );
    }

    const booking = await createBookingAtomic(basePayload);

    return NextResponse.json({ booking }, { status: 201 });
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json(
        {
          code: err.code,
          error: err.message,
          suggestedSlots: err.suggestedSlots,
        },
        { status: 409 },
      );
    }
    if (err instanceof PolicyError) {
      return NextResponse.json(
        {
          code: err.code,
          error: err.message,
          ...(err.suggestedSlots ? { suggestedSlots: err.suggestedSlots } : {}),
        },
        { status: 400 },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos ingresados' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'No se pudo registrar la cita' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const actor = {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
    fullName: session.user.fullName,
  };

  try {
    const raw = (await request.json()) as unknown;
    const rawAction =
      typeof raw === 'object' && raw !== null && 'action' in raw
        ? (raw as { action?: unknown }).action
        : undefined;

    if (rawAction === 'check_in') {
      const checkInReq = AdminCheckInBookingSchema.parse(raw);
      const denied = await assertSpecialistOwnsBooking(
        session,
        checkInReq.bookingId,
        'No tienes permiso para registrar la llegada de citas de otra profesional.',
      );
      if (denied) return denied;

      const booking = await checkInBookingAdmin({
        bookingId: checkInReq.bookingId,
        actor,
      });
      return NextResponse.json({ booking });
    }

    if (rawAction === 'send_reminder') {
      const reminderReq = SendReminderSchema.parse(raw);
      const denied = await assertSpecialistOwnsBooking(
        session,
        reminderReq.bookingId,
        'No tienes permiso para enviar recordatorios de otra profesional.',
      );
      if (denied) return denied;

      const reminder = await sendManualBookingReminder({
        bookingId: reminderReq.bookingId,
        channel: reminderReq.channel,
      });
      return NextResponse.json({
        ok: reminder.ok,
        bookingId: reminder.bookingId,
        channel: reminder.channel,
        waMeUrl: reminder.waMeUrl,
        messagePreview: reminder.messagePreview,
      });
    }

    if (rawAction === 'request_reschedule') {
      const rescheduleReq = RequestRescheduleSchema.parse(raw);
      const denied = await assertSpecialistOwnsBooking(
        session,
        rescheduleReq.bookingId,
        'No tienes permiso para solicitar reprogramación en citas de otra profesional.',
      );
      if (denied) return denied;

      const result = await requestBookingReschedule({
        bookingId: rescheduleReq.bookingId,
        note: rescheduleReq.note,
        actor,
      });
      return NextResponse.json(result);
    }

    if (rawAction === 'reschedule_admin') {
      const rescheduleReq = AdminRescheduleBookingSchema.parse(raw);
      const denied = await assertSpecialistOwnsBooking(
        session,
        rescheduleReq.bookingId,
        'No tienes permiso para mover citas de otra profesional.',
      );
      if (denied) return denied;
      if (
        session.user.role === 'specialist' &&
        rescheduleReq.staffId &&
        rescheduleReq.staffId !== session.user.staffMemberId
      ) {
        return NextResponse.json(
          { error: 'No tienes permiso para mover citas de otra profesional.' },
          { status: 403 },
        );
      }

      const booking = await rescheduleBookingAdmin({
        bookingId: rescheduleReq.bookingId,
        startAt: rescheduleReq.startAt,
        staffId: rescheduleReq.staffId,
        durationMinutes: rescheduleReq.durationMinutes,
        reason: rescheduleReq.reason,
        actor,
      });
      return NextResponse.json({ booking });
    }

    if (rawAction === 'reject_deposit') {
      const rejectReq = AdminRejectDepositSchema.parse(raw);
      const denied = await assertSpecialistOwnsBooking(
        session,
        rejectReq.bookingId,
        'No tienes permiso para rechazar comprobantes de otra profesional.',
      );
      if (denied) return denied;

      const booking = await rejectBookingDeposit({
        bookingId: rejectReq.bookingId,
        reason: rejectReq.reason,
        actor,
      });
      return NextResponse.json({ booking });
    }

    if (rawAction === 'checkout_split') {
      const checkoutReq = CheckoutSplitSchema.parse(raw);
      const denied = await assertSpecialistOwnsBooking(
        session,
        checkoutReq.bookingId,
        'No tienes permiso para cobrar citas de otra profesional.',
      );
      if (denied) return denied;

      const result = await recordBookingCheckoutAtomic({
        bookingId: checkoutReq.bookingId,
        splits: checkoutReq.splits,
        extraItem: checkoutReq.extraItem ?? null,
        markCompleted: checkoutReq.markCompleted,
        redeemLoyaltyReward: checkoutReq.redeemLoyaltyReward,
        redeemClientPackageId: checkoutReq.redeemClientPackageId ?? null,
        actor,
      });
      return NextResponse.json(result);
    }

    const body = AdminPatchBookingStatusSchema.parse(raw);
    const denied = await assertSpecialistOwnsBooking(
      session,
      body.bookingId,
      'No tienes permiso para modificar citas de otra profesional.',
    );
    if (denied) return denied;

    if (body.status === 'canceled') {
      const pinDenied = await checkOwnerPinGate(request, session.user.id, body.ownerPin);
      if (pinDenied) return pinDenied;
    }

    const booking = await updateBookingStatus({
      bookingId: body.bookingId,
      status: body.status,
      cancellationReason: body.cancellationReason,
      internalNotes: body.internalNotes,
      paymentMethod: body.paymentMethod,
      tipCents: body.tipCents,
      recordedBy: session.user.fullName,
      actor,
    });
    return NextResponse.json({ booking });
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json(
        {
          code: err.code,
          error: err.message,
          suggestedSlots: err.suggestedSlots,
        },
        { status: 409 },
      );
    }
    if (err instanceof PolicyError) {
      const status =
        err.code === 'PAST_BOOKING_LOCKED'
          ? 403
          : err.code === 'INVALID_TRANSITION'
            ? 409
            : err.code === 'BOOKING_NOT_FOUND'
              ? 404
              : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos enviados' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Error actualizando cita' }, { status: 400 });
  }
}
