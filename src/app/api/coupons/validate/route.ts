import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ValidateCouponSchema } from '@/lib/contracts';
import { logError } from '@/lib/logger';
import { getRepository } from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

const GENERIC_INVALID_COUPON_ERROR = 'Código no válido o no aplicable para esta cita.';

export async function POST(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'public:coupons',
    key: getRequestIp(request),
    limit: 15,
    windowMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      {
        valid: false,
        code: 'RATE_LIMITED',
        error: 'Demasiados intentos de validación de cupón. Espera unos segundos e intenta de nuevo.',
      },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(rate.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  const baseHeaders = {
    'Cache-Control': 'no-store',
    'X-RateLimit-Remaining': String(rate.remaining),
  };

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { valid: false, error: 'Solicitud inválida.' },
      { status: 400, headers: baseHeaders },
    );
  }

  const parsed = ValidateCouponSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { valid: false, error: parsed.error.issues[0]?.message ?? 'Código inválido.' },
      { status: 400, headers: baseHeaders },
    );
  }

  try {
    const result = await getRepository().validateCouponCode(
      parsed.data.code,
      parsed.data.subtotalCents,
    );
    if (!result.valid) {
      return NextResponse.json(
        { valid: false, error: GENERIC_INVALID_COUPON_ERROR },
        { status: 400, headers: baseHeaders },
      );
    }
    return NextResponse.json(
      {
        valid: true,
        code: result.coupon.code,
        kind: result.coupon.kind,
        discountCents: result.discountCents,
      },
      { headers: baseHeaders },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { valid: false, error: err.issues[0]?.message ?? 'Código inválido.' },
        { status: 400, headers: baseHeaders },
      );
    }
    logError('public_coupon_validate_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { valid: false, error: 'No se pudo validar el código en este momento.' },
      { status: 500, headers: baseHeaders },
    );
  }
}
