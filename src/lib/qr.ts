interface BlockSpec {
  count: number;
  dataCodewords: number;
  ecCodewords: number;
}

interface VersionSpec {
  version: number;
  eccLevel: 'M' | 'L';
  formatEccBits: number;
  totalDataCodewords: number;
  blocks: readonly BlockSpec[];
  alignmentCenters: readonly number[];
}

const VERSION_SPECS: readonly VersionSpec[] = [
  {
    version: 1,
    eccLevel: 'M',
    formatEccBits: 0,
    totalDataCodewords: 16,
    blocks: [{ count: 1, dataCodewords: 16, ecCodewords: 10 }],
    alignmentCenters: [],
  },
  {
    version: 2,
    eccLevel: 'M',
    formatEccBits: 0,
    totalDataCodewords: 28,
    blocks: [{ count: 1, dataCodewords: 28, ecCodewords: 16 }],
    alignmentCenters: [6, 18],
  },
  {
    version: 3,
    eccLevel: 'M',
    formatEccBits: 0,
    totalDataCodewords: 44,
    blocks: [{ count: 1, dataCodewords: 44, ecCodewords: 26 }],
    alignmentCenters: [6, 22],
  },
  {
    version: 4,
    eccLevel: 'M',
    formatEccBits: 0,
    totalDataCodewords: 64,
    blocks: [{ count: 2, dataCodewords: 32, ecCodewords: 18 }],
    alignmentCenters: [6, 26],
  },
  {
    version: 5,
    eccLevel: 'M',
    formatEccBits: 0,
    totalDataCodewords: 86,
    blocks: [{ count: 2, dataCodewords: 43, ecCodewords: 24 }],
    alignmentCenters: [6, 30],
  },
  {
    version: 6,
    eccLevel: 'M',
    formatEccBits: 0,
    totalDataCodewords: 108,
    blocks: [{ count: 4, dataCodewords: 27, ecCodewords: 16 }],
    alignmentCenters: [6, 34],
  },
  {
    version: 7,
    eccLevel: 'M',
    formatEccBits: 0,
    totalDataCodewords: 124,
    blocks: [{ count: 4, dataCodewords: 31, ecCodewords: 18 }],
    alignmentCenters: [6, 22, 38],
  },
  {
    version: 8,
    eccLevel: 'M',
    formatEccBits: 0,
    totalDataCodewords: 154,
    blocks: [
      { count: 2, dataCodewords: 38, ecCodewords: 22 },
      { count: 2, dataCodewords: 39, ecCodewords: 22 },
    ],
    alignmentCenters: [6, 24, 42],
  },
  {
    version: 8,
    eccLevel: 'L',
    formatEccBits: 1,
    totalDataCodewords: 194,
    blocks: [{ count: 2, dataCodewords: 97, ecCodewords: 24 }],
    alignmentCenters: [6, 24, 42],
  },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255] ?? 0;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  const logA = GF_LOG[a] ?? 0;
  const logB = GF_LOG[b] ?? 0;
  return GF_EXP[logA + logB] ?? 0;
}

function buildRsGenerator(degree: number): number[] {
  let poly: number[] = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    const factor = GF_EXP[i] ?? 1;
    for (let j = 0; j < poly.length; j += 1) {
      const coeff = poly[j] ?? 0;
      next[j] = (next[j] ?? 0) ^ coeff;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(coeff, factor);
    }
    poly = next;
  }
  return poly;
}

function computeRsRemainder(data: readonly number[], ecLength: number): number[] {
  const gen = buildRsGenerator(ecLength);
  const remainder = new Array<number>(ecLength).fill(0);
  for (const byte of data) {
    const factor = byte ^ (remainder[0] ?? 0);
    for (let i = 0; i < ecLength - 1; i += 1) {
      remainder[i] = remainder[i + 1] ?? 0;
    }
    remainder[ecLength - 1] = 0;
    for (let i = 0; i < ecLength; i += 1) {
      remainder[i] = (remainder[i] ?? 0) ^ gfMul(gen[i + 1] ?? 0, factor);
    }
  }
  return remainder;
}

