import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  AssignClientPackageSchema,
  CreateServicePackageSchema,
  PatchClientPackageSchema,
} from '@/lib/contracts';
import {
  assignClientPackage,
  cancelClientPackage,
  listClientPackages,
  listServicePackages,
  PolicyError,
  redeemClientPackageSession,
  toggleServicePackage,
  upsertServicePackage,
} from '@/lib/repositories/db';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin', 'specialist'], request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim() || undefined;
  return NextResponse.json({
    servicePackages: listServicePackages(),
    clientPackages: listClientPackages(clientId),
  });
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Permisos insuficientes para gestionar paquetes.' },
      { status: 403 },
    );
  }

  try {
    const raw = (await request.json()) as unknown;
    const rawKind =
      typeof raw === 'object' && raw !== null && 'kind' in raw
        ? (raw as { kind?: unknown }).kind
        : undefined;

    if (rawKind === 'assign') {
      const parsed = AssignClientPackageSchema.parse(raw);
      const clientPackage = await assignClientPackage(parsed);
      return NextResponse.json({ clientPackage }, { status: 201 });
    }

    const parsed = CreateServicePackageSchema.parse(raw);
    const servicePackage = await upsertServicePackage({
      id: parsed.id,
      name: parsed.name,
      description: parsed.description,
      serviceId: parsed.serviceId,
      totalSessions: parsed.totalSessions,
      priceCents: parsed.priceCents,
      validDays: parsed.validDays,
      isActive: parsed.isActive,
    });
    return NextResponse.json({ servicePackage }, { status: 201 });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status =
        err.code === 'CLIENT_NOT_FOUND' ||
        err.code === 'PACKAGE_NOT_FOUND' ||
        err.code === 'SERVICE_NOT_FOUND'
          ? 404
          : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos inválidos de paquete.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Error creando paquete.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Permisos insuficientes para modificar paquetes.' },
      { status: 403 },
    );
  }

  try {
    const parsed = PatchClientPackageSchema.parse(await request.json());
    if (parsed.action === 'toggle_catalog') {
      const servicePackage = await toggleServicePackage(
        parsed.packageId,
        parsed.isActive,
      );
      return NextResponse.json({ servicePackage });
    }
    if (parsed.action === 'redeem') {
      const clientPackage = await redeemClientPackageSession({
        clientPackageId: parsed.clientPackageId,
        bookingId: parsed.bookingId ?? null,
      });
      return NextResponse.json({ clientPackage });
    }
    const clientPackage = await cancelClientPackage(parsed.clientPackageId);
    return NextResponse.json({ clientPackage });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status =
        err.code === 'PACKAGE_NOT_FOUND'
          ? 404
          : err.code === 'PACKAGE_ALREADY_REDEEMED'
            ? 409
            : 400;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos inválidos.' },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Error actualizando paquete.' }, { status: 500 });
  }
}
