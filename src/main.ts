// 結合（docs/SPEC.md ステップ4）。固定の刻みで step を呼び、world・ui とつなぐ
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import achievementsJson from '../data/achievements.json';
import donkiJson from '../data/donki-events.json';
import missionsJson from '../data/missions.json';
import nasaImagesJson from '../data/nasa-images.json';
import valuesJson from '../data/values.json';
import type {
  ActiveEvent,
  DonkiEvent,
  DonkiTimeline,
  Facility,
  FacilityKind,
  GameEvent,
  SimCommand,
  SimState,
  Values,
} from './contracts/index.ts';
import { createProceduralEnv } from './env/index.ts';
import { createHelp } from './help/index.ts';
import {
  type AchievementCondition,
  createAchievementStore,
  parseAchievements,
} from './save/achievements.ts';
import { createSaveStore } from './save/index.ts';
import type { BuildOptions, Placement } from './sim/api.ts';
import { checkPlacement, createInitialState, describe, step } from './sim/index.ts';
import { type Advice, createAdviceCard, pickAdvices } from './tutorial/advice.ts';
import { createTutorial, parseMissions } from './tutorial/index.ts';
import type { ContextAction } from './ui/api.ts';
import { createFx } from './ui/fx.ts';
import { onLangChange, t } from './ui/i18n.ts';
import { createUi } from './ui/index.ts';
import { createPhotoCard, parseNasaImages } from './ui/photo.ts';
import { createWorld } from './world/index.ts';
import './style.css';

const HOURS_PER_DAY = 24;
// 重い端末で1フレームに step を呼びすぎないための上限
const MAX_STEPS_PER_FRAME = 8;
// TODO(人間に確認): 地形の seed。実データの地形（ステップ5）に変えるまでの仮
const TERRAIN_SEED = 1;

const values: Values = valuesJson;
const timeline: DonkiTimeline = parseDonkiTimeline(donkiJson);

/** data/donki-events.json の形を確かめる。形が違えば止める */
function parseDonkiTimeline(json: unknown): DonkiTimeline {
  if (!Array.isArray(json)) {
    throw new Error('data/donki-events.json が配列ではない');
  }
  return json.map((entry: Record<string, unknown>, i): DonkiEvent => {
    const { kind, donkiId, eventTime, classOrIntensity, link } = entry;
    if (
      (kind !== 'solarFlare' && kind !== 'sep') ||
      typeof donkiId !== 'string' ||
      typeof eventTime !== 'string' ||
      typeof classOrIntensity !== 'string' ||
      typeof link !== 'string'
    ) {
      throw new Error(`data/donki-events.json の ${i} 件目の形が違う`);
    }
    return { kind, donkiId, eventTime, classOrIntensity, link };
  });
}

function requireElement<T extends HTMLElement>(id: string, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`index.html に #${id} がない`);
  }
  return element;
}

const canvas = requireElement('renderCanvas', HTMLCanvasElement);
const uiRoot = requireElement('ui', HTMLDivElement);

document.title = t('app.title');
onLangChange(() => {
  document.title = t('app.title');
});

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
const env = createProceduralEnv(values, TERRAIN_SEED);
const world = createWorld(scene, env, values);
// 建設モードの間、PC で地面をクリックしたらそこに置く（confirmBuild は下で定義。呼ばれるのは起動のあと）
world.onGroundClick(() => confirmBuild());

const saves = createSaveStore(values);
// セーブがあれば、いちばん新しいものから続ける（リロードしても続きから遊べる）
let state = saves.latest() ?? createInitialState(values, env, env.landerPosition);
let speed: 1 | 4 = 1;
let menuPaused = false;
let indoors = state.player.indoors;
let buildMode: { kind: FacilityKind; options: BuildOptions } | null = null;
let lastPlacement: Placement | null = null;
let accumulatedHours = 0;
let lastActionsKey: string | null = null;
let collectedIce = false;
// 氷を取った場所。居住モジュールに持ち帰るまで運んでいる
let carriedIce: { x: number; z: number } | null = null;
// この回で倒れたか（実績「一度も倒れずに基地を完成」用。セーブから再開したときは分からないので数えない）
let downedThisRun = false;
const achievementStore = createAchievementStore(parseAchievements(achievementsJson));
const pending: SimCommand[] = [];
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const fx = createFx(document.body);
const help = createHelp(document.body);
const tutorial = createTutorial(
  document.body,
  isTouch,
  values,
  parseMissions(missionsJson),
  () => restartGame(),
  (what) => celebrate(what),
);
// チュートリアルの「歩けたか」を測る起点
const moveOrigin = { x: state.player.x, z: state.player.z };
let lastGuideKey = '';
let manualSaveCount = 0;
let lastBlocking: boolean | null = null;
let currentAdvices: Advice[] = [];

