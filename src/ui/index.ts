// HUD、メニュー、説明の窓、仮想パッド。素の DOM で作り、文言はすべて t() から出す
import type {
  ActiveEvent,
  CrewTask,
  DonkiEvent,
  FacilityKind,
  GameEvent,
  LaunchItem,
  LaunchItemKind,
  ResourceKey,
  SimState,
  Values,
} from '../contracts/index.ts';
import type { SaveSummary } from '../save/api.ts';
import type { BuildOptions, Placement, SimView } from '../sim/api.ts';
import { buildCost, launchItemCost } from '../sim/index.ts';
import type { PadInput } from '../world/api.ts';
import type { ContextAction, Ui, UiCallbacks } from './api.ts';
import { getLang, onLangChange, setLang, t } from './i18n.ts';
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
const LAUNCH_ITEM_KINDS: readonly LaunchItemKind[] = [
  'oxygen',
  'water',
  'food',
  'spareParts',
  'materials',
  'facilityKit',
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
];
const MENUS = ['build', 'launch', 'crew', 'save', 'data'] as const;
const DEVELOPMENT_ELEMENTS = ['selfSufficiency', 'stability', 'safety', 'scale'] as const;
const LIFE_SUPPORT_KEYS = ['oxygen', 'water', 'food'] as const;
const SHIELD_MATERIALS = ['regolith', 'water'] as const;

// 表示だけに使う値（ゲームの数値ではない）
const STAR_COUNT = 5;
const TOAST_MS = 4500;
const HOURS_PER_DAY = 24;
const PERCENT = 100;
const LOW_BAR_RATIO = 0.25; // バーを赤くする残りの割合
const LOW_DAYS = 7; // 生命維持の日数を赤くする
const DOSE_WARN_RATIO = 0.5; // 被ばくが上限のこの割合を超えたら赤くする
const KNOB_TRAVEL = 0.6; // パッドのつまみが動ける範囲（半径に対する割合）
const ISO_DATE_LENGTH = 10; // "2024-05-14T..." の日付の部分

