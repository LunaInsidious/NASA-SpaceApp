// 見た目と手触りの定数（ゲームの数値ではないもの）
// 見た目と手触りだけの定数なので、data/values.json（ゲームの結果に関わる数）には入れない（人間の判断）

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
/** 影の中でも、地球の照り返しで斜面の形が分かるようにする明るさ（地球のほうを向いた斜面ほど明るい） */
export const SHADE_SHADOW_RELIEF = 0.1;
/** 歩く範囲の外の地形（見るだけ）の明るさ。日なたは BASE + 太陽を向いた斜面ほど SLOPE_GAIN、影は作らない */
export const OUTER_SHADE_BASE = 0.32;
export const OUTER_SHADE_SLOPE_GAIN = 0.5;
/** 歩く範囲の外の地形を、歩く範囲の下にしまう深さ（重ならないように） */
export const OUTER_HIDE_DEPTH_M = 80;
/** 地面の細かい模様（レゴリスの粒やでこぼこ）がくり返す長さ。歩くと模様が流れて、進んでいるのが分かる */
export const DETAIL_TILE_M = 6;
export const DETAIL_TEXTURE_SIZE = 512;
/** 地面に散らばる石（見た目だけ。歩くのはじゃましない） */
export const ROCK_COUNT = 2600;
export const ROCK_MIN_SIZE_M = 0.15;
export const ROCK_MAX_SIZE_M = 1.2;
/** 着陸船のまわりのこの距離には石を置かない（建てる場所） */
export const ROCK_CLEAR_RADIUS_M = 25;
/** 石の自分の明るさ（地面の明るさになじませる） */
export const ROCK_EMISSIVE = 0.22;
/** 影の中の石の明るさ（日なたを 1 として） */
export const ROCK_SHADOW_BRIGHTNESS = 0.18;
/** 石の形の種類と、角ばらせ方（頂点を 1〜この割合に縮める）、上下のつぶし方 */
export const ROCK_VARIANTS = 5;
export const ROCK_BUMP_MIN = 0.62;
export const ROCK_FLATTEN = 0.8;
/** この半径より大きなクレーターの縁に、飛び散った石を置く（半径 1 m あたりの数） */
export const ROCK_EJECTA_MIN_CRATER_RADIUS_M = 3;
export const ROCK_EJECTA_PER_RADIUS_M = 4;
/** 小さなクレーターの置き方を決める乱数の種（見た目だけ。いつも同じ置き方） */
export const MICRO_RELIEF_SEED = 21;
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
/** くんれんで空の地球を見せるとき：カメラの縦の角度（地平線のすぐ上が画面に入る）と、
 *  地球を吹き出しの横（画面の左）に出すための横のずらし。向きを変える速さ */
export const SKY_FOCUS_BETA_RAD = 1.47;
export const SKY_FOCUS_YAW_OFFSET_RAD = 0.42;
export const SKY_FOCUS_RATE = 2.2;
export const CAMERA_MAX_Z_M = 4000;
/** スマホの幅（CSS の @media (max-width: 640px) と同じ）。博士の吹き出しが上に出る */
export const PHONE_LAYOUT_QUERY = '(max-width: 640px)';
/** スマホでは宇宙飛行士を画面の真ん中からこれだけ下に見せる（画面の高さの半分を 1 とした割合） */
export const PHONE_PLAYER_SCREEN_SHIFT = 0.34;

export const SKY_DIAMETER_M = 1800;
export const STAR_COUNT = 1400;
export const STAR_TEXTURE_SIZE = 2048;
export const CELESTIAL_DISTANCE_M = 800;
/** 月から見た地球は直径約2°、太陽は約0.5°（見やすいよう太陽は大きめ） */
export const EARTH_DIAMETER_M = 28;
/** 地球の見た目：写真（NASA Blue Marble）を貼った球。大気のうすい縁の大きさ、夜の側の暗さ、回る速さ（見た目） */
export const EARTH_TEXTURE_URL = '/textures/earth-bluemarble-2048.jpg';
export const EARTH_ATMOSPHERE_SCALE = 1.06;
export const EARTH_ATMOSPHERE_ALPHA = 0.45;
export const EARTH_NIGHT_GLOW = 0.35;
/** 昼の側の写真の明るさの倍率（写真の海がとても暗いので、太陽の当たる側が星空の中ではっきり見えるまで上げる） */
export const EARTH_DAY_BRIGHTNESS = 3;
export const EARTH_SPIN_RAD_PER_SEC = 0.02;
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

// 宇宙飛行士の影（見た目）。足元の丸い影だけ（本当は太陽が低くて長い影になるが、でこぼこの地面で欠けやすいので出さない）
export const PLAYER_BLOB_RADIUS_M = 0.45;
/** 建物の当たり判定：宇宙飛行士の体の半径（建物の形の箱から、これだけ離れて止まる） */
export const PLAYER_BODY_RADIUS_M = 0.4;
export const PLAYER_BLOB_ALPHA = 0.45;
export const SHADOW_LIFT_M = 0.05;

// 施設の上に浮かぶアイコン（見た目）
export const ICON_SIZE_M = 1.2;
export const ICON_GAP_M = 1.2;
export const ICON_TEXTURE_PX = 128;
export const ICON_BG = 'rgba(14, 22, 38, 0.85)';
export const ICON_BORDER = '#ffd27a';

// 建った施設がポンと出てくる動き（見た目）
export const POP_SECONDS = 0.45;
export const POP_OVERSHOOT = 2.2;

/**
 * 見た目だけの小さなクレーター（元のデータの 5 m より小さいもの）。半径はゲームの m。
 * 深さと縁の高さは直径に対する割合（月の新しい小さなクレーターは深さが直径の約 0.2 倍）
 */
export const MICRO_CRATER_COUNT = 500;
export const MICRO_CRATER_MIN_RADIUS_M = 2;
export const MICRO_CRATER_MAX_RADIUS_M = 9;
export const MICRO_CRATER_DEPTH_RATIO = 0.18;
export const MICRO_CRATER_RIM_RATIO = 0.035;
/** 縁の外へなだらかに戻るところまで（半径の何倍か） */
export const MICRO_CRATER_OUTER = 1.6;
/** 着陸船のまわりのこの距離にはクレーターを置かない（建てる場所） */
export const MICRO_CRATER_CLEAR_RADIUS_M = 15;
/** クレーターをすぐ探すためのマス目の大きさ */
export const MICRO_CRATER_BUCKET_M = 10;
/** クレーターの中の影を調べる刻み */
export const MICRO_SHADOW_STEP_M = 0.35;