function appendBits(bits: number[], value: number, bitLength: number): void {
  for (let i = bitLength - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1);
  }
}

function selectVersionSpec(byteLength: number): VersionSpec {
  for (const spec of VERSION_SPECS) {
    const neededDataCodewords = Math.ceil((4 + 8 + byteLength * 8) / 8);
    if (neededDataCodewords <= spec.totalDataCodewords) {
      return spec;
    }
  }
  throw new Error('QR payload exceeds supported Version 1-8 byte capacity (max 192 bytes).');
}

function buildFinalCodewords(bytes: Uint8Array, spec: VersionSpec): number[] {
  const bits: number[] = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }

  const maxBits = spec.totalDataCodewords * 8;
  const terminatorLen = Math.min(4, maxBits - bits.length);
  appendBits(bits, 0, terminatorLen);

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let val = 0;
    for (let b = 0; b < 8; b += 1) {
      val = (val << 1) | (bits[i + b] ?? 0);
    }
    dataCodewords.push(val);
  }

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataCodewords.length < spec.totalDataCodewords) {
    dataCodewords.push(padBytes[padIdx % 2] ?? 0xec);
    padIdx += 1;
  }

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let cursor = 0;

  for (const group of spec.blocks) {
    for (let i = 0; i < group.count; i += 1) {
      const slice = dataCodewords.slice(cursor, cursor + group.dataCodewords);
      cursor += group.dataCodewords;
      dataBlocks.push(slice);
      ecBlocks.push(computeRsRemainder(slice, group.ecCodewords));
    }
  }

  const interleaved: number[] = [];
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i += 1) {
    for (const block of dataBlocks) {
      const cw = block[i];
      if (cw !== undefined) {
        interleaved.push(cw);
      }
    }
  }

  const maxEcLen = Math.max(...ecBlocks.map((b) => b.length));
  for (let i = 0; i < maxEcLen; i += 1) {
    for (const block of ecBlocks) {
      const cw = block[i];
      if (cw !== undefined) {
        interleaved.push(cw);
      }
    }
  }

  return interleaved;
}

function createMatrix(size: number): boolean[][] {
  return Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
}

function setModule(
  modules: boolean[][],
  isFunction: boolean[][],
  row: number,
  col: number,
  dark: boolean,
): void {
  const modRow = modules[row];
  const fnRow = isFunction[row];
  if (!modRow || !fnRow) return;
  if (col < 0 || col >= modRow.length) return;
  modRow[col] = dark;
  fnRow[col] = true;
}

function drawFinderPattern(
  modules: boolean[][],
  isFunction: boolean[][],
  topRow: number,
  leftCol: number,
): void {
  const size = modules.length;
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const r = topRow + dy;
      const c = leftCol + dx;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const inOuter = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6;
      const isBorder = dy === 0 || dy === 6 || dx === 0 || dx === 6;
      const isCenter = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
      setModule(modules, isFunction, r, c, inOuter && (isBorder || isCenter));
    }
  }
}

function drawAlignmentPattern(
  modules: boolean[][],
  isFunction: boolean[][],
  centerRow: number,
  centerCol: number,
): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const dist = Math.max(Math.abs(dy), Math.abs(dx));
      setModule(modules, isFunction, centerRow + dy, centerCol + dx, dist !== 1);
    }
  }
}

function drawVersionBits(
  modules: boolean[][],
  isFunction: boolean[][],
  version: number,
): void {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i += 1) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  const bits = (version << 12) | rem;
  const size = modules.length;
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setModule(modules, isFunction, a, b, dark);
    setModule(modules, isFunction, b, a, dark);
  }
}

