// NASA PGDA の月南極の地形（LOLA 5 m/画素の GeoTIFF、Barker ほか 2021）から、ゲームの地形を作る。
// 指定した中心のまわりを切り出し、縦横を同じ割合（scale 分の1）で縮めて public/terrain/<地点>/ に書く：
//   height.bin        ゲームの高さ（m）。Float32 のリトルエンディアン、行が z（地球の向き）、列が x（東）
//   illumination.png  平均の日照率（白いほどよく日が当たる。上が地球の向き）。人間が PGDA の日照の画像と見比べる用
//   outer.bin         まわりの広い範囲の高さ（見るだけ。歩けない）。同じ縮尺・同じ高さの基準。行と列の向きは height.bin と同じ
//   site.json         出典、範囲、縮尺、緯度、着陸船の位置、氷の場所
// 日照と氷（永久影）は、ゲームと同じ計算（src/env の createTerrainEnv）で求める。だからゲームの中の影と氷の場所が合う。
// 使い方（引数はすべて要る）:
//   node tools/make-terrain.ts --input <GeoTIFF> --out public/terrain/site01 --name "Site01 Connecting ridge"
//     --center <X>,<Y> --crop <実寸の一辺 m> --scale <縮める割合> --resolution <一辺の頂点の数>
//     --azimuths <日照を調べる太陽の向きの数> --ice-min-radius <氷にする永久影の最小の半径 m（ゲーム）>
//     --lander-search <着陸船を探す中心からの距離 m（ゲーム）> --lander-flat-radius <平らであってほしい半径 m（ゲーム）>
//     --lander-max-slope-deg <着陸船の場所の最大の傾き 度> --lander-lit-radius <日なたであってほしい半径 m（ゲーム）>
//     --outer-crop <まわりの見える範囲の実寸の一辺 m> --outer-resolution <その一辺の頂点の数>
// GeoTIFF は圧縮なし・32 ビット浮動小数・ストリップ形式だけを読む（PGDA の LOLA_5mpp のファイルはこの形）。違えば止める

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
import type { Values } from '../src/contracts/index.ts';
import { createTerrainEnv } from '../src/env/index.ts';
import type { Site } from '../src/env/site.ts';
import { SUNLIT_SAMPLE_OFFSET_M } from '../src/world/tuning.ts';

const MOON_RADIUS_M = 1737400; // PGDA の LOLA の基準の球の半径
const SOURCE = 'NASA GSFC PGDA: High-Resolution LOLA Topography for Lunar South Pole Sites';
const URL_PAGE = 'https://pgda.gsfc.nasa.gov/products/78';
const CITATION =
  'Barker, M.K. et al. (2021) Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on illumination conditions. Planetary and Space Science 203, 105119. doi:10.1016/j.pss.2020.105119';

// ---- 引数（すべて要る。足りなければ止める） ----
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key.startsWith('--') || value === undefined) {
    throw new Error(`引数の形が違う: ${key}`);
  }
  args.set(key.slice(2), value);
}
const arg = (key: string): string => {
  const v = args.get(key);
  if (v === undefined) {
    throw new Error(`--${key} がない（使い方は tools/make-terrain.ts の先頭）`);
  }
  return v;
};
const numArg = (key: string): number => {
  const v = Number(arg(key));
  if (!Number.isFinite(v)) {
    throw new Error(`--${key} が数ではない`);
  }
  return v;
};
const [centerX, centerY] = arg('center').split(',').map(Number);
if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
  throw new Error('--center は X,Y（極投影の m）');
}
const cropMeters = numArg('crop');
const scale = numArg('scale');
const resolution = numArg('resolution');
const azimuths = numArg('azimuths');
const iceMinRadius = numArg('ice-min-radius');
const landerSearch = numArg('lander-search');
const landerFlatRadius = numArg('lander-flat-radius');
const landerLitRadius = numArg('lander-lit-radius');
const landerMaxSlopeDeg = numArg('lander-max-slope-deg');
const outDir = arg('out');
const outerCropMeters = numArg('outer-crop');
const outerResolution = numArg('outer-resolution');
if (outerCropMeters <= cropMeters) {
  throw new Error('--outer-crop は --crop より大きくする（まわりの見える範囲）');
}
const name = arg('name');

