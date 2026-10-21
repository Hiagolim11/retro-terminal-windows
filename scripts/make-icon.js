// Gera src/renderer/icon.png (256x256): um monitor CRT com prompt "> _" em fósforo verde.
// Uso: node scripts/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const W = 256, H = 256;
const px = Buffer.alloc(W * H * 4);

function set(x, y, [r, g, b, a = 255]) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  // composição alfa simples sobre o que já existe
  const ba = px[i + 3] / 255, fa = a / 255, oa = fa + ba * (1 - fa);
  if (oa === 0) return;
  px[i] = Math.round((r * fa + px[i] * ba * (1 - fa)) / oa);
  px[i + 1] = Math.round((g * fa + px[i + 1] * ba * (1 - fa)) / oa);
  px[i + 2] = Math.round((b * fa + px[i + 2] * ba * (1 - fa)) / oa);
  px[i + 3] = Math.round(oa * 255);
}

function roundRect(x0, y0, x1, y1, r, colorAt) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const dx = Math.max(x0 + r - x - 0.5, 0, x - (x1 - r) + 0.5);
    const dy = Math.max(y0 + r - y - 0.5, 0, y - (y1 - r) + 0.5);
    const d = Math.hypot(dx, dy) - r;
    if (d > 1) continue;
    const c = colorAt(x, y);
    const a = d > 0 ? Math.round((c[3] === undefined ? 255 : c[3]) * (1 - d)) : (c[3] === undefined ? 255 : c[3]);
    set(x, y, [c[0], c[1], c[2], a]);
  }
}

// gabinete
roundRect(14, 18, 242, 214, 28, (x, y) => {
  const t = (y - 18) / 196;
  const v = Math.round(70 - t * 35);
  return [v + 8, v + 4, v - 6];
});
// base
roundRect(84, 210, 172, 236, 8, () => [40, 36, 30]);
roundRect(60, 230, 196, 244, 6, () => [52, 47, 38]);
// tela com brilho radial e curvatura
roundRect(34, 36, 222, 190, 22, (x, y) => {
  const cx = (x - 128) / 94, cy = (y - 113) / 77;
  const d = Math.min(1, Math.hypot(cx, cy));
  const glow = 1 - d * 0.75;
  const scan = (y % 4 < 2) ? 1 : 0.78;
  return [Math.round(6 * glow), Math.round(42 * glow * scan), Math.round(14 * glow)];
});

// texto "> _" em blocos de pixel (fonte 5x7, cada pixel = 8x8)
const GLYPHS = {
  '>': ['10000', '01000', '00100', '00010', '00100', '01000', '10000'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
};
function glyph(ch, ox, oy, s) {
  GLYPHS[ch].forEach((row, gy) => [...row].forEach((bit, gx) => {
    if (bit !== '1') return;
    for (let y = 0; y < s - 1; y++) for (let x = 0; x < s - 1; x++) {
      const yy = oy + gy * s + y;
      const bright = yy % 4 < 2 ? 1 : 0.8;
      set(ox + gx * s + x, yy, [Math.round(90 * bright), Math.round(255 * bright), Math.round(120 * bright)]);
    }
    // halo (bloom)
    for (let y = -6; y < s + 6; y++) for (let x = -6; x < s + 6; x++) {
      const d = Math.hypot(Math.max(0, -x, x - s), Math.max(0, -y, y - s));
      if (d > 0 && d < 6) set(ox + gx * s + x, oy + gy * s + y, [40, 255, 90, Math.round(26 * (1 - d / 6))]);
    }
  }));
}
glyph('>', 62, 84, 9);
glyph('_', 128, 84, 9);

// reflexo no vidro
roundRect(48, 44, 150, 60, 8, () => [255, 255, 255, 18]);
// LED de energia
roundRect(200, 196, 210, 204, 3, () => [255, 150, 40]);

// --- codificador PNG mínimo ---
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 4 + 1)] = 0; px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4); }
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'src', 'renderer', 'icon.png');
fs.writeFileSync(out, png);
console.log('ícone gerado:', out, png.length, 'bytes');
