import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { addWaitlistEntry } from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

const schema = z.object({
  serviceId: z.string().min(1),
  preferredStaffId: z.string().nullable().optional(),
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferredWindow: z.enum(['morning', 'afternoon', 'any']).default('any'),
  clientName: z.string().min(2),
  clientPhoneE164: z.string().min(8),
  clientEmail: z.string().email().optional().or(z.literal('')).nullable(),
  notes: z.string().max(400).default(''),
});

export async function POST(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'public:waitlist',
    key: getRequestIp(request),
    limit: 30,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        code: 'RATE_LIMITED',
        error: 'Demasiados registros en lista de espera en poco tiempo. Espera unos segundos e intenta de nuevo.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rate.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  try {
    const body = schema.parse(await request.json());
    const entry = await addWaitlistEntry({
      ...body,
      preferredStaffId: body.preferredStaffId ?? null,
      clientEmail: body.clientEmail || null,
    });
    return NextResponse.json(
      { entry },
      { status: 201, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudo registrar en lista de espera' },
      { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }
}
