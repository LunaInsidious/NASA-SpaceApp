// 実データの地形の Env。座標は x が東（南極の極投影の X）、z が地球のある月の表側の向き（Y）、y が上。
// 単位はゲームの m（実寸を site.json の scale で縦横とも同じ割合で縮めたもの）
import type { Values } from '../contracts/index.ts';
import type { TerrainEnv } from './api.ts';
import type { Site } from './site.ts';

type Vec3 = { x: number; y: number; z: number };

const DEG = Math.PI / 180;

/** 地形の形（高さの格子）と、着陸船・氷の場所 */
export interface TerrainData {
  sizeMeters: number;
  resolution: number;
  heights: Float32Array;
  latitudeDeg: number;
  landerPosition: [number, number];
  iceSpots: { x: number; z: number; radius: number }[];
}

/** site.json と高さのファイル（Float32 のリトルエンディアン）から、地形の形を作る。形が合わなければ止める */
export function terrainFromSite(site: Site, heightFile: ArrayBufferLike): TerrainData {
  const expected = site.resolution * site.resolution * Float32Array.BYTES_PER_ELEMENT;
  if (heightFile.byteLength !== expected) {
    throw new Error(
      `地形の高さのファイルの大きさが違う（${heightFile.byteLength} バイト、${expected} バイトのはず）`,
    );
  }
  return {
    sizeMeters: site.sizeMeters,
    resolution: site.resolution,
    heights: new Float32Array(heightFile),
    latitudeDeg: site.latitudeDeg,
    landerPosition: site.landerPosition,
    iceSpots: site.iceSpots,
  };
}

export function createTerrainEnv(data: TerrainData, values: Values): TerrainEnv {
  const { sizeMeters, resolution, heights, latitudeDeg, landerPosition, iceSpots } = data;
  if (heights.length !== resolution * resolution) {
    throw new Error('地形の高さの数が resolution × resolution ではない');
  }
  const sunElevationDeg = values.moon.sunElevationDeg.value;
  const earthElevationDeg = values.moon.earthElevationDeg.value;
  const antennaHeight = values.terrain.antennaHeightMeters.value;
  const dustPeak = values.terrain.landerDustPeak.value;
  const dustRadius = values.terrain.landerDustRadiusMeters.value;
  const polarLatitudeDeg = values.terrain.polarLatitudeDeg.value;

  const half = sizeMeters / 2;
  const cell = sizeMeters / (resolution - 1);
  const [landerX, landerZ] = landerPosition;
  let maxHeight = Number.NEGATIVE_INFINITY;
  for (const h of heights) {
    maxHeight = Math.max(maxHeight, h);
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

  /** (x, y, z) から dir の向きへ進み、地形に遮られるか。地図の外は遮らないとみなす */
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
  /** 方位 az（+z から +x へ回る角度）と高度 el から単位ベクトルを作る */
  const fromAzimuthElevation = (az: number, el: number): Vec3 => ({
    x: Math.cos(el) * Math.sin(az),
    y: Math.sin(el),
    z: Math.cos(el) * Math.cos(az),
  });

  const sunDirection = (sunAzimuthRad: number): Vec3 => {
    if (Math.abs(latitudeDeg) >= polarLatitudeDeg) {
      // 極のそばでは太陽は地平線すれすれを一周する。極からずれた分だけ一日のうちで高度が上下する
      const offPoleDeg = 90 - Math.abs(latitudeDeg);
      const el = (sunElevationDeg + offPoleDeg * Math.cos(sunAzimuthRad)) * DEG;
      return fromAzimuthElevation(sunAzimuthRad, el);
    }
    // 極でない場所：sunAzimuthRad を時角として、赤緯 0 の太陽の向きを求める
    // 季節（赤緯）の変化は入れない（かんたんにするため。人間の判断）
    const h = sunAzimuthRad;
    return {
      x: -Math.sin(h),
      y: Math.cos(latitudeRad) * Math.cos(h),
      z: -Math.sin(latitudeRad) * Math.cos(h),
    };
  };

  const earth = fromAzimuthElevation(0, earthElevationDeg * DEG);
  const earthDirection = (): Vec3 => ({ ...earth });

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
    isEarthVisible: (x, z) => !isOccluded(x, heightAt(x, z) + antennaHeight, z, earth),
    isIceAt: (x, z) => iceSpots.some((s) => Math.hypot(x - s.x, z - s.z) <= s.radius),
    dustFactorAt: (x, z) => {
      const d2 = (x - landerX) ** 2 + (z - landerZ) ** 2;
      return 1 + dustPeak * Math.exp(-d2 / (dustRadius * dustRadius));
    },
  };
}
