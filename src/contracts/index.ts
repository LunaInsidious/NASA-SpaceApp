// 契約（docs/SPEC.md「契約」）。sim/ と world/・ui/ の境界なので、人間の確認なしに変えない
import type valuesJson from '../../data/values.json';

export type ResourceKey = 'oxygen' | 'water' | 'food' | 'power';
export type FacilityKind =
  | 'habitat'
  | 'solar'
  | 'battery'
  | 'antenna'
  | 'greenhouse'
  | 'lifeSupport'
  | 'iceDrill'
  | 'shield';
export type CrewTask = 'maintenance' | 'research' | 'farming';
export type LaunchItemKind =
  | 'oxygen'
  | 'water'
  | 'food'
  | 'spareParts'
  | 'materials'
  | 'facilityKit'
  | 'crew'
  | 'relaySatellite';

export interface LaunchItem {
  kind: LaunchItemKind;
  quantity: number;
  facilityKind?: FacilityKind; // facilityKit のときだけ
}

/** コスト ＝ max(実際の重さ, 大きさを重さに換算した値)。値は values.json */
export interface Launch {
  id: string;
  items: LaunchItem[];
  totalCost: number;
  arrivesAtHours: number;
}

export interface PlanetConfig {
  id: 'moon' | 'mars';
  gravity: number; // m/s^2
  sunElevationDeg: number; // 太陽の高度（月の南極は地平線すれすれ）
  sunPeriodDays: number; // 太陽が一周する地球日数（月は約29.5）
  commDelaySec: number; // 地球との片道の通信の遅れ
  radiationMsvPerDay: number; // 屋外での1日あたりの線量
  sites: SiteConfig[];
}

export interface SiteConfig {
  id: string; // 着陸地点
  stage: 1 | 2 | 3 | 4 | 5; // 解放の段階
  latitudeDeg: number; // 太陽の動きの計算に使う
  scale: number; // 縦横同じ縮尺（例 0.1）。距離の表示は実寸に戻す
  heightmapUrl: string; // 16bit PNG
  illuminationUrl: string; // 平均日照率の画像（表示と説明用）
  earthVisibilityUrl: string; // 地球が見えるかの画像
  sizeMeters: number; // ゲーム内の一辺の長さ（縮尺は未決）
  heightRangeMeters: [number, number];
  landerPosition: [number, number];
}

/** 地形と日照を問い合わせる関数。実装は env/。sim/ はこれだけを通して世界を知る */
export interface Env {
  heightAt(x: number, z: number): number;
  isSunlit(x: number, z: number, y: number, sunAzimuthRad: number): boolean;
  isEarthVisible(x: number, z: number): boolean;
  isIceAt(x: number, z: number): boolean;
  dustFactorAt(x: number, z: number): number; // 着陸場に近いほど大きい
}

export interface Facility {
  id: string;
  kind: FacilityKind;
  x: number;
  z: number;
  condition: number; // 0〜1。劣化で下がり、点検で戻る
  dustCover: boolean; // ほこりよけの有無
  shieldMaterial?: 'regolith' | 'water'; // 遮蔽の壁の材料
  regolithCover?: boolean; // 居住モジュールにレゴリスを盛ったか
  sunlit: boolean; // 直前の判定結果（太陽電池等）
}

export interface CrewMember {
  id: string;
  isPlayer: boolean;
  task: CrewTask | null; // プレイヤーは null
  doseMsv: number; // 累積の被ばく量
}

