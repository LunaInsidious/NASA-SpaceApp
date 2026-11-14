// HUD、メニュー、説明の窓、仮想パッド。素の DOM で作り、文言はすべて t() から出す
import type {
  ActiveEvent,
  CrewTask,
  DonkiEvent,
  FacilityKind,
  GameEvent,
  LaunchItem,
  LaunchItemKind,
  SimState,
  Values,
} from '../contracts/index.ts';
import type { SaveSummary } from '../save/api.ts';
import type { BuildOptions, Placement, SimView } from '../sim/api.ts';
import { buildCost, commLostReason, launchItemCost, outdoorDoseMsvPerHour } from '../sim/index.ts';
import { powerKw } from '../sim/model.ts';
import type { DeathAdvice } from '../tutorial/death.ts';
import { professorDeathAdviceHtml } from '../tutorial/deathView.ts';
import { PROFESSOR_SVG } from '../tutorial/professor.ts';
import type { PadInput } from '../world/api.ts';
import type { ContextAction, MorningSummary, RestInfo, Ui, UiCallbacks } from './api.ts';
import { getLang, onLangChange, setLang, t, tPlain } from './i18n.ts';
import { type MinigameOutcome, openMinigame } from './minigame.ts';
import { type NasaImages, photoFigureHtml } from './photo.ts';
import './ui.css';

const FACILITY_KINDS: readonly FacilityKind[] = [
  'habitat',
  'solar',
  'battery',
  'antenna',
  'lifeSupport',
  'greenhouse',
  'iceDrill',
  'shield',
];
// ほきゅうで頼める荷物。施設のキットは届くものが資材と同じなので出さず、資材を頼んでもらう（CLAUDE.md）
const LAUNCH_ITEM_KINDS: readonly LaunchItemKind[] = [
  'oxygen',
  'water',
  'food',
  'spareParts',
  'materials',
  'crew',
  'relaySatellite',
];
const BULK_LAUNCH_ITEMS: readonly LaunchItemKind[] = ['oxygen', 'water', 'food', 'materials'];
const CREW_TASKS: readonly CrewTask[] = ['maintenance', 'research', 'farming'];
const CONTEXT_ACTIONS: readonly ContextAction[] = [
  'enterHabitat',
  'exitHabitat',
  'collectIce',
  'repair',
  'coverRegolith',
  'nextDay',
];
const MENUS = ['build', 'status', 'data'] as const;
// 休息フェーズの2D画面のタブ（docs/SPEC.md ステップ13）
// 休息フェーズの2D画面は、タブではなく順に進むページ（何から開くかを選ばなくてよい）。セーブは順の外
const REST_PAGES = ['review', 'crew', 'launch', 'tasks', 'plan'] as const;
const NOTEBOOK_PAGES = [...REST_PAGES, 'save', 'status', 'cards'] as const;
// インベントリ画面に出す物資
const INVENTORY_STOCKS = ['oxygen', 'water', 'food', 'spareParts', 'materials'] as const;
type RestPage = (typeof NOTEBOOK_PAGES)[number];
type RestStep = (typeof REST_PAGES)[number];
const DEVELOPMENT_ELEMENTS = ['selfSufficiency', 'stability', 'safety', 'scale'] as const;
const LIFE_SUPPORT_KEYS = ['oxygen', 'water', 'food'] as const;
const SHIELD_MATERIALS = ['regolith', 'water'] as const;

// 表示だけに使う値（ゲームの数値ではない）
const STAR_COUNT = 5;
const TOAST_MS = 4500;
const TOAST_MAX = 2; // 一度に並べるお知らせの数（多いと子どもがこわがるので少なく）
const HOURS_PER_DAY = 24;
const PERCENT = 100;
const MINUTES_PER_HOUR = 60;
// 押せないボタンの吹き出し（見た目）
const BUBBLE_MS = 3200;
const BUBBLE_GAP_PX = 12;
const BUBBLE_MARGIN_PX = 8;
const LOW_BAR_RATIO = 0.25; // バーを赤くする残りの割合
const LOW_DAYS = 7; // 生命維持の日数を赤くする
const DOSE_WARN_RATIO = 0.5; // 被ばくが上限のこの割合を超えたら赤くする
const KNOB_TRAVEL = 0.6; // パッドのつまみが動ける範囲（半径に対する割合）
const ISO_DATE_LENGTH = 10;
const TANK_WARN_RATIO = 0.6; // ボンベのバーを黄色にする残り（表示だけ）
const LIFE_GAIN_POP_DAYS = 0.5; // 生き延びられる日数がこれ以上ふえたら、お祝いの演出を出す（表示だけ）
const POWER_EVEN_KW = 0.05;
const SPARKLES = 8;
const GAIN_MS = 1600; // これより差が小さければ「ちょうど」と出す（表示だけ） // "2024-05-14T..." の日付の部分

type MenuKind = (typeof MENUS)[number];
type Dialog =
  | { type: 'flare'; event: ActiveEvent; donki: DonkiEvent | null }
  | { type: 'downed'; advice: DeathAdvice }
  | { type: 'cleared'; total: number }
  | { type: 'gameOver'; advice: DeathAdvice }
  | { type: 'morning'; summary: MorningSummary };

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function fmt(n: number, digits = 0): string {
  return n.toFixed(digits);
}

/** data-* の値を、決まった候補のどれかとして読む。候補にない値は作りの誤りなので例外 */
function pick<T extends string>(value: string | undefined, allowed: readonly T[], what: string): T {
  const found = allowed.find((item) => item === value);
  if (found === undefined) {
    throw new Error(`ui の ${what} が不正: ${String(value)}`);
  }
  return found;
}

// 「データ」の窓で、出典と並べて見せる数値（HUD の項目ごと）
export const SOURCE_KEYS = {
  tank: ['eva.maxHours', 'crew.sleepHours', 'eva.weeklyHoursPerPerson'],
  lifeSupport: [
    'crew.oxygenKgPerDay',
    'crew.waterKgPerDay',
    'crew.foodKgPerDay',
    'facilities.lifeSupport.oxygenKgPerDay',
  ],
  power: [
    'facilities.solar.generationKw',
    'facilities.battery.capacityKwh',
    'facilities.habitat.powerKw',
    'moon.sunPeriodDays',
  ],
  shielding: [
    'moon.radiationMsvPerDay',
    'crew.doseLimitMsv',
    'facilities.habitat.indoorProtection',
    'events.flareMultiplierX',
  ],
  development: ['development.clearThreshold', 'development.scalePerCrew'],
  comm: ['comm.earthPeriodDays', 'moon.commDelaySec'],
  // X級フレアの倍率と、ふだん浴びる放射線は「遮蔽と放射線」に出しているので、ここには重ねない
  flare: ['events.flareMultiplierM', 'events.sepMultiplier', 'events.flareDurationHours'],
} as const;
type SourceSection = keyof typeof SOURCE_KEYS;
const SOURCE_SECTIONS = Object.keys(SOURCE_KEYS) as SourceSection[];

interface ValueEntryLike {
  value: number;
  unit: string;
  source: string;
  url?: string;
}

/** values の中の "a.b.c" の値。なければ作りの誤りなので例外 */
function valueAt(values: Values, path: string): ValueEntryLike {
  let node: unknown = values;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) {
      throw new Error(`values に ${path} がない`);
    }
    node = (node as Record<string, unknown>)[part];
  }
  return node as ValueEntryLike;
}

/** 数と単位を、子どもに読める形で（ratio は % にする）。単位の言葉は i18n の unit.* */
function valueText(entry: ValueEntryLike): string {
  if (entry.unit === 'ratio') {
    return `${fmt(entry.value * PERCENT)}%`;
  }
  return t(`unit.${entry.unit}`, { value: String(entry.value) });
}

/** 数値と、その出典（リンクつき）の一覧。出典が決まっていなければそう書く */
function sourceListHtml(values: Values, section: SourceSection): string {
  const rows = SOURCE_KEYS[section].map((path) => {
    const entry = valueAt(values, path);
    const source =
      entry.source === 'TBD'
        ? `<span class="ui-src-tbd">${t('source.tbd')}</span>`
        : entry.source.startsWith('docs/SPEC.md')
          ? t('source.gameDesign')
          : entry.url !== undefined
            ? `<a href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">${esc(entry.source)}</a>`
            : esc(entry.source);
    return `<li><b>${t(`valueName.${path}`)}</b>：${valueText(entry)}<br><span class="ui-small">${t('source.label')} ${source}</span></li>`;
  });
  return `<ul class="ui-src-list">${rows.join('')}</ul>`;
}

/** 電力の差し引き。たまるか、へるかを＋と−、色、矢印で見せる */
function powerNet(netKw: number): string {
  if (Math.abs(netKw) < POWER_EVEN_KW) {
    return `<div class="ui-net">${t('hud.powerNet.even')}</div>`;
  }
  return netKw > 0
    ? `<div class="ui-net ui-ok">${t('hud.powerNet.plus', { kw: fmt(netKw, 1) })}</div>`
    : `<div class="ui-net ui-bad">${t('hud.powerNet.minus', { kw: fmt(-netKw, 1) })}</div>`;
}

/** 3D で施設の上に出しているのと同じアイコン（建設の窓と置く場所を選ぶバーで、どれがどれか分かるように） */
function facilityIconHtml(kind: FacilityKind): string {
  return `<span class="ui-fac-icon" aria-hidden="true">${t(`facilityIcon.${kind}`)}</span>`;
}

function stars(value: number, max: number): string {
  const count = Math.min(STAR_COUNT, Math.max(0, Math.round((value / max) * STAR_COUNT)));
  return '★'.repeat(count) + '☆'.repeat(STAR_COUNT - count);
}

