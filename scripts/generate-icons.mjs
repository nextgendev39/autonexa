import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ink = [22, 48, 56];
const brass = [198, 161, 91];

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function blend(pixels, size, x, y, color, alpha) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= size || py >= size) return;
  const index = (py * size + px) * 4;
  const source = alpha / 255;
  const destination = pixels[index + 3] / 255;
  const out = source + destination * (1 - source);
  if (out === 0) return;
  for (let channel = 0; channel < 3; channel += 1) {
    pixels[index + channel] =
      (color[channel] * source + pixels[index + channel] * destination * (1 - source)) / out;
  }
  pixels[index + 3] = out * 255;
}

function insideRoundRect(x, y, size, radius, inset) {
  const left = inset;
  const right = size - inset - 1;
  const top = inset;
  const bottom = size - inset - 1;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius && x >= left && x <= right && y >= top && y <= bottom;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
}

function paint(pixels, size, { padding }) {
  const radius = size * 0.22;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (insideRoundRect(x, y, size, radius, padding)) {
        blend(pixels, size, x, y, ink, 255);
      }
    }
  }

  const span = size - padding * 2;
  const segments = [
    [0.28, 0.34, 0.72, 0.34],
    [0.72, 0.34, 0.28, 0.66],
    [0.28, 0.66, 0.72, 0.66],
  ];
  const stroke = size * 0.055;
  for (let y = padding; y < size - padding; y += 1) {
    for (let x = padding; x < size - padding; x += 1) {
      const nx = (x - padding) / span;
      const ny = (y - padding) / span;
      const distance = Math.min(
        ...segments.map(([x1, y1, x2, y2]) => distanceToSegment(nx, ny, x1, y1, x2, y2) * span),
      );
      if (distance <= stroke) {
        const alpha = distance > stroke - 1.2 ? Math.max(0, (stroke - distance) / 1.2) * 255 : 255;
        blend(pixels, size, x, y, brass, alpha);
      }
    }
  }
}

function createPng(size, options) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  paint(pixels, size, options);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size * 4; x += 1) raw[row + 1 + x] = pixels[y * size * 4 + x];
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const root = path.resolve("public/icons");
const app = path.resolve("src/app");
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, "icon-192.png"), createPng(192, { padding: 0 }));
fs.writeFileSync(path.join(root, "icon-512.png"), createPng(512, { padding: 0 }));
fs.writeFileSync(path.join(root, "icon-maskable-512.png"), createPng(512, { padding: 64 }));
fs.writeFileSync(path.join(root, "apple-touch-icon.png"), createPng(180, { padding: 8 }));
fs.writeFileSync(path.join(app, "icon.png"), createPng(192, { padding: 0 }));
fs.writeFileSync(path.join(app, "apple-icon.png"), createPng(180, { padding: 8 }));
fs.rmSync(path.join(app, "favicon.ico"), { force: true });
console.log("icons written");
