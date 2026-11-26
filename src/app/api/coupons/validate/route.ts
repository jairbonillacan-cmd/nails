import { NextRequest, NextResponse } from 'next/server';
import { ValidateCouponSchema } from '@/lib/contracts';
import { getRepository } from '@/lib/repositories/db';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export async function POST(request: NextRequest) {
  const rate = checkRateLimit({
    bucket: 'public:coupons',
    key: getRequestIp(request),
    limit: 30,
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
          'Retry-After': String(rate.retryAfterSeconds),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  try {
    const body = ValidateCouponSchema.parse(await request.json());
    const result = await getRepository().validateCouponCode(body.code, body.subtotalCents);
    if (!result.valid) {
      return NextResponse.json(
        { valid: false, error: result.error },
        { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
      );
    }
    return NextResponse.json(
      {
        valid: true,
        code: result.coupon.code,
        kind: result.coupon.kind,
        discountCents: result.discountCents,
      },
      { headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  } catch {
    return NextResponse.json(
      { valid: false, error: 'Código inválido' },
      { status: 400, headers: { 'X-RateLimit-Remaining': String(rate.remaining) } },
    );
  }
}