// ---- GeoTIFF を読む ----
const file = readFileSync(arg('input'));
const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
const littleEndian = view.getUint16(0) === 0x4949;
if (!littleEndian && view.getUint16(0) !== 0x4d4d) {
  throw new Error('TIFF ではない');
}
const u16 = (o: number) => view.getUint16(o, littleEndian);
const u32 = (o: number) => view.getUint32(o, littleEndian);
const TYPE_BYTES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8 };
const tags = new Map<number, number[]>();
{
  const ifd = u32(4);
  for (let i = 0; i < u16(ifd); i++) {
    const entry = ifd + 2 + i * 12;
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    const size = TYPE_BYTES[type];
    if (size === undefined) continue;
    const at = size * count <= 4 ? entry + 8 : u32(entry + 8);
    const values: number[] = [];
    for (let k = 0; k < count; k++) {
      const o = at + k * size;
      values.push(
        type === 3
          ? u16(o)
          : type === 4
            ? u32(o)
            : type === 11
              ? view.getFloat32(o, littleEndian)
              : type === 12
                ? view.getFloat64(o, littleEndian)
                : view.getUint8(o),
      );
    }
    tags.set(u16(entry), values);
  }
}
const tag = (id: number, label: string): number[] => {
  const v = tags.get(id);
  if (v === undefined) {
    throw new Error(`GeoTIFF に ${label}（タグ ${id}）がない`);
  }
  return v;
};
const width = tag(256, '幅')[0];
const height = tag(257, '高さ')[0];
if (tag(259, '圧縮')[0] !== 1 || tag(258, 'ビット数')[0] !== 32 || tag(339, '数の形')[0] !== 3) {
  throw new Error('圧縮なし・32 ビット浮動小数の GeoTIFF だけを読む');
}
const stripOffsets = tag(273, 'ストリップの位置');
const rowsPerStrip = tag(278, 'ストリップの行数')[0];
const [pixelX, pixelY] = tag(33550, '画素の大きさ');
const tiepoint = tag(33922, '基準点');
const originX = tiepoint[3];
const originY = tiepoint[4];
const pixelAt = (row: number, col: number): number => {
  const strip = Math.floor(row / rowsPerStrip);
  const o = stripOffsets[strip] + ((row - strip * rowsPerStrip) * width + col) * 4;
  return view.getFloat32(o, littleEndian);
};
/** 極投影の (X, Y) の高さ（m）。画素の間は線形に補う。範囲の外なら止める */
const realHeightAt = (X: number, Y: number): number => {
  const c = (X - originX) / pixelX - 0.5;
  const r = (originY - Y) / pixelY - 0.5;
  if (c < 0 || r < 0 || c > width - 1 || r > height - 1) {
    throw new Error(`切り出す範囲が GeoTIFF の外に出た（X ${X}, Y ${Y}）`);
  }
  const c0 = Math.min(width - 2, Math.floor(c));
  const r0 = Math.min(height - 2, Math.floor(r));
  const tc = c - c0;
  const tr = r - r0;
  const a = pixelAt(r0, c0) + (pixelAt(r0, c0 + 1) - pixelAt(r0, c0)) * tc;
  const b = pixelAt(r0 + 1, c0) + (pixelAt(r0 + 1, c0 + 1) - pixelAt(r0 + 1, c0)) * tc;
  return a + (b - a) * tr;
};

// ---- 切り出して縮める ----
const sizeMeters = cropMeters / scale;
const real = new Float64Array(resolution * resolution);
let base = Number.POSITIVE_INFINITY;
for (let iz = 0; iz < resolution; iz++) {
  for (let ix = 0; ix < resolution; ix++) {
    const X = centerX - cropMeters / 2 + (ix * cropMeters) / (resolution - 1);
    const Y = centerY - cropMeters / 2 + (iz * cropMeters) / (resolution - 1);
    const h = realHeightAt(X, Y);
    if (!Number.isFinite(h)) {
      throw new Error(`高さが数ではない（X ${X}, Y ${Y}）`);
    }
    real[iz * resolution + ix] = h;
    base = Math.min(base, h);
  }
}
const heights = new Float32Array(resolution * resolution);
for (let i = 0; i < heights.length; i++) {
  heights[i] = (real[i] - base) / scale;
}
// まわりの見える範囲（歩く範囲と同じ中心・同じ高さの基準・同じ縮尺）
const outerHeights = new Float32Array(outerResolution * outerResolution);
for (let iz = 0; iz < outerResolution; iz++) {
  for (let ix = 0; ix < outerResolution; ix++) {
    const X = centerX - outerCropMeters / 2 + (ix * outerCropMeters) / (outerResolution - 1);
    const Y = centerY - outerCropMeters / 2 + (iz * outerCropMeters) / (outerResolution - 1);
    const h = realHeightAt(X, Y);
    if (!Number.isFinite(h)) {
      throw new Error(`まわりの高さが数ではない（X ${X}, Y ${Y}）`);
    }
    outerHeights[iz * outerResolution + ix] = (h - base) / scale;
  }
}
const rho = Math.hypot(centerX, centerY);
const latitudeDeg = -(90 - (2 * Math.atan(rho / (2 * MOON_RADIUS_M)) * 180) / Math.PI);

