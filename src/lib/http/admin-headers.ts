export const ADMIN_PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  Vary: 'Cookie',
} as const;

export function withAdminPrivateHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  if (!extra) {
    return { ...ADMIN_PRIVATE_HEADERS };
  }
  return {
    ...extra,
    ...ADMIN_PRIVATE_HEADERS,
  };
}
