import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getBookingByToken,
  getSnapshot,
  manageClientBookingAction,
  PolicyError,
  SlotConflictError,
  submitBookingReview,
} from '@/lib/repositories/db';
import { buildCalendarAddLinks } from '@/lib/ics';
import { buildBookingWhatsAppFallbackUrl } from '@/lib/integrations/notifications';
import { getRuntimeIntegrationStatus } from '@/lib/env';
import {
  toPublicServiceDTO,
  toPublicSettingsDTO,
  toPublicStaffDTO,
} from '@/lib/public-dto';
import type { BookingWithRelations } from '@/lib/types';

export const dynamic = 'force-dynamic';

function toPublicManageBooking(booking: BookingWithRelations) {
  return {
    ...booking,
    internalNotes: '',
    staff: toPublicStaffDTO(booking.staff),
    service: toPublicServiceDTO(booking.service),
  };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const booking = getBookingByToken(token);
  if (!booking) {
    return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 });
  }
  const db = getSnapshot();
  const env = getRuntimeIntegrationStatus();
  const manageUrl = `${env.appUrl}/cita/${booking.manageToken}`;

  return NextResponse.json({
    booking: toPublicManageBooking(booking),
    settings: toPublicSettingsDTO(db.settings),
    calendarLinks: buildCalendarAddLinks(booking, db.settings, manageUrl),
    whatsappUrl: buildBookingWhatsAppFallbackUrl(booking, db.settings, env.appUrl),
  });
}

const patchSchema = z.object({
  action: z.enum(['cancel', 'reschedule']),
  reason: z.string().max(400).optional(),
  newStartAt: z.string().optional(),
  newStaffId: z.string().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const body = patchSchema.parse(await request.json());
    const booking = await manageClientBookingAction({ token, ...body });
    return NextResponse.json({ booking: toPublicManageBooking(booking) });
  } catch (err) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json(
        { code: err.code, error: err.message, suggestedSlots: err.suggestedSlots },
        { status: 409 },
      );
    }
    if (err instanceof PolicyError) {
      return NextResponse.json({ code: err.code, error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'No se pudo actualizar la cita' }, { status: 400 });
  }
}

const reviewSchema = z.object({
  rating: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  comment: z.string().max(600).default(''),
  clickedGoogleReview: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const body = reviewSchema.parse(await request.json());
    const review = await submitBookingReview({
      manageToken: token,
      ...body,
    });
    return NextResponse.json({ review });
  } catch (err) {
    if (err instanceof PolicyError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: 'No se pudo guardar tu reseña' }, { status: 400 });
  }
}
