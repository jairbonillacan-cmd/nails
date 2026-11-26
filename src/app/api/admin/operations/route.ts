import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession, requireAdmin } from '@/lib/auth/admin-session';
import {
  addCashEntry,
  adjustInventoryItem,
  getSnapshot,
  recordAuditEvent,
  updateCalendarConnection,
  updateWaitlistStatus,
  updateWorkflow,
  upsertCoupon,
  verifyStoredOwnerPin,
} from '@/lib/repositories/db';
import { serializeCsv } from '@/lib/sanitize';

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
    const providedPin = request.headers.get('x-owner-pin') ?? undefined;
    const pinCheck = verifyStoredOwnerPin(providedPin);
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

    const db = getSnapshot();
    const headers = [
      'Fecha',
      'Tipo',
      'Descripción',
      'Método',
      'Monto MXN',
      'Propina MXN',
      'Comisión MXN',
      'Registrado por',
    ];
    const rows = db.cashEntries.map((e) => [
      e.occurredAt,
      e.entryType,
      e.description,
      e.paymentMethod,
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

  const body = await request.json();

  if (body.kind === 'calendar') {
    if (
      session.user.role === 'specialist' &&
      (!session.user.staffMemberId || body.staffId !== session.user.staffMemberId)
    ) {
      return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
    }
    const connection = await updateCalendarConnection(body.staffId, body.patch);
    return NextResponse.json({ connection });
  }

  if (!['owner', 'admin'].includes(session.user.role)) {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  }

  if (body.kind === 'cash') {
    const entry = await addCashEntry({
      ...body.data,
      recordedBy: session.user.fullName,
    });
    return NextResponse.json({ entry });
  }

  if (body.kind === 'inventory') {
    const item = await adjustInventoryItem({
      ...body.data,
      createdBy: session.user.fullName,
    });
    return NextResponse.json({ item });
  }

  if (body.kind === 'coupon') {
    const coupon = await upsertCoupon(body.data);
    return NextResponse.json({ coupon });
  }

  if (body.kind === 'waitlist') {
    const entry = await updateWaitlistStatus(body.id, body.status);
    return NextResponse.json({ entry });
  }

  if (body.kind === 'workflow') {
    if (session.user.role !== 'owner') {
      return NextResponse.json(
        { error: 'Solo la Dueña puede editar workflows de automatización.' },
        { status: 403 },
      );
    }
    const workflow = await updateWorkflow(body.id, body.patch);
    return NextResponse.json({ workflow });
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 });
}
