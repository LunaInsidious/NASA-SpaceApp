// ミニゲームの画面（docs/SPEC.md 追加の仕様 ステップ14）。判定は src/tasks/minigame.ts。
// ゲームの時間は止めない（やり直した分だけ外にいられる時間が減る）
import type { Values } from '../contracts/index.ts';
import {
  dragFits,
  type MinigameKind,
  type MinigameResult,
  type Point,
  timeUp,
  timingPosition,
  timingPress,
  timingResult,
  tracePoints,
  traceResult,
  traceVisit,
} from '../tasks/minigame.ts';
import { t } from './i18n.ts';

const MS_PER_SECOND = 1000;
const PERCENT = 100;
// できた！を見せてから閉じるまで（見た目だけ）
const SUCCESS_SHOW_MS = 700;
// フィルター交換：部品とはめる場所の、最初の位置（割合）
const DRAG_START: Point = { x: 0.18, z: 0.55 };
const DRAG_SLOT: Point = { x: 0.8, z: 0.45 };

export type MinigameOutcome = 'success' | 'quit';

/**
 * ミニゲームを開く。成功するか「やめる」で onFinish を呼んで閉じる。時間切れなら「もう一度」か「やめる」を選ぶ。
 * 返す関数で、外から閉じる（倒れた、警報が来たなど。onFinish は呼ばない）
 */