world.teleportPlayer(state.player.x, state.player.z);

const ui = createUi(
  uiRoot,
  {
    onSpeedChange: (next) => {
      speed = next;
    },
    onPauseChange: (paused) => {
      menuPaused = paused;
      applyPlayerMode();
    },
    onBuildSelect: (kind, options) => {
      buildMode = { kind, options };
      lastPlacement = null;
      world.setBuildCursor(true);
    },
    onBuildConfirm: confirmBuild,
    onBuildCancel: cancelBuild,
    onOrderLaunch: (items) => {
      pending.push({ type: 'orderLaunch', items });
    },
    onAssignCrew: (crewId, task) => {
      pending.push({ type: 'assignCrew', crewId, task });
    },
    onContextAction: doAction,
    onFlareChoice: (choice) => {
      if (choice === 'shelter') {
        shelter();
        // チュートリアルの訓練の警報では実績を取らない（本当のイベントのときだけ）
        if (state.activeEvents.length > 0) {
          earn('shelterDuringFlare');
        }
      }
      tutorial.answerFlare(choice);
    },
    onRestart: () => {
      startFrom(createInitialState(values, env, env.landerPosition));
    },
    onSave: (slot) => {
      saves.manualSave(state, slot);
      manualSaveCount++;
      ui.setSaves(saves.list());
    },
    onLoad: (saveId) => {
      startFrom(saves.load(saveId));
    },
  },
  values,
);
ui.setSaves(saves.list());
ui.setDonkiEvents(timeline);
const nasaImages = parseNasaImages(nasaImagesJson);
ui.setNasaImages(nasaImages);
const photoCard = createPhotoCard(document.body, nasaImages);
const adviceCard = createAdviceCard(document.body, (menu) => ui.openMenu(menu));

/** チュートリアルとミッションの「できた！」 */
function celebrate(what: 'step' | 'mission' | 'trainingDone'): void {
  if (what === 'step') {
    fx.sound('chime');
    return;
  }
  fx.banner(t(what === 'mission' ? 'fx.missionClear' : 'fx.trainingDone'), 'big');
  fx.confetti('shower');
  fx.sound('fanfare');
}

// 建った施設と、発展度の★を覚えておき、ふえた瞬間にお祝いする
let knownFacilityIds: Set<string> | null = null;
let knownStars: Record<string, number> | null = null;
const DEVELOPMENT_KEYS = ['selfSufficiency', 'stability', 'safety', 'scale'] as const;
const STAR_COUNT = 5;

function celebrateProgress(): void {
  if (knownFacilityIds !== null) {
    for (const f of state.facilities) {
      if (!knownFacilityIds.has(f.id)) {
        fx.banner(t('fx.built', { name: t(`facility.${f.kind}`) }), 'small');
        fx.confetti('burst');
        fx.sound('pop');
        photoCard.show(f.kind);
      }
    }
  }
  knownFacilityIds = new Set(state.facilities.map((f) => f.id));
  const max = values.development.elementMax.value;
  const stars: Record<string, number> = {};
  for (const key of DEVELOPMENT_KEYS) {
    stars[key] = Math.min(STAR_COUNT, Math.round((state.development[key] / max) * STAR_COUNT));
    if (knownStars !== null && stars[key] > knownStars[key]) {
      fx.banner(t('fx.starUp', { name: t(`development.${key}`) }), 'small');
      fx.sound('star');
    }
  }
  knownStars = stars;
}

