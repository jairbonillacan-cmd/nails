import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  AdminCreateBookingSchema,
  AdminPatchBookingStatusSchema,
  CheckoutSplitSchema,
  RequestRescheduleSchema,
  SendReminderSchema,
} from '@/lib/contracts';
import {
  createBookingAtomic,
  createRecurringBookingSeries,
  getBookingsWithRelations,
  getSnapshot,
  PolicyError,
  recordBookingCheckoutAtomic,
  requestBookingReschedule,
  sendManualBookingReminder,
  SlotConflictError,
  updateBookingStatus,
  verifyStoredOwnerPin,
} from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (session.user.role === 'specialist' && !session.user.staffMemberId) {
    return NextResponse.json({ bookings: [] });
  }
  const bookings = getBookingsWithRelations(
    session.user.role,
    session.user.staffMemberId,
  );
  return NextResponse.json({ bookings });
}

function checkOwnerPinGate(
  request: NextRequest,
  actorId: string,
  bodyPin?: string,
): NextResponse | null {
  const db = getSnapshot();
  const providedPin = bodyPin ?? request.headers.get('x-owner-pin') ?? undefined;
  const gateActive = Boolean(
    (db.settings.ownerPinEnabled && db.settings.ownerPinHash) || providedPin?.trim(),
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

  const check = verifyStoredOwnerPin(providedPin);
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

export async function POST(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin', 'specialist'], request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const parsed = AdminCreateBookingSchema.parse(await request.json());

    let effectiveStaffId: string | null = parsed.staffId ?? null;
    if (session.user.role === 'specialist') {
      if (!session.user.staffMemberId) {
        return NextResponse.json(
          { error: 'Tu usuario no tiene especialista vinculada.' },
          { status: 403 },
        );
      }
      if (parsed.staffId && parsed.staffId !== session.user.staffMemberId) {
        return NextResponse.json(
          { error: 'No tienes permiso para crear citas en la agenda de otra especialista.' },
          { status: 403 },
        );
      }
      effectiveStaffId = session.user.staffMemberId;
    }

    if (typeof parsed.customPriceCents === 'number') {
      const db = getSnapshot();
      const baseService = db.services.find((s) => s.id === parsed.serviceId);
      const extras = db.services.filter((s) => parsed.extraServiceIds.includes(s.id));
      const addons = db.addons.filter(
        (a) => parsed.addonIds.includes(a.id) && a.isActive,
      );
      const catalogSubtotal = baseService
        ? baseService.priceCents +
          extras.reduce((sum, s) => sum + s.priceCents, 0) +
          addons.reduce((sum, a) => sum + a.extraPriceCents, 0)
        : -1;
      if (parsed.customPriceCents !== catalogSubtotal) {
        const pinDenied = checkOwnerPinGate(request, session.user.id, parsed.ownerPin);
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

    if (rawAction === 'send_reminder') {
      const reminderReq = SendReminderSchema.parse(raw);

      if (session.user.role === 'specialist') {
        const db = getSnapshot();
        const target = db.bookings.find((b) => b.id === reminderReq.bookingId);
        if (
          !session.user.staffMemberId ||
          !target ||
          target.staffId !== session.user.staffMemberId
        ) {
          return NextResponse.json(
            { error: 'No tienes permiso para enviar recordatorios de otra especialista.' },
            { status: 403 },
          );
        }
      }

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

      if (session.user.role === 'specialist') {
        const db = getSnapshot();
        const target = db.bookings.find((b) => b.id === rescheduleReq.bookingId);
        if (
          !session.user.staffMemberId ||
          !target ||
          target.staffId !== session.user.staffMemberId
        ) {
          return NextResponse.json(
            {
              error:
                'No tienes permiso para solicitar reprogramación en citas de otra especialista.',
            },
            { status: 403 },
          );
        }
      }

      const result = await requestBookingReschedule({
        bookingId: rescheduleReq.bookingId,
        note: rescheduleReq.note,
        actor,
      });
      return NextResponse.json(result);
    }

    if (rawAction === 'checkout_split') {
      const checkoutReq = CheckoutSplitSchema.parse(raw);

      if (session.user.role === 'specialist') {
        const db = getSnapshot();
        const target = db.bookings.find((b) => b.id === checkoutReq.bookingId);
        if (
          !session.user.staffMemberId ||
          !target ||
          target.staffId !== session.user.staffMemberId
        ) {
          return NextResponse.json(
            { error: 'No tienes permiso para cobrar citas de otra especialista.' },
            { status: 403 },
          );
        }
      }

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

    if (session.user.role === 'specialist') {
      const db = getSnapshot();
      const target = db.bookings.find((b) => b.id === body.bookingId);
      if (
        !session.user.staffMemberId ||
        !target ||
        target.staffId !== session.user.staffMemberId
      ) {
        return NextResponse.json(
          { error: 'No tienes permiso para modificar citas de otra especialista.' },
          { status: 403 },
        );
      }
    }

    if (body.status === 'canceled') {
      const pinDenied = checkOwnerPinGate(request, session.user.id, body.ownerPin);
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