export function openMinigame(
  host: HTMLElement,
  kind: MinigameKind,
  values: Values,
  onFinish: (outcome: MinigameOutcome) => void,
  onSound: (name: 'hit' | 'miss' | 'success') => void,
): () => void {
  const layer = document.createElement('div');
  layer.className = 'mg-layer';
  host.append(layer);
  let startMs = performance.now();
  let frame = 0;
  let finished = false;
  // 遊んでいる様子
  let hits = 0;
  let visited = 0;
  let piece: Point = { ...DRAG_START };
  let dragging = false;
  let tracing = false;

  const elapsedSec = () => (performance.now() - startMs) / MS_PER_SECOND;
  const limitSec = values.minigame[`${kind}TimeLimitSec`].value;

  layer.innerHTML = `
    <div class="mg-card" role="dialog" aria-label="${t(`minigame.title.${kind}`).replace(/<[^>]*>/g, '')}">
      <h2>${t(`minigame.title.${kind}`)}</h2>
      <p class="mg-howto">${t(`minigame.howto.${kind}`, { hits: values.minigame.timingHits.value })}</p>
      <div class="mg-timer"><div></div></div>
      <div class="mg-area mg-${kind}" data-part="area"></div>
      <div class="mg-status" data-part="status"></div>
      <div class="mg-actions">
        <button data-mg="quit">${t('minigame.quit')}</button>
      </div>
    </div>`;
  const area = layer.querySelector<HTMLElement>('[data-part="area"]');
  const status = layer.querySelector<HTMLElement>('[data-part="status"]');
  const timerBar = layer.querySelector<HTMLElement>('.mg-timer > div');
  if (area === null || status === null || timerBar === null) {
    throw new Error('ミニゲームの部品がない');
  }

  /** 指やマウスの位置を、遊ぶ場所の中の割合にする */
  const toArea = (e: PointerEvent): Point => {
    const rect = area.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, z: (e.clientY - rect.top) / rect.height };
  };
  const at = (p: Point) => `left:${p.x * PERCENT}%;top:${p.z * PERCENT}%`;

  const drawArea = () => {
    switch (kind) {
      case 'timing': {
        const zone = values.minigame.timingZoneRatio.value * PERCENT;
        const dots = Array.from({ length: values.minigame.timingHits.value }, (_, i) =>
          i < hits ? '●' : '○',
        ).join(' ');
        area.innerHTML = `
          <div class="mg-track"><div class="mg-zone" style="left:${50 - zone / 2}%;width:${zone}%"></div><div class="mg-marker"></div></div>
          <div class="mg-dots">${dots}</div>
          <div class="mg-drill">⛏️🧊</div>`;
        break;
      }
      case 'drag':
        area.innerHTML = `
          <div class="mg-slot" style="${at(DRAG_SLOT)}">${t('minigame.slot')}</div>
          <div class="mg-piece" style="${at(piece)}">🧽</div>`;
        break;
      case 'trace':
        area.innerHTML = tracePoints(values)
          .map(
            (point, i) =>
              `<div class="mg-mound ${i < visited ? 'done' : i === visited ? 'next' : ''}" style="${at(point)}"></div>`,
          )
          .join('');
        break;
    }
  };

  const close = () => {
    finished = true;
    cancelAnimationFrame(frame);
    window.removeEventListener('keydown', onKey, true);
    layer.remove();
  };

  const finish = (outcome: MinigameOutcome) => {
    close();
    onFinish(outcome);
  };

  const showResult = (result: MinigameResult) => {
    if (result === 'success') {
      finished = true;
      onSound('success');
      status.className = 'mg-status ui-ok';
      status.innerHTML = t('minigame.success');
      window.setTimeout(() => finish('success'), SUCCESS_SHOW_MS);
      return;
    }
    if (result === 'failed') {
      finished = true;
      onSound('miss');
      status.className = 'mg-status ui-bad';
      status.innerHTML = `${t('minigame.failed')} <button class="primary" data-mg="retry">${t('minigame.retry')}</button>`;
    }
  };

  const restart = () => {
    hits = 0;
    visited = 0;
    piece = { ...DRAG_START };
    dragging = false;
    tracing = false;
    finished = false;
    startMs = performance.now();
    status.className = 'mg-status';
    status.innerHTML = '';
    drawArea();
    frame = requestAnimationFrame(tick);
  };

  const press = () => {
    if (finished || kind !== 'timing') return;
    const before = hits;
    hits = timingPress(hits, timingPosition(elapsedSec(), values), values);
    onSound(hits > before ? 'hit' : 'miss');
    if (hits === 0 && before > 0) {
      area.classList.remove('mg-shake');
      requestAnimationFrame(() => area.classList.add('mg-shake'));
    }
    drawArea();
    showResult(timingResult(hits, elapsedSec(), values));
  };

  const tick = (): void => {
    if (finished) return;
    const elapsed = elapsedSec();
    timerBar.style.width = `${Math.max(0, 1 - elapsed / limitSec) * PERCENT}%`;
    if (kind === 'timing') {
      const marker = area.querySelector<HTMLElement>('.mg-marker');
      if (marker !== null) marker.style.left = `${timingPosition(elapsed, values) * PERCENT}%`;
    }
    if (timeUp(elapsed, kind, values)) {
      showResult('failed');
      return;
    }
    frame = requestAnimationFrame(tick);
  };

  function onKey(e: KeyboardEvent) {
    // 遊んでいる間は、ジャンプや E キーの行動にしない
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) press();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      finish('quit');
    }
  }
  window.addEventListener('keydown', onKey, true);

  area.addEventListener('pointerdown', (e) => {
    if (finished) return;
    const p = toArea(e);
    if (kind === 'timing') {
      press();
      return;
    }
    area.setPointerCapture(e.pointerId);
    if (kind === 'drag') {
      dragging =
        Math.hypot(p.x - piece.x, p.z - piece.z) <= values.minigame.dragSnapRatio.value * 2;
    } else {
      tracing = true;
      visited = traceVisit(visited, p, values);
      drawArea();
    }
  });
  area.addEventListener('pointermove', (e) => {
    if (finished) return;
    const p = toArea(e);
    if (kind === 'drag' && dragging) {
      piece = p;
      drawArea();
    } else if (kind === 'trace' && tracing) {
      const next = traceVisit(visited, p, values);
      if (next !== visited) {
        visited = next;
        onSound('hit');
        drawArea();
        showResult(traceResult(visited, elapsedSec(), values));
      }
    }
  });
  const release = () => {
    if (finished) return;
    if (kind === 'drag' && dragging) {
      dragging = false;
      if (dragFits(piece, DRAG_SLOT, values)) {
        piece = { ...DRAG_SLOT };
        drawArea();
        showResult('success');
      } else {
        // はまらなければ、元の場所に戻る（もう一度運ぶ）
        piece = { ...DRAG_START };
        onSound('miss');
        drawArea();
      }
    }
    tracing = false;
  };
  area.addEventListener('pointerup', release);
  area.addEventListener('pointercancel', release);

  layer.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    const button = e.target.closest<HTMLElement>('[data-mg]');
    if (button?.dataset.mg === 'quit') finish('quit');
    if (button?.dataset.mg === 'retry') restart();
  });

  drawArea();
  frame = requestAnimationFrame(tick);
  return close;
}
