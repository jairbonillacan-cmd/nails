export const NAIL_SHAPES = ['Almendra', 'Coffin', 'Cuadrada', 'Stiletto'] as const;
export type NailShape = (typeof NAIL_SHAPES)[number];

export const NAIL_LENGTHS = ['Corto', 'Medio', 'Largo'] as const;
export type NailLength = (typeof NAIL_LENGTHS)[number];

export const NAIL_BASES = ['Rubber', 'Acrílico', 'Gel'] as const;
export type NailBase = (typeof NAIL_BASES)[number];

export const NAIL_ALERTS = [
  'Cutícula sensible',
  'Alergia a acetona',
  'Uña delgada',
] as const;
export type NailAlert = (typeof NAIL_ALERTS)[number];

export interface NailTechProfile {
  shape: NailShape | null;
  length: NailLength | null;
  base: NailBase | null;
  alerts: NailAlert[];
}

export interface ParsedNailTechNotes {
  profile: NailTechProfile;
  freeNotes: string;
}

export interface NailTechBadge {
  label: string;
  tone: 'neutral' | 'warning';
}

const TECH_HEADER_RE = /^\s*\[Ficha t[eé]cnica\]\s*(.*)$/i;

function normalizeMatchKey(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function matchOption<T extends string>(raw: string, options: readonly T[]): T | null {
  const target = normalizeMatchKey(raw);
  if (!target) return null;
  for (const option of options) {
    if (normalizeMatchKey(option) === target) return option;
  }
  return null;
}

function normalizeAlerts(alerts: readonly NailAlert[]): NailAlert[] {
  const set = new Set<NailAlert>(alerts);
  return NAIL_ALERTS.filter((alert) => set.has(alert));
}

function createEmptyProfile(): NailTechProfile {
  return {
    shape: null,
    length: null,
    base: null,
    alerts: [],
  };
}

export function parseNailTechNotes(rawNotes: string): ParsedNailTechNotes {
  const trimmed = rawNotes.trim();
  if (!trimmed) {
    return { profile: createEmptyProfile(), freeNotes: '' };
  }

  const lines = trimmed.split(/\r?\n/);
  const firstLine = lines[0] ?? '';
  const match = TECH_HEADER_RE.exec(firstLine);
  if (!match) {
    return { profile: createEmptyProfile(), freeNotes: trimmed };
  }

  const payload = (match[1] ?? '').trim();
  const profile = createEmptyProfile();
  const parsedAlerts: NailAlert[] = [];

  for (const segment of payload.split(/[·|]/)) {
    const clean = segment.trim();
    const colonIdx = clean.indexOf(':');
    if (colonIdx <= 0) continue;
    const rawKey = normalizeMatchKey(clean.slice(0, colonIdx));
    const rawVal = clean.slice(colonIdx + 1).trim();
    if (!rawVal) continue;

    if (rawKey === 'forma') {
      profile.shape = matchOption(rawVal, NAIL_SHAPES);
    } else if (rawKey === 'largo') {
      profile.length = matchOption(rawVal, NAIL_LENGTHS);
    } else if (rawKey === 'base' || rawKey === 'base favorita') {
      profile.base = matchOption(rawVal, NAIL_BASES);
    } else if (rawKey === 'alertas' || rawKey === 'alerta') {
      for (const piece of rawVal.split(/[,;]/)) {
        const matched = matchOption(piece, NAIL_ALERTS);
        if (matched) parsedAlerts.push(matched);
      }
    }
  }

  profile.alerts = normalizeAlerts(parsedAlerts);
  const freeNotes = lines.slice(1).join('\n').trim();
  return { profile, freeNotes };
}

export function serializeNailTechNotes(profile: NailTechProfile, freeNotes: string): string {
  const segments: string[] = [];
  if (profile.shape) segments.push(`Forma: ${profile.shape}`);
  if (profile.length) segments.push(`Largo: ${profile.length}`);
  if (profile.base) segments.push(`Base: ${profile.base}`);
  const orderedAlerts = normalizeAlerts(profile.alerts);
  if (orderedAlerts.length > 0) {
    segments.push(`Alertas: ${orderedAlerts.join(', ')}`);
  }

  const cleanNotes = freeNotes.trim();
  if (segments.length === 0) {
    return cleanNotes;
  }

  const header = `[Ficha técnica] ${segments.join(' · ')}`;
  return cleanNotes ? `${header}\n\n${cleanNotes}` : header;
}

export function formatNailTechBadges(profile: NailTechProfile): NailTechBadge[] {
  const badges: NailTechBadge[] = [];
  if (profile.shape) badges.push({ label: profile.shape, tone: 'neutral' });
  if (profile.length) badges.push({ label: profile.length, tone: 'neutral' });
  if (profile.base) badges.push({ label: profile.base, tone: 'neutral' });
  for (const alert of normalizeAlerts(profile.alerts)) {
    badges.push({ label: alert, tone: 'warning' });
  }
  return badges;
}