// ---- 日照：ゲームと同じ計算で、太陽の向きを一周させて数える ----
const values = JSON.parse(readFileSync('data/values.json', 'utf8')) as Values;
const cell = sizeMeters / (resolution - 1);
const half = sizeMeters / 2;
const env = createTerrainEnv(
  { sizeMeters, resolution, heights, latitudeDeg, landerPosition: [0, 0], iceSpots: [] },
  values,
);
const litCount = new Uint16Array(resolution * resolution);
for (let a = 0; a < azimuths; a++) {
  const az = (a / azimuths) * Math.PI * 2;
  for (let iz = 0; iz < resolution; iz++) {
    for (let ix = 0; ix < resolution; ix++) {
      const i = iz * resolution + ix;
      if (
        env.isSunlit(-half + ix * cell, -half + iz * cell, heights[i] + SUNLIT_SAMPLE_OFFSET_M, az)
      ) {
        litCount[i]++;
      }
    }
  }
}
const litFraction = (i: number) => litCount[i] / azimuths;

// ---- 氷：永久影（一度も日が当たらない）のまとまりを円にする ----
const iceSpots: Site['iceSpots'] = [];
{
  const seen = new Uint8Array(resolution * resolution);
  for (let start = 0; start < seen.length; start++) {
    if (seen[start] || litCount[start] > 0) continue;
    const stack = [start];
    seen[start] = 1;
    let count = 0;
    let sumX = 0;
    let sumZ = 0;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      const ix = i % resolution;
      const iz = Math.floor(i / resolution);
      count++;
      sumX += ix;
      sumZ += iz;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = ix + dx;
        const nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= resolution || nz >= resolution) continue;
        const n = nz * resolution + nx;
        if (!seen[n] && litCount[n] === 0) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    const radius = Math.sqrt(count / Math.PI) * cell;
    if (radius >= iceMinRadius) {
      iceSpots.push({
        x: round(-half + (sumX / count) * cell),
        z: round(-half + (sumZ / count) * cell),
        radius: round(radius),
      });
    }
  }
}
if (iceSpots.length === 0) {
  throw new Error('永久影が見つからない（--ice-min-radius を小さくするか、範囲を変える）');
}

// ---- 着陸船：中心の近くで、平らで、いちばん日が当たる場所 ----
const slopeDegAround = (ix: number, iz: number): number => {
  const steps = Math.round(landerFlatRadius / cell);
  const h0 = heights[iz * resolution + ix];
  let worst = 0;
  for (let dz = -steps; dz <= steps; dz++) {
    for (let dx = -steps; dx <= steps; dx++) {
      const d = Math.hypot(dx, dz);
      if (d === 0 || d > steps) continue;
      const nx = ix + dx;
      const nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= resolution || nz >= resolution) return 90;
      worst = Math.max(worst, Math.abs(heights[nz * resolution + nx] - h0) / (d * cell));
    }
  }
  return (Math.atan(worst) * 180) / Math.PI;
};
/** まわり（--lander-lit-radius の円）の平均の日照率。着陸船だけでなく、最初の居住モジュールや宇宙飛行士の場所も日なたにする */
const litAround = (ix: number, iz: number): number => {
  const steps = Math.round(landerLitRadius / cell);
  let sum = 0;
  let count = 0;
  for (let dz = -steps; dz <= steps; dz++) {
    for (let dx = -steps; dx <= steps; dx++) {
      if (Math.hypot(dx, dz) > steps) continue;
      const nx = ix + dx;
      const nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= resolution || nz >= resolution) return 0;
      sum += litFraction(nz * resolution + nx);
      count++;
    }
  }
  return sum / count;
};
let lander: { ix: number; iz: number; lit: number; dist: number } | null = null;
for (let iz = 0; iz < resolution; iz++) {
  for (let ix = 0; ix < resolution; ix++) {
    const dist = Math.hypot(-half + ix * cell, -half + iz * cell);
    if (dist > landerSearch) continue;
    if (
      iceSpots.some(
        (s) =>
          Math.hypot(-half + ix * cell - s.x, -half + iz * cell - s.z) <
          s.radius + landerFlatRadius,
      )
    ) {
      continue;
    }
    if (slopeDegAround(ix, iz) > landerMaxSlopeDeg) continue;
    const lit = litAround(ix, iz);
    if (
      lander === null ||
      lit > lander.lit + 1e-9 ||
      (Math.abs(lit - lander.lit) <= 1e-9 && dist < lander.dist)
    ) {
      lander = { ix, iz, lit, dist };
    }
  }
}
if (lander === null) {
  throw new Error(
    '着陸船を置ける平らな場所がない（--lander-search や --lander-max-slope-deg を見直す）',
  );
}
const landerPosition: [number, number] = [
  round(-half + lander.ix * cell),
  round(-half + lander.iz * cell),
];
iceSpots.sort(
  (a, b) =>
    Math.hypot(a.x - landerPosition[0], a.z - landerPosition[1]) -
    Math.hypot(b.x - landerPosition[0], b.z - landerPosition[1]),
);

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

