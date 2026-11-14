// 自動生成の地形の形を決める定数（実データの地形はステップ5で置き換える）
// TODO(人間に確認): values.json に移す

/** 一辺の頂点の数 */
export const TERRAIN_RESOLUTION = 129;

/** 着陸船のまわりの台地。中心は着陸船の位置 */
export const PLATEAU_TOP_HEIGHT_M = 40;
export const PLATEAU_EDGE_HEIGHT_M = 6;
export const PLATEAU_INNER_RADIUS_M = 60;
export const PLATEAU_OUTER_RADIUS_M = 125;
/** 台地の上のゆるい傾き（1m あたり）。太陽の高度より小さくして台地の上は日なたにする */
export const PLATEAU_DOME_SLOPE = 0.008;

/** 台地の上の小山。長い影が台地の一部を横切る（太陽電池が影に入る場面のため） */
export const HILL_OFFSET_M: [number, number] = [38, -30];
export const HILL_HEIGHT_M = 7;
export const HILL_RADIUS_M = 10;

/** 低地のクレーター。底は永久影で氷がある */
export const CRATER_COUNT = 4;
export const CRATER_RING_MIN_M = 100;
export const CRATER_RING_MAX_M = 128;
export const CRATER_RADIUS_MIN_M = 16;
export const CRATER_RADIUS_MAX_M = 24;
export const CRATER_DEPTH_MIN_M = 10;
export const CRATER_DEPTH_MAX_M = 16;
export const CRATER_RIM_HEIGHT_M = 2.5;
export const CRATER_RIM_WIDTH_M = 5;
/** 氷の円の半径（クレーターの半径に対する割合） */
export const ICE_RADIUS_RATIO = 0.45;

/** 表面の小さなでこぼこ */
export const NOISE_AMPLITUDE_M = 0.35;
export const NOISE_CELL_M = 18;

/** 着陸船の位置 [x, z] */
export const LANDER_POSITION: [number, number] = [0, 0];

/** 地球との見通しを調べるときの、地面からの高さ（アンテナの高さ） */
export const ANTENNA_HEIGHT_M = 3;

/** ほこり：着陸船の位置で 1 + DUST_PEAK、DUST_RADIUS_M 離れると e^-1 まで下がる */
export const DUST_PEAK = 2;
export const DUST_RADIUS_M = 40;

/** これより緯度の絶対値が大きいときは極として扱い、太陽は地平線すれすれを一周する */
export const POLAR_LATITUDE_DEG = 80;