function bar(ratio: number, extraClass: string): string {
  const clamped = Math.min(1, Math.max(0, ratio));
  const low = clamped < LOW_BAR_RATIO ? 'low' : '';
  return `<div class="ui-bar ${extraClass} ${low}"><div style="width:${fmt(clamped * PERCENT)}%"></div></div>`;
}

/**
 * values をたどり、確かめられた出典（"TBD" でも "docs/SPEC.md" で始まるものでもない）を重複なしで集める。
 * 値の形は tests/data.test.ts が確かめているので、形が違えば作りの誤りとして例外にする
 */
function collectValueSources(values: Values): { source: string; url: string | undefined }[] {
  const found = new Map<string, { source: string; url: string | undefined }>();
  const walk = (node: unknown) => {
    if (typeof node !== 'object' || node === null) {
      return;
    }
    if ('value' in node) {
      const { source, url } = node as { source?: unknown; url?: unknown };
      if (typeof source !== 'string' || (url !== undefined && typeof url !== 'string')) {
        throw new Error('values の出典の形が違う');
      }
      if (source !== 'TBD' && !source.startsWith('docs/SPEC.md')) {
        found.set(`${source}\n${url ?? ''}`, { source, url });
      }
      return;
    }
    for (const child of Object.values(node)) {
      walk(child);
    }
  };
  walk(values);
  return [...found.values()];
}

