import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  addDateOverride,
  deleteDateOverride,
  saveStaffSchedule,
} from '@/lib/repositories/db';
import type { AvailabilityRule } from '@/lib/types';

export async function PUT(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await request.json()) as {
    staffId: string;
    rules: AvailabilityRule[];
  };
  if (
    session.user.role === 'specialist' &&
    session.user.staffMemberId &&
    body.staffId !== session.user.staffMemberId
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
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  if (
    session.user.role === 'specialist' &&
    session.user.staffMemberId &&
    body.staffId !== session.user.staffMemberId
  ) {
    return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
  }
  const override = await addDateOverride(body);
  return NextResponse.json({ override });
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (id) await deleteDateOverride(id);
  return NextResponse.json({ ok: true });
}