function drawFormatBits(
  modules: boolean[][],
  isFunction: boolean[][],
  formatEccBits: number,
  mask: number,
): void {
  const data = (formatEccBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  const bits = ((data << 10) | rem) ^ 0x5412;
  const size = modules.length;

  for (let i = 0; i <= 5; i += 1) {
    setModule(modules, isFunction, i, 8, ((bits >>> i) & 1) !== 0);
  }
  setModule(modules, isFunction, 7, 8, ((bits >>> 6) & 1) !== 0);
  setModule(modules, isFunction, 8, 8, ((bits >>> 7) & 1) !== 0);
  setModule(modules, isFunction, 8, 7, ((bits >>> 8) & 1) !== 0);
  for (let i = 9; i < 15; i += 1) {
    setModule(modules, isFunction, 8, 14 - i, ((bits >>> i) & 1) !== 0);
  }

  for (let i = 0; i < 8; i += 1) {
    setModule(modules, isFunction, 8, size - 1 - i, ((bits >>> i) & 1) !== 0);
  }
  for (let i = 8; i < 15; i += 1) {
    setModule(modules, isFunction, size - 15 + i, 8, ((bits >>> i) & 1) !== 0);
  }
  setModule(modules, isFunction, size - 8, 8, true);
}

function drawFunctionPatterns(
  modules: boolean[][],
  isFunction: boolean[][],
  spec: VersionSpec,
): void {
  const size = modules.length;

  for (let i = 0; i < size; i += 1) {
    setModule(modules, isFunction, 6, i, i % 2 === 0);
    setModule(modules, isFunction, i, 6, i % 2 === 0);
  }

  drawFinderPattern(modules, isFunction, 0, 0);
  drawFinderPattern(modules, isFunction, 0, size - 7);
  drawFinderPattern(modules, isFunction, size - 7, 0);

  const centers = spec.alignmentCenters;
  for (let i = 0; i < centers.length; i += 1) {
    for (let j = 0; j < centers.length; j += 1) {
      const r = centers[i];
      const c = centers[j];
      if (r === undefined || c === undefined) continue;
      const inTopLeft = i === 0 && j === 0;
      const inTopRight = i === 0 && j === centers.length - 1;
      const inBottomLeft = i === centers.length - 1 && j === 0;
      if (inTopLeft || inTopRight || inBottomLeft) continue;
      drawAlignmentPattern(modules, isFunction, r, c);
    }
  }

  drawFormatBits(modules, isFunction, spec.formatEccBits, 0);
  drawVersionBits(modules, isFunction, spec.version);
}

function placeDataCodewords(
  modules: boolean[][],
  isFunction: boolean[][],
  codewords: readonly number[],
): void {
  const size = modules.length;
  let bitIdx = 0;
  const totalBits = codewords.length * 8;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;
    }
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert += 1) {
      const row = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j += 1) {
        const col = right - j;
        if (isFunction[row]?.[col]) continue;
        let dark = false;
        if (bitIdx < totalBits) {
          const cw = codewords[bitIdx >>> 3] ?? 0;
          dark = ((cw >>> (7 - (bitIdx & 7))) & 1) !== 0;
          bitIdx += 1;
        }
        const modRow = modules[row];
        if (modRow) {
          modRow[col] = dark;
        }
      }
    }
  }
}

function shouldInvertForMask(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0:
      return (row + col) % 2 === 0;
    case 1:
      return row % 2 === 0;
    case 2:
      return col % 3 === 0;
    case 3:
      return (row + col) % 3 === 0;
    case 4:
      return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
    case 5:
      return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6:
      return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default:
      return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
  }
}

