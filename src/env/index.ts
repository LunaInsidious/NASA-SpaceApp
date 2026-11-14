// 自動生成の地形の Env。座標は x が東、z が北（地球のある月の表側の向き）、y が上。単位は m
import type { Values } from '../contracts/index.ts';
import type { TerrainEnv } from './api.ts';
import {
  ANTENNA_HEIGHT_M,
  CRATER_COUNT,
  CRATER_DEPTH_MAX_M,
  CRATER_DEPTH_MIN_M,
  CRATER_RADIUS_MAX_M,
  CRATER_RADIUS_MIN_M,
  CRATER_RIM_HEIGHT_M,
  CRATER_RIM_WIDTH_M,
  CRATER_RING_MAX_M,
  CRATER_RING_MIN_M,
  DUST_PEAK,
  DUST_RADIUS_M,
  HILL_HEIGHT_M,
  HILL_OFFSET_M,
  HILL_RADIUS_M,
  ICE_RADIUS_RATIO,
  LANDER_POSITION,
  NOISE_AMPLITUDE_M,
  NOISE_CELL_M,
  PLATEAU_DOME_SLOPE,
  PLATEAU_EDGE_HEIGHT_M,
  PLATEAU_INNER_RADIUS_M,
  PLATEAU_OUTER_RADIUS_M,
  PLATEAU_TOP_HEIGHT_M,
  POLAR_LATITUDE_DEG,
  TERRAIN_RESOLUTION,
} from './tuning.ts';

type Vec3 = { x: number; y: number; z: number };

const DEG = Math.PI / 180;

/** seed から決まる 0〜1 の乱数（mulberry32） */
function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** 格子の値をなめらかにつないだノイズ（-1〜1） */
function createValueNoise(
  random: () => number,
  cellMeters: number,
): (x: number, z: number) => number {
  const size = 64;
  const table = Array.from({ length: size * size }, () => random() * 2 - 1);
  const at = (ix: number, iz: number) =>
    table[(((iz % size) + size) % size) * size + (((ix % size) + size) % size)];
  return (x, z) => {
    const fx = x / cellMeters;
    const fz = z / cellMeters;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = smoothstep(0, 1, fx - ix);
    const tz = smoothstep(0, 1, fz - iz);
    const a = at(ix, iz) + (at(ix + 1, iz) - at(ix, iz)) * tx;
    const b = at(ix, iz + 1) + (at(ix + 1, iz + 1) - at(ix, iz + 1)) * tx;
    return a + (b - a) * tz;
  };
}

interface Crater {
  x: number;
  z: number;
  radius: number;
  depth: number;
}

function placeCraters(random: () => number): Crater[] {
  const craters: Crater[] = [];
  const startAngle = random() * Math.PI * 2;
  for (let i = 0; i < CRATER_COUNT; i++) {
    // 等間隔の向きに少し揺らぎを入れて、クレーター同士が重なりすぎないようにする
    const angle = startAngle + (i / CRATER_COUNT) * Math.PI * 2 + (random() - 0.5) * 0.6;
    const ring = CRATER_RING_MIN_M + random() * (CRATER_RING_MAX_M - CRATER_RING_MIN_M);
    craters.push({
      x: LANDER_POSITION[0] + Math.sin(angle) * ring,
      z: LANDER_POSITION[1] + Math.cos(angle) * ring,
      radius: CRATER_RADIUS_MIN_M + random() * (CRATER_RADIUS_MAX_M - CRATER_RADIUS_MIN_M),
      depth: CRATER_DEPTH_MIN_M + random() * (CRATER_DEPTH_MAX_M - CRATER_DEPTH_MIN_M),
    });
  }
  return craters;
}

