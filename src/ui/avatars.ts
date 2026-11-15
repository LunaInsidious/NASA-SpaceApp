// 管制室のメイン画面に映る相手の絵（オリジナル。NASA のロゴやデザインは使わない）

/** 地球管制官：ヘッドセットをつけた人 */
export const CONTROLLER_SVG = `<svg viewBox="0 0 120 120" aria-hidden="true">
  <rect width="120" height="120" rx="14" fill="#16314d"/>
  <rect x="8" y="78" width="104" height="42" rx="10" fill="#2b5d8a"/>
  <path d="M30 120 C32 92 88 92 90 120 Z" fill="#3f7fb8"/>
  <path d="M52 92 L60 104 L68 92 Z" fill="#e8f2ff"/>
  <circle cx="60" cy="56" r="25" fill="#f2c9a5"/>
  <path d="M35 52 C35 30 85 30 85 52 C80 40 66 36 60 36 C52 36 40 40 35 52 Z" fill="#3a2a22"/>
  <circle cx="51" cy="57" r="3" fill="#2a2a2a"/>
  <circle cx="69" cy="57" r="3" fill="#2a2a2a"/>
  <path d="M51 67 Q60 74 69 67" stroke="#a8553f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M33 56 C33 26 87 26 87 56" stroke="#1b1f27" stroke-width="5" fill="none"/>
  <rect x="27" y="50" width="10" height="16" rx="4" fill="#1b1f27"/>
  <rect x="83" y="50" width="10" height="16" rx="4" fill="#1b1f27"/>
  <path d="M33 64 C34 74 42 78 50 76" stroke="#1b1f27" stroke-width="3" fill="none"/>
  <circle cx="51" cy="76" r="3" fill="#ffd27a"/>
</svg>`;

/** 基地の端末：顔のある画面 */
export const TERMINAL_SVG = `<svg viewBox="0 0 120 120" aria-hidden="true">
  <rect width="120" height="120" rx="14" fill="#2a2412"/>
  <rect x="18" y="20" width="84" height="62" rx="8" fill="#0d1a0f" stroke="#ffd27a" stroke-width="4"/>
  <rect x="38" y="40" width="10" height="14" rx="2" fill="#7dff9a"/>
  <rect x="72" y="40" width="10" height="14" rx="2" fill="#7dff9a"/>
  <path d="M44 66 H76" stroke="#7dff9a" stroke-width="4" stroke-linecap="round"/>
  <rect x="50" y="82" width="20" height="12" fill="#5a4a22"/>
  <rect x="32" y="94" width="56" height="8" rx="3" fill="#5a4a22"/>
</svg>`;
