// sim/ が外（main.ts、ui/、world/）に見せる型。実装は src/sim/index.ts
import type { CrewTask, FacilityKind } from '../contracts/index.ts';

/** HUD やメニューの表示に使う、SimState から計算した値 */
export interface SimView {
  day: number; // 着陸からの日数（小数）
  lifeSupportDays: { oxygen: number; water: number; food: number; min: number };
  power: {
    generationKw: number;
    consumptionKw: number;
    batteryKwh: number;
    batteryCapacityKwh: number;
  };
  shielding: {
    playerDoseMsv: number; // 操作中の宇宙飛行士の累積の被ばく量
    doseLimitMsv: number;
    indoorProtection: number; // 0〜1。屋内で線量を何割減らせるか（基地の守りの強さ）
  };
  tankRatio: number; // ボンベの酸素の残り 0〜1
  comm: { linked: boolean; earthUp: boolean; relaySatellites: number; unsentResearch: number };
  launch: {
    capacity: number; // 1回の打ち上げのコストの上限
    canOrderNow: boolean; // 今注文できるか（打ち上げの時期で、通信が通じている）
    hoursUntilNext: number; // 次に注文できるまで（ゲーム内の時間）
    deliveryHours: number; // 注文から届くまで
    inFlight: { id: string; hoursUntilArrival: number; totalCost: number }[];
  };
  crew: { count: number; capacity: number; byTask: Record<CrewTask, number> };
  facilityStatus: Record<
    string,
    { working: boolean; reason: 'shadow' | 'condition' | 'noPower' | 'noEarth' | null }
  >;
}

/** 地球と話せない理由。理由ごとに「やること」が違う */
export type CommLostReason = 'noAntenna' | 'noPower' | 'earthDown' | 'blocked';

/**
 * 建てる場所の判定。allowed：建てられるか。works：そこで動くか（太陽電池は日なた、アンテナは地球が見える、採掘機は氷の上）。
 * プレビューの色は allowed && works が緑、allowed && !works が黄、!allowed が赤
 */
export interface Placement {
  allowed: boolean;
  works: boolean;
  reason:
    | 'needsShadow'
    | 'notEnoughMaterials'
    | 'tooClose'
    | 'noSunlight'
    | 'noEarth'
    | 'noIce'
    | null;
}

export interface BuildCost {
  materials: number;
  energyKwh: number;
}

/** 施設を置くときの選択肢（遮蔽の壁の材料など） */
export interface BuildOptions {
  dustCover: boolean;
  shieldMaterial?: 'regolith' | 'water';
}

export type { FacilityKind };