function applyMask(
  baseModules: readonly (readonly boolean[])[],
  isFunction: readonly (readonly boolean[])[],
  mask: number,
): boolean[][] {
  const size = baseModules.length;
  const out = createMatrix(size);
  for (let r = 0; r < size; r += 1) {
    const outRow = out[r];
    const baseRow = baseModules[r];
    const fnRow = isFunction[r];
    if (!outRow || !baseRow || !fnRow) continue;
    for (let c = 0; c < size; c += 1) {
      const dark = baseRow[c] ?? false;
      outRow[c] = fnRow[c] ? dark : dark !== shouldInvertForMask(mask, r, c);
    }
  }
  return out;
}

function computePenaltyScore(modules: readonly (readonly boolean[])[]): number {
  const size = modules.length;
  let penalty = 0;

  for (let r = 0; r < size; r += 1) {
    let runColor = modules[r]?.[0] ?? false;
    let runLen = 1;
    for (let c = 1; c < size; c += 1) {
      const val = modules[r]?.[c] ?? false;
      if (val === runColor) {
        runLen += 1;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = val;
        runLen = 1;
      }
    }
  }

  for (let c = 0; c < size; c += 1) {
    let runColor = modules[0]?.[c] ?? false;
    let runLen = 1;
    for (let r = 1; r < size; r += 1) {
      const val = modules[r]?.[c] ?? false;
      if (val === runColor) {
        runLen += 1;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      } else {
        runColor = val;
        runLen = 1;
      }
    }
  }

  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const val = modules[r]?.[c] ?? false;
      if (
        val === (modules[r]?.[c + 1] ?? false) &&
        val === (modules[r + 1]?.[c] ?? false) &&
        val === (modules[r + 1]?.[c + 1] ?? false)
      ) {
        penalty += 3;
      }
    }
  }

  let darkCount = 0;
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (modules[r]?.[c]) darkCount += 1;
    }
  }
  const total = size * size;
  const k = Math.floor(Math.abs(darkCount * 20 - total * 10) / total);
  penalty += k * 10;

  return penalty;
}

function escapeSvgAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function encodeQrMatrix(text: string): boolean[][] {
  const payload = text.trim();
  if (!payload) {
    throw new Error('QR payload must not be empty.');
  }
  const bytes = new TextEncoder().encode(payload);
  const spec = selectVersionSpec(bytes.length);
  const size = spec.version * 4 + 17;
  const codewords = buildFinalCodewords(bytes, spec);

  const baseModules = createMatrix(size);
  const isFunction = createMatrix(size);
  drawFunctionPatterns(baseModules, isFunction, spec);
  placeDataCodewords(baseModules, isFunction, codewords);

  let bestMatrix = applyMask(baseModules, isFunction, 0);
  drawFormatBits(bestMatrix, isFunction, spec.formatEccBits, 0);
  let bestScore = computePenaltyScore(bestMatrix);

  for (let mask = 1; mask < 8; mask += 1) {
    const candidate = applyMask(baseModules, isFunction, mask);
    drawFormatBits(candidate, isFunction, spec.formatEccBits, mask);
    const score = computePenaltyScore(candidate);
    if (score < bestScore) {
      bestScore = score;
      bestMatrix = candidate;
    }
  }

  return bestMatrix;
}

export function generateQrSvg(text: string, label?: string): string {
  const matrix = encodeQrMatrix(text);
  const quietZone = 4;
  const size = matrix.length;
  const viewSize = size + quietZone * 2;

  const pathSegments: string[] = [];
  for (let r = 0; r < size; r += 1) {
    const row = matrix[r];
    if (!row) continue;
    for (let c = 0; c < size; c += 1) {
      if (row[c]) {
        pathSegments.push(`M${c + quietZone} ${r + quietZone}h1v1h-1z`);
      }
    }
  }

  const accessibleLabel = escapeSvgAttribute(label?.trim() || `Código QR para ${text.trim()}`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" role="img" aria-label="${accessibleLabel}" shape-rendering="crispEdges"><title>${accessibleLabel}</title><rect width="${viewSize}" height="${viewSize}" fill="#FFFFFF"/><path fill="#141414" d="${pathSegments.join('')}"/></svg>`;
}
