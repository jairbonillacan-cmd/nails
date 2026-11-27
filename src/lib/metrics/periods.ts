import { formatDateKeyDisplay, getDateKeyInTimezone } from '../format';

export type MetricPeriod = 'today' | '7d' | 'month' | 'last_month' | 'custom' | 'all';
export type MetricReportPeriod = MetricPeriod | '30d' | '90d';

export interface MetricCustomRange {
  fromKey: string;
  toKey: string;
}

export interface MetricDateRange {
  startKey: string | null;
  endKey: string | null;
}

interface MetricPeriodOption<T extends string = MetricPeriod> {
  value: T;
  label: string;
}

export const UNIFIED_PERIOD_OPTIONS: readonly MetricPeriodOption<MetricPeriod>[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: 'month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes pasado' },
  { value: 'custom', label: 'Fechas' },
  { value: 'all', label: 'Todo' },
];

export const DASHBOARD_PERIOD_OPTIONS: readonly MetricPeriodOption<
  'today' | '7d' | 'month' | 'last_month'
>[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: 'month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes pasado' },
];

export const REPORT_PERIOD_OPTIONS: readonly MetricPeriodOption<
  'today' | '7d' | 'month' | 'last_month' | '90d' | 'all'
>[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: 'Últimos 7 días' },
  { value: 'month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes pasado' },
  { value: '90d', label: 'Últimos 90 días' },
  { value: 'all', label: 'Todo' },
];

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isMetricDateKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && DATE_KEY_RE.test(value.trim());
}

export function shiftMetricDateKey(dateKey: string, deltaDays: number): string {
  const parts = dateKey.split('-').map((chunk) => Number.parseInt(chunk, 10));
  const dt = new Date(
    Date.UTC(parts[0] || 2026, (parts[1] || 1) - 1, (parts[2] || 1) + deltaDays, 12, 0, 0),
  );
  return dt.toISOString().slice(0, 10);
}

export function diffMetricCalendarDaysInclusive(startKey: string, endKey: string): number {
  const s = startKey.split('-').map((chunk) => Number.parseInt(chunk, 10));
  const e = endKey.split('-').map((chunk) => Number.parseInt(chunk, 10));
  const startUtc = Date.UTC(s[0] || 2026, (s[1] || 1) - 1, s[2] || 1, 12, 0, 0);
  const endUtc = Date.UTC(e[0] || 2026, (e[1] || 1) - 1, e[2] || 1, 12, 0, 0);
  const diff = Math.round((endUtc - startUtc) / DAY_MS);
  return Math.max(1, diff + 1);
}

function monthStartKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

function previousMonthRange(referenceDateKey: string): MetricDateRange {
  if (!isMetricDateKey(referenceDateKey)) {
    return { startKey: referenceDateKey, endKey: referenceDateKey };
  }
  const lastDayPrev = shiftMetricDateKey(monthStartKey(referenceDateKey), -1);
  return { startKey: monthStartKey(lastDayPrev), endKey: lastDayPrev };
}

export function resolveMetricPeriodRange(
  todayKey: string,
  period: MetricReportPeriod,
  custom?: MetricCustomRange | null,
): MetricDateRange {
  if (period === 'all') return { startKey: null, endKey: null };
  if (period === 'today') return { startKey: todayKey, endKey: todayKey };
  if (period === '7d') return { startKey: shiftMetricDateKey(todayKey, -6), endKey: todayKey };
  if (period === '30d') return { startKey: shiftMetricDateKey(todayKey, -29), endKey: todayKey };
  if (period === '90d') return { startKey: shiftMetricDateKey(todayKey, -89), endKey: todayKey };
  if (period === 'month') {
    return {
      startKey: isMetricDateKey(todayKey) ? monthStartKey(todayKey) : todayKey,
      endKey: todayKey,
    };
  }
  if (period === 'last_month') {
    return previousMonthRange(todayKey);
  }
  const from = isMetricDateKey(custom?.fromKey) ? custom.fromKey.trim() : null;
  const to = isMetricDateKey(custom?.toKey) ? custom.toKey.trim() : null;
  if (from && to && from > to) return { startKey: to, endKey: from };
  return { startKey: from, endKey: to };
}