/** 「さいしょから」：新しいゲームにする（セーブは消さない） */
function restartGame(): void {
  startFrom(createInitialState(values, env, env.landerPosition));
  moveOrigin.x = state.player.x;
  moveOrigin.z = state.player.z;
  manualSaveCount = 0;
}

/** チュートリアルの訓練の警報。本物の記録（SEP か X 級）を見せるが、sim では何も起こさない */
function showFlareDrill(): void {
  const record = timeline.find((e) => e.kind === 'sep' || e.classOrIntensity.startsWith('X'));
  if (record === undefined) {
    throw new Error('data/donki-events.json に SEP か X 級のフレアがない（訓練の警報に使う）');
  }
  ui.showFlareAlert(
    {
      kind: record.kind,
      source: 'archived',
      donkiId: record.donkiId,
      classOrIntensity: record.classOrIntensity,
      endsAtHours: state.timeHours,
    },
    record,
  );
}

const guideArrow = document.createElement('div');
guideArrow.className = 'guide-arrow';
guideArrow.hidden = true;
const guideArrowIcon = document.createElement('div');
guideArrowIcon.className = 'guide-arrow-icon';
guideArrowIcon.textContent = '⬆';
const guideArrowText = document.createElement('div');
guideArrow.append(guideArrowIcon, guideArrowText);
uiRoot.append(guideArrow);

const carryBadge = document.createElement('div');
carryBadge.className = 'carry-badge';
carryBadge.hidden = true;
uiRoot.append(carryBadge);
const renderCarryBadge = () => {
  carryBadge.textContent = t('carry.ice');
};
renderCarryBadge();
onLangChange(renderCarryBadge);

/** セーブからの再開や、新しく始めるとき */
function startFrom(next: SimState): void {
  state = next;
  pending.length = 0;
  accumulatedHours = 0;
  collectedIce = false;
  downedThisRun = false;
  carriedIce = null;
  knownFacilityIds = null;
  knownStars = null;
  cancelBuild();
  indoors = state.player.indoors;
  world.teleportPlayer(state.player.x, state.player.z);
  applyPlayerMode();
  refreshView();
}

function applyPlayerMode(): void {
  carryBadge.hidden = carriedIce === null;
  world.setPlayerVisible(!indoors);
  world.setMovementEnabled(!menuPaused && !tutorial.isBlocking() && !help.isOpen() && !indoors);
}

function distanceToPlayer(f: Facility): number {
  const p = world.getPlayer();
  return Math.hypot(f.x - p.x, f.z - p.z);
}

function nearbyFacilities(): Facility[] {
  const radius = values.player.interactRadiusMeters.value;
  return state.facilities
    .filter((f) => distanceToPlayer(f) <= radius)
    .sort((a, b) => distanceToPlayer(a) - distanceToPlayer(b));
}

function contextActions(): ContextAction[] {
  if (indoors) {
    return ['exitHabitat'];
  }
  const p = world.getPlayer();
  const near = nearbyFacilities();
  const actions: ContextAction[] = [];
  if (env.isIceAt(p.x, p.z) && carriedIce === null) {
    actions.push('collectIce');
  }
  if (near.some(needsRepair)) {
    actions.push('repair');
  }
  const habitat = near.find((f) => f.kind === 'habitat');
  if (habitat !== undefined) {
    actions.push('enterHabitat');
    if (habitat.regolithCover !== true) {
      actions.push('coverRegolith');
    }
  }
  return actions;
}

function doAction(action: ContextAction): void {
  const p = world.getPlayer();
  const near = nearbyFacilities();
  switch (action) {
    case 'enterHabitat':
      indoors = true;
      deliverIce();
      break;
    case 'exitHabitat':
      indoors = false;
      break;
    case 'collectIce':
      // 氷は手で運ぶ（docs/SPEC.md「水と酸素」）。居住モジュールに持ち帰ると水になる
      carriedIce = { x: p.x, z: p.z };
      earn('collectIce');
      break;
    case 'repair': {
      const target = near.find(needsRepair);
      if (target !== undefined) {
        pending.push({ type: 'repair', facilityId: target.id });
      }
      break;
    }
    case 'coverRegolith': {
      const target = near.find((f) => f.kind === 'habitat' && f.regolithCover !== true);
      if (target !== undefined) {
        pending.push({ type: 'coverWithRegolith', facilityId: target.id });
      }
      break;
    }
  }
  applyPlayerMode();
}

