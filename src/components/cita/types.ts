import type { BookingWithRelations } from '@/lib/types';
import type { PublicServiceDTO, PublicStaffDTO } from '@/lib/public-dto';

export type PublicManageBooking = Omit<BookingWithRelations, 'staff' | 'service'> & {
  staff: PublicStaffDTO;
  service: PublicServiceDTO;
  extraServices?: PublicServiceDTO[];
};

export interface CalendarAddLinks {
  google: string;
  outlook: string;
  office365: string;
  icsDownload: string;
}

export function resolveSafeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

export function isDisplayableMediaUrl(value: string | null | undefined): boolean {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return false;
  return (
    trimmed.startsWith('/api/media/') ||
    trimmed.startsWith('/gallery/') ||
    trimmed.startsWith('/landing/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://')
  );
}