export function createUi(root: HTMLElement, callbacks: UiCallbacks, values: Values): Ui {
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  root.classList.add('ui-root');
  root.innerHTML = `
    <div class="ui-hud" data-part="hud"></div>
    <div class="ui-top">
      <div class="ui-row" data-part="topButtons"></div>
      <div class="ui-panel ui-status" data-part="status" hidden></div>
    </div>
    <div class="ui-toasts" data-part="toasts"></div>
    <div class="ui-buildbar ui-panel" data-part="buildbar" hidden></div>
    <div class="ui-buttons" data-part="buttons"></div>
    <div class="ui-pad" data-part="pad" hidden><div class="ui-pad-knob" data-part="knob"></div></div>
    <div class="ui-pause" data-part="pauseOverlay" hidden></div>
    <div class="nb-layer" data-part="notebook" hidden></div>
    <div class="ui-modal-layer" data-part="modal" hidden></div>`;
  const part = (name: string): HTMLElement => {
    const el = root.querySelector<HTMLElement>(`[data-part="${name}"]`);
    if (el === null) {
      throw new Error(`ui の部品がない: ${name}`);
    }
    return el;
  };
  const hudEl = part('hud');
  const topButtonsEl = part('topButtons');
  const statusEl = part('status');
  const toastsEl = part('toasts');
  const buildbarEl = part('buildbar');
  const buttonsEl = part('buttons');
  const padEl = part('pad');
  const knobEl = part('knob');
  const modalEl = part('modal');
  const notebookEl = part('notebook');
  // メニューは、窓の外（暗いところ）をクリックしても閉じる。警報やゲームオーバーの窓は選んでもらうので閉じない
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl && menu !== null && dialogs.length === 0) {
      closeMenus();
    }
  });
  padEl.hidden = !isTouch;

  let state: SimState | null = null;
  let view: SimView | null = null;
  let userPaused = false;
  let lastPaused = false;
  let showBreakdown = false;
  let menu: MenuKind | null = null;
  // 休息フェーズの2D画面（居住モジュールの中）。main が setRest で開け閉めする
  let rest: RestInfo | null = null;
  let restPage: RestPage = 'review';
  // 順に進むページのどこまで来たか。先のページへは「次へ」でしか進めない（戻るのはできる）。
  // セーブ・くわしい様子・カード（順の外）を開いている間も、ここを覚えておいて戻る
  let restStep: RestStep = 'review';
  // 外で今日こなすタスク（main が setTaskList で渡す）
  let taskList: { label: string; done: boolean }[] = [];
  // 開いているミニゲームを閉じる関数
  let closeMinigame: (() => void) | null = null;
  const dialogs: Dialog[] = [];
  let saves: SaveSummary[] = [];
  let donkiEvents: DonkiEvent[] = [];
  const buildOptions: { dustCover: boolean; shieldMaterial: 'regolith' | 'water' } = {
    dustCover: false,
    shieldMaterial: 'regolith',
  };
  const cart = Object.fromEntries(LAUNCH_ITEM_KINDS.map((kind) => [kind, 0])) as Record<
    LaunchItemKind,
    number
  >;
  // 割り当てを選んだが、時間が止まっていてまだ state に出ていないもの
  const assigned = new Map<string, CrewTask>();
  let contextActions: ContextAction[] = [];
  let buildMode: { kind: FacilityKind; placement: Placement } | null = null;
  const pad = { x: 0, y: 0 };
  let padPointer: number | null = null;

  const pauseEl = part('pauseOverlay');
  /** 一時停止のボタンで止めている間は、画面全体を暗くして大きく知らせる（メニューや窓で止まっているときは出さない） */
  const renderPauseOverlay = () => {
    pauseEl.hidden = !userPaused;
    pauseEl.innerHTML = userPaused
      ? `<div class="ui-pause-card">
          <div class="ui-pause-title">${t('pause.title')}</div>
          <p>${t('pause.body')}</p>
          <button class="primary ui-pause-resume" data-action="pause">${t('pause.resume')}</button>
        </div>`
      : '';
  };

  const updatePause = () => {
    const paused = userPaused || menu !== null || dialogs.length > 0;
    if (paused !== lastPaused) {
      lastPaused = paused;
      callbacks.onPauseChange(paused);
    }
  };

  const toast = (text: string, bad: boolean) => {
    // 同じお知らせが出ているあいだは重ねない。並ぶのは TOAST_MAX まで（古いものから消す）
    if ([...toastsEl.children].some((child) => child.innerHTML === text)) {
      return;
    }
    while (toastsEl.children.length >= TOAST_MAX) {
      toastsEl.firstElementChild?.remove();
    }
    const el = document.createElement('div');
    el.className = bad ? 'ui-toast bad' : 'ui-toast';
    el.innerHTML = text;
    toastsEl.append(el);
    window.setTimeout(() => el.remove(), TOAST_MS);
  };

  const optionsFor = (kind: FacilityKind): BuildOptions =>
    kind === 'shield'
      ? { dustCover: buildOptions.dustCover, shieldMaterial: buildOptions.shieldMaterial }
      : { dustCover: buildOptions.dustCover };

  const cartItems = (): LaunchItem[] =>
    LAUNCH_ITEM_KINDS.filter((kind) => cart[kind] > 0).map((kind) => ({
      kind,
      quantity: cart[kind],
    }));

  // ---- 右上：一時停止・言語 ----
  const renderTopButtons = () => {
    const lang = getLang();
    topButtonsEl.innerHTML = `
      <button data-action="pause" class="${userPaused ? 'on' : ''}">${t(userPaused ? 'hud.resume' : 'hud.pause')}</button>
      <button data-action="lang" data-lang="en" class="${lang === 'en' ? 'on' : ''}">${t('hud.langEn')}</button>
      <button data-action="lang" data-lang="ja" class="${lang === 'ja' ? 'on' : ''}">${t('hud.langJa')}</button>`;
  };

  // ---- 右上：日数・屋内外・通信 ----
  const renderStatus = () => {
    if (state === null || view === null) {
      statusEl.hidden = true;
      return;
    }
    statusEl.hidden = false;
    const lines = [
      `<div>${t('hud.day', { day: Math.floor(view.day) + 1 })} · ${t(state.player.indoors ? 'hud.indoors' : 'hud.outdoors')}</div>`,
      `<div class="${view.comm.linked ? 'ui-ok' : 'ui-bad'}">${t(view.comm.linked ? 'hud.commLinked' : 'hud.commLost')}</div>`,
      ...(view.comm.linked
        ? []
        : [`<div class="ui-hint">${t(`commHint.${commLostReason(state, view)}`)}</div>`]),
      `<div class="ui-long">${t('hud.relays', { count: view.comm.relaySatellites })}</div>`,
    ];
    if (view.comm.unsentResearch > 0) {
      lines.push(
        `<div class="ui-long">${t('hud.unsentResearch', { amount: fmt(view.comm.unsentResearch, 1) })}</div>`,
      );
    }
    if (state.activeEvents.length > 0) {
      const hours = Math.max(...state.activeEvents.map((e) => e.endsAtHours)) - state.timeHours;
      lines.push(`<div class="ui-bad">${t('hud.flareActive', stormLeft(hours))}</div>`);
    }
    if (state.phase === 'cleared') {
      lines.push(`<div class="ui-ok">${t('hud.cleared')}</div>`);
    }
    if (lastPaused) {
      lines.push(`<div class="ui-long">${t('hud.paused')}</div>`);
    }
    statusEl.classList.toggle('emergency', state.activeEvents.length > 0);
    statusEl.innerHTML = lines.join('');
  };

  // ---- 左上：資源と発展度 ----
  let lastLifeMin: number | null = null;
  /** 生き延びられる日数がふえた瞬間に、数字を弾ませ「＋N日」を飛ばして、きらきらを散らす */
  const celebrateLifeGain = (gainDays: number) => {
    const value = hudEl.querySelector<HTMLElement>('.ui-life-value');
    if (value === null) {
      return;
    }
    value.classList.add('ui-pop');
    const rect = value.getBoundingClientRect();
    const pop = document.createElement('div');
    pop.className = 'ui-gain';
    pop.style.left = `${rect.left}px`;
    pop.style.top = `${rect.top}px`;
    pop.innerHTML = t('hud.lifeGain', { days: fmt(gainDays, 1) });
    for (let i = 0; i < SPARKLES; i++) {
      const sparkle = document.createElement('span');
      sparkle.className = 'ui-sparkle';
      sparkle.textContent = '✨';
      sparkle.style.setProperty('--angle', `${(i / SPARKLES) * 360}deg`);
      pop.append(sparkle);
    }
    root.append(pop);
    window.setTimeout(() => pop.remove(), GAIN_MS);
  };

  /** 外にいられる残りの時間（ゲームの中の時間）。ボンベの残り × 宇宙服でいられる時間 */
  const timeLeft = (tankRatio: number) => {
    const minutes = Math.max(
      0,
      Math.floor(tankRatio * values.eva.maxHours.value * MINUTES_PER_HOUR),
    );
    return { hours: Math.floor(minutes / MINUTES_PER_HOUR), minutes: minutes % MINUTES_PER_HOUR };
  };

  /**
   * 電気が足りずに止まっている機械。止まった機械は電気を使わないので、上の差し引きは「たまる」に見えることがある。
   * そのずれで迷わないよう、止まっている数と、動かすのに要る電気を並べる
   */
  const stoppedForPowerHtml = (current: SimState, currentView: SimView) => {
    const stopped = current.facilities.filter(
      (f) => currentView.facilityStatus[f.id]?.reason === 'noPower',
    );
    if (stopped.length === 0) {
      return '';
    }
    const needKw = stopped.reduce((sum, f) => sum + powerKw(f.kind, values), 0);
    return `<div class="ui-bad">${t('hud.powerStopped', { count: stopped.length, kw: fmt(needKw, 1) })}</div>`;
  };

  /** くわしい数字（生命維持・電力・被ばく・発展度）。3D の画面ではくんれんの段だけで見せ、ふだんはインベントリ画面に出す */
  const detailPanelsHtml = (current: SimState, currentView: SimView): string => {
    const life = currentView.lifeSupportDays;
    // sim は減らないときに上限（display.maxLifeSupportDays）を返すので、上限なら「減っていない」と出す
    // 減っていないとき（sim は上限を返す）は、作るのが止まったらあと何日もつかを「（減らない）」と並べて出す
    const forever = (days: number) => days >= values.display.maxLifeSupportDays.value;
    const ifStopped = currentView.lifeSupportDaysIfStopped;
    const daysText = (days: number, stopped: number) =>
      forever(days)
        ? t('hud.daysSteady', { days: fmt(stopped, 1) })
        : t('hud.daysLeft', { days: fmt(days, 1) });
    const breakdown = showBreakdown
      ? `<div class="ui-breakdown">${LIFE_SUPPORT_KEYS.map(
          (key) =>
            `<div>${t('hud.breakdown', { name: t(`resource.${key}`), days: daysText(life[key], ifStopped[key]) })}</div>`,
        ).join('')}</div>`
      : `<div class="ui-small">${t('hud.tapForDetails')}</div>`;
    const power = currentView.power;
    const battery =
      power.batteryCapacityKwh > 0
        ? `<div class="ui-small">${t('hud.battery', {
            stored: fmt(power.batteryKwh),
            capacity: fmt(power.batteryCapacityKwh),
          })}</div>${bar(power.batteryKwh / power.batteryCapacityKwh, '')}`
        : `<div class="ui-small">${t('hud.noBattery')}</div>`;
    const shielding = currentView.shielding;
    const doseWarn = shielding.playerDoseMsv > shielding.doseLimitMsv * DOSE_WARN_RATIO;
    const development = current.development;
    const elementMax = values.development.elementMax.value;
    return `
      <div class="ui-panel ui-detail">
        <div class="ui-stat ui-life" data-action="toggleBreakdown">
          <span class="ui-label">${t('hud.lifeSupport')}</span>
          <span class="ui-value ui-life-value ${life.min < LOW_DAYS ? 'ui-bad' : ''}">${daysText(life.min, ifStopped.min)}</span>
          ${breakdown}
        </div>
        <div class="ui-stat ui-power">
          <span class="ui-label">${t('hud.power')}</span>
          <div><span class="ui-ok">${t('hud.powerGen', { kw: fmt(power.generationKw, 1) })}</span>　<span class="ui-bad">${t('hud.powerUse', { kw: fmt(power.consumptionKw, 1) })}</span></div>
          ${powerNet(power.generationKw - power.consumptionKw)}
          ${stoppedForPowerHtml(current, currentView)}
          ${battery}
        </div>
        <div class="ui-stat">
          <span class="ui-label">${t('hud.shielding')}</span>
          <div class="${doseWarn ? 'ui-bad' : ''}">${t('hud.dose', {
            dose: fmt(shielding.playerDoseMsv, 1),
            limit: fmt(shielding.doseLimitMsv),
          })}</div>
          <div>${t('hud.protection', { pct: fmt(shielding.indoorProtection * PERCENT) })}</div>
        </div>
      </div>
      <div class="ui-panel ui-detail ui-development">
        <div class="ui-stat">
          <span class="ui-label">${t('development.total')}</span>
          <span class="ui-value">${fmt(development.total)}</span>
        </div>
        ${DEVELOPMENT_ELEMENTS.map(
          (key) =>
            `<div class="ui-small">${t(`development.${key}`)} <span class="ui-stars">${stars(development[key], elementMax)}</span></div>`,
        ).join('')}
      </div>`;
  };

  const renderHud = () => {
    if (state === null || view === null) {
      hudEl.innerHTML = '';
      return;
    }
    const life = view.lifeSupportDays;
    const tankPct = Math.round(Math.min(1, Math.max(0, view.tankRatio)) * PERCENT);
    const tankLevel =
      view.tankRatio < values.advice.tankLowRatio.value
        ? 'danger'
        : view.tankRatio < TANK_WARN_RATIO
          ? 'warn'
          : 'ok';
    hudEl.innerHTML = `
      <div class="ui-panel ui-tank ui-tank-${tankLevel} ${state.player.indoors ? 'indoors' : ''}">
        <div class="ui-tank-head"><span>🫧 <span class="ui-long">${t('hud.tankHp')}</span><span class="ui-short">${t('hud.tankShort')}</span></span><span class="ui-tank-pct">${tankPct}%</span></div>
        <div class="ui-tank-bar"><div style="width:${tankPct}%"></div></div>
        <div class="ui-small">${state.player.indoors ? t('hud.tankIndoors') : t('hud.timeLeft', timeLeft(view.tankRatio))}</div>
      </div>
      ${
        !state.player.indoors && taskList.length > 0
          ? `<div class="ui-panel ui-tasks"><div class="ui-label">${t('tasks.today')}</div>${taskList
              .map(
                (task) =>
                  `<div class="${task.done ? 'ui-ok' : ''}">${task.done ? '✅' : '⬜'} ${task.label}</div>`,
              )
              .join('')}</div>`
          : ''
      }
      ${detailPanelsHtml(state, view)}`;
    const maxDays = values.display.maxLifeSupportDays.value;
    if (
      lastLifeMin !== null &&
      life.min < maxDays &&
      life.min - lastLifeMin >= LIFE_GAIN_POP_DAYS
    ) {
      celebrateLifeGain(life.min - lastLifeMin);
    }
    lastLifeMin = life.min;
  };

  // ---- 右下：メニューとその場の行動 ----
  const renderButtons = () => {
    const contextHtml = contextActions
      .map((action, index) => {
        const label = t(`action.${action}`);
        return index === 0
          ? `<button data-action="context" data-context="${action}" class="primary">${isTouch ? label : t('action.withKey', { label })}</button>`
          : `<button data-action="context" data-context="${action}">${label}</button>`;
      })
      .join('');
    buttonsEl.innerHTML = `
      <div class="ui-row ui-context">${contextHtml}</div>
      <div class="ui-row">
        ${MENUS.map(
          (menuKind) =>
            `<button class="ui-menu-button" data-action="menu" data-menu="${menuKind}"><span class="ui-menu-icon">${t(`button.icon.${menuKind}`)}</span><span>${t(isTouch ? `button.short.${menuKind}` : `button.${menuKind}`)}</span></button>`,
        ).join('')}
      </div>
`;
  };

  // ---- 下中央：置く場所を選んでいる間 ----
  const renderBuildBar = () => {
    if (buildMode === null) {
      buildbarEl.hidden = true;
      buildbarEl.innerHTML = '';
      return;
    }
    const { kind, placement } = buildMode;
    const reason = placement.reason === null ? '' : t(`placement.${placement.reason}`);
    let status: string;
    if (!placement.allowed) {
      status = `<div class="ui-bad">${t('build.blocked', { reason })}</div>`;
    } else if (placement.works) {
      status = `<div class="ui-ok">${t('build.good')}</div>`;
    } else {
      status = `<div>${t('build.warn', { reason })}</div>`;
    }
    buildbarEl.hidden = false;
    buildbarEl.innerHTML = `
      <div class="ui-fac-item">${facilityIconHtml(kind)}<b>${t('build.placing', { name: t(`facility.${kind}`) })}</b></div>
      ${status}
      <div class="ui-small ui-buildhint">${t(isTouch ? 'build.hint.touch' : 'build.hint.mouse')}</div>
      <div class="ui-row">
        <button data-action="buildConfirm" class="primary" ${placement.allowed ? '' : 'disabled'}>${t(isTouch ? 'build.place.touch' : 'build.place')}</button>
        <button data-action="buildCancel">${t(isTouch ? 'build.cancel.touch' : 'build.cancel')}</button>
      </div>`;
  };

  // ---- メニュー ----
  const buildMenuHtml = (current: SimState) => {
    const items = FACILITY_KINDS.map((kind) => {
      const cost = buildCost(kind, optionsFor(kind), values);
      const affordable = cost.materials <= current.stocks.materials;
      if (kind === 'shield') {
        // 遮蔽の壁は、材料（レゴリスか水）を選んでから建てる。選ぶところを壁の枠の中にまとめる
        const shield = values.facilities.shield;
        const options = SHIELD_MATERIALS.map((material) => {
          const materialCost = buildCost(
            kind,
            { ...optionsFor(kind), shieldMaterial: material },
            values,
          );
          const need =
            material === 'water'
              ? t('build.materialNeed.water', {
                  materials: fmt(materialCost.materials),
                  water: fmt(shield.waterKg.value),
                })
              : t('build.cost', { materials: fmt(materialCost.materials) });
          const protection =
            material === 'water' ? shield.waterProtection.value : shield.regolithProtection.value;
          return `<button class="ui-material ${buildOptions.shieldMaterial === material ? 'on' : ''}" data-action="shieldMaterial" data-material="${material}">
            <b>${t(`build.material.${material}`)}</b>
            <span>${need}</span>
            <span class="ui-ok">${t('build.materialProtect', { pct: fmt(protection * PERCENT) })}</span>
          </button>`;
        }).join('');
        return `<li class="ui-shield-card">
          <button class="ui-item ui-fac-item ${affordable ? '' : 'dim'}" data-action="buildSelect" data-kind="${kind}">
            ${facilityIconHtml(kind)}
            <span class="ui-grow"><b>${t('build.shieldWith', { material: t(`build.material.${buildOptions.shieldMaterial}`) })}</b> — ${t('build.cost', { materials: fmt(cost.materials) })}
            <small>${t(`facilityDesc.${kind}`)}</small></span>
          </button>
          <div class="ui-material-pick">
            <div class="ui-material-title">${t('build.materialPick')}</div>
            <div class="ui-material-options">${options}</div>
            <small>${t(`build.materialDesc.${buildOptions.shieldMaterial}`)}</small>
          </div>
        </li>`;
      }
      return `<li>
        <button class="ui-item ui-fac-item ${affordable ? '' : 'dim'}" data-action="buildSelect" data-kind="${kind}">
          ${facilityIconHtml(kind)}
          <span class="ui-grow"><b>${t(`facility.${kind}`)}</b> — ${t('build.cost', { materials: fmt(cost.materials) })}
          <small>${t(`facilityDesc.${kind}`)}</small></span>
        </button>
      </li>`;
    }).join('');
    return `
      <h2>${t('build.title')}</h2>
      <p>${t('build.have', { materials: fmt(current.stocks.materials) })}</p>
      <button data-action="dustCover" class="${buildOptions.dustCover ? 'on' : ''}">${t(
        'build.dustCover',
        {
          state: t(buildOptions.dustCover ? 'common.on' : 'common.off'),
        },
      )}</button>
      <small>${t('build.dustCoverDesc')}</small>
      <ul class="ui-list">${items}</ul>`;
  };

  const launchMenuHtml = (current: SimView) => {
    const items = cartItems();
    const used = items.reduce((sum, item) => sum + launchItemCost(item, values), 0);
    const capacity = current.launch.capacity;
    const over = used > capacity;
    const reasons: string[] = [];
    // 今は注文できない理由（通信、次のロケット待ち）は、開いてすぐ見えるよう上に出す
    const blockers: string[] = [];
    if (!current.comm.linked) {
      if (state === null) {
        throw new Error('ui: state がないのに打ち上げメニューを描こうとした');
      }
      // できなかった理由から、やることまでを1本のつながりで見せる
      blockers.push(t(`launch.noLinkChain.${commLostReason(state, current)}`));
    }
    if (current.launch.hoursUntilNext > 0) {
      blockers.push(
        t('launch.notYet', { days: fmt(current.launch.hoursUntilNext / HOURS_PER_DAY, 1) }),
      );
    }
    if (over) {
      reasons.push(t('launch.overCapacity'));
    }
    if (items.length === 0) {
      reasons.push(t('launch.empty'));
    }
    const canOrder = current.launch.canOrderNow && !over && items.length > 0;
    // 新しい隊員は、居住モジュール1つに1人。届く前の隊員と、カートに入れた分も数える
    if (state === null) {
      throw new Error('ui: state がないのに補給の窓を描こうとした');
    }
    const crewOnTheWay = state.launches
      .flatMap((launch) => launch.items)
      .filter((item) => item.kind === 'crew')
      .reduce((sum, item) => sum + item.quantity, 0);
    const crewRoom = current.crew.capacity - current.crew.count - crewOnTheWay - cart.crew;
    const rows = LAUNCH_ITEM_KINDS.map((kind) => {
      // ＋を1回押したときに増える数と、それがロケットの場所をどれだけ使うか
      const step = BULK_LAUNCH_ITEMS.includes(kind) ? values.launch.bulkOrderStep.value : 1;
      const stepCost = launchItemCost({ kind, quantity: step }, values);
      // 量は名前のかっこの中に（＋1回で増える量）。横には、それが使うロケットの場所だけを出す
      const nameText = BULK_LAUNCH_ITEMS.includes(kind)
        ? t('launch.itemAmount', { name: t(`launchItem.${kind}`), step: fmt(step) })
        : t(`launchItem.${kind}`);
      const costText = t('launch.stepCostOne', { cost: fmt(stepCost) });
      // 何に使うかは「？」にのせる（マウスを重ねるか、タップして出す）
      const why = `<button type="button" class="ui-why" aria-label="${tPlain('launch.whyLabel')}">?</button><span class="ui-why-tip" role="tooltip">${t(`launchItemWhy.${kind}`)}</span>`;
      const noRoom = kind === 'crew' && crewRoom <= 0;
      const roomNote =
        kind === 'crew'
          ? `<small class="${noRoom && cart.crew === 0 ? 'ui-bad' : 'ui-ok'}">${noRoom ? t(cart.crew > 0 ? 'launch.crewFull' : 'launch.crewNoRoom') : t('launch.crewRoom', { count: crewRoom })}</small>`
          : '';
      // 名前と −/＋ を1つのわくに入れ、どの数を増やすのかが分かるようにする
      return `<li class="ui-supply-row${cart[kind] > 0 ? ' picked' : ''}">
        <span class="ui-grow"><b>${nameText}</b>${why} <span class="ui-small ui-cost">${costText}</span>${roomNote}</span>
        <span class="ui-stepper">
          <button data-action="cart" data-kind="${kind}" data-delta="-1" aria-label="${tPlain(`launchItem.${kind}`)} −">−</button>
          <span class="ui-qty">${cart[kind] / step}</span>
          <button data-action="cart" data-kind="${kind}" data-delta="1" aria-label="${tPlain(`launchItem.${kind}`)} ＋" ${noRoom ? 'disabled' : ''}>＋</button>
        </span>
      </li>`;
    }).join('');
    const meterRatio = capacity > 0 ? Math.min(1, used / capacity) : 1;
    const inFlight = current.launch.inFlight
      .map(
        (launch) =>
          `<div class="ui-small">${t('launch.inFlight', { days: fmt(launch.hoursUntilArrival / HOURS_PER_DAY, 1) })}</div>`,
      )
      .join('');
    if (rest?.queuedOrder != null) {
      const list = rest.queuedOrder
        .map((item) => {
          const step = BULK_LAUNCH_ITEMS.includes(item.kind)
            ? values.launch.bulkOrderStep.value
            : 1;
          const name = BULK_LAUNCH_ITEMS.includes(item.kind)
            ? t('launch.itemAmount', { name: t(`launchItem.${item.kind}`), step: fmt(step) })
            : t(`launchItem.${item.kind}`);
          return `<li>${name} × ${fmt(item.quantity / step)}</li>`;
        })
        .join('');
      return `
        <h2>${t('launch.title')}</h2>
        <div class="ui-queued">
          <p><b>${t('launch.queued')}</b></p>
          <ul>${list}</ul>
          <p class="ui-small">${t('launch.queuedNote')}</p>
          <button data-action="cancelOrder">${t('launch.cancel')}</button>
        </div>`;
    }
    return `
      <h2>${t('launch.title')}</h2>
      ${blockers.length > 0 ? `<div class="ui-blocker">${blockers.map((b) => `<div>${b}</div>`).join('')}</div>` : ''}
      <div class="ui-meter"><div class="${over ? 'over' : ''}" style="width:${fmt(meterRatio * PERCENT)}%"></div></div>
      <div>${t('launch.meter', { used: fmt(used), capacity: fmt(capacity) })}</div>
      <div class="ui-small">${t('launch.delivery', { days: fmt(current.launch.deliveryHours / HOURS_PER_DAY) })}</div>
      <ul class="ui-list">${rows}</ul>
      ${inFlight}
      ${reasons.map((reason) => `<div class="ui-small ui-bad">${reason}</div>`).join('')}
      <div class="ui-actions">
        <button data-action="order" class="primary" ${canOrder ? '' : 'disabled'}>${t('launch.order')}</button>
      </div>`;
  };

  const crewMenuHtml = (current: SimState, currentView: SimView) => {
    let number = 0;
    const rows = current.crew
      .map((member) => {
        if (member.isPlayer) {
          return `<li><span class="ui-grow"><b>${t('crew.you')}</b><small>${t('crew.youDesc')}</small></span></li>`;
        }
        number += 1;
        const task = assigned.get(member.id) ?? member.task;
        const buttons = CREW_TASKS.map(
          (option) =>
            `<button data-action="assign" data-crew="${esc(member.id)}" data-task="${option}" class="${task === option ? 'on' : ''}">${t(`crewTask.${option}`)}</button>`,
        ).join('');
        return `<li><span class="ui-grow"><b>${t('crew.member', { number })}</b></span>${buttons}</li>`;
      })
      .join('');
    const descriptions = CREW_TASKS.map(
      (task) =>
        `<div class="ui-small"><b>${t(`crewTask.${task}`)}</b>: ${t(`crewTaskDesc.${task}`)}</div>`,
    ).join('');
    return `
      <h2>${t('crew.title')}</h2>
      <p>${t('crew.beds', { count: currentView.crew.count, capacity: currentView.crew.capacity })}</p>
      <ul class="ui-list">${rows}</ul>
      ${descriptions}`;
  };

  /** 嵐の残りの時間を、ゲームの中の時間と、外にいるときの本当の秒数で */
  const stormLeft = (hours: number) => ({
    hours: fmt(Math.ceil(hours)),
    seconds: fmt(Math.ceil(hours * values.time.evaSecondsPerHour.value)),
  });

  /** 待つと失う時間と、外にいると浴びる量を並べて、退避するかを決める手がかりにする */
  const stormChoiceHtml = (event: ActiveEvent) => {
    if (state === null || view === null) {
      throw new Error('ui: state がないのに嵐の警報を描こうとした');
    }
    const hours = event.endsAtHours - state.timeHours;
    const outside = outdoorDoseMsvPerHour([event], values) * hours;
    const inside = outside * (1 - view.shielding.indoorProtection);
    const { playerDoseMsv, doseLimitMsv } = view.shielding;
    const over = playerDoseMsv + outside >= doseLimitMsv;
    return `
      <ul class="ui-storm">
        <li><b>${t('flare.duration', stormLeft(hours))}</b></li>
        <li>${t('flare.waitInside', { dose: fmt(inside, 1) })}</li>
        <li>${t('flare.stayOutside', { dose: fmt(outside, 1), now: fmt(playerDoseMsv, 1), limit: fmt(doseLimitMsv) })}</li>
      </ul>
      <p class="${over ? 'ui-bad' : 'ui-small'}">${t(over ? 'flare.overLimit' : 'flare.underLimit')}</p>`;
  };

  // ---- 説明の窓 ----
  // 太陽フレアの警報に出す NASA の写真（main が setNasaImages で渡す）
  let nasaImages: NasaImages = {};
  const flareHtml = (event: ActiveEvent, donki: DonkiEvent | null) => {
    let source: string;
    if (event.source === 'archived') {
      if (donki === null) {
        throw new Error(`過去のイベントの DONKI の記録がない: ${event.donkiId}`);
      }
      source = `${t('flare.archived', { date: donki.eventTime.slice(0, ISO_DATE_LENGTH) })}
        <a href="${esc(donki.link)}" target="_blank" rel="noopener noreferrer">${t('flare.sourceLink')}</a>`;
    } else {
      source = t('flare.live');
    }
    return `
      <h2>${t(`flare.title.${event.kind}`)}</h2>
      <p>${t(`flare.explain.${event.kind}`)}</p>
      ${nasaImages.flare === undefined ? '' : photoFigureHtml(nasaImages.flare)}
      <p><b>${t('flare.class', { value: esc(event.classOrIntensity) })}</b></p>
      <p class="ui-small">${source}</p>
      <p>${t('flare.hint')}</p>
      ${stormChoiceHtml(event)}
      <div class="ui-actions">
        <button data-action="flare" data-choice="continue">${t('flare.continue')}</button>
        <button data-action="flare" data-choice="shelter" class="primary">${t('flare.shelter')}</button>
      </div>`;
  };

  /** 「翌日へ」で寝ている間に起きたこと（物資の増減、ロケットの到着、宇宙天気） */
  const morningHtml = (summary: MorningSummary) => {
    const rows = summary.stockChanges
      .map(
        (change) =>
          `<li><span class="ui-grow">${t(`launchItem.${change.kind}`)}</span><b class="${change.delta >= 0 ? 'ui-ok' : 'ui-bad'}">${change.delta >= 0 ? '+' : ''}${fmt(change.delta, 1)}</b></li>`,
      )
      .join('');
    const weather = summary.spaceWeather
      .map(
        (event) =>
          `<p class="ui-small">${t(`morning.spaceWeather.${event.kind}`, { cls: esc(event.classOrIntensity) })}</p>`,
      )
      .join('');
    return `
      <h2>${t('morning.title', { day: summary.day + 1 })}</h2>
      <p>${t('morning.lead')}</p>
      ${rows === '' ? '' : `<ul class="ui-list">${rows}</ul>`}
      ${summary.arrived > 0 ? `<p class="ui-ok">${t('morning.arrived')}</p>` : ''}
      ${summary.newlyShaded > 0 ? `<p class="ui-warn">${t('morning.shaded', { count: summary.newlyShaded })}</p>` : ''}
      ${summary.newlyLit > 0 ? `<p class="ui-ok">${t('morning.lit', { count: summary.newlyLit })}</p>` : ''}
      ${weather}
      <div class="ui-actions"><button data-action="dialogOk" class="primary">${t('morning.ok')}</button></div>`;
  };

  const dialogHtml = (dialog: Dialog): string => {
    switch (dialog.type) {
      case 'flare':
        return flareHtml(dialog.event, dialog.donki);
      case 'downed':
        return `
          <h2>${t('downed.title')}</h2>
          ${professorDeathAdviceHtml(dialog.advice)}
          <p>${t('downed.wake')}</p>
          <div class="ui-actions"><button data-action="dialogOk" class="primary">${t('button.ok')}</button></div>`;
      case 'cleared':
        return `
          <h2>${t('cleared.title')}</h2>
          <p>${t('cleared.body', { value: fmt(dialog.total) })}</p>
          <p>${t('cleared.next')}</p>
          <div class="ui-actions"><button data-action="dialogOk" class="primary">${t('cleared.continue')}</button></div>`;
      case 'morning':
        return morningHtml(dialog.summary);
      case 'gameOver': {
        const kind = dialog.advice.kind;
        // 宇宙飛行士が倒れた（ボンベ・放射線）か、基地の物資が尽きたか
        const playerDown = kind === 'tankEmpty' || kind === 'radiation';
        return `
          <h2>${t(playerDown ? 'gameOver.playerTitle' : 'gameOver.title')}</h2>
          <p>${playerDown ? t(`gameOver.player.${kind}`) : t('gameOver.reason', { resource: t(`resource.${kind}`) })}</p>
          ${professorDeathAdviceHtml(dialog.advice)}
          ${saves.length > 0 ? `<p>${t('gameOver.resumeFrom')}</p>${saveListHtml()}` : ''}
          <div class="ui-actions"><button data-action="restart" class="primary">${t('gameOver.restart')}</button></div>`;
      }
    }
  };

  // ---- セーブ ----
  const saveSummaryText = (save: SaveSummary) =>
    t('save.summary', { day: Math.floor(save.day) + 1, development: fmt(save.developmentTotal) });

  const saveListHtml = () => {
    if (saves.length === 0) {
      return `<p class="ui-small">${t('save.none')}</p>`;
    }
    const rows = saves
      .map(
        (save) => `<li>
          <span class="ui-grow"><b>${t(save.kind === 'auto' ? 'save.auto' : 'save.manual')}</b> ${saveSummaryText(save)}</span>
          <button data-action="load" data-save="${esc(save.id)}">${t('save.resume')}</button>
        </li>`,
      )
      .join('');
    return `<ul class="ui-list">${rows}</ul>`;
  };

  const saveMenuHtml = () => {
    const slots = Array.from({ length: values.save.manualSlots.value }, (_, slot) => {
      const current = saves.find((save) => save.kind === 'manual' && save.slot === slot);
      return `<li>
        <span class="ui-grow"><b>${t('save.slot', { number: slot + 1 })}</b> ${current === undefined ? t('save.empty') : saveSummaryText(current)}</span>
        <button data-action="save" data-slot="${slot}">${t('save.saveHere')}</button>
      </li>`;
    }).join('');
    return `
      <h2>${t('save.title')}</h2>
      <p class="ui-small">${t('save.autoNote', { days: values.save.autoSaveDays.value })}</p>
      <h3>${t('save.manualTitle')}</h3>
      <ul class="ui-list">${slots}</ul>
      <h3>${t('save.listTitle')}</h3>
      ${saveListHtml()}
      <div class="ui-restart-row"><button data-action="backToTitle">${t('save.backToTitle')}</button></div>`;
  };

  // ---- データ出典 ----
  const dataMenuHtml = () => {
    const events = donkiEvents
      .map(
        (event) => `<li>
          <span class="ui-grow"><b>${t(`data.kind.${event.kind}`)}</b> ${t('data.eventLine', {
            strength: esc(event.classOrIntensity),
            date: event.eventTime.slice(0, ISO_DATE_LENGTH),
          })}</span>
          <a href="${esc(event.link)}" target="_blank" rel="noopener noreferrer">${t('data.donkiLink')}</a>
        </li>`,
      )
      .join('');
    const sources = collectValueSources(values)
      .map(
        ({ source, url }) =>
          `<li>${url === undefined ? esc(source) : `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(source)}</a>`}</li>`,
      )
      .join('');
    return `
      <h2>${t('data.title')}</h2>
      <h3>${t('data.spaceWeather')}</h3>
      <p class="ui-small">${t('data.spaceWeatherNote')}</p>
      <ul class="ui-list">${events}</ul>
      <h3>${t('source.title')}</h3>
      ${SOURCE_SECTIONS.map((section) => `<h4>${t(`source.section.${section}`)}</h4>${sourceListHtml(values, section)}`).join('')}
      <h3>${t('data.values')}</h3>
      ${sources === '' ? `<p class="ui-small">${t('data.valuesPending')}</p>` : `<ul class="ui-list">${sources}</ul>`}
      <h3>${t('data.terrainTitle')}</h3>
      <p class="ui-small">${t('data.terrain')}</p>`;
  };

  // ---- 休息フェーズの2D画面（ノート） ----
  const researchHtml = (current: SimState, currentView: SimView) => {
    const today = current.history[current.history.length - 1];
    return `
      <h2>${t('research.title')}</h2>
      <p>${t('research.body')}</p>
      <ul class="nb-stats">
        <li><span>${t('research.researchers')}</span><b>${fmt(currentView.crew.byTask.research)}</b></li>
        <li><span>${t('research.today')}</span><b>${fmt(today?.research ?? 0, 1)}</b></li>
        <li><span>${t('research.unsent')}</span><b class="${currentView.comm.unsentResearch > 0 ? 'ui-bad' : ''}">${fmt(currentView.comm.unsentResearch, 1)}</b></li>
        <li><span>${t('research.comm')}</span><b class="${currentView.comm.linked ? 'ui-ok' : 'ui-bad'}">${t(currentView.comm.linked ? 'hud.commLinked' : 'hud.commLost')}</b></li>
      </ul>
      <p class="ui-small">${t('research.note')}</p>`;
  };

  const reviewHtml = (info: RestInfo, current: SimState, currentView: SimView) => `
    <h2>${t('review.title')}</h2>
    <ul class="nb-review">${info.review.map((line) => `<li>${line}</li>`).join('')}</ul>
    ${researchHtml(current, currentView)}`;

  /** インベントリ画面（くわしい様子）：くわしい数字、物資の量、基地の様子（docs/SPEC.md ステップ16） */
  const inventoryHtml = (current: SimState, currentView: SimView) => {
    const stocks = INVENTORY_STOCKS.map(
      (kind) =>
        `<li><span>${t(`launchItem.${kind}`)}</span><b>${fmt(current.stocks[kind], kind === 'spareParts' ? 1 : 0)}${kind === 'spareParts' ? '' : ' kg'}</b></li>`,
    ).join('');
    const commLine = currentView.comm.linked
      ? `<b class="ui-ok">${t('hud.commLinked')}</b>`
      : `<b class="ui-bad">${t('hud.commLost')}</b>`;
    return `
      <h2>${t('inventory.title')}</h2>
      <div class="nb-inv">
        ${detailPanelsHtml(current, currentView)}
        <div class="ui-panel">
          <span class="ui-label">${t('inventory.stocks')}</span>
          <ul class="nb-stats">${stocks}</ul>
        </div>
        <div class="ui-panel">
          <span class="ui-label">${t('inventory.base')}</span>
          <ul class="nb-stats">
            <li><span>${t('hud.day', { day: Math.floor(currentView.day) + 1 })}</span><b>${t(current.player.indoors ? 'hud.indoors' : 'hud.outdoors')}</b></li>
            <li><span>${t('research.comm')}</span>${commLine}</li>
            <li><span>${t('hud.relays', { count: currentView.comm.relaySatellites })}</span><b></b></li>
            <li><span>${t('crew.title')}</span><b>${t('inventory.crew', { count: currentView.crew.count, capacity: currentView.crew.capacity })}</b></li>
            ${current.phase === 'cleared' ? `<li><b class="ui-ok">${t('hud.cleared')}</b></li>` : ''}
          </ul>
        </div>
      </div>`;
  };

  /** 翌日のタスクを選ぶ。外にいられる時間は限られるので、全部はできないかもしれない */
  const tasksHtml = (info: RestInfo) => {
    const rows = info.tasks
      .map(
        (task) => `<li class="ui-supply-row${task.selected ? ' picked' : ''}">
          <span class="ui-grow"><b>${task.label}</b> <span class="ui-small ui-cost">${t('tasks.meters', { meters: fmt(task.meters) })}</span></span>
          <button data-action="taskToggle" data-task="${esc(task.id)}" class="${task.selected ? 'on' : ''}">${t(task.selected ? 'tasks.selected' : 'tasks.select')}</button>
        </li>`,
      )
      .join('');
    return `
      <h2>${t('tasks.title')}</h2>
      <p>${t('tasks.lead', { hours: fmt(values.eva.maxHours.value) })}</p>
      ${rows === '' ? `<p class="ui-small">${t('tasks.none')}</p>` : `<ul class="ui-list">${rows}</ul>`}`;
  };

  /** さいごのページ：明日の計画（選んだタスク）と、「翌日へ」「外に出る」 */
  const planHtml = (info: RestInfo) => {
    const chosen = info.tasks.filter((task) => task.selected);
    return `
      <h2>${t('plan.title')}</h2>
      ${
        chosen.length === 0
          ? `<p class="ui-small">${t('plan.empty')}</p>`
          : `<ol class="nb-plan">${chosen.map((task) => `<li>${task.label}</li>`).join('')}</ol>`
      }
      <p class="ui-small">${t(info.canGoOut ? 'plan.goOutNote' : 'plan.sleepNote')}</p>`;
  };

  const restPageHtml = (
    page: RestPage,
    info: RestInfo,
    current: SimState,
    currentView: SimView,
  ) => {
    switch (page) {
      case 'review':
        return reviewHtml(info, current, currentView);
      case 'crew':
        return crewMenuHtml(current, currentView);
      case 'launch':
        return launchMenuHtml(currentView);
      case 'tasks':
        return tasksHtml(info);
      case 'plan':
        return planHtml(info);
      case 'save':
        return saveMenuHtml();
      case 'status':
        return inventoryHtml(current, currentView);
      case 'cards':
        return callbacks.cardsHtml();
    }
  };

  /** 順に進むページの何番目か。セーブ・くわしい様子（順の外）なら -1 */
  /**
   * そのページを開く。順のページは、今いるところか、それより前（戻る）だけ。先へは「次へ」でしか進めないので false を返す。
   * 順の外のページ（セーブ・くわしい様子・カード）はいつでも開ける
   */
  const openRestPage = (page: RestPage): boolean => {
    const step = REST_PAGES.find((p) => p === page);
    if (step === undefined) {
      restPage = page;
    } else if (REST_PAGES.indexOf(step) <= REST_PAGES.indexOf(restStep)) {
      restStep = step;
      restPage = step;
    } else {
      return false;
    }
    renderNotebook();
    return true;
  };

  const renderNotebook = () => {
    if (rest === null || state === null || view === null) {
      notebookEl.hidden = true;
      notebookEl.innerHTML = '';
      document.body.classList.remove('nb-open');
      return;
    }
    notebookEl.hidden = false;
    document.body.classList.add('nb-open');
    // 上の進み具合：番号と名前。前のページへは押して戻れる。先のページは押せない（「次へ」で順に進む）
    const outOfOrder = restPage !== restStep;
    const index = REST_PAGES.indexOf(restStep);
    // 博士の「やること」がこのページでの操作なら、済むまで先へは進ませない（もどる・前のページと、左上の「外に出る」は押せる）
    const requiredPage = rest.requiredPage;
    const locked = requiredPage !== null && requiredPage === restPage;
    // 押せないボタンは disabled にせず（押しても何も起きないと理由が分からない）、押したら理由を知らせる
    const lockedAttr = (reason: 'task' | 'ahead') =>
      `aria-disabled="true" data-locked="${reason === 'task' && requiredPage !== null ? `task.${requiredPage}` : 'ahead'}"`;
    const steps = REST_PAGES.map(
      (page, i) =>
        `<button class="nb-step ${page === restPage ? 'on' : i <= index ? 'past' : ''}" data-action="nbGo" data-page="${page}" ${i > index ? lockedAttr(locked ? 'task' : 'ahead') : ''}><span class="nb-step-no">${i + 1}</span><span>${t(`notebook.page.${page}`)}</span></button>`,
    ).join('');
    const guideHtml =
      guide === null
        ? ''
        : `<div class="ui-modal-guide"><span class="ui-modal-guide-face">${PROFESSOR_SVG}</span><div>${guide}</div></div>`;
    const back =
      outOfOrder || index > 0
        ? `<button data-action="nbBack">${t('notebook.back')}</button>`
        : '<span></span>';
    let forward: string;
    if (outOfOrder) {
      // セーブ・くわしい様子・カードからは、「もどる」で順のページに戻るだけ
      forward = '<span></span>';
    } else if (restPage === 'plan') {
      // 「外に出る」「翌日へ」は 3D の画面と同じボタン（data-action="context"）にして、E キーとくんれんの矢印もそのまま使う
      const goOut = rest.canGoOut
        ? `<button class="${rest.wentOutToday && rest.canNextDay ? '' : 'primary nb-next'}" data-action="context" data-context="exitHabitat">${t('action.exitHabitat')}</button>`
        : '';
      const nextDay = rest.canNextDay
        ? `<button class="${rest.canGoOut && !rest.wentOutToday ? '' : 'primary nb-next'}" data-action="context" data-context="nextDay">${t('action.nextDay')}</button>`
        : '';
      forward = `<span class="nb-foot-actions">${goOut}${nextDay}</span>`;
    } else {
      forward = `<button class="primary nb-next" data-action="nbNext" ${locked ? lockedAttr('task') : ''}>${t('notebook.next', { page: t(`notebook.page.${REST_PAGES[Math.min(index + 1, REST_PAGES.length - 1)]}`) })}</button>`;
    }
    // 出口はいつも左上に（ちょっと中に入っただけのときも、「次へ」で最後まで進まなくてよい）
    const exitTop = rest.canGoOut
      ? `<button class="nb-exit" data-action="context" data-context="exitHabitat" aria-label="${tPlain('action.exitHabitat')}"><span>${t('notebook.icon.exit')}</span><span class="nb-head-label">${t('action.exitHabitat')}</span><span class="nb-exit-short">${t('notebook.exitShort')}</span></button>`
      : '';
    notebookEl.innerHTML = `
      <div class="nb">
        <div class="nb-head">${exitTop}<b class="nb-head-title"><span class="nb-head-label">${t('notebook.title', { day: Math.floor(view.day) + 1 })}</span><span class="nb-exit-short">${t('hud.day', { day: Math.floor(view.day) + 1 })}</span></b><span class="nb-head-buttons">${(['cards', 'status', 'save'] as const).map((page) => `<button data-action="nbGo" data-page="${page}" aria-label="${tPlain(`notebook.page.${page}`)}" ${locked && requiredPage !== page ? lockedAttr('task') : ''}><span>${t(`notebook.icon.${page}`)}</span><span class="nb-head-label">${t(`notebook.page.${page}`)}</span></button>`).join('')}</span></div>
        ${guideHtml}
        <nav class="nb-steps">${steps}</nav>
        <section class="nb-page">${restPageHtml(restPage, rest, state, view)}</section>
        <div class="nb-foot">${back}${forward}</div>
      </div>`;
  };

  // 窓のいちばん上に出す博士の「やること」（main が毎フレーム渡す）
  let guide: string | null = null;
  const renderModal = () => {
    renderNotebook();
    const dialog = dialogs[0];
    if (dialog !== undefined) {
      modalEl.hidden = false;
      modalEl.innerHTML = `<div class="ui-modal">${dialogHtml(dialog)}</div>`;
      return;
    }
    if (menu !== null && state !== null && view !== null) {
      let html: string;
      if (menu === 'build') {
        html = buildMenuHtml(state);
      } else if (menu === 'status') {
        html = inventoryHtml(state, view);
      } else {
        html = dataMenuHtml();
      }
      modalEl.hidden = false;
      // 閉じるボタンは下にもあるが、見つけやすいよう右上にも出す
      const guideHtml =
        guide === null
          ? ''
          : `<div class="ui-modal-guide"><span class="ui-modal-guide-face">${PROFESSOR_SVG}</span><div>${guide}</div></div>`;
      modalEl.innerHTML = `<div class="ui-modal"><button class="ui-modal-x" data-action="closeMenu" aria-label="${tPlain('button.close')}">${t('button.closeIcon')}</button>${guideHtml}${html}<div class="ui-close-row"><button data-action="closeMenu">${t('button.close')}</button></div></div>`;
      return;
    }
    modalEl.hidden = true;
    modalEl.innerHTML = '';
  };

  const pushDialog = (dialog: Dialog) => {
    // 説明の窓はメニューより先に見せる
    menu = null;
    dialogs.push(dialog);
    renderModal();
    updatePause();
    renderStatus();
  };

  const closeTopDialog = () => {
    dialogs.shift();
    renderModal();
    updatePause();
    renderStatus();
  };

  const closeMenus = () => {
    if (menu === null) {
      return;
    }
    menu = null;
    renderModal();
    updatePause();
    renderStatus();
  };

  /** 3D の窓（建設・データ）を開く。隊員・ほきゅう・セーブは休息の画面のタブなので、中にいればそのタブにし、外ならひとこと出す */
  const openMenu = (kind: MenuKind | RestPage) => {
    const menuKind = MENUS.find((m) => m === kind);
    // 中にいる間：くわしい様子は休息の画面のページで。建設は外の 3D の地面で選ぶので、外に出てから
    if (menuKind === 'status' && rest !== null) {
      openRestPage('status');
      return;
    }
    if (menuKind === 'build' && rest !== null) {
      toast(t('notebook.buildOutside'), false);
      return;
    }
    if (menuKind === undefined) {
      const page = pick(kind, NOTEBOOK_PAGES, 'notebook page');
      if (rest === null) {
        toast(t('notebook.insideOnly', { name: t(`notebook.page.${page}`) }), false);
        return;
      }
      // 中では順に進むので、先のページ（キーや困りごとカードから）は開かず、「次へ」で進むよう伝える
      if (!openRestPage(page)) {
        toast(t('notebook.inOrder'), false);
      }
      return;
    }
    if (state === null || view === null) {
      throw new Error('ui.update の前にメニューを開こうとした');
    }
    if (dialogs.length > 0) {
      return; // 説明の窓を先に閉じてもらう
    }
    if (menu === menuKind) {
      closeMenus();
      return;
    }
    menu = menuKind;
    renderModal();
    updatePause();
    renderStatus();
  };

  const renderAll = () => {
    renderTopButtons();
    renderPauseOverlay();
    renderStatus();
    renderHud();
    renderButtons();
    renderBuildBar();
    renderModal();
  };

  // ---- 押せないボタンを押したとき ----
  // 文を読まずに押した子にも届くよう、押したその場で知らせる：ボタンを震わせ、すぐ上に大きな吹き出しで理由を出し、
  // 博士の「やること」の欄を光らせる（下のお知らせや、ほかの場所の文を探させない）
  let lockedBubble: { el: HTMLElement; timer: number } | null = null;
  const explainLocked = (target: HTMLElement, text: string) => {
    if (lockedBubble !== null) {
      window.clearTimeout(lockedBubble.timer);
      lockedBubble.el.remove();
    }
    const bubble = document.createElement('div');
    bubble.className = 'ui-locked-bubble';
    bubble.setAttribute('role', 'alert');
    bubble.innerHTML = text;
    root.append(bubble);
    const rect = target.getBoundingClientRect();
    const box = bubble.getBoundingClientRect();
    const left = Math.min(
      window.innerWidth - box.width - BUBBLE_MARGIN_PX,
      Math.max(BUBBLE_MARGIN_PX, rect.left + rect.width / 2 - box.width / 2),
    );
    // 上に場所があれば上に、なければ下に出す
    const above = rect.top - box.height - BUBBLE_GAP_PX >= BUBBLE_MARGIN_PX;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${above ? rect.top - box.height - BUBBLE_GAP_PX : rect.bottom + BUBBLE_GAP_PX}px`;
    bubble.dataset.side = above ? 'above' : 'below';
    bubble.style.setProperty('--tail-x', `${rect.left + rect.width / 2 - left}px`);
    for (const el of [target, ...root.querySelectorAll<HTMLElement>('.nb .ui-modal-guide')]) {
      const name = el === target ? 'ui-shake' : 'ui-flash';
      el.classList.remove(name);
      // つけ直して、アニメーションをもう一度動かす
      requestAnimationFrame(() => el.classList.add(name));
    }
    lockedBubble = {
      el: bubble,
      timer: window.setTimeout(() => {
        bubble.remove();
        lockedBubble = null;
      }, BUBBLE_MS),
    };
  };

  // ---- 入力 ----
  root.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) {
      return;
    }
    const target = e.target.closest<HTMLElement>('[data-action]');
    if (target === null) {
      return;
    }
    // 押せないボタン：何もせず、押せない理由を知らせる
    if (target.getAttribute('aria-disabled') === 'true') {
      const locked = target.dataset.locked;
      explainLocked(
        target,
        locked === undefined || locked === 'ahead'
          ? t('notebook.inOrder')
          : t(`notebook.doFirst.${locked.slice('task.'.length)}`),
      );
      return;
    }
    switch (target.dataset.action) {
      case 'pause':
        userPaused = !userPaused;
        renderPauseOverlay();
        renderTopButtons();
        updatePause();
        renderStatus();
        break;
      case 'lang':
        setLang(pick(target.dataset.lang, ['en', 'ja'] as const, 'lang'));
        break;
      case 'menu':
        openMenu(pick(target.dataset.menu, MENUS, 'menu'));
        break;
      case 'closeMenu':
        closeMenus();
        break;
      case 'nbGo':
        // 先のページのボタンは押せないようにしているので、ここで開けないのは作りの誤り
        if (!openRestPage(pick(target.dataset.page, NOTEBOOK_PAGES, 'notebook page'))) {
          throw new Error(`ui：先のページ ${String(target.dataset.page)} へ飛ぼうとした`);
        }
        break;
      case 'nbNext': {
        restStep = REST_PAGES[Math.min(REST_PAGES.indexOf(restStep) + 1, REST_PAGES.length - 1)];
        restPage = restStep;
        renderNotebook();
        break;
      }
      case 'nbBack': {
        // 順の外のページからは、開く前にいたページへ。順のページからは1つ前へ
        if (restPage === restStep) {
          restStep = REST_PAGES[Math.max(REST_PAGES.indexOf(restStep) - 1, 0)];
        }
        restPage = restStep;
        renderNotebook();
        break;
      }
      case 'openTerm': {
        const term = target.dataset.term;
        if (term === undefined) {
          throw new Error('ui の言葉がない');
        }
        callbacks.onOpenTerm(term);
        break;
      }
      case 'taskToggle': {
        const taskId = target.dataset.task;
        if (taskId === undefined) {
          throw new Error('ui のタスクの ID がない');
        }
        callbacks.onTaskToggle(taskId);
        break;
      }
      case 'context':
        callbacks.onContextAction(pick(target.dataset.context, CONTEXT_ACTIONS, 'context'));
        break;
      case 'dustCover':
        buildOptions.dustCover = !buildOptions.dustCover;
        renderModal();
        break;
      case 'shieldMaterial':
        buildOptions.shieldMaterial = pick(target.dataset.material, SHIELD_MATERIALS, 'material');
        renderModal();
        break;
      case 'buildSelect': {
        const kind = pick(target.dataset.kind, FACILITY_KINDS, 'facility');
        menu = null;
        renderModal();
        updatePause();
        renderStatus();
        callbacks.onBuildSelect(kind, optionsFor(kind));
        break;
      }
      case 'buildConfirm':
        callbacks.onBuildConfirm();
        break;
      case 'buildCancel':
        callbacks.onBuildCancel();
        break;
      case 'cart': {
        const kind = pick(target.dataset.kind, LAUNCH_ITEM_KINDS, 'launch item');
        const delta = pick(target.dataset.delta, ['1', '-1'] as const, 'delta') === '1' ? 1 : -1;
        // 酸素・水・食料・資材は 1 個が 1 kg なので、1 回の押しでまとまった量を増減する
        const step = BULK_LAUNCH_ITEMS.includes(kind) ? values.launch.bulkOrderStep.value : 1;
        cart[kind] = Math.max(0, cart[kind] + delta * step);
        renderModal();
        break;
      }

      case 'order': {
        const items = cartItems();
        for (const kind of LAUNCH_ITEM_KINDS) {
          cart[kind] = 0;
        }
        callbacks.onOrderLaunch(items);
        break;
      }
      case 'cancelOrder': {
        // 取り消したら、カゴに戻して選び直せるようにする
        for (const item of rest?.queuedOrder ?? []) {
          cart[item.kind] += item.quantity;
        }
        callbacks.onCancelOrder();
        break;
      }
      case 'assign': {
        const crewId = target.dataset.crew;
        if (crewId === undefined) {
          throw new Error('ui の隊員の ID がない');
        }
        const task = pick(target.dataset.task, CREW_TASKS, 'task');
        assigned.set(crewId, task);
        callbacks.onAssignCrew(crewId, task);
        renderModal();
        break;
      }
      case 'flare': {
        const choice = pick(target.dataset.choice, ['shelter', 'continue'] as const, 'choice');
        closeTopDialog();
        callbacks.onFlareChoice(choice);
        break;
      }
      case 'dialogOk':
        closeTopDialog();
        break;
      case 'backToTitle':
        dialogs.length = 0;
        menu = null;
        renderModal();
        updatePause();
        callbacks.onBackToTitle();
        break;
      case 'restart':
        dialogs.length = 0;
        menu = null;
        renderModal();
        updatePause();
        callbacks.onRestart();
        break;
      case 'save': {
        const slot = Number(target.dataset.slot);
        if (!Number.isInteger(slot) || slot < 0 || slot >= values.save.manualSlots.value) {
          throw new Error(`ui のセーブの枠が不正: ${String(target.dataset.slot)}`);
        }
        callbacks.onSave(slot);
        break;
      }
      case 'load': {
        const saveId = target.dataset.save;
        if (saveId === undefined) {
          throw new Error('ui のセーブの ID がない');
        }
        // 再開の前に窓とメニューを閉じる
        dialogs.length = 0;
        menu = null;
        renderModal();
        updatePause();
        renderStatus();
        callbacks.onLoad(saveId);
        break;
      }
    }
  });

  // HUD は時間が進むたびに描き直すので、押した瞬間に反応させる
  root.addEventListener('pointerdown', (e) => {
    if (!(e.target instanceof Element)) {
      return;
    }
    const target = e.target.closest<HTMLElement>('[data-action]');
    if (target?.dataset.action === 'toggleBreakdown') {
      showBreakdown = !showBreakdown;
      renderHud();
    }
  });

  const movePad = (e: PointerEvent) => {
    const rect = padEl.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = (e.clientX - (rect.left + radius)) / radius;
    let dy = (e.clientY - (rect.top + radius)) / radius;
    const length = Math.hypot(dx, dy);
    if (length > 1) {
      dx /= length;
      dy /= length;
    }
    pad.x = dx;
    pad.y = -dy;
    knobEl.style.transform = `translate(${dx * radius * KNOB_TRAVEL}px, ${dy * radius * KNOB_TRAVEL}px)`;
  };
  const releasePad = (e: PointerEvent) => {
    if (e.pointerId !== padPointer) {
      return;
    }
    padPointer = null;
    pad.x = 0;
    pad.y = 0;
    knobEl.style.transform = '';
  };
  padEl.addEventListener('pointerdown', (e) => {
    padPointer = e.pointerId;
    padEl.setPointerCapture(e.pointerId);
    movePad(e);
    e.preventDefault();
  });
  padEl.addEventListener('pointermove', (e) => {
    if (e.pointerId === padPointer) {
      movePad(e);
    }
  });
  padEl.addEventListener('pointerup', releasePad);
  padEl.addEventListener('pointercancel', releasePad);

  onLangChange(renderAll);

  const showEvents = (events: GameEvent[], eventState: SimState, death: DeathAdvice | null) => {
    const adviceFor = (what: string): DeathAdvice => {
      if (death === null) {
        throw new Error(`ui: ${what} なのに、ルナはかせのアドバイスがない`);
      }
      return death;
    };
    for (const event of events) {
      switch (event.type) {
        // 止まった施設は、困りごとカード（直るまで出る）と HUD で分かるので、そのたびのお知らせは出さない
        case 'facilityStopped':
          break;
        case 'launchArrived':
          toast(t('event.launchArrived'), false);
          break;
        case 'commLost':
          toast(t('event.commLost'), true);
          break;
        case 'commRestored':
          toast(t('event.commRestored'), false);
          break;
        case 'playerDowned':
          // 同じときに基地の物資も尽きたら、そちらのゲームオーバーの窓だけを出す
          if (events.some((e) => e.type === 'gameOver')) {
            break;
          }
          // チュートリアルの外で倒れたら、main がゲームオーバーにしている
          pushDialog(
            eventState.phase === 'gameOver'
              ? { type: 'gameOver', advice: adviceFor('倒れた') }
              : { type: 'downed', advice: adviceFor('倒れた') },
          );
          break;
        case 'cleared':
          pushDialog({ type: 'cleared', total: eventState.development.total });
          break;
        case 'gameOver':
          pushDialog({ type: 'gameOver', advice: adviceFor('ゲームオーバー') });
          break;
        case 'achievement':
          toast(t('event.achievement', { name: t(`achievement.${event.id}`) }), false);
          break;
        // 警報は DONKI の記録と合わせて main が showFlareAlert で出す。発展度は HUD に出る
        case 'eventStarted':
        case 'developmentChanged':
          break;
      }
    }
  };

  const sameBuildMode = (mode: { kind: FacilityKind; placement: Placement } | null) => {
    if (mode === null || buildMode === null) {
      return mode === buildMode;
    }
    return (
      mode.kind === buildMode.kind &&
      mode.placement.allowed === buildMode.placement.allowed &&
      mode.placement.works === buildMode.placement.works &&
      mode.placement.reason === buildMode.placement.reason
    );
  };

  document.documentElement.lang = getLang();
  renderAll();

  return {
    update(nextState, nextView) {
      state = nextState;
      view = nextView;
      for (const member of nextState.crew) {
        if (assigned.get(member.id) === member.task) {
          assigned.delete(member.id);
        }
      }
      renderHud();
      renderStatus();
      if (rest !== null) {
        renderNotebook();
      }
    },
    showEvents,
    showMorning(summary) {
      pushDialog({ type: 'morning', summary });
    },
    showFlareAlert(event, donki) {
      pushDialog({ type: 'flare', event, donki });
    },
    getPadInput(): PadInput {
      const input = { x: pad.x, y: pad.y };
      return input;
    },
    setBuildMode(mode) {
      if (sameBuildMode(mode)) {
        return;
      }
      buildMode = mode;
      renderBuildBar();
    },
    setContextActions(actions) {
      if (
        actions.length === contextActions.length &&
        actions.every((action, index) => action === contextActions[index])
      ) {
        return;
      }
      contextActions = [...actions];
      renderButtons();
    },
    openMenu,
    closeMenus,
    notify: toast,
    setNasaImages(images) {
      nasaImages = images;
    },
    setDonkiEvents(events) {
      donkiEvents = [...events];
      if (menu === 'data') {
        renderModal();
      }
    },
    setSaves(next) {
      saves = [...next];
      if (rest !== null || dialogs[0]?.type === 'gameOver') {
        renderModal();
      }
    },
    isInventoryOpen() {
      return menu === 'status' || (rest !== null && restPage === 'status');
    },
    isMenuOpen() {
      return menu !== null || dialogs.length > 0 || closeMinigame !== null;
    },
    setGuide(next) {
      if (next === guide) {
        return;
      }
      guide = next;
      if (menu !== null || rest !== null) {
        renderModal();
      }
    },
    setTaskList(next) {
      if (JSON.stringify(next) === JSON.stringify(taskList)) {
        return;
      }
      taskList = next.map((task) => ({ ...task }));
      renderHud();
    },
    startMinigame(kind, onFinish) {
      if (closeMinigame !== null) {
        return;
      }
      closeMinigame = openMinigame(
        root,
        kind,
        values,
        (outcome: MinigameOutcome) => {
          closeMinigame = null;
          onFinish(outcome);
        },
        (name) => callbacks.onMinigameSound(name),
      );
    },
    stopMinigame() {
      closeMinigame?.();
      closeMinigame = null;
    },
    isMinigameOpen() {
      return closeMinigame !== null;
    },
    setRest(next) {
      if (JSON.stringify(next) === JSON.stringify(rest)) {
        return;
      }
      if (rest === null && next !== null) {
        // 夕方に中に入ったら振り返りから。朝（まだ外に出ていない）なら、さいごのページ（明日の計画と「外に出る」）から
        restStep = next.wentOutToday ? 'review' : 'plan';
        restPage = restStep;
      }
      rest = next;
      renderNotebook();
      renderButtons();
    },
    isUserPaused() {
      return userPaused;
    },
  };
}