/** 太陽フレアの警報で「退避する」を選んだとき：いちばん近い居住モジュールに入る */
function shelter(): void {
  const habitats = state.facilities.filter((f) => f.kind === 'habitat');
  if (habitats.length === 0) {
    return;
  }
  const nearest = habitats.reduce((a, b) => (distanceToPlayer(a) <= distanceToPlayer(b) ? a : b));
  world.teleportPlayer(nearest.x, nearest.z);
  indoors = true;
  deliverIce();
  applyPlayerMode();
}

/** 運んできた氷を居住モジュールに届ける */
function deliverIce(): void {
  if (carriedIce !== null) {
    pending.push({ type: 'collectIce', ...carriedIce });
    carriedIce = null;
    collectedIce = true;
    fx.banner(t('fx.iceWater', { kg: values.player.iceKgPerTrip.value }), 'small');
    fx.sound('coin');
  }
}

function currentPlacement(): { x: number; z: number; placement: Placement } | null {
  if (buildMode === null) {
    return null;
  }
  const spot = world.getBuildSpot();
  // 着陸船の位置は SimState にないので、着陸船に重なる場所は main で止める
  const [landerX, landerZ] = env.landerPosition;
  if (Math.hypot(spot.x - landerX, spot.z - landerZ) < values.terrain.landerClearanceMeters.value) {
    return { ...spot, placement: { allowed: false, works: false, reason: 'tooClose' } };
  }
  const placement = checkPlacement(
    state,
    buildMode.kind,
    spot.x,
    spot.z,
    buildMode.options,
    values,
    env,
  );
  return { ...spot, placement };
}

function needsRepair(f: Facility): boolean {
  return f.condition < values.player.repairPromptBelowCondition.value;
}

function confirmBuild(): void {
  const current = currentPlacement();
  if (buildMode === null || current === null || !current.placement.allowed) {
    return;
  }
  pending.push({
    type: 'build',
    kind: buildMode.kind,
    x: current.x,
    z: current.z,
    dustCover: buildMode.options.dustCover,
    shieldMaterial: buildMode.options.shieldMaterial,
  });
  if (buildMode.kind === 'solar' && !current.placement.works) {
    earn('buildSolarInShadow');
  }
  cancelBuild();
}

/** 実績の条件を満たした。初めてならトーストで知らせる */
function earn(condition: AchievementCondition): void {
  const id = achievementStore.unlock(condition);
  if (id !== null) {
    fx.banner(t('fx.achievement', { name: t(`achievement.${id}`) }), 'big');
    fx.confetti('burst');
    fx.sound('fanfare');
    photoCard.show(id);
  }
}

function cancelBuild(): void {
  buildMode = null;
  lastPlacement = null;
  world.setBuildCursor(false);
  world.setBuildPreview(null);
  ui.setBuildMode(null);
}

function updateBuildPreview(): void {
  const current = currentPlacement();
  if (buildMode === null || current === null) {
    return;
  }
  world.setBuildPreview({ kind: buildMode.kind, ...current });
  const p = current.placement;
  if (
    lastPlacement === null ||
    lastPlacement.allowed !== p.allowed ||
    lastPlacement.works !== p.works ||
    lastPlacement.reason !== p.reason
  ) {
    lastPlacement = p;
    ui.setBuildMode({ kind: buildMode.kind, placement: p });
  }
}