export interface SimState {
  timeHours: number; // ゲーム内の経過時間
  sunAzimuthRad: number;
  stocks: Record<'oxygen' | 'water' | 'food' | 'spareParts' | 'materials', number>;
  batteryKwh: number;
  facilities: Facility[];
  crew: CrewMember[];
  player: { x: number; z: number; tankOxygen: number; indoors: boolean; downed: boolean };
  history: DailyRecord[]; // 発展度の計算に使う直近の記録
  development: {
    selfSufficiency: number;
    stability: number;
    safety: number;
    scale: number;
    total: number;
    best: number;
  };
  activeEvents: ActiveEvent[];
  launches: Launch[]; // 注文済みで、まだ届いていない打ち上げ
  nextLaunchAtHours: number; // 次に注文できる打ち上げ
  tasksSinceLaunch: number; // 前の注文からこなしたタスク（氷を運ぶ・点検・レゴリス）。地球への報告で、注文に values.launch.tasksPerLaunch 回要る
  relaySatellites: number; // 0〜2
  commLinked: boolean; // 今、地球と通じているか
  unsentResearch: number; // 通信が途切れて送れていない研究
  phase: 'tutorial' | 'main' | 'cleared' | 'gameOver';
}

export interface DailyRecord {
  day: number;
  produced: Record<ResourceKey, number>;
  consumed: Record<ResourceKey, number>;
  minBatteryRatio: number;
  research: number;
  downedCount: number;
  commHours: number; // その日に地球と通信できていた時間（発展度の「安全」：警報が届くか）
}

export type SimCommand =
  | {
      type: 'build';
      kind: FacilityKind;
      x: number;
      z: number;
      dustCover: boolean;
      shieldMaterial?: 'regolith' | 'water';
    }
  | { type: 'coverWithRegolith'; facilityId: string }
  | { type: 'demolish'; facilityId: string }
  | { type: 'repair'; facilityId: string } // プレイヤーが自分で点検
  | { type: 'assignCrew'; crewId: string; task: CrewTask }
  | { type: 'orderLaunch'; items: LaunchItem[] }
  | { type: 'collectIce'; x: number; z: number }
  | { type: 'reportTask' } // 今日のタスクに選んだ施設を、隊員が先に直した。地球への報告に1回数える（人間が承認して足した）
  | { type: 'setPlayer'; x: number; z: number; indoors: boolean };

export interface ActiveEvent {
  kind: 'solarFlare' | 'sep';
  source: 'archived' | 'live'; // 画面に必ず表示する
  donkiId: string;
  classOrIntensity: string;
  endsAtHours: number;
}

export type GameEvent =
  | { type: 'facilityStopped'; facilityId: string; reason: 'shadow' | 'condition' | 'noPower' }
  | { type: 'eventStarted'; event: ActiveEvent }
  | { type: 'launchArrived'; launchId: string }
  | { type: 'commLost' }
  | { type: 'commRestored' }
  | { type: 'playerDowned'; reason: 'tankEmpty' | 'radiation' }
  | { type: 'developmentChanged'; total: number }
  | { type: 'cleared' }
  | { type: 'gameOver'; reason: ResourceKey }
  | { type: 'achievement'; id: string };

/** 純粋関数。dtHours は固定の刻み。乱数は rng を通してのみ使う */
export type Step = (
  state: SimState,
  dtHours: number,
  env: Env,
  commands: SimCommand[],
  values: Values,
  events: DonkiTimeline,
  rng: () => number,
) => { state: SimState; emitted: GameEvent[] };

/** data/values.json の1つの値。出典が決まっていない値は source を "TBD" にする */
export interface ValueEntry {
  value: number;
  unit: string;
  source: string;
  url?: string;
}

/**
 * data/values.json の型。JSON の中身から決まるので、値を足すときは JSON に ValueEntry の形で足すだけでよい
 * （形は tests/data.test.ts で確かめる）
 */
export type Values = typeof valuesJson;

/** data/donki-events.json の1件。過去の実際の太陽フレアか SEP */
export interface DonkiEvent {
  kind: 'solarFlare' | 'sep';
  donkiId: string; // DONKI の ID（flrID か sepID）
  eventTime: string; // DONKI 上の日時（ISO 8601、UTC）
  classOrIntensity: string; // フレアの等級（例：X1.0）。SEP は強さ
  // TODO(人間に確認): 仕様の項目にはないが、画面から DONKI の出典をたどれるように DONKI のページの URL を持たせた
  link: string;
}

/** data/donki-events.json の型。ゲーム内で起こしてよいイベントの一覧（いつ起こすかはランダム） */
export type DonkiTimeline = DonkiEvent[];
