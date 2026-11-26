import { NextRequest, NextResponse } from 'next/server';
import { constantTimeEqual, requireAdmin } from '@/lib/auth/admin-session';
import { readClientPortalSession } from '@/lib/auth/client-portal-otp';
import { normalizePhoneE164 } from '@/lib/format';
import { logError } from '@/lib/logger';
import { getMediaAccessOwner } from '@/lib/repositories/db';
import {
  parseSafeMediaPath,
  readStoredMedia,
  verifyMediaSignature,
} from '@/lib/storage/media';
import type { MediaAccessOwner } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const url = new URL(request.url);
  const rawPathname = url.pathname;
  if (
    rawPathname.includes('..') ||
    rawPathname.includes('\\') ||
    rawPathname.toLowerCase().includes('%2e') ||
    rawPathname.toLowerCase().includes('%5c') ||
    rawPathname.includes('\0')
  ) {
    return NextResponse.json({ error: 'Ruta de archivo inválida.' }, { status: 400 });
  }

  const { path: segments } = await context.params;
  if (!Array.isArray(segments) || segments.length !== 2) {
    return NextResponse.json({ error: 'Ruta de archivo inválida.' }, { status: 400 });
  }

  const folder = segments[0] ?? '';
  const fileName = segments[1] ?? '';
  const parsed = parseSafeMediaPath(`${folder}/${fileName}`);
  if (!parsed) {
    return NextResponse.json({ error: 'Archivo no permitido.' }, { status: 400 });
  }

  const storagePath = parsed.storagePath;
  let ownerLoaded = false;
  let ownerRecord: MediaAccessOwner | null = null;
  async function loadOwner(): Promise<MediaAccessOwner | null> {
    if (!ownerLoaded) {
      ownerLoaded = true;
      ownerRecord = await getMediaAccessOwner(storagePath);
    }
    return ownerRecord;
  }

  let authorized = false;
  let forbiddenAttempt = false;

  const adminSession = await requireAdmin(undefined, request);
  if (adminSession) {
    if (adminSession.user.role === 'owner' || adminSession.user.role === 'admin') {
      authorized = true;
    } else {
      const owner = await loadOwner();
      if (
        owner?.staffId &&
        adminSession.user.staffMemberId &&
        owner.staffId === adminSession.user.staffMemberId
      ) {
        authorized = true;
      } else {
        forbiddenAttempt = true;
      }
    }
  }

  if (!authorized) {
    const expParam = url.searchParams.get('exp');
    const sigParam = url.searchParams.get('sig');
    if (expParam !== null && sigParam !== null) {
      if (verifyMediaSignature(storagePath, expParam, sigParam)) {
        authorized = true;
      }
    }
  }

  if (!authorized) {
    const tokenParam = url.searchParams.get('token')?.trim() ?? '';
    if (tokenParam.length > 0) {
      const owner = await loadOwner();
      if (owner?.manageToken && constantTimeEqual(tokenParam, owner.manageToken)) {
        authorized = true;
      } else {
        forbiddenAttempt = true;
      }
    }
  }

  if (!authorized) {
    const portalSession = await readClientPortalSession(request);
    if (portalSession) {
      const owner = await loadOwner();
      if (
        owner?.clientPhoneE164 &&
        constantTimeEqual(
          normalizePhoneE164(portalSession.phoneE164),
          normalizePhoneE164(owner.clientPhoneE164),
        )
      ) {
        authorized = true;
      } else {
        forbiddenAttempt = true;
      }
    }
  }

  if (!authorized) {
    if (forbiddenAttempt) {
      return NextResponse.json({ error: 'Acceso denegado.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  try {
    const readResult = await readStoredMedia(storagePath);
    if (readResult.status !== 200) {
      const errorMessage =
        readResult.status === 404
          ? 'Archivo no encontrado.'
          : readResult.status === 403
            ? 'Acceso denegado.'
            : 'Contenido de imagen inválido.';
      return NextResponse.json({ error: errorMessage }, { status: readResult.status });
    }

    return new NextResponse(new Uint8Array(readResult.bytes), {
      status: 200,
      headers: {
        'Content-Type': readResult.contentType,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Content-Disposition': `inline; filename="${parsed.fileName}"`,
        'Cache-Control': 'private, max-age=300, no-store',
        Vary: 'Cookie',
      },
    });
  } catch (err) {
    logError('media_route_read_failed', { storagePath, error: err });
    return NextResponse.json(
      { error: 'Error al obtener la imagen.' },
      { status: 500 },
    );
  }
}
