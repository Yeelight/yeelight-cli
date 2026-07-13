"use strict";

const QR_L_TABLE = [
  null,
  { version: 1, size: 21, dataCodewords: 19, eccCodewords: 7, alignment: [] },
  { version: 2, size: 25, dataCodewords: 34, eccCodewords: 10, alignment: [6, 18] },
  { version: 3, size: 29, dataCodewords: 55, eccCodewords: 15, alignment: [6, 22] },
  { version: 4, size: 33, dataCodewords: 80, eccCodewords: 20, alignment: [6, 26] },
  { version: 5, size: 37, dataCodewords: 108, eccCodewords: 26, alignment: [6, 30] },
];

function renderQrTerminal(text, options = {}) {
  const matrix = encodeQr(text);
  const margin = Number(options.margin === undefined ? 2 : options.margin);
  const useAnsi = options.ansi === undefined ? true : Boolean(options.ansi);
  const dark = options.dark || (useAnsi ? "\x1b[40m  \x1b[0m" : "██");
  const light = options.light || (useAnsi ? "\x1b[47m  \x1b[0m" : "  ");
  const size = matrix.length + margin * 2;
  const lines = [];
  for (let y = 0; y < size; y += 1) {
    let line = "";
    for (let x = 0; x < size; x += 1) {
      const inMatrix = y >= margin && y < matrix.length + margin && x >= margin && x < matrix.length + margin;
      const value = inMatrix ? matrix[y - margin][x - margin] : false;
      line += value ? dark : light;
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function encodeQr(text) {
  const bytes = Array.from(Buffer.from(String(text), "utf8"));
  const spec = chooseSpec(bytes.length);
  const dataCodewords = buildDataCodewords(bytes, spec.dataCodewords);
  const ecc = reedSolomonRemainder(dataCodewords, spec.eccCodewords);
  const allCodewords = dataCodewords.concat(ecc);
  const matrix = createMatrix(spec.size);
  const reserved = createMatrix(spec.size);
  drawFunctionPatterns(matrix, reserved, spec);
  drawCodewords(matrix, reserved, codewordsToBits(allCodewords));

  let bestMatrix = null;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = cloneMatrix(matrix);
    applyMask(candidate, reserved, mask);
    drawFormatBits(candidate, reserved, mask);
    const penalty = calculatePenalty(candidate);
    if (penalty < bestPenalty) {
      bestMatrix = candidate;
      bestPenalty = penalty;
    }
  }
  return bestMatrix;
}

function chooseSpec(byteLength) {
  for (const spec of QR_L_TABLE.slice(1)) {
    if (4 + 8 + byteLength * 8 <= spec.dataCodewords * 8) {
      return spec;
    }
  }
  throw new Error("二维码内容过长，当前 CLI 终端二维码最多支持 108 字节。");
}

function buildDataCodewords(bytes, dataCodewords) {
  const bits = [];
  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  for (const byte of bytes) {
    appendBits(bits, byte, 8);
  }
  const capacity = dataCodewords * 8;
  appendBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  const codewords = [];
  for (let index = 0; index < bits.length; index += 8) {
    codewords.push(bitsToByte(bits.slice(index, index + 8)));
  }
  for (let padIndex = 0; codewords.length < dataCodewords; padIndex += 1) {
    codewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }
  return codewords;
}

function appendBits(bits, value, width) {
  for (let index = width - 1; index >= 0; index -= 1) {
    bits.push((value >>> index) & 1);
  }
}

function bitsToByte(bits) {
  return bits.reduce((value, bit) => (value << 1) | bit, 0);
}

function codewordsToBits(codewords) {
  const bits = [];
  for (const codeword of codewords) {
    appendBits(bits, codeword, 8);
  }
  return bits;
}

function createMatrix(size) {
  return Array.from({ length: size }, () => Array(size).fill(false));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

function drawFunctionPatterns(matrix, reserved, spec) {
  const size = spec.size;
  drawFinder(matrix, reserved, 0, 0);
  drawFinder(matrix, reserved, size - 7, 0);
  drawFinder(matrix, reserved, 0, size - 7);
  drawAlignmentPatterns(matrix, reserved, spec.alignment);
  drawTiming(matrix, reserved);
  reserveFormatAreas(reserved);
  setFunctionModule(matrix, reserved, 8, size - 8, true);
}

function drawFinder(matrix, reserved, left, top) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const xx = left + x;
      const yy = top + y;
      if (!isInBounds(matrix, xx, yy)) {
        continue;
      }
      const inFinder = x >= 0 && x <= 6 && y >= 0 && y <= 6;
      const border = x === 0 || x === 6 || y === 0 || y === 6;
      const center = x >= 2 && x <= 4 && y >= 2 && y <= 4;
      setFunctionModule(matrix, reserved, xx, yy, inFinder && (border || center));
    }
  }
}