export function resolvePreviousMetricPeriodRange(
  todayKey: string,
  period: MetricReportPeriod,
  custom?: MetricCustomRange | null,
): MetricDateRange | null {
  if (period === 'all') return null;
  if (period === 'month') {
    return previousMonthRange(todayKey);
  }
  if (period === 'last_month') {
    const prev = previousMonthRange(todayKey);
    return prev.startKey ? previousMonthRange(prev.startKey) : null;
  }
  const current = resolveMetricPeriodRange(todayKey, period, custom);
  if (!current.startKey || !current.endKey) return null;
  const spanDays = diffMetricCalendarDaysInclusive(current.startKey, current.endKey);
  const prevEndKey = shiftMetricDateKey(current.startKey, -1);
  const prevStartKey = shiftMetricDateKey(prevEndKey, -(spanDays - 1));
  return { startKey: prevStartKey, endKey: prevEndKey };
}

function formatRangeKeyShort(key: string): string {
  return formatDateKeyDisplay(key, 'short').replace(/^[^,]+,\s*/, '');
}

export function formatMetricPeriodLabel(
  period: MetricReportPeriod,
  custom?: MetricCustomRange | null,
  todayKey?: string,
): string {
  if (period === 'today') return 'Hoy';
  if (period === '7d') return 'Últimos 7 días';
  if (period === '30d') return 'Últimos 30 días';
  if (period === '90d') return 'Últimos 90 días';
  if (period === 'month') return 'Este mes';
  if (period === 'last_month') return 'Mes pasado';
  if (period === 'all') return 'Histórico';
  const range = resolveMetricPeriodRange(todayKey ?? '', 'custom', custom);
  if (range.startKey && range.endKey) {
    return range.startKey === range.endKey
      ? formatRangeKeyShort(range.startKey)
      : `${formatRangeKeyShort(range.startKey)} – ${formatRangeKeyShort(range.endKey)}`;
  }
  if (range.startKey) return `Desde ${formatRangeKeyShort(range.startKey)}`;
  if (range.endKey) return `Hasta ${formatRangeKeyShort(range.endKey)}`;
  return 'Rango personalizado';
}

export function formatMetricCompareLabel(period: MetricReportPeriod): string {
  if (period === 'today') return 'vs ayer';
  if (period === '7d') return 'vs 7 días previos';
  if (period === '30d') return 'vs 30 días previos';
  if (period === '90d') return 'vs 90 días previos';
  if (period === 'month') return 'vs mes pasado';
  if (period === 'last_month') return 'vs mes previo';
  if (period === 'custom') return 'vs periodo previo';
  return 'histórico';
}

export function isIsoInMetricRange(
  iso: string,
  range: MetricDateRange,
  tz: string,
): boolean {
  if (!range.startKey && !range.endKey) return true;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  const entryKey = getDateKeyInTimezone(parsed, tz);
  if (range.startKey && entryKey < range.startKey) return false;
  if (range.endKey && entryKey > range.endKey) return false;
  return true;
}

export function isIsoInMetricPeriod(
  iso: string,
  todayKey: string,
  tz: string,
  period: MetricReportPeriod,
  custom?: MetricCustomRange | null,
): boolean {
  return isIsoInMetricRange(iso, resolveMetricPeriodRange(todayKey, period, custom), tz);
}

const VALID_REPORT_PERIODS = new Set<MetricReportPeriod>([
  'today',
  '7d',
  '30d',
  '90d',
  'month',
  'last_month',
  'custom',
  'all',
]);

const VALID_METRIC_PERIODS = new Set<MetricPeriod>([
  'today',
  '7d',
  'month',
  'last_month',
  'custom',
  'all',
]);

export function isMetricPeriod(value: string | null | undefined): value is MetricPeriod {
  return typeof value === 'string' && VALID_METRIC_PERIODS.has(value as MetricPeriod);
}

export function isMetricReportPeriod(
  value: string | null | undefined,
): value is MetricReportPeriod {
  return typeof value === 'string' && VALID_REPORT_PERIODS.has(value as MetricReportPeriod);
}
