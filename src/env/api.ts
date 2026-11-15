// env/ が外（main.ts、world/）に見せる型。実装は src/env/index.ts
import type { Env } from '../contracts/index.ts';

/** Env に、地形を描くための情報を足したもの */
export interface TerrainEnv extends Env {
  sizeMeters: number; // 一辺の長さ。地形は x, z とも -size/2〜+size/2
  resolution: number; // 一辺の頂点の数
  heights: Float32Array; // resolution * resolution。行が z、列が x の順
  landerPosition: [number, number]; // [x, z]
  iceSpots: { x: number; z: number; radius: number }[];
  /** 太陽の方向の単位ベクトル（y が上）。緯度で変わる形にしてある */
  sunDirection(sunAzimuthRad: number): { x: number; y: number; z: number };
  /** 地球の方向の単位ベクトル（地球が地平線の上にいるときの向き） */
  earthDirection(): { x: number; y: number; z: number };
}