// ---- 書き出す ----
mkdirSync(outDir, { recursive: true });
const heightFile = 'height.bin';
writeFileSync(`${outDir}/${heightFile}`, Buffer.from(heights.buffer));
const outerHeightFile = 'outer.bin';
writeFileSync(`${outDir}/${outerHeightFile}`, Buffer.from(outerHeights.buffer));
const site: Site = {
  name,
  source: SOURCE,
  url: URL_PAGE,
  citation: CITATION,
  scale,
  centerX,
  centerY,
  cropMeters,
  sizeMeters,
  resolution,
  baseHeightMeters: round(base),
  latitudeDeg: Math.round(latitudeDeg * 10000) / 10000,
  landerPosition,
  iceSpots,
  heightFile,
  outerSizeMeters: outerCropMeters / scale,
  outerResolution,
  outerHeightFile,
};
writeFileSync(`${outDir}/site.json`, `${JSON.stringify(site, null, 2)}\n`);

// 日照の画像（上が地球の向き = z の大きい方）
const png = Buffer.alloc((resolution + 1) * resolution);
for (let row = 0; row < resolution; row++) {
  const iz = resolution - 1 - row;
  png[row * (resolution + 1)] = 0;
  for (let ix = 0; ix < resolution; ix++) {
    png[row * (resolution + 1) + 1 + ix] = Math.round(litFraction(iz * resolution + ix) * 255);
  }
}
writeFileSync(`${outDir}/illumination.png`, encodeGrayPng(resolution, resolution, png));

function encodeGrayPng(w: number, h: number, rows: Buffer): Buffer {
  const chunk = (type: string, body: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typed = Buffer.concat([Buffer.from(type), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typed));
    return Buffer.concat([length, typed, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0);
  header.writeUInt32BE(h, 4);
  header[8] = 8; // ビット数
  header[9] = 0; // グレー
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 確かめるための数 ----
const nearestIce = iceSpots[0];
const earthLit = env.isEarthVisible(landerPosition[0], landerPosition[1]);
let maxH = 0;
for (const h of heights) maxH = Math.max(maxH, h);
console.log(
  [
    `地点: ${name}  緯度 ${site.latitudeDeg}°  ゲームの一辺 ${sizeMeters} m（実寸 ${cropMeters} m、1/${scale}）`,
    `高さ: 実寸 ${round(base)}〜${round(base + maxH * scale)} m → ゲーム 0〜${round(maxH)} m`,
    `着陸船: (${landerPosition.join(', ')})  まわりの日照率 ${Math.round(lander.lit * 100)}%  地球が見える: ${earthLit}`,
    `氷: ${iceSpots.length} か所。いちばん近いのは (${nearestIce.x}, ${nearestIce.z}) 半径 ${nearestIce.radius} m、着陸船から ${round(Math.hypot(nearestIce.x - landerPosition[0], nearestIce.z - landerPosition[1]))} m`,
    `書いた: ${outDir}/{${heightFile}, ${outerHeightFile}, site.json, illumination.png}`,
  ].join('\n'),
);