function drawAlignmentPatterns(matrix, reserved, positions) {
  for (const y of positions) {
    for (const x of positions) {
      if (reserved[y] && reserved[y][x]) {
        continue;
      }
      drawAlignment(matrix, reserved, x, y);
    }
  }
}

function drawAlignment(matrix, reserved, centerX, centerY) {
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) {
      const xx = centerX + x;
      const yy = centerY + y;
      const value = Math.max(Math.abs(x), Math.abs(y)) !== 1;
      setFunctionModule(matrix, reserved, xx, yy, value);
    }
  }
}

function drawTiming(matrix, reserved) {
  const size = matrix.length;
  for (let index = 8; index < size - 8; index += 1) {
    const value = index % 2 === 0;
    setFunctionModule(matrix, reserved, index, 6, value);
    setFunctionModule(matrix, reserved, 6, index, value);
  }
}

function reserveFormatAreas(reserved) {
  const size = reserved.length;
  for (let index = 0; index <= 8; index += 1) {
    if (index !== 6) {
      reserved[8][index] = true;
      reserved[index][8] = true;
    }
  }
  for (let index = 0; index < 8; index += 1) {
    reserved[8][size - 1 - index] = true;
    reserved[size - 1 - index][8] = true;
  }
  reserved[8][8] = true;
}

function drawCodewords(matrix, reserved, bits) {
  const size = matrix.length;
  let bitIndex = 0;
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right -= 1;
    }
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        if (reserved[y][x]) {
          continue;
        }
        matrix[y][x] = bitIndex < bits.length ? Boolean(bits[bitIndex]) : false;
        bitIndex += 1;
      }
    }
    upward = !upward;
  }
}

function applyMask(matrix, reserved, mask) {
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix.length; x += 1) {
      if (!reserved[y][x] && maskBit(mask, x, y)) {
        matrix[y][x] = !matrix[y][x];
      }
    }
  }
}

function maskBit(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return false;
  }
}

function drawFormatBits(matrix, reserved, mask) {
  const bits = getFormatBits(mask);
  for (let i = 0; i <= 5; i += 1) {
    setFunctionModule(matrix, reserved, 8, i, getBit(bits, i));
  }
  setFunctionModule(matrix, reserved, 8, 7, getBit(bits, 6));
  setFunctionModule(matrix, reserved, 8, 8, getBit(bits, 7));
  setFunctionModule(matrix, reserved, 7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i += 1) {
    setFunctionModule(matrix, reserved, 14 - i, 8, getBit(bits, i));
  }

  const size = matrix.length;
  for (let i = 0; i < 8; i += 1) {
    setFunctionModule(matrix, reserved, size - 1 - i, 8, getBit(bits, i));
  }
  for (let i = 8; i < 15; i += 1) {
    setFunctionModule(matrix, reserved, 8, size - 15 + i, getBit(bits, i));
  }
  setFunctionModule(matrix, reserved, 8, size - 8, true);
}

function getFormatBits(mask) {
  const data = (1 << 3) | mask;
  let bits = data << 10;
  const generator = 0x537;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if (((bits >>> bit) & 1) !== 0) {
      bits ^= generator << (bit - 10);
    }
  }
  return ((data << 10) | bits) ^ 0x5412;
}

function getBit(value, index) {
  return ((value >>> index) & 1) !== 0;
}

function setFunctionModule(matrix, reserved, x, y, value) {
  if (!isInBounds(matrix, x, y)) {
    return;
  }
  matrix[y][x] = Boolean(value);
  reserved[y][x] = true;
}

function isInBounds(matrix, x, y) {
  return y >= 0 && y < matrix.length && x >= 0 && x < matrix.length;
}

