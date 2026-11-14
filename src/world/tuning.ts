// 見た目と手触りの定数（ゲームの数値ではないもの）
// TODO(人間に確認): values.json に移す

const DEG = Math.PI / 180;

/** 太陽の方位がこれだけ変わったら、地形の影を焼き直す */
export const SUN_REBAKE_STEP_RAD = 1 * DEG;
/** 影の焼き直しを1フレームに何行ずつ進めるか（固まらないように分ける） */
export const BAKE_ROWS_PER_FRAME = 48;

/** 地形の明るさ。日なたは BASE + 太陽を向いた斜面ほど SLOPE_GAIN まで明るく、影は SHADOW */
export const SHADE_LIT_BASE = 0.42;
export const SHADE_LIT_SLOPE_GAIN = 0.55;
export const SHADE_SHADOW = 0.07;
/** 氷の場所の色と、影の中でも見える明るさ */
export const ICE_COLOR: [number, number, number] = [0.6, 0.78, 1];
export const ICE_BRIGHTNESS = 0.45;
/** 日照を調べるときの地面からの高さ */
export const SUNLIT_SAMPLE_OFFSET_M = 0.3;

/** 歩くときに自動で跳ねる速さ（月面の跳ねる歩き方） */
export const HOP_SPEED_MPS = 1.1;
/** 地図の端から、これより外に出ない */
export const PLAYER_BOUNDS_MARGIN_M = 2;
/** 向きを変える速さ（大きいほど早く向く） */
export const TURN_RATE = 10;
/** 宇宙飛行士や施設が影に入っているかを調べる間隔（秒） */
export const SHADOW_CHECK_INTERVAL_SEC = 0.3;

export const CAMERA_RADIUS_M = 10;
export const CAMERA_MIN_RADIUS_M = 4;
export const CAMERA_MAX_RADIUS_M = 30;
export const CAMERA_BETA_RAD = 1.15;
export const CAMERA_MIN_BETA_RAD = 0.25;
export const CAMERA_MAX_BETA_RAD = 1.5;
export const CAMERA_TARGET_HEIGHT_M = 1.3;
export const CAMERA_GROUND_MARGIN_M = 1;
export const CAMERA_FOLLOW_RATE = 8;
export const CAMERA_MAX_Z_M = 4000;

export const SKY_DIAMETER_M = 1800;
export const STAR_COUNT = 1400;
export const STAR_TEXTURE_SIZE = 2048;
export const CELESTIAL_DISTANCE_M = 800;
/** 月から見た地球は直径約2°、太陽は約0.5°（見やすいよう太陽は大きめ） */
export const EARTH_DIAMETER_M = 28;
export const SUN_DIAMETER_M = 14;

export const SUN_LIGHT_INTENSITY = 1.6;
export const AMBIENT_LIGHT_INTENSITY = 0.45;

/** プレビューの色：動く、建てられるが動かない、建てられない */
export const PREVIEW_GOOD: [number, number, number] = [0.2, 0.9, 0.35];
export const PREVIEW_WARN: [number, number, number] = [0.95, 0.85, 0.2];
export const PREVIEW_BAD: [number, number, number] = [0.95, 0.25, 0.2];
export const PREVIEW_ALPHA = 0.45;

/** 止まっている施設、傷んだ施設、影の中の施設の暗さ */
export const STOPPED_TINT = 0.4;
export const MIN_CONDITION_TINT = 0.45;

// チュートリアルの光の柱（見た目）
export const GUIDE_HEIGHT_M = 40;
export const GUIDE_DIAMETER_M = 1.6;
export const GUIDE_COLOR: [number, number, number] = [1, 0.85, 0.3];
export const GUIDE_ALPHA = 0.55;

// 置く場所をマウスやタップで選ぶ（手触り）
export const CLICK_SLOP_PX = 6; // 押してから離すまでにこれ以上動いたら、クリックではなくドラッグ
export const PICK_STEP_M = 0.5; // 画面の点から地面を探すときの1歩
export const PICK_MAX_DISTANCE_M = 400;
export const PICK_REFINE_STEPS = 6;

// 建った施設がポンと出てくる動き（見た目）
export const POP_SECONDS = 0.45;
export const POP_OVERSHOOT = 2.2;
