import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const outDir = path.resolve("extension/icons");
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const png = renderIcon(size);
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
}

function renderIcon(size) {
  const image = new Uint8ClampedArray(size * size * 4);
  const radius = size * 0.2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!insideRoundRect(x + 0.5, y + 0.5, size * 0.06, size * 0.06, size * 0.88, size * 0.88, radius)) continue;
      const t = (x + y) / (size * 2);
      setPixel(image, size, x, y, mix([16, 35, 63, 255], [7, 17, 31, 255], t));
    }
  }

  const cat = [248, 250, 252, 255];
  const ink = [7, 17, 31, 255];
  const blue = [56, 189, 248, 255];
  const mint = [94, 234, 212, 255];

  fillTriangle(image, size, size * 0.28, size * 0.42, size * 0.40, size * 0.20, size * 0.49, size * 0.45, cat);
  fillTriangle(image, size, size * 0.72, size * 0.42, size * 0.60, size * 0.20, size * 0.51, size * 0.45, cat);
  fillCircle(image, size, size * 0.50, size * 0.55, size * 0.275, cat);
  fillCircle(image, size, size * 0.40, size * 0.52, size * 0.035, ink);
  fillCircle(image, size, size * 0.60, size * 0.52, size * 0.035, ink);
  fillTriangle(image, size, size * 0.47, size * 0.61, size * 0.53, size * 0.61, size * 0.50, size * 0.66, ink);
  drawThickLine(image, size, size * 0.39, size * 0.67, size * 0.48, size * 0.72, size * 0.025, ink);
  drawThickLine(image, size, size * 0.52, size * 0.72, size * 0.61, size * 0.67, size * 0.025, ink);
  drawThickLine(image, size, size * 0.25, size * 0.57, size * 0.40, size * 0.57, size * 0.027, blue);
  drawThickLine(image, size, size * 0.24, size * 0.65, size * 0.40, size * 0.62, size * 0.027, blue);
  drawThickLine(image, size, size * 0.60, size * 0.57, size * 0.75, size * 0.57, size * 0.027, blue);
  drawThickLine(image, size, size * 0.60, size * 0.62, size * 0.76, size * 0.65, size * 0.027, blue);
  drawThickLine(image, size, size * 0.34, size * 0.79, size * 0.55, size * 0.86, size * 0.052, blue);
  drawThickLine(image, size, size * 0.55, size * 0.86, size * 0.77, size * 0.74, size * 0.052, mint);

  return encodePng(size, size, image);
}

function drawGlyph(image, size, glyph, x, y, cell, color) {
  const patterns = {
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"]
  };
  const pattern = patterns[glyph];
  const gap = Math.max(1, cell * 0.12);
  for (let row = 0; row < pattern.length; row += 1) {
    for (let col = 0; col < pattern[row].length; col += 1) {
      if (pattern[row][col] !== "1") continue;
      fillRoundRect(
        image,
        size,
        x + col * cell,
        y + row * cell,
        cell - gap,
        cell - gap,
        Math.max(1, cell * 0.18),
        color
      );
    }
  }
}

function fillRoundRect(image, size, x, y, width, height, radius, color) {
  const minX = Math.max(0, Math.floor(x));
  const minY = Math.max(0, Math.floor(y));
  const maxX = Math.min(size, Math.ceil(x + width));
  const maxY = Math.min(size, Math.ceil(y + height));
  for (let py = minY; py < maxY; py += 1) {
    for (let px = minX; px < maxX; px += 1) {
      if (insideRoundRect(px + 0.5, py + 0.5, x, y, width, height, radius)) {
        blendPixel(image, size, px, py, color);
      }
    }
  }
}

function fillCircle(image, size, cx, cy, radius, color) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(size, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(size, Math.ceil(cy + radius));
  const r2 = radius * radius;
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r2) blendPixel(image, size, x, y, color);
    }
  }
}

function fillTriangle(image, size, x1, y1, x2, y2, x3, y3, color) {
  const minX = Math.max(0, Math.floor(Math.min(x1, x2, x3)));
  const maxX = Math.min(size, Math.ceil(Math.max(x1, x2, x3)));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2, y3)));
  const maxY = Math.min(size, Math.ceil(Math.max(y1, y2, y3)));
  const area = edge(x1, y1, x2, y2, x3, y3);
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const a = edge(x2, y2, x3, y3, px, py);
      const b = edge(x3, y3, x1, y1, px, py);
      const c = edge(x1, y1, x2, y2, px, py);
      if ((area >= 0 && a >= 0 && b >= 0 && c >= 0) || (area < 0 && a <= 0 && b <= 0 && c <= 0)) {
        blendPixel(image, size, x, y, color);
      }
    }
  }
}

function edge(x1, y1, x2, y2, x3, y3) {
  return (x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1);
}

function drawThickLine(image, size, x1, y1, x2, y2, width, color) {
  const minX = Math.max(0, Math.floor(Math.min(x1, x2) - width));
  const maxX = Math.min(size, Math.ceil(Math.max(x1, x2) + width));
  const minY = Math.max(0, Math.floor(Math.min(y1, y2) - width));
  const maxY = Math.min(size, Math.ceil(Math.max(y1, y2) + width));
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  for (let y = minY; y < maxY; y += 1) {
    for (let x = minX; x < maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x + 0.5 - x1) * dx + (y + 0.5 - y1) * dy) / len2));
      const px = x1 + t * dx;
      const py = y1 + t * dy;
      const distance = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (distance <= width / 2) blendPixel(image, size, x, y, color);
    }
  }
}

function insideRoundRect(px, py, x, y, width, height, radius) {
  const cx = Math.max(x + radius, Math.min(px, x + width - radius));
  const cy = Math.max(y + radius, Math.min(py, y + height - radius));
  return (px - cx) ** 2 + (py - cy) ** 2 <= radius ** 2;
}

function setPixel(image, size, x, y, color) {
  const offset = (y * size + x) * 4;
  image[offset] = color[0];
  image[offset + 1] = color[1];
  image[offset + 2] = color[2];
  image[offset + 3] = color[3];
}

function blendPixel(image, size, x, y, color) {
  const offset = (y * size + x) * 4;
  const a = color[3] / 255;
  const inv = 1 - a;
  image[offset] = Math.round(color[0] * a + image[offset] * inv);
  image[offset + 1] = Math.round(color[1] * a + image[offset + 1] * inv);
  image[offset + 2] = Math.round(color[2] * a + image[offset + 2] * inv);
  image[offset + 3] = Math.min(255, Math.round(color[3] + image[offset + 3] * inv));
}

function mix(a, b, t) {
  return a.map((value, index) => Math.round(value * (1 - t) + b[index] * t));
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, row + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr(width, height)),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function ihdr(width, height) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  buffer[10] = 0;
  buffer[11] = 0;
  buffer[12] = 0;
  return buffer;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
