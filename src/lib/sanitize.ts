const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const CSV_FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;
const CSV_NEEDS_QUOTING_RE = /[",\r\n]/;

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const raw = String(value);
  const neutralized = CSV_FORMULA_PREFIX_RE.test(raw) ? `'${raw}` : raw;
  if (CSV_NEEDS_QUOTING_RE.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function serializeCsv(
  headers: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const headerLine = headers.map((cell) => escapeCsvCell(cell)).join(',');
  const rowLines = rows.map((row) =>
    row.map((cell) => escapeCsvCell(cell)).join(','),
  );
  return [headerLine, ...rowLines].join('\r\n');
}
