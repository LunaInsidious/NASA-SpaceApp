// ミニゲーム（10〜30秒、タップかなぞるだけ）の、画面に依存しない判定。
// 失敗しても効果は減らさず、やり直しになる（やり直した分だけ外の時間が減る。docs/SPEC.md 追加の仕様）
import type { Values } from '../contracts/index.ts';

export type MinigameKind = 'timing' | 'drag' | 'trace';

/** 画面の中の位置。0〜1 の割合（左上が 0,0） */
export interface Point {
  x: number;
  z: number;
}

export type MinigameResult = 'playing' | 'success' | 'failed';

/** 時間切れか */
export function timeUp(elapsedSec: number, kind: MinigameKind, values: Values): boolean {
  return elapsedSec >= values.minigame[`${kind}TimeLimitSec`].value;
}

// ---- 氷を掘る（timing）：行き来する目印が真ん中の帯にあるときに押す。外すと最初から ----

/** 目印の位置 0〜1（端で折り返して行き来する） */
export function timingPosition(elapsedSec: number, values: Values): number {
  const period = values.minigame.timingPeriodSec.value;
  const phase = (elapsedSec % period) / period;
  return phase < 1 / 2 ? phase * 2 : 2 - phase * 2;
}

/** 真ん中の帯（幅 timingZoneRatio）に入っているか */
export function timingInZone(position: number, values: Values): boolean {
  return Math.abs(position - 1 / 2) <= values.minigame.timingZoneRatio.value / 2;
}

/** 押したあとの、当てた回数。外すと 0 に戻る */
export function timingPress(hits: number, position: number, values: Values): number {
  return timingInZone(position, values) ? hits + 1 : 0;
}

export function timingResult(hits: number, elapsedSec: number, values: Values): MinigameResult {
  if (hits >= values.minigame.timingHits.value) return 'success';
  return timeUp(elapsedSec, 'timing', values) ? 'failed' : 'playing';
}

// ---- フィルター交換（drag）：部品を、はめる場所まで運んで離す ----

/** 離した場所が、はめる場所の近く（dragSnapRatio 以内）か */
export function dragFits(drop: Point, slot: Point, values: Values): boolean {
  return Math.hypot(drop.x - slot.x, drop.z - slot.z) <= values.minigame.dragSnapRatio.value;
}

// ---- レゴリスを盛る（trace）：並んだ土の山を、順になぞる ----

/** なぞる山の位置（左から右へ、ゆるい山なり） */
export function tracePoints(values: Values): Point[] {
  const count = values.minigame.tracePoints.value;
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 1 / 2 : i / (count - 1);
    // 左右の端は少しあける。真ん中ほど上に
    const margin = values.minigame.traceMarginRatio.value;
    return { x: margin + t * (1 - 2 * margin), z: 1 / 2 + (1 / 4) * (2 * t - 1) ** 2 - 1 / 8 };
  });
}

/** 指の位置が、次になぞる山に届いたら、なぞった数を1つ増やす（順番どおりだけ数える） */
export function traceVisit(visited: number, finger: Point, values: Values): number {
  const points = tracePoints(values);
  const next = points[visited];
  if (next === undefined) return visited;
  return Math.hypot(finger.x - next.x, finger.z - next.z) <= values.minigame.traceHitRatio.value
    ? visited + 1
    : visited;
}

export function traceResult(visited: number, elapsedSec: number, values: Values): MinigameResult {
  if (visited >= values.minigame.tracePoints.value) return 'success';
  return timeUp(elapsedSec, 'trace', values) ? 'failed' : 'playing';
}