function reedSolomonRemainder(data, degree) {
  const generator = reedSolomonGenerator(degree);
  const result = Array(degree).fill(0);
  for (const value of data) {
    const factor = value ^ result.shift();
    result.push(0);
    for (let index = 0; index < degree; index += 1) {
      result[index] ^= gfMultiply(generator[index], factor);
    }
  }
  return result;
}

function reedSolomonGenerator(degree) {
  let result = [1];
  for (let index = 0; index < degree; index += 1) {
    result = reedSolomonMultiply(result, [1, gfPow(2, index)]);
  }
  return result.slice(1);
}

function reedSolomonMultiply(left, right) {
  const result = Array(left.length + right.length - 1).fill(0);
  for (let i = 0; i < left.length; i += 1) {
    for (let j = 0; j < right.length; j += 1) {
      result[i + j] ^= gfMultiply(left[i], right[j]);
    }
  }
  return result;
}

function gfPow(value, exponent) {
  let result = 1;
  for (let index = 0; index < exponent; index += 1) {
    result = gfMultiply(result, value);
  }
  return result;
}

function gfMultiply(left, right) {
  let x = left;
  let y = right;
  let result = 0;
  while (y !== 0) {
    if ((y & 1) !== 0) {
      result ^= x;
    }
    y >>>= 1;
    x <<= 1;
    if ((x & 0x100) !== 0) {
      x ^= 0x11d;
    }
  }
  return result & 0xff;
}

function calculatePenalty(matrix) {
  return penaltyRuns(matrix) + penaltyBlocks(matrix) + penaltyFinderLike(matrix) + penaltyDarkRatio(matrix);
}

function penaltyRuns(matrix) {
  let penalty = 0;
  for (const row of matrix) {
    penalty += lineRunPenalty(row);
  }
  for (let x = 0; x < matrix.length; x += 1) {
    const column = matrix.map((row) => row[x]);
    penalty += lineRunPenalty(column);
  }
  return penalty;
}

function lineRunPenalty(line) {
  let penalty = 0;
  let runValue = line[0];
  let runLength = 1;
  for (let index = 1; index < line.length; index += 1) {
    if (line[index] === runValue) {
      runLength += 1;
      continue;
    }
    if (runLength >= 5) {
      penalty += 3 + runLength - 5;
    }
    runValue = line[index];
    runLength = 1;
  }
  if (runLength >= 5) {
    penalty += 3 + runLength - 5;
  }
  return penalty;
}

function penaltyBlocks(matrix) {
  let penalty = 0;
  for (let y = 0; y < matrix.length - 1; y += 1) {
    for (let x = 0; x < matrix.length - 1; x += 1) {
      const value = matrix[y][x];
      if (matrix[y][x + 1] === value && matrix[y + 1][x] === value && matrix[y + 1][x + 1] === value) {
        penalty += 3;
      }
    }
  }
  return penalty;
}

function penaltyFinderLike(matrix) {
  let penalty = 0;
  for (const row of matrix) {
    penalty += finderLikePenalty(row);
  }
  for (let x = 0; x < matrix.length; x += 1) {
    penalty += finderLikePenalty(matrix.map((row) => row[x]));
  }
  return penalty;
}

function finderLikePenalty(line) {
  let penalty = 0;
  for (let index = 0; index <= line.length - 11; index += 1) {
    if (matchesPattern(line, index, [true, false, true, true, true, false, true, false, false, false, false])) {
      penalty += 40;
    }
    if (matchesPattern(line, index, [false, false, false, false, true, false, true, true, true, false, true])) {
      penalty += 40;
    }
  }
  return penalty;
}

function matchesPattern(line, start, pattern) {
  for (let index = 0; index < pattern.length; index += 1) {
    if (line[start + index] !== pattern[index]) {
      return false;
    }
  }
  return true;
}

function penaltyDarkRatio(matrix) {
  const size = matrix.length;
  let dark = 0;
  for (const row of matrix) {
    for (const value of row) {
      if (value) {
        dark += 1;
      }
    }
  }
  const percent = (dark * 100) / (size * size);
  return Math.floor(Math.abs(percent - 50) / 5) * 10;
}

module.exports = {
  encodeQr,
  renderQrTerminal,
};
