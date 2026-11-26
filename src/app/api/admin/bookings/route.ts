import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
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

const createAdminBookingSchema = z.object({
  serviceId: z.string().min(1),
  extraServiceIds: z.array(z.string().min(1)).max(8).default([]),
  addonIds: z.array(z.string()).default([]),
  staffId: z.string().nullable().optional(),
  startAt: z.string().min(1),
  clientName: z.string().min(2, 'Escribe el nombre completo'),
  clientPhone: z.string().min(8, 'Escribe un WhatsApp válido de 10 dígitos'),
  clientEmail: z.string().email('Correo inválido').optional().or(z.literal('')).nullable(),
  clientInstagram: z.string().max(120).optional().nullable(),
  clientBirthday: z.string().optional().nullable(),
  clientNotes: z.string().max(1000).optional(),
  internalNotes: z.string().max(1000).optional(),
  inspoPhotoUrl: z.string().max(2_500_000).optional().nullable(),
  paymentProofUrl: z.string().max(2_500_000).optional().nullable(),
  proofDeliveryMethod: z.enum(['web_upload', 'instagram_dm', 'none']).optional(),
  customDurationMinutes: z.number().int().min(15).max(480).optional().nullable(),
  customPriceCents: z.number().int().nonnegative().max(10_000_000).optional().nullable(),
  notifyEmail: z.boolean().optional(),
  notifyWhatsapp: z.boolean().optional(),
  couponCode: z.string().max(40).optional().nullable(),
  source: z.enum(['manual', 'walk_in']).default('manual'),
  forceConfirmed: z.boolean().default(true),
  ownerPin: z.string().max(12).optional(),
  recurrence: z
    .object({
      intervalWeeks: z.union([z.literal(2), z.literal(3), z.literal(4)]),
      count: z.number().int().min(2).max(6),
    })
    .optional(),
});

function checkOwnerPinGate(
  request: NextRequest,
  bodyPin?: string,
): NextResponse | null {
  const providedPin = bodyPin ?? request.headers.get('x-owner-pin') ?? undefined;
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
    const parsed = createAdminBookingSchema.parse(await request.json());

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
        const pinDenied = checkOwnerPinGate(request, parsed.ownerPin);
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

const sendReminderSchema = z.object({
  action: z.literal('send_reminder'),
  bookingId: z.string().min(1),
  channel: z.enum(['whatsapp', 'email', 'both']).default('whatsapp'),
});

const requestRescheduleSchema = z.object({
  action: z.literal('request_reschedule'),
  bookingId: z.string().min(1),
  note: z.string().trim().max(400).optional(),
});

const checkoutSplitSchema = z.object({
  action: z.literal('checkout_split'),
  bookingId: z.string().min(1),
  splits: z
    .array(
      z.object({
        method: z.enum(['cash', 'card', 'transfer', 'giftcard', 'online']),
        amountCents: z.number().int().nonnegative().max(10_000_000),
        tipCents: z.number().int().nonnegative().max(10_000_000).default(0),
        tipStaffId: z.string().min(1).nullable().optional(),
        reference: z.string().max(160).optional(),
      }),
    )
    .min(1)
    .max(10),
  extraItem: z
    .object({
      inventoryItemId: z.string().min(1),
      quantity: z.number().int().min(1).max(50),
    })
    .nullable()
    .optional(),
  markCompleted: z.boolean().default(true),
  redeemLoyaltyReward: z.boolean().optional(),
  redeemClientPackageId: z.string().min(1).nullable().optional(),
});

const patchStatusSchema = z.object({
  action: z.literal('update_status').optional(),
  bookingId: z.string().min(1),
  status: z.enum([
    'pending_payment',
    'pending_confirmation',
    'confirmed',
    'completed',
    'canceled',
    'no_show',
  ]),
  cancellationReason: z.string().optional(),
  internalNotes: z.string().optional(),
  paymentMethod: z.enum(['cash', 'transfer', 'card', 'gift_card']).optional(),
  tipCents: z.number().int().nonnegative().optional(),
  ownerPin: z.string().max(12).optional(),
});

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
      const reminderReq = sendReminderSchema.parse(raw);

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
      const rescheduleReq = requestRescheduleSchema.parse(raw);

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
      const checkoutReq = checkoutSplitSchema.parse(raw);

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

    const body = patchStatusSchema.parse(raw);

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
      const pinDenied = checkOwnerPinGate(request, body.ownerPin);
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
