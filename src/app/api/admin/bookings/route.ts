import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  createBookingAtomic,
  getBookingsWithRelations,
  getSnapshot,
  PolicyError,
  SlotConflictError,
  updateBookingStatus,
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
  addonIds: z.array(z.string()).default([]),
  staffId: z.string().nullable().optional(),
  startAt: z.string().min(1),
  clientName: z.string().min(2, 'Escribe el nombre completo'),
  clientPhone: z.string().min(8, 'Escribe un WhatsApp válido de 10 dígitos'),
  clientEmail: z.string().email('Correo inválido').optional().or(z.literal('')).nullable(),
  clientBirthday: z.string().optional().nullable(),
  clientNotes: z.string().max(1000).optional(),
  inspoPhotoUrl: z.string().max(2_500_000).optional().nullable(),
  paymentProofUrl: z.string().max(2_500_000).optional().nullable(),
  couponCode: z.string().max(40).optional().nullable(),
  source: z.enum(['manual', 'walk_in']).default('manual'),
  forceConfirmed: z.boolean().default(true),
});

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

    const booking = await createBookingAtomic({
      ...parsed,
      staffId: effectiveStaffId,
      clientEmail: parsed.clientEmail || null,
      idempotencyKey: request.headers.get('Idempotency-Key'),
      source: parsed.source,
      forceConfirmed: parsed.forceConfirmed,
    });

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

const patchSchema = z.object({
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
});

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = patchSchema.parse(await request.json());

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

    const booking = await updateBookingStatus({
      ...body,
      recordedBy: session.user.fullName,
    });
    return NextResponse.json({ booking });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status = err.code === 'INVALID_TRANSITION' ? 409 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    return NextResponse.json({ error: 'Error actualizando cita' }, { status: 400 });
  }
}
