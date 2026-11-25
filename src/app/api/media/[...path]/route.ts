import fs from 'node:fs';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import {
  detectImageMimeFromMagicBytes,
  type AllowedMediaMime,
  type MediaFolder,
} from '@/lib/storage/media';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DEFAULT_UPLOADS_DIR = path.join(process.cwd(), '.nails-demo-uploads');
const SAFE_FILENAME_RE = /^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/;
const EXT_TO_MIME: Record<string, AllowedMediaMime> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

function isAllowedFolder(value: string): value is MediaFolder {
  return value === 'inspo' || value === 'proofs';
}

function readContainedFile(
  folderDir: string,
  targetPath: string,
): { status: 200; bytes: Buffer } | { status: 403 | 404 } {
  if (!targetPath.startsWith(folderDir + path.sep)) {
    return { status: 403 };
  }

  let folderStat: fs.Stats;
  let fileStat: fs.Stats;
  try {
    folderStat = fs.lstatSync(folderDir);
    fileStat = fs.lstatSync(targetPath);
  } catch {
    return { status: 404 };
  }

  if (!folderStat.isDirectory() || folderStat.isSymbolicLink()) {
    return { status: 403 };
  }
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    return { status: 403 };
  }

  const realFolder = fs.realpathSync(folderDir);
  const realFile = fs.realpathSync(targetPath);
  if (!realFile.startsWith(realFolder + path.sep)) {
    return { status: 403 };
  }

  return { status: 200, bytes: fs.readFileSync(realFile) };
}

function readSafeDemoMediaBytes(
  folder: MediaFolder,
  fileName: string,
): { status: 200; bytes: Buffer } | { status: 403 | 404 } {
  if (process.env.NODE_ENV === 'test') {
    const customDir = process.env.NAILS_DEMO_UPLOADS_DIR?.trim();
    if (customDir) {
      const resolvedRoot = path.resolve(customDir);
      const folderDir = path.resolve(resolvedRoot, folder);
      if (!folderDir.startsWith(resolvedRoot + path.sep)) {
        return { status: 403 };
      }
      return readContainedFile(folderDir, path.resolve(folderDir, fileName));
    }
  }

  const resolvedRoot = path.resolve(DEFAULT_UPLOADS_DIR);
  const folderDir = path.resolve(resolvedRoot, folder);
  if (!folderDir.startsWith(resolvedRoot + path.sep)) {
    return { status: 403 };
  }
  const targetPath = path.resolve(folderDir, fileName);
  if (!targetPath.startsWith(folderDir + path.sep)) {
    return { status: 403 };
  }

  let folderStat: fs.Stats;
  let fileStat: fs.Stats;
  try {
    folderStat = fs.lstatSync(folderDir);
    fileStat = fs.lstatSync(targetPath);
  } catch {
    return { status: 404 };
  }
  if (
    !folderStat.isDirectory() ||
    folderStat.isSymbolicLink() ||
    !fileStat.isFile() ||
    fileStat.isSymbolicLink()
  ) {
    return { status: 403 };
  }

  const realFolder = fs.realpathSync(folderDir);
  const realFile = fs.realpathSync(targetPath);
  if (!realFile.startsWith(realFolder + path.sep)) {
    return { status: 403 };
  }

  return { status: 200, bytes: fs.readFileSync(realFile) };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const rawPathname = new URL(request.url).pathname;
  if (
    rawPathname.includes('..') ||
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

  if (
    !isAllowedFolder(folder) ||
    !SAFE_FILENAME_RE.test(fileName) ||
    path.isAbsolute(fileName)
  ) {
    return NextResponse.json({ error: 'Archivo no permitido.' }, { status: 400 });
  }

  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  const expectedMime = EXT_TO_MIME[ext];
  if (!expectedMime) {
    return NextResponse.json({ error: 'Extensión no permitida.' }, { status: 400 });
  }

  const readResult = readSafeDemoMediaBytes(folder, fileName);
  if (readResult.status !== 200) {
    return NextResponse.json(
      { error: readResult.status === 403 ? 'Acceso denegado.' : 'Archivo no encontrado.' },
      { status: readResult.status },
    );
  }

  const detectedMime = detectImageMimeFromMagicBytes(readResult.bytes);
  if (!detectedMime || detectedMime !== expectedMime) {
    return NextResponse.json({ error: 'Contenido de imagen inválido.' }, { status: 400 });
  }

  return new NextResponse(new Uint8Array(readResult.bytes), {
    status: 200,
    headers: {
      'Content-Type': detectedMime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `inline; filename="${fileName}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
