import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readClientPortalSession } from '@/lib/auth/client-portal-otp';
import {
  selectClientPortalProfile,
  type ClientPortalHistoryContext,
} from '@/lib/client-account';
import {
  ClientPortalProfileResponseSchema,
  PatchClientPortalProfileSchema,
} from '@/lib/contracts';
import { logError } from '@/lib/logger';
import { getRepository, PolicyError } from '@/lib/repositories/db';
import type { ClientPortalRecordData } from '@/lib/repositories/port';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

const PROFILE_RATE_LIMIT = 60;
const PROFILE_WRITE_RATE_LIMIT = 30;
const PROFILE_RATE_WINDOW_MS = 60_000;
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };

async function buildProfilePayload(
  phoneE164: string,
  record: ClientPortalRecordData,
) {
  let history: ClientPortalHistoryContext | undefined;
  if (record.client && record.latestBooking) {
    const bootstrap = await getRepository().getPublicBootstrap();
    history = {
      bookings: [record.latestBooking],
      services: bootstrap.services.map((srv) => ({
        id: srv.id,
        slug: srv.slug,
        name: srv.name,
        isActive: true,
        isPrivate: srv.isPrivate,
      })),
      staff: bootstrap.staff.map((member) => ({
        id: member.id,
        bookingSlug: member.bookingSlug,
        name: member.name,
        isActive: true,
      })),
    };
  }
  return ClientPortalProfileResponseSchema.parse({
    authenticated: true,
    authMethod: 'whatsapp_otp',
    profile: selectClientPortalProfile(
      record.client ? [record.client] : [],
      phoneE164,
      history,
    ),
  });
}

export async function GET(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'client-portal-profile',
    key: getRequestIp(request),
    limit: PROFILE_RATE_LIMIT,
    windowMs: PROFILE_RATE_WINDOW_MS,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', error: 'Demasiados intentos. Espera un momento.' },
      {
        status: 429,
        headers: { ...PRIVATE_HEADERS, 'Retry-After': String(rate.retryAfterSeconds) },
      },
    );
  }

  const session = await readClientPortalSession(request);
  if (!session) {
    return NextResponse.json(
      ClientPortalProfileResponseSchema.parse({ authenticated: false }),
      { status: 401, headers: PRIVATE_HEADERS },
    );
  }

  const record = await getRepository().getClientPortalRecordByPhone(session.phoneE164);
  const body = await buildProfilePayload(session.phoneE164, record);
  return NextResponse.json(body, { status: 200, headers: PRIVATE_HEADERS });
}

export async function PATCH(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'client-portal-profile-write',
    key: getRequestIp(request),
    limit: PROFILE_WRITE_RATE_LIMIT,
    windowMs: PROFILE_RATE_WINDOW_MS,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', error: 'Demasiados intentos. Espera un momento.' },
      {
        status: 429,
        headers: { ...PRIVATE_HEADERS, 'Retry-After': String(rate.retryAfterSeconds) },
      },
    );
  }

  const session = await readClientPortalSession(request);
  if (!session) {
    return NextResponse.json(
      ClientPortalProfileResponseSchema.parse({ authenticated: false }),
      { status: 401, headers: PRIVATE_HEADERS },
    );
  }

  try {
    const rawBody: unknown = await request.json();
    const parsed = PatchClientPortalProfileSchema.parse(rawBody);
    const updatedRecord = await getRepository().upsertClientPortalProfileByPhone({
      phoneE164: session.phoneE164,
      fullName: parsed.fullName,
      email: parsed.email,
      instagramHandle: parsed.instagramHandle,
      birthday: parsed.birthday,
    });
    const body = await buildProfilePayload(session.phoneE164, updatedRecord);
    return NextResponse.json(body, { status: 200, headers: PRIVATE_HEADERS });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Revisa los datos ingresados.' },
        { status: 400, headers: PRIVATE_HEADERS },
      );
    }
    if (err instanceof PolicyError) {
      return NextResponse.json(
        { code: err.code, error: err.message },
        { status: 400, headers: PRIVATE_HEADERS },
      );
    }
    logError('client_portal_profile_update_failed', { error: err });
    return NextResponse.json(
      { error: 'No se pudo guardar tu perfil.' },
      { status: 500, headers: PRIVATE_HEADERS },
    );
  }
}
