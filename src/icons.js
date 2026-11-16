// Genera los iconos PNG de la app sin dependencias externas (zlib de Node + CRC32 propio).
// Dibujo: atardecer sobre una carretera en perspectiva, con fondo a sangre (válido como icono "maskable").
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filtro "None"
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits por canal
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const SKY_TOP = hex('#0f2236');
const SKY_LOW = hex('#2a4767');
const GROUND = hex('#16293f');
const SUN = hex('#f0a53a');
const ROAD = hex('#eef2f6');
const DASH = hex('#16293f');

const HORIZON = 0.6;

// Color de un punto (u, v) en [0,1]² con el modelo del "pintor".
function colorAt(u, v) {
  let c;
  if (v < HORIZON) {
    const k = v / HORIZON;
    c = SKY_TOP.map((a, i) => a + (SKY_LOW[i] - a) * k);
    const dx = u - 0.5;
    const dy = v - HORIZON;
    if (dx * dx + dy * dy < 0.2 * 0.2) c = SUN; // sol poniéndose (solo la mitad visible)
  } else {
    c = GROUND;
    // Carretera: trapecio desde el horizonte (ancho 0,04) hasta abajo (ancho 0,62).
    const t = (v - HORIZON) / (1 - HORIZON);
    const half = 0.02 + t * 0.29;
    if (Math.abs(u - 0.5) < half) {
      c = ROAD;
      // Línea central discontinua, más ancha cerca del observador.
      const dashes = [
        [0.64, 0.67],
        [0.71, 0.77],
        [0.82, 0.92],
      ];
      const inDash = dashes.some(([a, b]) => v >= a && v <= b);
      if (inDash && Math.abs(u - 0.5) < half * 0.09) c = DASH;
    }
  }
  return c;
}

function drawIcon(size) {
  const S = 4; // supermuestreo 4×4 para suavizar bordes
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const c = colorAt((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const i = (y * size + x) * 4;
      px[i] = Math.round(r / (S * S));
      px[i + 1] = Math.round(g / (S * S));
      px[i + 2] = Math.round(b / (S * S));
      px[i + 3] = 255;
    }
  }
  return encodePng(size, size, px);
}

module.exports = { drawIcon };