function nearestToPlayer<T extends { x: number; z: number }>(items: T[]): T | null {
  const p = world.getPlayer();
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const d = Math.hypot(item.x - p.x, item.z - p.z);
    if (d < bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}

/** 光の柱を立てる場所：チュートリアルの行き先。なければアクシデントの行き先（ボンベなら居住モジュール、壊れかけならその施設） */
function guideTarget(): { x: number; z: number } | null {
  const habitats = state.facilities.filter((f) => f.kind === 'habitat');
  const guide = tutorial.guide();
  if (guide === 'ice') {
    return nearestToPlayer(env.iceSpots);
  }
  if (guide === 'home') {
    return nearestToPlayer(habitats);
  }
  const currentAdvice = currentAdvices.at(0) ?? null;
  if (currentAdvice?.kind === 'tankLow') {
    return nearestToPlayer(habitats);
  }
  if (currentAdvice !== null && currentAdvice.facilityId !== null) {
    const id = currentAdvice.facilityId;
    return state.facilities.find((f) => f.id === id) ?? null;
  }
  return null;
}

/** チュートリアルを進め、行く場所に光の柱を立てる */
function updateTutorial(): void {
  const p = world.getPlayer();
  tutorial.update({
    state,
    movedMeters: Math.hypot(p.x - moveOrigin.x, p.z - moveOrigin.z),
    viewYawRad: world.getViewYawRad(),
    airborne: p.y > env.heightAt(p.x, p.z) + values.tutorial.airborneMeters.value,
    placing: buildMode === null ? null : buildMode.kind,
    speed,
    indoors,
    onIce: env.isIceAt(p.x, p.z),
    carryingIce: carriedIce !== null,
    deliveredIce: collectedIce,
    manualSaves: manualSaveCount,
  });
  if (tutorial.takeFlareDrillRequest()) {
    showFlareDrill();
  }
  const target = guideTarget();
  const key = target === null ? '' : `${target.x},${target.z}`;
  if (key !== lastGuideKey) {
    lastGuideKey = key;
    world.setGuideMarker(target === null ? null : { x: target.x, z: target.z });
  }
  // 行く方向の矢印（カメラの向きに対して）と、のこりの距離
  // メニューや窓が開いている間は、矢印で文字を隠さない
  guideArrow.hidden = target === null || ui.isMenuOpen() || tutorial.isBlocking();
  if (target !== null) {
    const bearing = Math.atan2(target.x - p.x, target.z - p.z);
    const relative = bearing - world.getViewYawRad();
    guideArrowIcon.style.transform = `rotate(${relative}rad)`;
    // 画面の向きだけでは分かりにくいので、前・右・後ろ・左の言葉（PC ではキーも）を添える
    const quarter = Math.round(
      (((relative % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 2),
    );
    const direction = (['front', 'right', 'back', 'left'] as const)[quarter % 4];
    guideArrowText.textContent = t(`guide.dir.${direction}.${isTouch ? 'touch' : 'keys'}`, {
      meters: Math.round(Math.hypot(target.x - p.x, target.z - p.z)),
    });
  }
}

function needsShelterAlert(event: ActiveEvent): boolean {
  return event.kind === 'sep' || event.classOrIntensity.startsWith('X');
}

function findDonki(donkiId: string): DonkiEvent {
  const found = timeline.find((e) => e.donkiId === donkiId);
  if (found === undefined) {
    throw new Error(`data/donki-events.json に ${donkiId} がない`);
  }
  return found;
}

function handleEvents(events: GameEvent[]): void {
  for (const event of events) {
    // 退避が必要な警報は SEP と X 級のフレアだけ。ほかは HUD の「宇宙天気の嵐」だけで知らせる（docs/SPEC.md）
    if (event.type === 'eventStarted' && needsShelterAlert(event.event)) {
      const donki = event.event.source === 'archived' ? findDonki(event.event.donkiId) : null;
      ui.showFlareAlert(event.event, donki);
    }
    if (event.type === 'launchArrived') {
      fx.banner(t('fx.arrived'), 'small');
      fx.sound('coin');
    }
    if (event.type === 'playerDowned') {
      // sim が着陸船の近くの居住モジュールに戻している
      world.teleportPlayer(state.player.x, state.player.z);
      indoors = state.player.indoors;
      downedThisRun = true;
      // 倒れると、運んでいた氷はなくなる
      carriedIce = null;
      applyPlayerMode();
    }
  }
  const gameOver = events.find((e) => e.type === 'gameOver');
  if (gameOver !== undefined && tutorial.isTutorial()) {
    // チュートリアル中は、セーブから再開させず、最初からやり直す（途中からだと今はできない指示が出る）
    tutorial.failTutorial(t('gameOver.reason', { resource: t(`resource.${gameOver.reason}`) }));
    ui.showEvents(
      events.filter((e) => e.type !== 'gameOver'),
      state,
    );
  } else {
    ui.showEvents(events, state);
  }
  if (events.some((e) => e.type === 'cleared') && !downedThisRun) {
    earn('clearWithoutDowned');
  }
}

function tick(dtHours: number): void {
  const p = world.getPlayer();
  const commands: SimCommand[] = [
    { type: 'setPlayer', x: p.x, z: p.z, indoors },
    ...pending.splice(0),
  ];
  const dayBefore = Math.floor(state.timeHours / HOURS_PER_DAY);
  const result = step(state, dtHours, env, commands, values, timeline, Math.random);
  state = result.state;
  handleEvents(result.emitted);
  // ゲーム内の1日ごとに自動セーブ（ゲームオーバーの状態は残さない）
  if (Math.floor(state.timeHours / HOURS_PER_DAY) !== dayBefore && state.phase !== 'gameOver') {
    saves.autoSave(state);
    ui.setSaves(saves.list());
  }
}

function refreshView(): void {
  const view = describe(state, values, env);
  ui.update(state, view);
  world.setSunAzimuth(state.sunAzimuthRad);
  const working: Record<string, boolean> = {};
  for (const [id, status] of Object.entries(view.facilityStatus)) {
    working[id] = status.working;
  }
  world.syncFacilities(state.facilities, working);
  // チュートリアル中や大きな窓を出している間は、命に関わるボンベの警告だけにする
  currentAdvices = pickAdvices(
    state,
    view,
    indoors,
    values,
    tutorial.isTutorial() || tutorial.isBlocking(),
  );
  adviceCard.show(currentAdvices);
  celebrateProgress();
}

// ボタンにフォーカスが残ると、Space（ジャンプ）や Enter でそのボタンがまた押されるので外す
document.addEventListener('pointerup', () => {
  if (document.activeElement instanceof HTMLButtonElement) {
    document.activeElement.blur();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.repeat) {
    return;
  }
  if (buildMode !== null) {
    if (e.key === 'Enter') {
      confirmBuild();
    } else if (e.key === 'Escape') {
      cancelBuild();
    }
    return;
  }
  if (e.key === 'Escape') {
    ui.closeMenus();
    return;
  }
  if (ui.isMenuOpen()) {
    return;
  }
  switch (e.key.toLowerCase()) {
    case 'e': {
      const first = contextActions()[0];
      if (first !== undefined) {
        doAction(first);
      }
      break;
    }
    case 'b':
      ui.openMenu('build');
      break;
    case 'l':
      ui.openMenu('launch');
      break;
    case 'c':
      ui.openMenu('crew');
      break;
  }
});

applyPlayerMode();
refreshView();

engine.runRenderLoop(() => {
  const dtSec = engine.getDeltaTime() / 1000;
  // チュートリアルの大きな窓を出している間は、時間も移動も止める
  const blocking = tutorial.isBlocking() || help.isOpen();
  if (blocking !== lastBlocking) {
    lastBlocking = blocking;
    applyPlayerMode();
  }
  if (!menuPaused && !blocking && state.phase !== 'gameOver') {
    const stepHours = values.time.stepHours.value;
    accumulatedHours += dtSec * speed * (HOURS_PER_DAY / values.time.secondsPerEarthDay.value);
    let steps = 0;
    while (accumulatedHours >= stepHours && steps < MAX_STEPS_PER_FRAME) {
      accumulatedHours -= stepHours;
      tick(stepHours);
      steps++;
    }
    if (steps === MAX_STEPS_PER_FRAME) {
      accumulatedHours = 0;
    }
    if (steps > 0) {
      refreshView();
    }
  }
  world.setPadInput(ui.getPadInput());
  updateBuildPreview();
  updateTutorial();
  const actions = contextActions();
  const actionsKey = actions.join(',');
  if (actionsKey !== lastActionsKey) {
    lastActionsKey = actionsKey;
    ui.setContextActions(actions);
  }
  world.frame(dtSec);
  scene.render();
});

window.addEventListener('resize', () => engine.resize());
