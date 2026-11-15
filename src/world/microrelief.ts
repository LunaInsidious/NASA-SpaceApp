// 見た目だけの細かい起伏：元のデータ（5 m ごと）より小さいクレーター。
// 地形の形そのもの（env.heightAt）は実データのまま。3D の地面・宇宙飛行士・石・施設の見た目だけが、この上に乗る。
// sim（建てられるか、日照で発電するか）は実データの地形で決める
import type { TerrainEnv } from '../env/api.ts';
import {
  MICRO_CRATER_BUCKET_M,
  MICRO_CRATER_CLEAR_RADIUS_M,
  MICRO_CRATER_COUNT,
  MICRO_CRATER_DEPTH_RATIO,
  MICRO_CRATER_MAX_RADIUS_M,
  MICRO_CRATER_MIN_RADIUS_M,
  MICRO_CRATER_OUTER,
  MICRO_CRATER_RIM_RATIO,
  MICRO_SHADOW_STEP_M,
} from './tuning.ts';

export interface Crater {
  x: number;
  z: number;
  radius: number;
  depth: number;
  rim: number;
}

export interface MicroRelief {
  craters: readonly Crater[];
  /** 見た目の地面の高さ（実データの地形＋小さなクレーター） */
  groundAt(x: number, z: number): number;
  /** その高さの点に日が当たるか（実データの地形の影と、小さなクレーターの中の影） */
  sunlitAt(x: number, z: number, y: number, sunAzimuthRad: number): boolean;
}

/** 決まった並びの乱数（見た目だけ。毎回同じ置き方にする） */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
}

/** 真ん中からの距離の割合 s のところの高さ（底は深く、縁は少し盛り上がり、外へなだらかに戻る） */
function profile(crater: Crater, s: number): number {
  if (s < 1) {
    return -crater.depth + (crater.depth + crater.rim) * s * s;
  }
  if (s < MICRO_CRATER_OUTER) {
    const t = (s - 1) / (MICRO_CRATER_OUTER - 1);
    return crater.rim * (1 - t) * (1 - t);
  }
  return 0;
}

export function createMicroRelief(env: TerrainEnv, seed: number): MicroRelief {
  const random = seededRandom(seed);
  const half = env.sizeMeters / 2;
  const [landerX, landerZ] = env.landerPosition;
  const craters: Crater[] = [];
  for (
    let tries = 0;
    craters.length < MICRO_CRATER_COUNT && tries < MICRO_CRATER_COUNT * 6;
    tries++
  ) {
    // 小さいものほど多い（月のクレーターの数え方：大きさが半分になると数はおよそ4倍）
    const u = random();
    const radius =
      1 /
      Math.sqrt(
        1 / MICRO_CRATER_MIN_RADIUS_M ** 2 -
          u * (1 / MICRO_CRATER_MIN_RADIUS_M ** 2 - 1 / MICRO_CRATER_MAX_RADIUS_M ** 2),
      );
    const x = (random() * 2 - 1) * (half - radius * MICRO_CRATER_OUTER);
    const z = (random() * 2 - 1) * (half - radius * MICRO_CRATER_OUTER);
    if (
      Math.hypot(x - landerX, z - landerZ) <
      MICRO_CRATER_CLEAR_RADIUS_M + radius * MICRO_CRATER_OUTER
    ) {
      continue;
    }
    if (
      env.iceSpots.some(
        (s) => Math.hypot(x - s.x, z - s.z) < s.radius + radius * MICRO_CRATER_OUTER,
      )
    ) {
      continue;
    }
    // 新しいクレーターほど深い。古いものはならされて浅い
    const freshness = 0.45 + random() * 0.55;
    craters.push({
      x,
      z,
      radius,
      depth: radius * 2 * MICRO_CRATER_DEPTH_RATIO * freshness,
      rim: radius * 2 * MICRO_CRATER_RIM_RATIO * freshness,
    });
  }

  // 近くのクレーターをすぐ探せるように、マス目ごとに入れておく
  const buckets = new Map<string, Crater[]>();
  const key = (bx: number, bz: number) => `${bx},${bz}`;
  for (const crater of craters) {
    const reach = crater.radius * MICRO_CRATER_OUTER;
    for (
      let bx = Math.floor((crater.x - reach) / MICRO_CRATER_BUCKET_M);
      bx <= Math.floor((crater.x + reach) / MICRO_CRATER_BUCKET_M);
      bx++
    ) {
      for (
        let bz = Math.floor((crater.z - reach) / MICRO_CRATER_BUCKET_M);
        bz <= Math.floor((crater.z + reach) / MICRO_CRATER_BUCKET_M);
        bz++
      ) {
        const list = buckets.get(key(bx, bz)) ?? [];
        list.push(crater);
        buckets.set(key(bx, bz), list);
      }
    }
  }
  const nearby = (x: number, z: number): readonly Crater[] =>
    buckets.get(
      key(Math.floor(x / MICRO_CRATER_BUCKET_M), Math.floor(z / MICRO_CRATER_BUCKET_M)),
    ) ?? [];

  const offsetAt = (x: number, z: number): number => {
    let h = 0;
    for (const crater of nearby(x, z)) {
      h += profile(crater, Math.hypot(x - crater.x, z - crater.z) / crater.radius);
    }
    return h;
  };
  const groundAt = (x: number, z: number) => env.heightAt(x, z) + offsetAt(x, z);
  const longest = MICRO_CRATER_MAX_RADIUS_M * MICRO_CRATER_OUTER * 2;

  return {
    craters,
    groundAt,
    sunlitAt(x, z, y, sunAzimuthRad) {
      // 実データの地形の影（地面からの高さは同じにして調べる）
      const above = Math.max(0, y - groundAt(x, z));
      if (!env.isSunlit(x, z, env.heightAt(x, z) + above, sunAzimuthRad)) {
        return false;
      }
      // 小さなクレーターの中の影：太陽の方へ進み、クレーターの縁や壁が光をさえぎるか
      if (nearby(x, z).length === 0) {
        return true;
      }
      const sun = env.sunDirection(sunAzimuthRad);
      const horizontal = Math.hypot(sun.x, sun.z);
      if (horizontal < 1e-6) {
        return true;
      }
      const dx = sun.x / horizontal;
      const dz = sun.z / horizontal;
      const rise = sun.y / horizontal;
      for (let d = MICRO_SHADOW_STEP_M; d <= longest; d += MICRO_SHADOW_STEP_M) {
        const px = x + dx * d;
        const pz = z + dz * d;
        if (Math.abs(px) > half || Math.abs(pz) > half) {
          return true;
        }
        if (groundAt(px, pz) > y + d * rise) {
          return false;
        }
      }
      return true;
    },
  };
}
