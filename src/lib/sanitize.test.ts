import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { escapeCsvCell, escapeHtml, serializeCsv } from './sanitize';

function parseRfc4180Cell(serialized: string): string {
  if (serialized.startsWith('"') && serialized.endsWith('"')) {
    return serialized.slice(1, -1).replace(/""/g, '"');
  }
  return serialized;
}

describe('HTML and CSV sanitization helpers (S1 / S2)', () => {
  it('escapeHtml neutralizes XSS vectors and preserves safe text', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
    expect(escapeHtml(`<img src=x onerror='fetch("https://evil.test")'>`)).toBe(
      '&lt;img src=x onerror=&#39;fetch(&quot;https://evil.test&quot;)&#39;&gt;',
    );
    expect(escapeHtml('Sofía & Camila — Uñas "Cat Eye"')).toBe(
      'Sofía &amp; Camila — Uñas &quot;Cat Eye&quot;',
    );
    expect(escapeHtml('')).toBe('');
  });

  it('escapeCsvCell neutralizes all spreadsheet formula prefixes and follows RFC 4180 quoting', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
    expect(escapeCsvCell('')).toBe('');
    expect(escapeCsvCell(0)).toBe('0');
    expect(escapeCsvCell(380.5)).toBe('380.5');
    expect(escapeCsvCell('Manicura Rusa')).toBe('Manicura Rusa');

    expect(escapeCsvCell('Gel, Chrome')).toBe('"Gel, Chrome"');
    expect(escapeCsvCell('Diseño "Cat Eye"')).toBe('"Diseño ""Cat Eye"""');
    expect(escapeCsvCell('Línea 1\nLínea 2')).toBe('"Línea 1\nLínea 2"');

    expect(escapeCsvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeCsvCell('=HYPERLINK("http://evil.test","Abrir")')).toBe(
      `"'=HYPERLINK(""http://evil.test"",""Abrir"")"`,
    );
    expect(escapeCsvCell('+1+1')).toBe("'+1+1");
    expect(escapeCsvCell('-2+3')).toBe("'-2+3");
    expect(escapeCsvCell('@SUM(1+1)')).toBe("'@SUM(1+1)");
    expect(escapeCsvCell('\t=1+1')).toBe("'\t=1+1");
    expect(escapeCsvCell('\r=1+1')).toBe(`"'\r=1+1"`);
  });

  it('serializeCsv produces RFC 4180 CRLF output with escaped headers and rows', () => {
    const csv = serializeCsv(
      ['Fecha', 'Descripción', 'Monto, MXN', '=FormulaHeader'],
      [
        ['2026-12-01', '=HYPERLINK("http://evil.test","Ver")', 380.5, null],
        ['2026-12-02', 'Set "Acrílico"\ncon diseño', undefined, '+cmd'],
      ],
    );

    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(`Fecha,Descripción,"Monto, MXN",'=FormulaHeader`);
    expect(lines[1]).toBe(
      `2026-12-01,"'=HYPERLINK(""http://evil.test"",""Ver"")",380.5,`,
    );
    expect(lines.slice(2).join('\r\n')).toBe(
      `2026-12-02,"Set ""Acrílico""\ncon diseño",,'+cmd`,
    );
  });

  it('Property (S1): escapeHtml never emits raw HTML metacharacters', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const escaped = escapeHtml(input);
        expect(escaped).not.toMatch(/[<>"']/);
      }),
      { numRuns: 200 },
    );
  });

  it('Property (S2): escapeCsvCell never leaves an unquoted special char or active formula prefix', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const cell = escapeCsvCell(input);
        const decoded = parseRfc4180Cell(cell);

        if (decoded.length > 0) {
          expect(/^[=+\-@\t\r]/.test(decoded)).toBe(false);
        }

        if (!cell.startsWith('"')) {
          expect(cell).not.toMatch(/[",\r\n]/);
        } else {
          expect(cell.endsWith('"')).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});
