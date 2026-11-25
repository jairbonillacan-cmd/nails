import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  getBookingsWithRelations,
  PolicyError,
  updateBookingStatus,
} from '@/lib/repositories/db';

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const bookings = getBookingsWithRelations(
    session.user.role,
    session.user.staffMemberId,
  );
  return NextResponse.json({ bookings });
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
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const body = patchSchema.parse(await request.json());
    const booking = await updateBookingStatus({
      ...body,
      recordedBy: session.user.fullName,
    });
    return NextResponse.json({ booking });
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'Error actualizando cita' }, { status: 400 });
  }
}
