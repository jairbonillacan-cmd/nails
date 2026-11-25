import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validateCouponCode } from '@/lib/repositories/db';

const schema = z.object({
  code: z.string().min(1),
  subtotalCents: z.number().int().nonnegative(),
});

export async function POST(request: NextRequest) {
  try {
    const body = schema.parse(await request.json());
    const result = validateCouponCode(body.code, body.subtotalCents);
    if (!result.valid) {
      return NextResponse.json({ valid: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      valid: true,
      code: result.coupon.code,
      kind: result.coupon.kind,
      discountCents: result.discountCents,
    });
  } catch {
    return NextResponse.json({ valid: false, error: 'Código inválido' }, { status: 400 });
  }
}