type MenuKind = (typeof MENUS)[number];
type Dialog =
  | { type: 'flare'; event: ActiveEvent; donki: DonkiEvent | null }
  | { type: 'downed'; reason: 'tankEmpty' | 'radiation' }
  | { type: 'cleared'; total: number }
  | { type: 'gameOver'; reason: ResourceKey };

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
  padEl.hidden = !isTouch;

  let state: SimState | null = null;
  let view: SimView | null = null;
  let speed: 1 | 4 = 1;
  let userPaused = false;
  let lastPaused = false;
  let showBreakdown = false;
  let menu: MenuKind | null = null;
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
  let kitKind: FacilityKind = 'solar';
  // 割り当てを選んだが、時間が止まっていてまだ state に出ていないもの
  const assigned = new Map<string, CrewTask>();
  let contextActions: ContextAction[] = [];
  let buildMode: { kind: FacilityKind; placement: Placement } | null = null;
  const pad = { x: 0, y: 0 };
  let jumpHeld = false;
  let jumpLatched = false;
  let padPointer: number | null = null;

  const updatePause = () => {
    const paused = userPaused || menu !== null || dialogs.length > 0;
    if (paused !== lastPaused) {
      lastPaused = paused;
      callbacks.onPauseChange(paused);
    }
  };

  const toast = (text: string, bad: boolean) => {
    const el = document.createElement('div');
    el.className = bad ? 'ui-toast bad' : 'ui-toast';
    el.textContent = text;
    toastsEl.append(el);
    window.setTimeout(() => el.remove(), TOAST_MS);
  };

  const optionsFor = (kind: FacilityKind): BuildOptions =>
    kind === 'shield'
      ? { dustCover: buildOptions.dustCover, shieldMaterial: buildOptions.shieldMaterial }
      : { dustCover: buildOptions.dustCover };

  const launchLine = (kind: LaunchItemKind, quantity: number): LaunchItem =>
    kind === 'facilityKit' ? { kind, quantity, facilityKind: kitKind } : { kind, quantity };

  const cartItems = (): LaunchItem[] =>
    LAUNCH_ITEM_KINDS.filter((kind) => cart[kind] > 0).map((kind) => launchLine(kind, cart[kind]));

  // ---- 右上：速さ・一時停止・言語 ----
  const renderTopButtons = () => {
    const lang = getLang();
    topButtonsEl.innerHTML = `
      <button data-action="speed" data-speed="1" class="${speed === 1 ? 'on' : ''}">${t('hud.speed1')}</button>
      <button data-action="speed" data-speed="4" class="${speed === 4 ? 'on' : ''}">${t('hud.speed4')}</button>
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
      `<div>${t('hud.relays', { count: view.comm.relaySatellites })}</div>`,
    ];
    if (view.comm.unsentResearch > 0) {
      lines.push(
        `<div>${t('hud.unsentResearch', { amount: fmt(view.comm.unsentResearch, 1) })}</div>`,
      );
    }
    if (state.activeEvents.length > 0) {
      lines.push(`<div class="ui-bad">${t('hud.flareActive')}</div>`);
    }
    if (state.phase === 'cleared') {
      lines.push(`<div class="ui-ok">${t('hud.cleared')}</div>`);
    }
    if (lastPaused) {
      lines.push(`<div>${t('hud.paused')}</div>`);
    }
    statusEl.innerHTML = lines.join('');
  };

  // ---- 左上：資源と発展度 ----
  const renderHud = () => {
    if (state === null || view === null) {
      hudEl.innerHTML = '';
      return;
    }
    const life = view.lifeSupportDays;
    const daysText = (days: number) =>
      Number.isFinite(days) ? t('hud.daysLeft', { days: fmt(days, 1) }) : t('hud.daysForever');
    const breakdown = showBreakdown
      ? `<div class="ui-breakdown">${LIFE_SUPPORT_KEYS.map(
          (key) =>
            `<div>${t('hud.breakdown', { name: t(`resource.${key}`), days: daysText(life[key]) })}</div>`,
        ).join('')}</div>`
      : `<div class="ui-small">${t('hud.tapForDetails')}</div>`;
    const power = view.power;
    const battery =
      power.batteryCapacityKwh > 0
        ? `<div class="ui-small">${t('hud.battery', {
            stored: fmt(power.batteryKwh),
            capacity: fmt(power.batteryCapacityKwh),
          })}</div>${bar(power.batteryKwh / power.batteryCapacityKwh, '')}`
        : `<div class="ui-small">${t('hud.noBattery')}</div>`;
    const shielding = view.shielding;
    const doseWarn = shielding.playerDoseMsv > shielding.doseLimitMsv * DOSE_WARN_RATIO;
    const development = state.development;
    const elementMax = values.development.elementMax.value;
    hudEl.innerHTML = `
      <div class="ui-panel">
        <div class="ui-stat" data-action="toggleBreakdown">
          <span class="ui-label">${t('hud.lifeSupport')}</span>
          <span class="ui-value ${life.min < LOW_DAYS ? 'ui-bad' : ''}">${daysText(life.min)}</span>
          ${breakdown}
        </div>
        <div class="ui-stat">
          <span class="ui-label">${t('hud.power')}</span>
          <div>${t('hud.powerFlow', { gen: fmt(power.generationKw, 1), use: fmt(power.consumptionKw, 1) })}</div>
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
        <div class="ui-stat">
          <span class="ui-label">${t('hud.tank')}</span>
          ${bar(view.tankRatio, 'o2')}
        </div>
      </div>
      <div class="ui-panel">
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

  // ---- 右下：メニューとその場の行動 ----
  const renderButtons = () => {
    const contextHtml = contextActions
      .map((action, index) => {
        const label = t(`action.${action}`);
        return index === 0
          ? `<button data-action="context" data-context="${action}" class="primary">${t('action.withKey', { label })}</button>`
          : `<button data-action="context" data-context="${action}">${label}</button>`;
      })
      .join('');
    buttonsEl.innerHTML = `
      <div class="ui-row ui-context">${contextHtml}</div>
      <div class="ui-row">
        <button data-action="menu" data-menu="build">${t('button.build')}</button>
        <button data-action="menu" data-menu="launch">${t('button.launch')}</button>
        <button data-action="menu" data-menu="crew">${t('button.crew')}</button>
        <button data-action="menu" data-menu="save">${t('button.save')}</button>
        <button data-action="menu" data-menu="data">${t('button.data')}</button>
      </div>
      ${isTouch ? `<button class="ui-jump" data-action="jump">${t('button.jump')}</button>` : ''}`;
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
      <div><b>${t('build.placing', { name: t(`facility.${kind}`) })}</b></div>
      ${status}
      <div class="ui-small ui-buildhint">${t(isTouch ? 'build.hint.touch' : 'build.hint.mouse')}</div>
      <div class="ui-row">
        <button data-action="buildConfirm" class="primary" ${placement.allowed ? '' : 'disabled'}>${t('build.place')}</button>
        <button data-action="buildCancel">${t('build.cancel')}</button>
      </div>`;
  };

  // ---- メニュー ----
  const buildMenuHtml = (current: SimState) => {
    const items = FACILITY_KINDS.map((kind) => {
      const cost = buildCost(kind, optionsFor(kind), values);
      const affordable = cost.materials <= current.stocks.materials;
      const materialChooser =
        kind === 'shield'
          ? `<div class="ui-row">${SHIELD_MATERIALS.map(
              (material) =>
                `<button data-action="shieldMaterial" data-material="${material}" class="${buildOptions.shieldMaterial === material ? 'on' : ''}">${t(`build.material.${material}`)}</button>`,
            ).join(
              '',
            )}</div><small>${t(`build.materialDesc.${buildOptions.shieldMaterial}`)}</small>`
          : '';
      return `<li>
        <button class="ui-item ${affordable ? '' : 'dim'}" data-action="buildSelect" data-kind="${kind}">
          <b>${t(`facility.${kind}`)}</b> — ${t('build.cost', { materials: fmt(cost.materials) })}
          <small>${t(`facilityDesc.${kind}`)}</small>
        </button>
        ${materialChooser}
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
      <ul class="ui-list">${items}</ul>
      <div class="ui-actions"><button data-action="closeMenu">${t('button.close')}</button></div>`;
  };

  const launchMenuHtml = (current: SimView) => {
    const items = cartItems();
    const used = items.reduce((sum, item) => sum + launchItemCost(item, values), 0);
    const capacity = current.launch.capacity;
    const over = used > capacity;
    const reasons: string[] = [];
    if (!current.comm.linked) {
      reasons.push(t('launch.noLink'));
    }
    if (current.launch.hoursUntilNext > 0) {
      reasons.push(
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
    const rows = LAUNCH_ITEM_KINDS.map((kind) => {
      const unitCost = launchItemCost(launchLine(kind, 1), values);
      const kitSelect =
        kind === 'facilityKit'
          ? `<label class="ui-small">${t('launch.kitKind')} <select data-action="kitKind">${FACILITY_KINDS.map(
              (facility) =>
                `<option value="${facility}" ${facility === kitKind ? 'selected' : ''}>${t(`facility.${facility}`)}</option>`,
            ).join('')}</select></label>`
          : '';
      const desc =
        kind === 'facilityKit' || kind === 'crew' || kind === 'relaySatellite'
          ? `<small>${t(`launchItemDesc.${kind}`)}</small>`
          : '';
      return `<li>
        <span class="ui-grow"><b>${t(`launchItem.${kind}`)}</b> <span class="ui-small">${t('launch.unitCost', { cost: fmt(unitCost) })}</span>${desc}</span>
        ${kitSelect}
        <button data-action="cart" data-kind="${kind}" data-delta="-1">−</button>
        <span class="ui-qty">${cart[kind]}</span>
        <button data-action="cart" data-kind="${kind}" data-delta="1">＋</button>
      </li>`;
    }).join('');
    const meterRatio = capacity > 0 ? Math.min(1, used / capacity) : 1;
    const inFlight = current.launch.inFlight
      .map(
        (launch) =>
          `<div class="ui-small">${t('launch.inFlight', { days: fmt(launch.hoursUntilArrival / HOURS_PER_DAY, 1) })}</div>`,
      )
      .join('');
    return `
      <h2>${t('launch.title')}</h2>
      <p class="ui-small">${t('launch.intro')}</p>
      <div class="ui-meter"><div class="${over ? 'over' : ''}" style="width:${fmt(meterRatio * PERCENT)}%"></div></div>
      <div>${t('launch.meter', { used: fmt(used), capacity: fmt(capacity) })}</div>
      <ul class="ui-list">${rows}</ul>
      <div class="ui-small">${t('launch.delivery', { days: fmt(current.launch.deliveryHours / HOURS_PER_DAY, 1) })}</div>
      ${current.launch.canOrderNow ? `<div class="ui-small ui-ok">${t('launch.ready')}</div>` : ''}
      ${inFlight}
      ${reasons.map((reason) => `<div class="ui-small ui-bad">${reason}</div>`).join('')}
      <div class="ui-actions">
        <button data-action="order" class="primary" ${canOrder ? '' : 'disabled'}>${t('launch.order')}</button>
        <button data-action="closeMenu">${t('button.close')}</button>
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
      ${descriptions}
      <div class="ui-actions"><button data-action="closeMenu">${t('button.close')}</button></div>`;
  };

  // ---- 説明の窓 ----
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
      <p><b>${t('flare.class', { value: esc(event.classOrIntensity) })}</b></p>
      <p class="ui-small">${source}<small>${t('flare.donkiId', { id: esc(event.donkiId) })}</small></p>
      <p>${t('flare.hint')}</p>
      <div class="ui-actions">
        <button data-action="flare" data-choice="continue">${t('flare.continue')}</button>
        <button data-action="flare" data-choice="shelter" class="primary">${t('flare.shelter')}</button>
      </div>`;
  };

  const dialogHtml = (dialog: Dialog): string => {
    switch (dialog.type) {
      case 'flare':
        return flareHtml(dialog.event, dialog.donki);
      case 'downed':
        return `
          <h2>${t('downed.title')}</h2>
          <p>${t(`downed.${dialog.reason}`)}</p>
          <p>${t('downed.wake')}</p>
          <div class="ui-actions"><button data-action="dialogOk" class="primary">${t('button.ok')}</button></div>`;
      case 'cleared':
        return `
          <h2>${t('cleared.title')}</h2>
          <p>${t('cleared.body', { value: fmt(dialog.total) })}</p>
          <p>${t('cleared.next')}</p>
          <div class="ui-actions"><button data-action="dialogOk" class="primary">${t('cleared.continue')}</button></div>`;
      case 'gameOver':
        return `
          <h2>${t('gameOver.title')}</h2>
          <p>${t('gameOver.reason', { resource: t(`resource.${dialog.reason}`) })}</p>
          ${saves.length > 0 ? `<p>${t('gameOver.resumeFrom')}</p>${saveListHtml()}` : ''}
          <div class="ui-actions"><button data-action="restart" class="primary">${t('gameOver.restart')}</button></div>`;
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
      <div class="ui-actions"><button data-action="closeMenu">${t('button.close')}</button></div>`;
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
      <h3>${t('data.values')}</h3>
      ${sources === '' ? `<p class="ui-small">${t('data.valuesPending')}</p>` : `<ul class="ui-list">${sources}</ul>`}
      <h3>${t('data.terrainTitle')}</h3>
      <p class="ui-small">${t('data.terrain')}</p>
      <div class="ui-actions"><button data-action="closeMenu">${t('button.close')}</button></div>`;
  };

  const renderModal = () => {
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
      } else if (menu === 'launch') {
        html = launchMenuHtml(view);
      } else if (menu === 'crew') {
        html = crewMenuHtml(state, view);
      } else if (menu === 'save') {
        html = saveMenuHtml();
      } else {
        html = dataMenuHtml();
      }
      modalEl.hidden = false;
      modalEl.innerHTML = `<div class="ui-modal">${html}</div>`;
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

  const openMenu = (kind: MenuKind) => {
    if (state === null || view === null) {
      throw new Error('ui.update の前にメニューを開こうとした');
    }
    if (dialogs.length > 0) {
      return; // 説明の窓を先に閉じてもらう
    }
    if (menu === kind) {
      closeMenus();
      return;
    }
    menu = kind;
    renderModal();
    updatePause();
    renderStatus();
  };

  const renderAll = () => {
    renderTopButtons();
    renderStatus();
    renderHud();
    renderButtons();
    renderBuildBar();
    renderModal();
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
    switch (target.dataset.action) {
      case 'speed':
        speed = pick(target.dataset.speed, ['1', '4'] as const, 'speed') === '4' ? 4 : 1;
        callbacks.onSpeedChange(speed);
        renderTopButtons();
        break;
      case 'pause':
        userPaused = !userPaused;
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
        menu = null;
        renderModal();
        updatePause();
        renderStatus();
        callbacks.onOrderLaunch(items);
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

  root.addEventListener('change', (e) => {
    if (e.target instanceof HTMLSelectElement && e.target.dataset.action === 'kitKind') {
      kitKind = pick(e.target.value, FACILITY_KINDS, 'kit');
      renderModal();
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
    } else if (target?.dataset.action === 'jump') {
      jumpHeld = true;
      jumpLatched = true;
    }
  });
  window.addEventListener('pointerup', () => {
    jumpHeld = false;
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

  const showEvents = (events: GameEvent[], eventState: SimState) => {
    for (const event of events) {
      switch (event.type) {
        case 'facilityStopped': {
          const facility = eventState.facilities.find((f) => f.id === event.facilityId);
          if (facility === undefined) {
            throw new Error(`止まった施設が見つからない: ${event.facilityId}`);
          }
          toast(
            t('event.facilityStopped', {
              name: t(`facility.${facility.kind}`),
              reason: t(`stopReason.${event.reason}`),
            }),
            true,
          );
          break;
        }
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
          pushDialog({ type: 'downed', reason: event.reason });
          break;
        case 'cleared':
          pushDialog({ type: 'cleared', total: eventState.development.total });
          break;
        case 'gameOver':
          pushDialog({ type: 'gameOver', reason: event.reason });
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
    },
    showEvents,
    showFlareAlert(event, donki) {
      pushDialog({ type: 'flare', event, donki });
    },
    getPadInput(): PadInput {
      const input = { x: pad.x, y: pad.y, jump: jumpHeld || jumpLatched };
      jumpLatched = false;
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
    setDonkiEvents(events) {
      donkiEvents = [...events];
      if (menu === 'data') {
        renderModal();
      }
    },
    setSaves(next) {
      saves = [...next];
      if (menu === 'save' || dialogs[0]?.type === 'gameOver') {
        renderModal();
      }
    },
    isMenuOpen() {
      return menu !== null || dialogs.length > 0;
    },
  };
}
