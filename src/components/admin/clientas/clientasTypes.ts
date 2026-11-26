import type {
  InactiveReactivationCandidate,
  UpcomingBirthdayCandidate,
} from '@/lib/campaigns/retention';
import type { CampaignDispatchLog, ClientPackage } from '@/lib/types';

export type ClientsTab = 'directory' | 'retention' | 'loyalty';

export interface ClientPackageRow extends ClientPackage {
  clientName: string;
  serviceName: string;
  remainingSessions: number;
  isExpired: boolean;
}

export interface CampaignsPayload {
  todayKey: string;
  birthdayWindowDays: number;
  inactiveDays: number;
  birthdays: UpcomingBirthdayCandidate[];
  reactivation: InactiveReactivationCandidate[];
  recentDispatches: CampaignDispatchLog[];
}

export interface BannerNotice {
  status: 'success' | 'error';
  title: string;
  whatsappUrl?: string;
}

export interface InactiveClientRow {
  clientId: string;
  fullName: string;
  phoneE164: string;
  instagramHandle: string | null;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  totalVisits: number;
}

export const INACTIVE_DAY_PRESETS = [
  { days: 21, label: '21 días · Retoque' },
  { days: 30, label: '30 días' },
  { days: 45, label: '45 días · Te extrañamos' },
  { days: 60, label: '60 días' },
] as const;

export function formatInstagramDisplay(handle: string): string {
  const clean = handle.trim().replace(/^@+/, '');
  return clean ? `@${clean}` : '';
}

export function formatInstagramUrl(handle: string): string {
  const clean = handle.trim().replace(/^@+/, '');
  return `https://www.instagram.com/${encodeURIComponent(clean)}/`;
}

export function getInitialLetter(fullName: string): string {
  const normalized = fullName
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const first = normalized.charAt(0);
  return /^[A-Z]$/.test(first) ? first : '#';
}

export function resolveClientasTabParam(param: string | null): ClientsTab | null {
  if (param === 'retencion' || param === 'retention') return 'retention';
  if (
    param === 'paquetes' ||
    param === 'packages' ||
    param === 'premios' ||
    param === 'rewards' ||
    param === 'sellos' ||
    param === 'loyalty'
  ) {
    return 'loyalty';
  }
  if (param === 'directorio' || param === 'directory') return 'directory';
  return null;
}
