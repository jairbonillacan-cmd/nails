import crypto from 'node:crypto';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { AwsClient } from 'aws4fetch';

export const MAX_MEDIA_BYTES = 2_500_000;

export type AllowedMediaMime = 'image/png' | 'image/jpeg' | 'image/webp';
export type MediaFolder = 'inspo' | 'proofs' | 'gallery';
export type MediaStorageDriver = 'r2_binding' | 'r2_s3' | 'demo_local';

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

export interface ParsedMediaPath {
  folder: MediaFolder;
  fileName: string;
  storagePath: string;
  expectedMime: AllowedMediaMime;
}

export type ReadStoredMediaResult =
  | { status: 200; bytes: Buffer; contentType: AllowedMediaMime; driver: MediaStorageDriver }
  | { status: 400 | 403 | 404 };

interface R2ObjectBodyLike {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBodyLike | null>;
  delete(key: string): Promise<void>;
}

interface R2S3Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

declare global {
  var nailsEphemeralMediaSigningSecret: string | undefined;
}

const MIME_TO_EXT: Record<AllowedMediaMime, 'png' | 'jpg' | 'webp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const EXT_TO_MIME: Record<string, AllowedMediaMime> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

const DATA_URL_RE = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\r\n]+)$/i;
const SAFE_FILENAME_RE = /^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/;
const SAFE_ACCOUNT_ID_RE = /^[a-zA-Z0-9_-]+$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const DIGITS_ONLY_RE = /^\d+$/;
const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;
const MEDIA_SIGNING_PURPOSE = 'media-url:v1';

function isAllowedMime(value: string): value is AllowedMediaMime {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/webp';
}

function isAllowedFolder(value: string): value is MediaFolder {
  return value === 'inspo' || value === 'proofs' || value === 'gallery';
}

function isR2BucketLike(value: unknown): value is R2BucketLike {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return (
    typeof Reflect.get(value, 'put') === 'function' &&
    typeof Reflect.get(value, 'get') === 'function' &&
    typeof Reflect.get(value, 'delete') === 'function'
  );
}

