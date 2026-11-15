// 着陸地点の地形の説明（public/terrain/<地点>/site.json）。tools/make-terrain.ts が作る

export interface Site {
  /** 地点の名前（PGDA の名前） */
  name: string;
  /** 元のデータの出典 */
  source: string;
  url: string;
  citation: string;
  /** 縦横を同じ割合で何分の1に縮めたか。距離の表示は実寸（× scale）に換算する */
  scale: number;
  /** 切り出した範囲の中心（南極の極投影の X, Y。実寸の m） */
  centerX: number;
  centerY: number;
  /** 切り出した一辺（実寸の m） */
  cropMeters: number;
  /** ゲームの一辺（m）。cropMeters / scale */
  sizeMeters: number;
  /** 一辺の頂点の数 */
  resolution: number;
  /** ゲームの高さ 0 にした実際の高さ（月の基準の球からの m） */
  baseHeightMeters: number;
  latitudeDeg: number;
  /** 着陸船の位置 [x, z]（ゲームの m） */
  landerPosition: [number, number];
  /** 氷の場所：永久影（どの向きの太陽でも日が当たらない）のまとまり */
  iceSpots: { x: number; z: number; radius: number }[];
  /** 高さのファイルの名前（同じフォルダ。Float32 のリトルエンディアン、行が z、列が x） */
  heightFile: string;
  /** まわりの見える範囲（歩けない）の一辺（ゲームの m）・一辺の頂点の数・高さのファイル。中心と高さの基準は同じ */
  outerSizeMeters: number;
  outerResolution: number;
  outerHeightFile: string;
}

function num(json: Record<string, unknown>, key: string): number {
  const v = json[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`site.json の ${key} が数ではない`);
  }
  return v;
}

function str(json: Record<string, unknown>, key: string): string {
  const v = json[key];
  if (typeof v !== 'string') {
    throw new Error(`site.json の ${key} が文字列ではない`);
  }
  return v;
}

/** site.json の形を確かめる。形が違えば止める */
export function parseSite(json: unknown): Site {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('site.json がオブジェクトではない');
  }
  const o = json as Record<string, unknown>;
  const lander = o.landerPosition;
  if (
    !Array.isArray(lander) ||
    lander.length !== 2 ||
    !lander.every((v) => typeof v === 'number' && Number.isFinite(v))
  ) {
    throw new Error('site.json の landerPosition が [x, z] ではない');
  }
  if (!Array.isArray(o.iceSpots) || o.iceSpots.length === 0) {
    throw new Error('site.json の iceSpots が空（氷の場所がないとタスクができない）');
  }
  const iceSpots = o.iceSpots.map((spot: Record<string, unknown>) => ({
    x: num(spot, 'x'),
    z: num(spot, 'z'),
    radius: num(spot, 'radius'),
  }));
  return {
    name: str(o, 'name'),
    source: str(o, 'source'),
    url: str(o, 'url'),
    citation: str(o, 'citation'),
    scale: num(o, 'scale'),
    centerX: num(o, 'centerX'),
    centerY: num(o, 'centerY'),
    cropMeters: num(o, 'cropMeters'),
    sizeMeters: num(o, 'sizeMeters'),
    resolution: num(o, 'resolution'),
    baseHeightMeters: num(o, 'baseHeightMeters'),
    latitudeDeg: num(o, 'latitudeDeg'),
    landerPosition: [lander[0], lander[1]],
    iceSpots,
    heightFile: str(o, 'heightFile'),
    outerSizeMeters: num(o, 'outerSizeMeters'),
    outerResolution: num(o, 'outerResolution'),
    outerHeightFile: str(o, 'outerHeightFile'),
  };
}
