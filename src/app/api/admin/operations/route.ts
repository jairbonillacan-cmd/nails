import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import { AdminOperationsPostSchema } from '@/lib/contracts';
import { AdminOperationsDeleteQuerySchema } from '@/lib/contracts/operations';
import { toAdminCalendarConnectionDTO } from '@/lib/public-dto';
import {
  addCashEntry,
  adjustInventoryItem,
  deleteCoupon,
  getRepository,
  PolicyError,
  recordAuditEvent,
  updateCalendarConnection,
  updateWaitlistStatus,
  updateWorkflow,
  upsertCoupon,
  verifyStoredOwnerPinAsync,
} from '@/lib/repositories/db';
import { serializeCsv } from '@/lib/sanitize';
import { checkRateLimit, getRequestIp } from '@/lib/security/rate-limit';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      { error: authenticated ? 'Permisos insuficientes' : 'No autorizado' },
      { status: authenticated ? 403 : 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  if (searchParams.get('export') === 'csv') {
    const db = await getRepository().getSnapshot();
    const providedPin = request.headers.get('x-owner-pin') ?? undefined;
    const ownerPinGateActive = Boolean(
      (db.settings.ownerPinEnabled && db.settings.ownerPinHash) || providedPin?.trim(),
    );
    if (ownerPinGateActive) {
      const pinRate = checkRateLimit({
        bucket: 'admin:owner-pin',
        key: `${session.user.id}:${getRequestIp(request)}`,
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

    const pinCheck = await verifyStoredOwnerPinAsync(providedPin);
    if (pinCheck.required && !pinCheck.valid) {
      const hasAttempt = Boolean(providedPin?.trim());
      return NextResponse.json(
        {
          code: hasAttempt ? 'OWNER_PIN_INVALID' : 'OWNER_PIN_REQUIRED',
          error: hasAttempt
            ? 'El PIN de autorización de dueña es incorrecto.'
            : 'Exportar el reporte CSV requiere el PIN de autorización de dueña.',
        },
        { status: 403 },
      );
    }

    const currency = db.settings.currency || 'MXN';
    const entryTypeLabels: Record<string, string> = {
      service_income: 'Servicio',
      product_sale: 'Venta de producto',
      deposit: 'Anticipo',
      expense: 'Gasto',
      tip: 'Propina',
      refund: 'Devolución',
    };
    const paymentMethodLabels: Record<string, string> = {
      cash: 'Efectivo',
      card: 'Tarjeta',
      transfer: 'Transferencia',
      gift_card: 'Tarjeta de regalo',
    };
    const headers = [
      'Fecha',
      'Tipo',
      'Descripción',
      'Forma de pago',
      `Monto (${currency})`,
      `Propina (${currency})`,
      `Comisión (${currency})`,
      'Registrado por',
    ];
    const rows = db.cashEntries.map((e) => [
      e.occurredAt,
      entryTypeLabels[e.entryType] ?? e.entryType,
      e.description,
      paymentMethodLabels[e.paymentMethod] ?? e.paymentMethod,
      (e.amountCents / 100).toFixed(2),
      (e.tipCents / 100).toFixed(2),
      (e.commissionCents / 100).toFixed(2),
      e.recordedBy,
    ]);
    const csv = serializeCsv(headers, rows);

    await recordAuditEvent({
      actor: {
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        fullName: session.user.fullName,
      },
      action: 'csv_exported',
      entityType: 'cash_register',
      entityId: 'cash-entries',
      metadata: { rowCount: rows.length },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="nails-reporte-caja.csv"',
      },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json({ error: 'Solicitud JSON inválida.' }, { status: 400 });
  }

  try {
    const parsed = AdminOperationsPostSchema.parse(rawBody);

    if (parsed.kind === 'calendar') {
      if (
        session.user.role === 'specialist' &&
        (!session.user.staffMemberId || parsed.staffId !== session.user.staffMemberId)
      ) {
        return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
      }
      const connection = await updateCalendarConnection(parsed.staffId, parsed.patch);
      return NextResponse.json({
        connection: toAdminCalendarConnectionDTO(connection),
      });
    }

    if (session.user.role !== 'owner' && session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
    }

    if (parsed.kind === 'cash') {
      const entry = await addCashEntry({
        ...parsed.data,
        recordedBy: session.user.fullName,
      });
      return NextResponse.json({ entry });
    }

    if (parsed.kind === 'inventory') {
      const item = await adjustInventoryItem({
        ...parsed.data,
        createdBy: session.user.fullName,
      });
      return NextResponse.json({ item });
    }

    if (parsed.kind === 'coupon') {
      const coupon = await upsertCoupon(parsed.data);
      return NextResponse.json({ coupon });
    }

    if (parsed.kind === 'coupon_delete') {
      const deleted = await deleteCoupon(parsed.id);
      return NextResponse.json({
        ok: true,
        deletedId: deleted.id,
        code: deleted.code,
      });
    }

    if (parsed.kind === 'waitlist') {
      const entry = await updateWaitlistStatus(parsed.id, parsed.status);
      return NextResponse.json({ entry });
    }

    if (session.user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Solo la Dueña puede editar workflows de automatización.' },
        { status: 403 },
      );
    }
    const workflow = await updateWorkflow(parsed.id, parsed.patch);
    return NextResponse.json({ workflow });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status =
        err.code === 'ITEM_NOT_FOUND' ||
        err.code === 'COUPON_NOT_FOUND' ||
        err.code === 'WAITLIST_NOT_FOUND' ||
        err.code === 'WORKFLOW_NOT_FOUND'
          ? 404
          : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos de operación inválidos.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Error procesando operación.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin'], request);
  if (!session) {
    const authenticated = await getAdminSession(request);
    return NextResponse.json(
      { error: authenticated ? 'Permisos insuficientes' : 'No autorizado' },
      { status: authenticated ? 403 : 401 },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const parsed = AdminOperationsDeleteQuerySchema.parse({
      kind: searchParams.get('kind') ?? undefined,
      id: searchParams.get('id') ?? undefined,
    });
    const deleted = await deleteCoupon(parsed.id);
    return NextResponse.json({
      ok: true,
      deletedId: deleted.id,
      code: deleted.code,
    });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status = err.code === 'COUPON_NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Parámetros de eliminación inválidos.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'No se pudo eliminar el registro.' }, { status: 400 });
  }
}
