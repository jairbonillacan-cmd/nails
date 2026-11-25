import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  createSupabaseAdminClient,
  isSupabaseEnabled,
} from '../repositories/supabase-client';

export const MAX_MEDIA_BYTES = 2_500_000;

export type AllowedMediaMime = 'image/png' | 'image/jpeg' | 'image/webp';
export type MediaFolder = 'inspo' | 'proofs';

export type MediaValidationErrorCode =
  | 'INVALID_FORMAT'
  | 'UNSUPPORTED_MIME'
  | 'MAGIC_BYTE_MISMATCH'
  | 'FILE_TOO_LARGE'
  | 'EMPTY_FILE';

export class MediaValidationError extends Error {
  readonly code: MediaValidationErrorCode;

  constructor(code: MediaValidationErrorCode, message: string) {
    super(message);
    this.name = 'MediaValidationError';
    this.code = code;
  }
}

export interface ValidatedMedia {
  buffer: Buffer;
  contentType: AllowedMediaMime;
  extension: 'png' | 'jpg' | 'webp';
  sizeBytes: number;
}

export interface StoredMediaResult {
  storagePath: string;
  contentType: AllowedMediaMime;
  sizeBytes: number;
  signedUrl?: string;
}

const MIME_TO_EXT: Record<AllowedMediaMime, 'png' | 'jpg' | 'webp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const DATA_URL_RE = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\r\n]+)$/i;
const DEFAULT_DEMO_UPLOADS_DIR = path.join(process.cwd(), '.nails-demo-uploads');
const SUPABASE_MEDIA_BUCKET = 'salon-media';
const SIGNED_URL_TTL_SECONDS = 3600;

function isAllowedMime(value: string): value is AllowedMediaMime {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';
}

export function detectImageMimeFromMagicBytes(
  buffer: Buffer,
): AllowedMediaMime | null {
  if (
    buffer.byteLength >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.byteLength >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }

  if (
    buffer.byteLength >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

export function validateMediaBuffer(
  buffer: Buffer,
  declaredMimeType?: string,
): ValidatedMedia {
  if (buffer.byteLength === 0) {
    throw new MediaValidationError('EMPTY_FILE', 'El archivo de imagen está vacío.');
  }
  if (buffer.byteLength > MAX_MEDIA_BYTES) {
    throw new MediaValidationError(
      'FILE_TOO_LARGE',
      'La imagen supera el límite máximo permitido de 2.5 MB.',
    );
  }

  const normalizedDeclared = declaredMimeType?.trim().toLowerCase();
  if (normalizedDeclared && !isAllowedMime(normalizedDeclared)) {
    throw new MediaValidationError(
      'UNSUPPORTED_MIME',
      'Formato no permitido. Usa únicamente PNG, JPEG o WEBP.',
    );
  }

  const detected = detectImageMimeFromMagicBytes(buffer);
  if (!detected) {
    throw new MediaValidationError(
      'MAGIC_BYTE_MISMATCH',
      'El contenido del archivo no corresponde a una imagen PNG, JPEG o WEBP válida.',
    );
  }

  if (normalizedDeclared && normalizedDeclared !== detected) {
    throw new MediaValidationError(
      'MAGIC_BYTE_MISMATCH',
      'El tipo MIME declarado no coincide con la firma binaria de la imagen.',
    );
  }

  return {
    buffer,
    contentType: detected,
    extension: MIME_TO_EXT[detected],
    sizeBytes: buffer.byteLength,
  };
}

export function validateMediaDataUrl(dataUrl: string): ValidatedMedia {
  const trimmed = dataUrl.trim();
  const match = DATA_URL_RE.exec(trimmed);
  if (!match) {
    throw new MediaValidationError(
      'INVALID_FORMAT',
      'Formato de imagen inválido; se esperaba un data URL base64 de imagen.',
    );
  }

  const declaredMime = (match[1] ?? '').toLowerCase();
  if (!isAllowedMime(declaredMime)) {
    throw new MediaValidationError(
      'UNSUPPORTED_MIME',
      'Formato no permitido. Usa únicamente PNG, JPEG o WEBP.',
    );
  }

  const cleanBase64 = (match[2] ?? '').replace(/[\r\n]/g, '');
  if (!cleanBase64 || cleanBase64.length % 4 !== 0) {
    throw new MediaValidationError(
      'INVALID_FORMAT',
      'Contenido base64 mal formado.',
    );
  }

  const estimatedBytes = Math.floor((cleanBase64.length * 3) / 4);
  if (estimatedBytes > MAX_MEDIA_BYTES + 4) {
    throw new MediaValidationError(
      'FILE_TOO_LARGE',
      'La imagen supera el límite máximo permitido de 2.5 MB.',
    );
  }

  const buffer = Buffer.from(cleanBase64, 'base64');
  return validateMediaBuffer(buffer, declaredMime);
}

function writeDemoMediaFile(
  folder: MediaFolder,
  fileName: string,
  buffer: Buffer,
): void {
  if (process.env.NODE_ENV === 'test') {
    const customDir = process.env.NAILS_DEMO_UPLOADS_DIR?.trim();
    if (customDir) {
      const targetDir = path.join(customDir, folder);
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(path.join(targetDir, fileName), buffer);
      return;
    }
  }
  const targetDir = path.join(DEFAULT_DEMO_UPLOADS_DIR, folder);
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, fileName), buffer);
}

export async function storeMediaUpload(
  input:
    | { dataUrl: string; folder: MediaFolder }
    | { buffer: Buffer; declaredMimeType?: string; folder: MediaFolder },
): Promise<StoredMediaResult> {
  const validated =
    'dataUrl' in input
      ? validateMediaDataUrl(input.dataUrl)
      : validateMediaBuffer(input.buffer, input.declaredMimeType);

  const fileName = `${crypto.randomUUID()}.${validated.extension}`;
  const objectPath = `${input.folder}/${fileName}`;

  if (isSupabaseEnabled()) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.storage
      .from(SUPABASE_MEDIA_BUCKET)
      .upload(objectPath, validated.buffer, {
        contentType: validated.contentType,
        upsert: false,
      });

    if (error) {
      throw new Error(`No se pudo subir la imagen a Storage: ${error.message}`);
    }

    const { data: signedData } = await supabase.storage
      .from(SUPABASE_MEDIA_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);

    return {
      storagePath: objectPath,
      signedUrl: signedData?.signedUrl,
      contentType: validated.contentType,
      sizeBytes: validated.sizeBytes,
    };
  }

  writeDemoMediaFile(input.folder, fileName, validated.buffer);

  return {
    storagePath: objectPath,
    contentType: validated.contentType,
    sizeBytes: validated.sizeBytes,
  };
}
