// 将 client/public/icon.svg 的太阳图标光栅化为 256x256 并打包为 ICO
// 无第三方依赖: 手工光栅化几何图形 + zlib 生成 PNG + ICO 容器封装
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const SS = 4; // 4x4 超采样
const SIZES = [16, 32, 48, 256]; // ICO 多尺寸

// ---- 颜色 ----
const BG = [30, 58, 138];      // #1e3a8a
const RAY = [251, 191, 36];    // #fbbf24
const SUN_A = [253, 224, 71];  // #fde047
const SUN_B = [249, 115, 22];  // #f97316

// ---- 几何 (与 icon.svg 保持一致) ----
// 光芒线段 [x1,y1,x2,y2]
const RAYS = [
  [128, 50, 128, 72],
  [128, 184, 128, 206],
  [50, 128, 72, 128],
  [184, 128, 206, 128],
  [72.8, 72.8, 88.4, 88.4],
  [167.6, 167.6, 183.2, 183.2],
  [183.2, 72.8, 167.6, 88.4],
  [88.4, 167.6, 72.8, 183.2],
];

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// 圆角矩形 (rx 按尺寸缩放) 内判定
function inRoundedRect(x, y, S) {
  if (x < 0 || y < 0 || x > S || y > S) return false;
  const r = (56 / 256) * S;
  const corners = [[r, r], [S - r, r], [r, S - r], [S - r, S - r]];
  const inX = x >= r && x <= S - r;
  const inY = y >= r && y <= S - r;
  if (inX || inY) return true;
  for (const [cx, cy] of corners) {
    if ((x < r || x > S - r) && (y < r || y > S - r)) {
      if (Math.hypot(x - cx, y - cy) <= r) return true;
    }
  }
  return false;
}

// 采样单点颜色 [r,g,b,a]，S 为目标尺寸
function sample(x, y, S) {
  if (!inRoundedRect(x, y, S)) return [0, 0, 0, 0];
  const s = S / 256; // 几何缩放系数
  const cx0 = 128 * s, r0 = 42 * s;
  // 太阳本体 (对角线性渐变)
  const dxc = x - cx0, dyc = y - cx0;
  if (dxc * dxc + dyc * dyc <= r0 * r0) {
    let t = ((x - 86 * s) + (y - 86 * s)) / (2 * 84 * s);
    t = Math.max(0, Math.min(1, t));
    return [
      SUN_A[0] + (SUN_B[0] - SUN_A[0]) * t,
      SUN_A[1] + (SUN_B[1] - SUN_A[1]) * t,
      SUN_A[2] + (SUN_B[2] - SUN_A[2]) * t,
      255,
    ];
  }
  // 光芒 (半宽 8 按尺寸缩放, 圆头)
  const half = 8 * s;
  for (const [x1, y1, x2, y2] of RAYS) {
    if (distToSegment(x, y, x1 * s, y1 * s, x2 * s, y2 * s) <= half) return [...RAY, 255];
  }
  return [...BG, 255];
}

// ---- 光栅化 (超采样平均) ----
function rasterize(S) {
  const pixels = Buffer.alloc(S * S * 4);
  for (let py = 0; py < S; py++) {
    for (let px = 0; px < S; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [cr, cg, cb, ca] = sample(px + (sx + 0.5) / SS, py + (sy + 0.5) / SS, S);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const n = SS * SS;
      const o = (py * S + px) * 4;
      if (a === 0) continue;
      pixels[o] = Math.round(r / a);
      pixels[o + 1] = Math.round(g / a);
      pixels[o + 2] = Math.round(b / a);
      pixels[o + 3] = Math.round(a / n);
    }
  }
  return pixels;
}

// ---- PNG 编码 ----
const crcTable = (() => {
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
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  // 每行加 filter type 0 前缀
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const png = encodePng(256, 256, rasterize(256));

// ---- ICO 封装 (使用 png-to-ico 生成 NSIS 兼容的经典 BMP 格式) ----
const pngToIco = require("png-to-ico").default || require("png-to-ico");

async function main() {
  const pngBuffers = SIZES.map((s) => encodePng(s, s, rasterize(s)));
  const ico = await pngToIco(pngBuffers);

  // ---- 输出 ----
  const buildDir = path.join(__dirname, "..", "build");
  fs.mkdirSync(buildDir, { recursive: true });
  fs.writeFileSync(path.join(buildDir, "icon.ico"), ico);
  fs.writeFileSync(path.join(buildDir, "icon.png"), png);
  console.log("OK: build/icon.ico (" + ico.length + " bytes, " + SIZES.length + " sizes) + build/icon.png");
}

main().catch((err) => {
  console.error("gen-icon failed:", err);
  process.exit(1);
});
