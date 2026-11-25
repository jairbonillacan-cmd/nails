import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
import { diagnoseDateSlots } from '@/lib/availability/engine';
import { getDateKeyInTimezone } from '@/lib/format';
import {
  addDateOverride,
  deleteDateOverride,
  getSnapshot,
  saveStaffSchedule,
} from '@/lib/repositories/db';
import type { AvailabilityRule } from '@/lib/types';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode');
  if (mode !== 'diagnose') {
    return NextResponse.json({ error: 'Modo no soportado' }, { status: 400 });
  }

  const db = getSnapshot();
  const date =
    searchParams.get('date')?.trim() ||
    getDateKeyInTimezone(new Date(), db.settings.timezone);
  const serviceId = searchParams.get('serviceId')?.trim() || db.services[0]?.id;
  const requestedStaffId = searchParams.get('staffId')?.trim() || '';

  let targetStaffId: string;
  if (session.user.role === 'specialist') {
    if (!session.user.staffMemberId) {
      return NextResponse.json(
        { error: 'Tu usuario no tiene especialista vinculada.' },
        { status: 403 },
      );
    }
    if (requestedStaffId && requestedStaffId !== session.user.staffMemberId) {
      return NextResponse.json(
        { error: 'Solo puedes diagnosticar tu propia disponibilidad.' },
        { status: 403 },
      );
    }
    targetStaffId = session.user.staffMemberId;
  } else {
    targetStaffId = requestedStaffId || db.staff[0]?.id || '';
  }

  const service = db.services.find((s) => s.id === serviceId);
  if (!targetStaffId || !service) {
    return NextResponse.json({ date, diagnosis: [], diagnostics: [] });
  }

  const addonIdsParam = searchParams.get('addonIds') || '';
  const addonIds = addonIdsParam ? addonIdsParam.split(',').filter(Boolean) : [];
  const addons = db.addons.filter((a) => addonIds.includes(a.id) && a.isActive);

  const diagnosis = diagnoseDateSlots(
    {
      settings: db.settings,
      service,
      addons,
      staffMembers: db.staff,
      schedules: db.schedules,
      dateOverrides: db.dateOverrides,
      bookings: db.bookings,
      slotHolds: db.slotHolds,
      calendarConnections: db.calendarConnections,
    },
    date,
    targetStaffId,
  );

  return NextResponse.json({ date, diagnosis, diagnostics: diagnosis });
}

export async function PUT(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await request.json()) as {
    staffId: string;
    rules: AvailabilityRule[];
  };
  if (
    session.user.role === 'specialist' &&
    (!session.user.staffMemberId || body.staffId !== session.user.staffMemberId)
  ) {
    return NextResponse.json(
      { error: 'Solo puedes modificar tu propia disponibilidad.' },
      { status: 403 },
    );
  }

  await saveStaffSchedule(body.staffId, body.rules);
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  if (
    session.user.role === 'specialist' &&
    (!session.user.staffMemberId || body.staffId !== session.user.staffMemberId)
  ) {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  }
  const override = await addDateOverride(body);
  return NextResponse.json({ override });
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) {
    if (session.user.role === 'specialist') {
      const target = getSnapshot().dateOverrides.find((o) => o.id === id);
      if (
        !session.user.staffMemberId ||
        !target ||
        target.staffId !== session.user.staffMemberId
      ) {
        return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
      }
    }
    await deleteDateOverride(id);
  }
  return NextResponse.json({ ok: true });
}
