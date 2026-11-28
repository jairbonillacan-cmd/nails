import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/admin-session';
import {
  AssignClientPackageSchema,
  CreateServicePackageSchema,
  PatchClientPackageSchema,
} from '@/lib/contracts';
import { ADMIN_PRIVATE_HEADERS } from '@/lib/http/admin-headers';
import { logError } from '@/lib/logger';
import {
  assignClientPackage,
  cancelClientPackage,
  getRepository,
  listClientPackagesAsync,
  listServicePackagesAsync,
  PolicyError,
  redeemClientPackageSession,
  toggleServicePackage,
  upsertServicePackage,
} from '@/lib/repositories/db';

export async function GET(request: NextRequest) {
  const session = await requireAdmin(['owner', 'admin', 'specialist'], request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get('clientId')?.trim() || undefined;
  const [servicePackages, allClientPackages] = await Promise.all([
    listServicePackagesAsync(),
    listClientPackagesAsync(clientId),
  ]);

  if (session.user.role === 'specialist') {
    const staffMemberId = session.user.staffMemberId;
    if (!staffMemberId || allClientPackages.length === 0) {
      return NextResponse.json(
        { servicePackages, clientPackages: [] },
        { headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    const visibleClientIds = new Set(
      await getRepository().listStaffClientIds(staffMemberId),
    );
    if (clientId && !visibleClientIds.has(clientId)) {
      return NextResponse.json(
        { servicePackages, clientPackages: [] },
        { headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    return NextResponse.json(
      {
        servicePackages,
        clientPackages: allClientPackages.filter((pkg) =>
          visibleClientIds.has(pkg.clientId),
        ),
      },
      { headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  return NextResponse.json(
    {
      servicePackages,
      clientPackages: allClientPackages,
    },
    { headers: ADMIN_PRIVATE_HEADERS },
  );
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Permisos insuficientes para gestionar paquetes.' },
      { status: 403, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  let raw: unknown;
  try {
    raw = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud JSON inválida.' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  try {
    const rawKind =
      typeof raw === 'object' && raw !== null && 'kind' in raw
        ? (raw as { kind?: unknown }).kind
        : undefined;

    if (rawKind === 'assign') {
      const parsed = AssignClientPackageSchema.parse(raw);
      const clientPackage = await assignClientPackage(parsed);
      return NextResponse.json(
        { clientPackage },
        { status: 201, headers: ADMIN_PRIVATE_HEADERS },
      );
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
    return NextResponse.json(
      { servicePackage },
      { status: 201, headers: ADMIN_PRIVATE_HEADERS },
    );
  } catch (err) {
    if (err instanceof PolicyError) {
      const status =
        err.code === 'CLIENT_NOT_FOUND' ||
        err.code === 'PACKAGE_NOT_FOUND' ||
        err.code === 'SERVICE_NOT_FOUND'
          ? 404
          : 400;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos inválidos de paquete.' },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    logError('admin_packages_post_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Error creando paquete.' },
      { status: 500, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdmin(undefined, request);
  if (!session) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
  if (session.user.role !== 'owner' && session.user.role !== 'admin') {
    return NextResponse.json(
      { error: 'Permisos insuficientes para modificar paquetes.' },
      { status: 403, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = (await request.json()) as unknown;
  } catch {
    return NextResponse.json(
      { error: 'Solicitud JSON inválida.' },
      { status: 400, headers: ADMIN_PRIVATE_HEADERS },
    );
  }

  try {
    const parsed = PatchClientPackageSchema.parse(rawBody);
    if (parsed.action === 'toggle_catalog') {
      const servicePackage = await toggleServicePackage(
        parsed.packageId,
        parsed.isActive,
      );
      return NextResponse.json({ servicePackage }, { headers: ADMIN_PRIVATE_HEADERS });
    }
    if (parsed.action === 'redeem') {
      const clientPackage = await redeemClientPackageSession({
        clientPackageId: parsed.clientPackageId,
        bookingId: parsed.bookingId ?? null,
      });
      return NextResponse.json({ clientPackage }, { headers: ADMIN_PRIVATE_HEADERS });
    }
    const clientPackage = await cancelClientPackage(parsed.clientPackageId);
    return NextResponse.json({ clientPackage }, { headers: ADMIN_PRIVATE_HEADERS });
  } catch (err) {
    if (err instanceof PolicyError) {
      const status =
        err.code === 'PACKAGE_NOT_FOUND'
          ? 404
          : err.code === 'PACKAGE_ALREADY_REDEEMED'
            ? 409
            : 400;
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message || 'Datos inválidos.' },
        { status: 400, headers: ADMIN_PRIVATE_HEADERS },
      );
    }
    logError('admin_packages_patch_error', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Error actualizando paquete.' },
      { status: 500, headers: ADMIN_PRIVATE_HEADERS },
    );
  }
}
