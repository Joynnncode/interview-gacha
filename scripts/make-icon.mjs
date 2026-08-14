/**
 * Draws the app icon and writes build/icon.png (1024px) plus build/icon.icns.
 *
 *   node scripts/make-icon.mjs
 *
 * Why draw it in code rather than ship an .svg or a design file: there is no SVG
 * rasteriser on this machine (no rsvg-convert, no ImageMagick, no cairosvg), and
 * adding one just to make an icon is a heavier dependency than the icon itself.
 * Node can encode a PNG on its own — zlib is built in — so the icon is a small
 * program: shapes are sampled analytically and composited in order.
 *
 * Everything tunable is in DESIGN below. Colours are the same tokens the app
 * uses (src/index.css), so the icon cannot drift away from the UI palette.
 *
 * The .icns step shells out to sips and iconutil, both of which are part of
 * macOS. On any other platform the script stops after icon.png, which is enough
 * for electron-builder anyway — it converts a 1024px png itself.
 */

import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DESIGN = {
  /** Master size. macOS wants 1024 for the largest icns slice. */
  size: 1024,
  /** Samples per pixel per axis. 3 => 9 samples, which is enough to hide stair-stepping. */
  supersample: 3,

  /*
   * macOS icons are not full-bleed: the rounded square sits inside a margin, and
   * every other app's icon uses roughly this ratio, so matching it is what makes
   * the Dock look even.
   */
  plate: { inset: 92, radius: 200 },

  colours: {
    // Background gradient, top to bottom: pale peach into the warm pink token.
    plateTop: '#FFE6DC',
    plateBottom: '#FFB5A7',
    capsuleTop: '#FDFBF7', // cream, the app background
    capsuleBottom: '#A8E6CF', // tech mint
    seam: '#3D3A36', // warm black, used at low alpha
    sparkle: '#FFD93D', // SSR gold
    shadow: '#3D3A36',
  },

  /** The capsule: one circle, split by a seam, with a highlight and a shadow. */
  capsule: {
    cx: 512,
    cy: 540,
    r: 268,
    /** Seam sits slightly above the middle, the way a real capsule opens. */
    seamY: 512,
    seamHeight: 26,
    /** Little hinge tab on the left of the seam. */
    hinge: { w: 96, h: 44 },
  },

  highlight: { cx: 402, cy: 392, rx: 104, ry: 66, rotation: -0.6, alpha: 0.85 },
  shadow: { cx: 512, cy: 842, rx: 240, ry: 46, alpha: 0.14 },
  /** Shading along the bottom rim, so the capsule reads as a sphere. */
  volume: { alpha: 0.1, start: 0.55 },

  /*
   * Four-pointed sparkles, the SSR flourish. `pinch` is the exponent of the
   * superellipse: below 1 the sides cave inwards, which is what turns a diamond
   * into a star. 1 would be a diamond, 0.3 is needle-thin.
   */
  sparkles: [
    { cx: 784, cy: 292, r: 96, pinch: 0.42 },
    { cx: 262, cy: 258, r: 52, pinch: 0.42 },
  ],
};

// ---------------------------------------------------------------------------
// Tiny colour + geometry helpers
// ---------------------------------------------------------------------------

