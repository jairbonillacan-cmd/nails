export interface MexicoHoliday {
  date: string;
  name: string;
}

const PLAIN_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function formatUtcYmd(year: number, month1Based: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month1Based).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parsePlainDateToUtcNoonMs(dateStr: string): number {
  const match = PLAIN_DATE_RE.exec(dateStr.trim());
  if (!match) {
    throw new Error(`Fecha inválida (usa formato YYYY-MM-DD): ${dateStr}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const roundTrip = new Date(ms).toISOString().slice(0, 10);
  if (roundTrip !== dateStr.trim()) {
    throw new Error(`Fecha inexistente en calendario: ${dateStr}`);
  }
  return ms;
}

function getNthWeekdayOfMonth(
  year: number,
  month1Based: number,
  weekday0Sun: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  nth: number,
): string {
  const firstDow = new Date(Date.UTC(year, month1Based - 1, 1, 12, 0, 0, 0)).getUTCDay();
  const offset = (weekday0Sun - firstDow + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  return formatUtcYmd(year, month1Based, day);
}

export function getMexicoOfficialHolidays(year: number): MexicoHoliday[] {
  const safeYear = Math.trunc(year);
  if (!Number.isFinite(safeYear) || safeYear < 1970 || safeYear > 2100) {
    throw new Error('Año fuera del rango soportado (1970-2100).');
  }
  return [
    { date: formatUtcYmd(safeYear, 1, 1), name: 'Año Nuevo' },
    {
      date: getNthWeekdayOfMonth(safeYear, 2, 1, 1),
      name: 'Día de la Constitución',
    },
    {
      date: getNthWeekdayOfMonth(safeYear, 3, 1, 3),
      name: 'Natalicio de Benito Juárez',
    },
    { date: formatUtcYmd(safeYear, 5, 1), name: 'Día del Trabajo' },
    { date: formatUtcYmd(safeYear, 9, 16), name: 'Día de la Independencia' },
    {
      date: getNthWeekdayOfMonth(safeYear, 11, 1, 3),
      name: 'Revolución Mexicana',
    },
    { date: formatUtcYmd(safeYear, 12, 25), name: 'Navidad' },
  ];
}

export function expandPlainDateRange(
  startDate: string,
  endDate: string,
  maxDays = 31,
): string[] {
  const safeMax = Math.max(1, Math.floor(maxDays));
  const startMs = parsePlainDateToUtcNoonMs(startDate);
  const endMs = parsePlainDateToUtcNoonMs(endDate);
  if (endMs < startMs) {
    throw new Error('La fecha final debe ser igual o posterior a la fecha inicial.');
  }
  const dayCount = Math.round((endMs - startMs) / 86_400_000) + 1;
  if (dayCount > safeMax) {
    throw new Error(`El rango máximo permitido es de ${safeMax} días.`);
  }
  const dates: string[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    dates.push(new Date(startMs + i * 86_400_000).toISOString().slice(0, 10));
  }
  return dates;
}