function getNativeR2Bucket(): R2BucketLike | null {
  try {
    const ctx = getCloudflareContext();
    const env: unknown = ctx?.env;
    if (!env || typeof env !== 'object') {
      return null;
    }
    const candidate: unknown = Reflect.get(env, 'SALON_MEDIA_BUCKET');
    return isR2BucketLike(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function getR2S3Config(): R2S3Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }
  if (!SAFE_ACCOUNT_ID_RE.test(accountId)) {
    return null;
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

function buildR2ObjectUrl(cfg: R2S3Config, parsed: ParsedMediaPath): string {
  return `https://${cfg.accountId}.r2.cloudflarestorage.com/${encodeURIComponent(cfg.bucketName)}/${parsed.folder}/${encodeURIComponent(parsed.fileName)}`;
}

function createR2S3Client(cfg: R2S3Config): AwsClient {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
}

function getMediaSigningSecret(): string | null {
  const configured =
    process.env.CLIENT_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    return null;
  }
  if (!globalThis.nailsEphemeralMediaSigningSecret) {
    globalThis.nailsEphemeralMediaSigningSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalThis.nailsEphemeralMediaSigningSecret;
}

function deriveMediaSigningKey(secret: string): Buffer {
  return crypto
    .createHmac('sha256', secret)
    .update(MEDIA_SIGNING_PURPOSE, 'utf8')
    .digest();
}

export function parseSafeMediaPath(rawPath: string): ParsedMediaPath | null {
  const trimmed = rawPath.trim();
  if (
    !trimmed ||
    trimmed.includes('..') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0') ||
    trimmed.toLowerCase().includes('%2e') ||
    trimmed.toLowerCase().includes('%5c') ||
    trimmed.startsWith('/') ||
    trimmed.endsWith('/')
  ) {
    return null;
  }

  const segments = trimmed.split('/');
  if (segments.length !== 2) {
    return null;
  }

  const folder = segments[0] ?? '';
  const fileName = segments[1] ?? '';

  if (!isAllowedFolder(folder) || !SAFE_FILENAME_RE.test(fileName)) {
    return null;
  }

  const dotIdx = fileName.lastIndexOf('.');
  const ext = dotIdx >= 0 ? fileName.slice(dotIdx + 1).toLowerCase() : '';
  const expectedMime = EXT_TO_MIME[ext];
  if (!expectedMime) {
    return null;
  }

  return {
    folder,
    fileName,
    storagePath: `${folder}/${fileName}`,
    expectedMime,
  };
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

export function signMediaUrl(
  storagePath: string,
  options?: { ttlSeconds?: number; nowMs?: number },
): string | null {
  const parsed = parseSafeMediaPath(storagePath);
  if (!parsed) {
    return null;
  }

  const secret = getMediaSigningSecret();
  if (!secret) {
    return null;
  }

  const ttlSeconds = options?.ttlSeconds ?? DEFAULT_SIGNED_URL_TTL_SECONDS;
  const nowMs = options?.nowMs ?? Date.now();
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || !Number.isFinite(nowMs)) {
    return null;
  }

  const exp = Math.floor(nowMs / 1000) + Math.floor(ttlSeconds);
  const key = deriveMediaSigningKey(secret);
  const sig = crypto
    .createHmac('sha256', key)
    .update(`${parsed.storagePath}:${exp}`, 'utf8')
    .digest('base64url');

  return `/api/media/${parsed.storagePath}?exp=${exp}&sig=${sig}`;
}

export function verifyMediaSignature(
  storagePath: string,
  expStr: string | null | undefined,
  sigStr: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  const parsed = parseSafeMediaPath(storagePath);
  if (!parsed) {
    return false;
  }

  if (
    !expStr ||
    !sigStr ||
    !DIGITS_ONLY_RE.test(expStr) ||
    !BASE64URL_RE.test(sigStr) ||
    !Number.isFinite(nowMs)
  ) {
    return false;
  }

  const exp = Number(expStr);
  if (!Number.isSafeInteger(exp) || exp * 1000 <= nowMs) {
    return false;
  }

  const secret = getMediaSigningSecret();
  if (!secret) {
    return false;
  }

  const key = deriveMediaSigningKey(secret);
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${parsed.storagePath}:${exp}`, 'utf8')
    .digest();

  const provided = Buffer.from(sigStr, 'base64url');
  if (
    provided.length !== expected.length ||
    provided.toString('base64url') !== sigStr
  ) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

async function resolveDemoUploadsRoot(): Promise<{
  fs: typeof import('node:fs/promises');
  path: typeof import('node:path');
  rootDir: string;
}> {
  const [fs, path] = await Promise.all([
    import('node:fs/promises'),
    import('node:path'),
  ]);

  if (process.env.NODE_ENV === 'test') {
    const customDir = process.env.NAILS_DEMO_UPLOADS_DIR?.trim();
    if (customDir) {
      return { fs, path, rootDir: path.resolve(customDir) };
    }
  }

  return { fs, path, rootDir: path.resolve(process.cwd(), '.nails-demo-uploads') };
}

async function writeDemoMediaFile(
  parsed: ParsedMediaPath,
  buffer: Buffer,
): Promise<void> {
  const { fs, path, rootDir } = await resolveDemoUploadsRoot();
  const folderDir = path.resolve(rootDir, parsed.folder);
  if (!folderDir.startsWith(rootDir + path.sep)) {
    throw new MediaValidationError('INVALID_FORMAT', 'Ruta de archivo inválida.');
  }
  const targetPath = path.resolve(folderDir, parsed.fileName);
  if (!targetPath.startsWith(folderDir + path.sep)) {
    throw new MediaValidationError('INVALID_FORMAT', 'Ruta de archivo inválida.');
  }
  await fs.mkdir(folderDir, { recursive: true });
  await fs.writeFile(targetPath, buffer);
}

async function readDemoMediaFile(
  parsed: ParsedMediaPath,
): Promise<ReadStoredMediaResult> {
  const { fs, path, rootDir } = await resolveDemoUploadsRoot();
  const folderDir = path.resolve(rootDir, parsed.folder);
  if (!folderDir.startsWith(rootDir + path.sep)) {
    return { status: 403 };
  }
  const targetPath = path.resolve(folderDir, parsed.fileName);
  if (!targetPath.startsWith(folderDir + path.sep)) {
    return { status: 403 };
  }

  let folderStat: Awaited<ReturnType<typeof fs.lstat>>;
  let fileStat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    folderStat = await fs.lstat(folderDir);
    fileStat = await fs.lstat(targetPath);
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

  const realFolder = await fs.realpath(folderDir);
  const realFile = await fs.realpath(targetPath);
  if (!realFile.startsWith(realFolder + path.sep)) {
    return { status: 403 };
  }

  const bytes = await fs.readFile(realFile);
  const detectedMime = detectImageMimeFromMagicBytes(bytes);
  if (!detectedMime || detectedMime !== parsed.expectedMime) {
    return { status: 400 };
  }

  return {
    status: 200,
    bytes,
    contentType: detectedMime,
    driver: 'demo_local',
  };
}

async function deleteDemoMediaFile(parsed: ParsedMediaPath): Promise<boolean> {
  const { fs, path, rootDir } = await resolveDemoUploadsRoot();
  const folderDir = path.resolve(rootDir, parsed.folder);
  if (!folderDir.startsWith(rootDir + path.sep)) {
    throw new MediaValidationError('INVALID_FORMAT', 'Ruta de archivo inválida.');
  }
  const targetPath = path.resolve(folderDir, parsed.fileName);
  if (!targetPath.startsWith(folderDir + path.sep)) {
    throw new MediaValidationError('INVALID_FORMAT', 'Ruta de archivo inválida.');
  }

  let folderStat: Awaited<ReturnType<typeof fs.lstat>>;
  let fileStat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    folderStat = await fs.lstat(folderDir);
    fileStat = await fs.lstat(targetPath);
  } catch {
    return false;
  }

  if (
    !folderStat.isDirectory() ||
    folderStat.isSymbolicLink() ||
    !fileStat.isFile() ||
    fileStat.isSymbolicLink()
  ) {
    return false;
  }

  const realFolder = await fs.realpath(folderDir);
  const realFile = await fs.realpath(targetPath);
  if (!realFile.startsWith(realFolder + path.sep)) {
    return false;
  }

  try {
    await fs.unlink(realFile);
    return true;
  } catch {
    return false;
  }
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
  const parsed = parseSafeMediaPath(objectPath);
  if (!parsed) {
    throw new MediaValidationError('INVALID_FORMAT', 'Ruta de archivo inválida.');
  }

  const nativeBucket = getNativeR2Bucket();
  if (nativeBucket) {
    await nativeBucket.put(parsed.storagePath, new Uint8Array(validated.buffer), {
      httpMetadata: { contentType: validated.contentType },
    });
    const signedUrl = signMediaUrl(parsed.storagePath) ?? undefined;
    return {
      storagePath: parsed.storagePath,
      contentType: validated.contentType,
      sizeBytes: validated.sizeBytes,
      ...(signedUrl ? { signedUrl } : {}),
    };
  }

  const r2S3Config = getR2S3Config();
  if (r2S3Config) {
    const client = createR2S3Client(r2S3Config);
    const response = await client.fetch(buildR2ObjectUrl(r2S3Config, parsed), {
      method: 'PUT',
      headers: {
        'Content-Type': validated.contentType,
      },
      body: new Uint8Array(validated.buffer),
    });
    if (!response.ok) {
      throw new Error(`No se pudo subir la imagen a Cloudflare R2 (HTTP ${response.status}).`);
    }
    const signedUrl = signMediaUrl(parsed.storagePath) ?? undefined;
    return {
      storagePath: parsed.storagePath,
      contentType: validated.contentType,
      sizeBytes: validated.sizeBytes,
      ...(signedUrl ? { signedUrl } : {}),
    };
  }

  await writeDemoMediaFile(parsed, validated.buffer);

  return {
    storagePath: parsed.storagePath,
    contentType: validated.contentType,
    sizeBytes: validated.sizeBytes,
  };
}

export async function readStoredMedia(
  storagePath: string,
): Promise<ReadStoredMediaResult> {
  const parsed = parseSafeMediaPath(storagePath);
  if (!parsed) {
    return { status: 400 };
  }

  const nativeBucket = getNativeR2Bucket();
  if (nativeBucket) {
    const obj = await nativeBucket.get(parsed.storagePath);
    if (!obj) {
      return { status: 404 };
    }
    const bytes = Buffer.from(await obj.arrayBuffer());
    const detectedMime = detectImageMimeFromMagicBytes(bytes);
    if (!detectedMime || detectedMime !== parsed.expectedMime) {
      return { status: 400 };
    }
    return {
      status: 200,
      bytes,
      contentType: detectedMime,
      driver: 'r2_binding',
    };
  }

  const r2S3Config = getR2S3Config();
  if (r2S3Config) {
    const client = createR2S3Client(r2S3Config);
    const response = await client.fetch(buildR2ObjectUrl(r2S3Config, parsed), {
      method: 'GET',
    });
    if (response.status === 404) {
      return { status: 404 };
    }
    if (!response.ok) {
      throw new Error(`No se pudo leer la imagen desde Cloudflare R2 (HTTP ${response.status}).`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const detectedMime = detectImageMimeFromMagicBytes(bytes);
    if (!detectedMime || detectedMime !== parsed.expectedMime) {
      return { status: 400 };
    }
    return {
      status: 200,
      bytes,
      contentType: detectedMime,
      driver: 'r2_s3',
    };
  }

  return readDemoMediaFile(parsed);
}

export async function deleteStoredMedia(
  storagePath: string,
): Promise<{ deleted: boolean; driver: MediaStorageDriver }> {
  const parsed = parseSafeMediaPath(storagePath);
  if (!parsed) {
    throw new MediaValidationError('INVALID_FORMAT', 'Ruta de archivo inválida.');
  }

  const nativeBucket = getNativeR2Bucket();
  if (nativeBucket) {
    await nativeBucket.delete(parsed.storagePath);
    return { deleted: true, driver: 'r2_binding' };
  }

  const r2S3Config = getR2S3Config();
  if (r2S3Config) {
    const client = createR2S3Client(r2S3Config);
    const response = await client.fetch(buildR2ObjectUrl(r2S3Config, parsed), {
      method: 'DELETE',
    });
    if (response.status === 404) {
      return { deleted: false, driver: 'r2_s3' };
    }
    if (!response.ok) {
      throw new Error(`No se pudo eliminar la imagen en Cloudflare R2 (HTTP ${response.status}).`);
    }
    return { deleted: true, driver: 'r2_s3' };
  }

  const deleted = await deleteDemoMediaFile(parsed);
  return { deleted, driver: 'demo_local' };
}
