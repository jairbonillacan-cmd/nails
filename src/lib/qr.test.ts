import { describe, expect, it } from 'vitest';
import { encodeQrMatrix, generateQrSvg } from './qr';

function assertFinderAt(matrix: boolean[][], topRow: number, leftCol: number): void {
  for (let dy = 0; dy < 7; dy += 1) {
    for (let dx = 0; dx < 7; dx += 1) {
      const isOuter = dy === 0 || dy === 6 || dx === 0 || dx === 6;
      const isCenter = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
      expect(matrix[topRow + dy]?.[leftCol + dx]).toBe(isOuter || isCenter);
    }
  }
}

function readFormatCopy1(matrix: boolean[][]): number {
  let bits = 0;
  for (let i = 0; i <= 5; i += 1) {
    if (matrix[i]?.[8]) bits |= 1 << i;
  }
  if (matrix[7]?.[8]) bits |= 1 << 6;
  if (matrix[8]?.[8]) bits |= 1 << 7;
  if (matrix[8]?.[7]) bits |= 1 << 8;
  for (let i = 9; i < 15; i += 1) {
    if (matrix[8]?.[14 - i]) bits |= 1 << i;
  }
  return bits;
}

function readFormatCopy2(matrix: boolean[][]): number {
  const size = matrix.length;
  let bits = 0;
  for (let i = 0; i < 8; i += 1) {
    if (matrix[8]?.[size - 1 - i]) bits |= 1 << i;
  }
  for (let i = 8; i < 15; i += 1) {
    if (matrix[size - 15 + i]?.[8]) bits |= 1 << i;
  }
  return bits;
}

function formatBchSyndrome(unmaskedFormatBits: number): number {
  let rem = unmaskedFormatBits;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if ((rem >>> bit) & 1) {
      rem ^= 0x537 << (bit - 10);
    }
  }
  return rem;
}

function assertValidFormatInfo(matrix: boolean[][], expectedEccBits: number): void {
  const size = matrix.length;
  const copy1 = readFormatCopy1(matrix);
  const copy2 = readFormatCopy2(matrix);
  expect(copy1).toBe(copy2);
  expect(matrix[size - 8]?.[8]).toBe(true);
  const unmasked = copy1 ^ 0x5412;
  expect(formatBchSyndrome(unmasked)).toBe(0);
  expect((unmasked >>> 13) & 0b11).toBe(expectedEccBits);
}

describe('Zero-Dependency QR Code SVG Encoder (N9)', () => {
  it('encodes valid ISO/IEC 18004 finder, timing, dark-module, and deterministic matrices across versions', () => {
    const shortMatrix = encodeQrMatrix('LAIKONA');
    expect(shortMatrix.length).toBe(21);
    expect(shortMatrix.every((row) => row.length === 21)).toBe(true);
    assertFinderAt(shortMatrix, 0, 0);
    assertFinderAt(shortMatrix, 0, 14);
    assertFinderAt(shortMatrix, 14, 0);
    assertValidFormatInfo(shortMatrix, 0);

    const url = 'https://laikona.nails/links';
    const urlMatrix = encodeQrMatrix(url);
    const size = urlMatrix.length;
    expect(size).toBe(29);
    expect(urlMatrix).toEqual(encodeQrMatrix(url));
    assertFinderAt(urlMatrix, 0, 0);
    assertFinderAt(urlMatrix, 0, size - 7);
    assertFinderAt(urlMatrix, size - 7, 0);
    assertValidFormatInfo(urlMatrix, 0);
    for (let i = 8; i < size - 8; i += 1) {
      expect(urlMatrix[6]?.[i]).toBe(i % 2 === 0);
      expect(urlMatrix[i]?.[6]).toBe(i % 2 === 0);
    }

    const longUrl =
      'https://laikona.nails/reservar/gel-semipermanente-manos?utm_source=instagram&utm_medium=bio&utm_campaign=puebla_studio_laikona_2026';
    const longMatrix = encodeQrMatrix(longUrl);
    expect(longMatrix.length).toBeGreaterThanOrEqual(45);
    assertFinderAt(longMatrix, 0, 0);
    assertFinderAt(longMatrix, 0, longMatrix.length - 7);
    assertFinderAt(longMatrix, longMatrix.length - 7, 0);
    assertValidFormatInfo(longMatrix, 0);

    const eccLUrl = `https://laikona.nails/links?p=${'a'.repeat(140)}`;
    const eccLMatrix = encodeQrMatrix(eccLUrl);
    expect(eccLMatrix.length).toBe(49);
    assertValidFormatInfo(eccLMatrix, 1);
  });

  it('generates deterministic crisp SVG with 4-module quiet zone and safe XML escaping', () => {
    const url = 'https://laikona.nails/links';
    const matrix = encodeQrMatrix(url);
    const expectedView = matrix.length + 8;

    const svg = generateQrSvg(url, 'QR <LAIKONA> & "Karla"');
    expect(svg).toBe(generateQrSvg(url, 'QR <LAIKONA> & "Karla"'));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${expectedView} ${expectedView}"`);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="QR &lt;LAIKONA&gt; &amp; &quot;Karla&quot;"');
    expect(svg).toContain('<title>QR &lt;LAIKONA&gt; &amp; &quot;Karla&quot;</title>');
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).toContain('<path fill="#141414" d="M4 4h1v1h-1z');
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('rejects empty or oversized payloads cleanly', () => {
    expect(() => encodeQrMatrix('   ')).toThrow();
    expect(() => encodeQrMatrix('x'.repeat(250))).toThrow();
  });
});