/** '#RRGGBB' -> [r, g, b], 0-255. */
function hex(value) {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Source-over compositing onto a straight-alpha destination. */
function over(dst, src, alpha) {
  if (alpha <= 0) return dst;
  const outA = alpha + dst[3] * (1 - alpha);
  if (outA <= 0) return [0, 0, 0, 0];
  const blend = (i) => (src[i] * alpha + dst[i] * dst[3] * (1 - alpha)) / outA;
  return [blend(0), blend(1), blend(2), outA];
}

/** Signed distance to a rounded rectangle: negative inside. */
function sdRoundedRect(x, y, left, top, right, bottom, radius) {
  const halfW = (right - left) / 2;
  const halfH = (bottom - top) / 2;
  const px = Math.abs(x - (left + halfW)) - (halfW - radius);
  const py = Math.abs(y - (top + halfH)) - (halfH - radius);
  const outside = Math.hypot(Math.max(px, 0), Math.max(py, 0));
  return outside + Math.min(Math.max(px, py), 0) - radius;
}

/**
 * Coverage from a signed distance, in pixels.
 *
 * Edges still get one pixel of softening on top of the supersampling. Pure
 * supersampling alone leaves visible steps on the very shallow curves of a
 * 1024px rounded square.
 */
function coverage(distance) {
  return Math.min(Math.max(0.5 - distance, 0), 1);
}

// ---------------------------------------------------------------------------
// The picture itself: colour of one sample point
// ---------------------------------------------------------------------------

const C = DESIGN.colours;
const plateTop = hex(C.plateTop);
const plateBottom = hex(C.plateBottom);
const capsuleTop = hex(C.capsuleTop);
const capsuleBottom = hex(C.capsuleBottom);
const seam = hex(C.seam);
const sparkle = hex(C.sparkle);
const shadow = hex(C.shadow);
const white = [255, 255, 255];

function sample(x, y) {
  const { size, plate, capsule, highlight, shadow: shade, volume, sparkles } = DESIGN;
  let px = [0, 0, 0, 0];

  // 1. The rounded plate, with a top-to-bottom gradient.
  const plateDist = sdRoundedRect(x, y, plate.inset, plate.inset, size - plate.inset, size - plate.inset, plate.radius);
  const plateAlpha = coverage(plateDist);
  if (plateAlpha > 0) {
    const t = (y - plate.inset) / (size - plate.inset * 2);
    px = over(px, mix(plateTop, plateBottom, Math.min(Math.max(t, 0), 1)), plateAlpha);
  }
  if (px[3] <= 0) return px; // nothing outside the plate

  // 2. Contact shadow under the capsule. Soft-edged, so it fades rather than cuts.
  const sdx = (x - shade.cx) / shade.rx;
  const sdy = (y - shade.cy) / shade.ry;
  const shadowFalloff = 1 - Math.min(Math.hypot(sdx, sdy), 1);
  if (shadowFalloff > 0) {
    px = over(px, shadow, shadowFalloff ** 1.8 * shade.alpha * px[3]);
  }

  // 3. The capsule: a circle, cream above the seam and mint below it.
  const capsuleDist = Math.hypot(x - capsule.cx, y - capsule.cy) - capsule.r;
  const capsuleAlpha = coverage(capsuleDist) * px[3];
  if (capsuleAlpha > 0) {
    const half = coverage(y - capsule.seamY); // 1 above the seam, 0 below
    px = over(px, mix(capsuleBottom, capsuleTop, half), capsuleAlpha);

    // 3a. The seam line, clipped to the capsule.
    const seamDist = Math.abs(y - capsule.seamY) - capsule.seamHeight / 2;
    px = over(px, seam, coverage(seamDist) * capsuleAlpha * 0.14);

    // 3b. The hinge tab, so the seam reads as an opening rather than a stripe.
    const hingeDist = sdRoundedRect(
      x,
      y,
      capsule.cx - capsule.r * 0.62 - capsule.hinge.w / 2,
      capsule.seamY - capsule.hinge.h / 2,
      capsule.cx - capsule.r * 0.62 + capsule.hinge.w / 2,
      capsule.seamY + capsule.hinge.h / 2,
      capsule.hinge.h / 2,
    );
    px = over(px, seam, coverage(hingeDist) * capsuleAlpha * 0.16);

    // 3c. Highlight: a rotated ellipse, top-left, where a light would catch.
    const hx = x - highlight.cx;
    const hy = y - highlight.cy;
    const cos = Math.cos(highlight.rotation);
    const sin = Math.sin(highlight.rotation);
    const ex = (hx * cos - hy * sin) / highlight.rx;
    const ey = (hx * sin + hy * cos) / highlight.ry;
    const inHighlight = 1 - Math.min(Math.hypot(ex, ey), 1);
    px = over(px, white, inHighlight ** 0.7 * highlight.alpha * capsuleAlpha);

    // 3d. Volume: darken towards the bottom rim of the sphere.
    const radial = Math.hypot(x - capsule.cx, y - capsule.cy) / capsule.r;
    const belowCentre = Math.min(Math.max((y - capsule.cy) / capsule.r, 0), 1);
    const depth = Math.max(radial - volume.start, 0) / (1 - volume.start);
    px = over(px, shadow, depth ** 2 * belowCentre * volume.alpha * capsuleAlpha);
  }

  // 4. Sparkles on top of everything.
  for (const s of sparkles) {
    const dx = Math.abs(x - s.cx) / s.r;
    const dy = Math.abs(y - s.cy) / s.r;
    /*
     * Superellipse norm with an exponent below 1: |x|^p + |y|^p = 1. The sides
     * bow inwards towards the centre, giving the four thin points of a sparkle,
     * and the norm is 1 exactly on the outline, so (norm - 1) * r is close
     * enough to a signed distance for antialiasing.
     */
    const norm = (dx ** s.pinch + dy ** s.pinch) ** (1 / s.pinch);
    px = over(px, sparkle, coverage((norm - 1) * s.r) * px[3]);
  }

  return px;
}

// ---------------------------------------------------------------------------
// Render + PNG encoding
// ---------------------------------------------------------------------------

function render() {
  const { size, supersample: ss } = DESIGN;
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / ss;
  const offset = step / 2;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      // Average in premultiplied space, otherwise transparent samples drag the
      // edge colour towards black.
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const c = sample(px + offset + sx * step, py + offset + sy * step);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const n = ss * ss;
      const alpha = a / n;
      const i = (py * size + px) * 4;
      if (alpha > 0) {
        pixels[i] = Math.round(r / a);
        pixels[i + 1] = Math.round(g / a);
        pixels[i + 2] = Math.round(b / a);
      }
      pixels[i + 3] = Math.round(alpha * 255);
    }
  }

  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Minimal PNG writer: 8-bit RGBA, one IDAT, filter type 0 on every scanline. */
function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // 10-12: compression, filter, interlace — all zero.

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------

const pngPath = join(ROOT, 'build', 'icon.png');
mkdirSync(dirname(pngPath), { recursive: true });
writeFileSync(pngPath, encodePng(render(), DESIGN.size));
console.log(`wrote ${pngPath} (${DESIGN.size}x${DESIGN.size})`);

if (process.platform !== 'darwin') {
  console.log('not macOS — skipping icon.icns; electron-builder will convert icon.png itself');
  process.exit(0);
}

// icns: sips resizes the master, iconutil packs the set. Both ship with macOS.
const iconset = join(ROOT, 'build', 'icon.iconset');
rmSync(iconset, { recursive: true, force: true });
mkdirSync(iconset);

for (const size of [16, 32, 128, 256, 512]) {
  for (const [scale, suffix] of [
    [1, ''],
    [2, '@2x'],
  ]) {
    const target = join(iconset, `icon_${size}x${size}${suffix}.png`);
    execFileSync('sips', ['-z', String(size * scale), String(size * scale), pngPath, '--out', target], {
      stdio: 'ignore',
    });
  }
}

const icnsPath = join(ROOT, 'build', 'icon.icns');
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icnsPath]);
rmSync(iconset, { recursive: true, force: true });
console.log(`wrote ${icnsPath}`);