export function createProceduralEnv(values: Values, seed: number): TerrainEnv {
  const sizeMeters = values.terrain.sizeMeters.value;
  const latitudeDeg = values.terrain.latitudeDeg.value;
  const sunElevationDeg = values.moon.sunElevationDeg.value;
  const earthElevationDeg = values.moon.earthElevationDeg.value;

  const resolution = TERRAIN_RESOLUTION;
  const half = sizeMeters / 2;
  const cell = sizeMeters / (resolution - 1);
  const random = createRandom(seed);
  const noise = createValueNoise(random, NOISE_CELL_M);
  const craters = placeCraters(random);
  const [landerX, landerZ] = LANDER_POSITION;

  const shapeAt = (x: number, z: number): number => {
    const r = Math.hypot(x - landerX, z - landerZ);
    const plateau = 1 - smoothstep(PLATEAU_INNER_RADIUS_M, PLATEAU_OUTER_RADIUS_M, r);
    let h =
      PLATEAU_EDGE_HEIGHT_M +
      (PLATEAU_TOP_HEIGHT_M - PLATEAU_EDGE_HEIGHT_M) * plateau -
      PLATEAU_DOME_SLOPE * r * plateau;
    const hillDist2 = (x - landerX - HILL_OFFSET_M[0]) ** 2 + (z - landerZ - HILL_OFFSET_M[1]) ** 2;
    h += HILL_HEIGHT_M * Math.exp(-hillDist2 / (HILL_RADIUS_M * HILL_RADIUS_M));
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d < c.radius) {
        const t = d / c.radius;
        h -= c.depth * (1 - t * t);
      }
      h += CRATER_RIM_HEIGHT_M * Math.exp(-(((d - c.radius) / CRATER_RIM_WIDTH_M) ** 2));
    }
    return h + noise(x, z) * NOISE_AMPLITUDE_M;
  };

  const heights = new Float32Array(resolution * resolution);
  let maxHeight = 0;
  for (let iz = 0; iz < resolution; iz++) {
    for (let ix = 0; ix < resolution; ix++) {
      const h = shapeAt(-half + ix * cell, -half + iz * cell);
      heights[iz * resolution + ix] = h;
      maxHeight = Math.max(maxHeight, h);
    }
  }

  const heightAt = (x: number, z: number): number => {
    const fx = Math.min(resolution - 1, Math.max(0, (x + half) / cell));
    const fz = Math.min(resolution - 1, Math.max(0, (z + half) / cell));
    const ix = Math.min(resolution - 2, Math.floor(fx));
    const iz = Math.min(resolution - 2, Math.floor(fz));
    const tx = fx - ix;
    const tz = fz - iz;
    const i = iz * resolution + ix;
    const a = heights[i] + (heights[i + 1] - heights[i]) * tx;
    const b =
      heights[i + resolution] + (heights[i + resolution + 1] - heights[i + resolution]) * tx;
    return a + (b - a) * tz;
  };

  const isInside = (x: number, z: number) => x >= -half && x <= half && z >= -half && z <= half;

  /** (x, y, z) から dir の向きへ進み、地形に遮られるか。地図の外は高さ0とみなす */
  const isOccluded = (x: number, y: number, z: number, dir: Vec3): boolean => {
    if (dir.y <= 0) return true; // 地平線より下
    const horizontal = Math.hypot(dir.x, dir.z);
    if (horizontal < 1e-6) return false;
    const stepLength = cell / horizontal; // 1歩で水平に1マス進む
    let px = x;
    let py = y;
    let pz = z;
    for (;;) {
      px += dir.x * stepLength;
      py += dir.y * stepLength;
      pz += dir.z * stepLength;
      if (!isInside(px, pz) || py > maxHeight) return false;
      if (heightAt(px, pz) > py) return true;
    }
  };

  const latitudeRad = latitudeDeg * DEG;
  /** 方位 az（北 = +z から東 = +x へ回る角度）と高度 el から単位ベクトルを作る */
  const fromAzimuthElevation = (az: number, el: number): Vec3 => ({
    x: Math.cos(el) * Math.sin(az),
    y: Math.sin(el),
    z: Math.cos(el) * Math.cos(az),
  });

  const sunDirection = (sunAzimuthRad: number): Vec3 => {
    if (Math.abs(latitudeDeg) >= POLAR_LATITUDE_DEG) {
      // 極のそばでは太陽は地平線すれすれを一周する。極からずれた分だけ一日のうちで高度が上下する
      const offPoleDeg = 90 - Math.abs(latitudeDeg);
      const el = (sunElevationDeg + offPoleDeg * Math.cos(sunAzimuthRad)) * DEG;
      return fromAzimuthElevation(sunAzimuthRad, el);
    }
    // 極でない場所：sunAzimuthRad を時角として、赤緯 0 の太陽の向きを求める
    // TODO(人間に確認): 季節（赤緯）の変化は入れていない
    const h = sunAzimuthRad;
    return {
      x: -Math.sin(h),
      y: Math.cos(latitudeRad) * Math.cos(h),
      z: -Math.sin(latitudeRad) * Math.cos(h),
    };
  };

  const earth = fromAzimuthElevation(0, earthElevationDeg * DEG);
  const earthDirection = (): Vec3 => ({ ...earth });

  const iceSpots = craters.map((c) => ({ x: c.x, z: c.z, radius: c.radius * ICE_RADIUS_RATIO }));

  return {
    sizeMeters,
    resolution,
    heights,
    landerPosition: [landerX, landerZ],
    iceSpots,
    sunDirection,
    earthDirection,
    heightAt,
    isSunlit: (x, z, y, sunAzimuthRad) => !isOccluded(x, y, z, sunDirection(sunAzimuthRad)),
    isEarthVisible: (x, z) => !isOccluded(x, heightAt(x, z) + ANTENNA_HEIGHT_M, z, earth),
    isIceAt: (x, z) => iceSpots.some((s) => Math.hypot(x - s.x, z - s.z) <= s.radius),
    dustFactorAt: (x, z) => {
      const d2 = (x - landerX) ** 2 + (z - landerZ) ** 2;
      return 1 + DUST_PEAK * Math.exp(-d2 / (DUST_RADIUS_M * DUST_RADIUS_M));
    },
  };
}
