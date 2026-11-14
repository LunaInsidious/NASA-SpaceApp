// 結合（docs/SPEC.md ステップ4）。固定の刻みで step を呼び、world・ui とつなぐ
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import donkiJson from '../data/donki-events.json';
import valuesJson from '../data/values.json';
import type {
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
import { createSaveStore } from './save/index.ts';
import type { BuildOptions, Placement } from './sim/api.ts';
import { checkPlacement, createInitialState, describe, step } from './sim/index.ts';
import { createTutorial } from './tutorial/index.ts';
import type { ContextAction } from './ui/api.ts';
import { onLangChange, t } from './ui/i18n.ts';
import { createUi } from './ui/index.ts';
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
const pending: SimCommand[] = [];
const tutorial = createTutorial(document.body);

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
      }
    },
    onRestart: () => {
      startFrom(createInitialState(values, env, env.landerPosition));
    },
    onSave: (slot) => {
      saves.manualSave(state, slot);
      ui.setSaves(saves.list());
    },
    onLoad: (saveId) => {
      startFrom(saves.load(saveId));
    },
  },
  values,
);
ui.setSaves(saves.list());

/** セーブからの再開や、新しく始めるとき */
function startFrom(next: SimState): void {
  state = next;
  pending.length = 0;
  accumulatedHours = 0;
  collectedIce = false;
  cancelBuild();
  indoors = state.player.indoors;
  world.teleportPlayer(state.player.x, state.player.z);
  applyPlayerMode();
  refreshView();
}

function applyPlayerMode(): void {
  world.setPlayerVisible(!indoors);
  world.setMovementEnabled(!menuPaused && !indoors);
  tutorial.update({ state, indoors, collectedIce });
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
  if (env.isIceAt(p.x, p.z)) {
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
      break;
    case 'exitHabitat':
      indoors = false;
      break;
    case 'collectIce':
      pending.push({ type: 'collectIce', x: p.x, z: p.z });
      collectedIce = true;
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
  applyPlayerMode();
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
  cancelBuild();
}

function cancelBuild(): void {
  buildMode = null;
  lastPlacement = null;
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

function findDonki(donkiId: string): DonkiEvent {
  const found = timeline.find((e) => e.donkiId === donkiId);
  if (found === undefined) {
    throw new Error(`data/donki-events.json に ${donkiId} がない`);
  }
  return found;
}

function handleEvents(events: GameEvent[]): void {
  for (const event of events) {
    if (event.type === 'eventStarted') {
      const donki = event.event.source === 'archived' ? findDonki(event.event.donkiId) : null;
      ui.showFlareAlert(event.event, donki);
    }
    if (event.type === 'playerDowned') {
      // sim が着陸船の近くの居住モジュールに戻している
      world.teleportPlayer(state.player.x, state.player.z);
      indoors = state.player.indoors;
      applyPlayerMode();
    }
  }
  ui.showEvents(events, state);
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
  tutorial.update({ state, indoors, collectedIce });
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
  if (!menuPaused && state.phase !== 'gameOver') {
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
