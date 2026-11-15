// 地形の Env の定数（地形の形そのものは public/terrain/<地点>/ の実データ）
// TODO(人間に確認): values.json に移す

/** 地球との見通しを調べるときの、地面からの高さ（アンテナの高さ） */
export const ANTENNA_HEIGHT_M = 3;

/** ほこり：着陸船の位置で 1 + DUST_PEAK、DUST_RADIUS_M 離れると e^-1 まで下がる */
export const DUST_PEAK = 2;
export const DUST_RADIUS_M = 40;

/** これより緯度の絶対値が大きいときは極として扱い、太陽は地平線すれすれを一周する */
export const POLAR_LATITUDE_DEG = 80;
