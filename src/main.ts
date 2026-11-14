// 結合（docs/SPEC.md ステップ4）。固定の刻みで step を呼び、world・ui とつなぐ
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import achievementsJson from '../data/achievements.json';
import cardsJson from '../data/cards.json';
import donkiJson from '../data/donki-events.json';
import missionsJson from '../data/missions.json';
import nasaImagesJson from '../data/nasa-images.json';
import tasksJson from '../data/tasks.json';
import valuesJson from '../data/values.json';
import { type Card, createCardStore, parseCards } from './cards/index.ts';
import { cardsHtml } from './cards/view.ts';
import type {
  ActiveEvent,
  DonkiEvent,
  DonkiTimeline,
  Facility,
  FacilityKind,
  GameEvent,
  LaunchItem,
  SimCommand,
  SimState,
  Values,
} from './contracts/index.ts';
import { createProceduralEnv } from './env/index.ts';
import { createHelp } from './help/index.ts';
import { asHelpTerm } from './help/terms.ts';
import {
  type AchievementCondition,
  createAchievementStore,
  parseAchievements,
} from './save/achievements.ts';
import { createSaveStore } from './save/index.ts';
import type { BuildOptions, CommLostReason, Placement } from './sim/api.ts';
import {
  checkPlacement,
  commLostReason,
  createInitialState,
  describe,
  restUntilNextDay,
  step,
} from './sim/index.ts';
import {
  completeTask,
  needsRepair as facilityNeedsRepair,
  type PlannedTask,
  parseTasks,
  type TaskKind,
  taskCandidates,
  taskDef,
} from './tasks/index.ts';
import { createTitle } from './title/index.ts';
import { type Advice, createAdviceCard, pickAdvices } from './tutorial/advice.ts';
import { type DeathAdvice, type DeathKind, diagnoseDeath } from './tutorial/death.ts';
import { createTutorial, parseMissions } from './tutorial/index.ts';
import type { ContextAction, MorningSummary, RestInfo } from './ui/api.ts';
import { createFx } from './ui/fx.ts';
import { onLangChange, t, tPlain } from './ui/i18n.ts';
import { createUi } from './ui/index.ts';
import { createPhotoCard, parseNasaImages } from './ui/photo.ts';
import { createWorld } from './world/index.ts';
import './style.css';

const HOURS_PER_DAY = 24;
// 重い端末で1フレームに step を呼びすぎないための上限
const MAX_STEPS_PER_FRAME = 8;
// TODO(人間に確認): 地形の seed。実データの地形（ステップ5）に変えるまでの仮
const TERRAIN_SEED = 1;
// 足音を鳴らす間隔（歩いた距離、m）。見た目と音だけの値
const STEP_SOUND_METERS = 1.6;
const MINUTES_PER_HOUR = 60;
// 朝の窓に出す物資（増減があったものだけ）
const MORNING_STOCKS = ['oxygen', 'water', 'food', 'spareParts', 'materials'] as const;
// 休むときに1つずつ順に見せる、休む理由（文言は rest.reason.<キー>、数は values.json）
const REST_REASONS = ['eva', 'sleep', 'weekly'] as const;
// 朝の窓で、ほとんど変わらなかった物資は出さない（見た目だけの値）
const MORNING_MIN_DELTA = 0.05;

const values: Values = valuesJson;
const timeline: DonkiTimeline = parseDonkiTimeline(donkiJson);
const taskDefs = parseTasks(tasksJson);

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

document.title = tPlain('app.title');
onLangChange(() => {
  document.title = tPlain('app.title');
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
// 活動フェーズ（外）と休息フェーズ（居住モジュールの中）。sim の phase とは別（docs/SPEC.md 追加の仕様）。
// 中にいる間は時間が止まり、「翌日へ」で次の日の始まりまで一気に進める。外に出られるのは1日1回
// 新しいゲームは外（着陸船のそば）から始まるので、その日はもう外に出ている
let wentOutToday = !state.player.indoors;
// 「翌日へ」を押した回数（くんれんの段と、休む理由を順に見せるのに使う）
let restDays = 0;
// ボンベの残りの警告をいくつ出したか（外に出るたびに 0 に戻す）
let tankWarnings = 0;
// その日に外でしたこと（休息の画面の「振り返り」に出す）
type DayLogEntry = { kind: 'ice' | 'repair' | 'regolith' | 'build'; facility?: FacilityKind };
let dayLog: DayLogEntry[] = [];
// 休むときに見せた、休む理由（振り返りに「核になる知識の一言」として残す）
let restReason: (typeof REST_REASONS)[number] | null = null;
let lastRestKey = '';
// 準備した注文（「翌日へ」か「外に出る」で送る。それまでは取り消せる）
let queuedOrder: LaunchItem[] | null = null;
// さっき起きた宇宙天気（同じ記録が続かないように）
let lastEventId: string | null = null;
// くんれんの新しい段（インベントリ画面を開いた）
let inventoryOpened = false;
// 休息の画面で選んだ、次に外に出たときのタスク（選んだ順）と、今日外でこなすタスク
let selectedTaskIds: string[] = [];
let todayPlan: PlannedTask[] = [];
let menuPaused = false;
let indoors = state.player.indoors;
let buildMode: { kind: FacilityKind; options: BuildOptions } | null = null;
let lastPlacement: Placement | null = null;
let accumulatedHours = 0;
let lastActionsKey: string | null = null;
let collectedIce = false;
// 氷を取った場所。居住モジュールに持ち帰るまで運んでいる
let carriedIce: { x: number; z: number } | null = null;
const achievementStore = createAchievementStore(parseAchievements(achievementsJson));
const cardStore = createCardStore(parseCards(cardsJson, Object.keys(nasaImagesJson)));
const pending: SimCommand[] = [];
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const fx = createFx(document.body);
const help = createHelp(document.body, () => fx.sound('chime'));
const tutorial = createTutorial(
  document.body,
  isTouch,
  values,
  parseMissions(missionsJson),
  () => restartGame(),
  (what) => celebrate(what),
  (terms, announce) => help.learn(terms, announce),
);
// タイトル画面。うしろには、いちばん新しいセーブ（なければ新しいゲーム）の月面を見せておく
const title = createTitle(document.body, {
  saves: () => saves.list(),
  onNew: () => tutorial.startNew(),
  cardsHtml: () => cardsHtml(cardStore.list(), nasaImages),
  onOpenTerm: (term) => help.openTerm(asHelpTerm(term, '豆知識カード')),
  onContinue: (saveId) => {
    startFrom(saves.load(saveId), true);
    tutorial.startContinue();
  },
  soundMode: () => fx.soundMode(),
  setSoundMode: (mode) => fx.setSoundMode(mode),
});
let lastGuideKey = '';
// 地球と話せないときの理由（くんれんの「アンテナ」の段の文に使う）
let commReason: CommLostReason | null = null;
let manualSaveCount = 0;
let lastBlocking: boolean | null = null;
let currentAdvices: Advice[] = [];
// 足音のための、前のフレームの位置
let lastFoot = { x: state.player.x, z: state.player.z };
let walkedSinceStep = 0;

world.teleportPlayer(state.player.x, state.player.z);
world.setFacilityIcons({
  habitat: tPlain('facilityIcon.habitat'),
  solar: tPlain('facilityIcon.solar'),
  battery: tPlain('facilityIcon.battery'),
  antenna: tPlain('facilityIcon.antenna'),
  greenhouse: tPlain('facilityIcon.greenhouse'),
  lifeSupport: tPlain('facilityIcon.lifeSupport'),
  iceDrill: tPlain('facilityIcon.iceDrill'),
  shield: tPlain('facilityIcon.shield'),
});

const ui = createUi(
  uiRoot,
  {
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
    // 注文はすぐには送らず、「翌日へ」か「外に出る」まで取り消せるようにする。
    // 中では時間が止まっているので、送るのがそのときでも、届く日などは変わらない
    onOrderLaunch: (items) => {
      queuedOrder = items;
      fx.sound('pop');
    },
    onCancelOrder: () => {
      queuedOrder = null;
    },
    onAssignCrew: (crewId, task) => {
      pending.push({ type: 'assignCrew', crewId, task });
    },
    onContextAction: doAction,
    onTaskToggle: (taskId) => {
      selectedTaskIds = selectedTaskIds.includes(taskId)
        ? selectedTaskIds.filter((id) => id !== taskId)
        : [...selectedTaskIds, taskId];
      const chosen = currentCandidates().find((task) => task.id === taskId);
      if (chosen !== undefined) {
        help.learn(taskDef(taskDefs, chosen.kind).terms, true);
      }
    },
    onOpenDictionary: () => help.open(),
    soundMode: () => fx.soundMode(),
    setSoundMode: (mode) => fx.setSoundMode(mode),
    cardsCount: () => {
      const list = cardStore.list();
      return { owned: list.filter((entry) => entry.owned).length, total: list.length };
    },
    cardsHtml: () => cardsHtml(cardStore.list(), nasaImages),
    onOpenTerm: (term) => help.openTerm(asHelpTerm(term, '豆知識カード')),
    onMinigameSound: (name) => {
      fx.sound(name === 'hit' ? 'pop' : name === 'miss' ? 'land' : 'star');
    },
    onFlareChoice: (choice) => {
      if (choice === 'shelter') {
        shelter();
        // チュートリアルの訓練の警報では実績を取らない（本当のイベントのときだけ）
        if (state.activeEvents.length > 0) {
          earn('shelterDuringFlare');
        } else {
          collectCards('shelterDuringFlare');
        }
      }
      tutorial.answerFlare(choice);
    },
    onRestart: () => {
      startFrom(createInitialState(values, env, env.landerPosition), false);
    },
    onBackToTitle: () => {
      // タイトルの「つづきから」でここから続けられるよう、戻る前に自動でセーブする
      if (state.phase !== 'gameOver') {
        saves.autoSave(state);
        ui.setSaves(saves.list());
      }
      cancelBuild();
      tutorial.toTitle();
      title.show();
    },
    onSave: (slot) => {
      saves.manualSave(state, slot);
      manualSaveCount++;
      ui.notify(t('save.saved', { number: slot + 1 }), false);
      ui.setSaves(saves.list());
    },
    onLoad: (saveId) => {
      startFrom(saves.load(saveId), true);
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
        // 建てた施設の言葉は、ことばじてんに足す（チュートリアルで出てこない施設も、建てれば引ける）
        help.learn([f.kind], true);
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
  startFrom(createInitialState(values, env, env.landerPosition), false);
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
      // 訓練でも、本物の嵐ならどれだけ続くかを見せる
      endsAtHours:
        state.timeHours +
        (record.kind === 'sep'
          ? values.events.sepDurationHours.value
          : values.events.flareDurationHours.value),
    },
    record,
  );
  fx.sound('alarm');
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
  carryBadge.innerHTML = t('carry.ice');
};
renderCarryBadge();
onLangChange(renderCarryBadge);

/** セーブからの再開や、新しく始めるとき。セーブからは休息フェーズ（居住モジュールの中）で始める */
function startFrom(next: SimState, fromSave: boolean): void {
  state = next;
  wentOutToday = fromSave || !next.player.indoors;
  restDays = 0;
  tankWarnings = 0;
  dayLog = [];
  restReason = null;
  queuedOrder = null;
  selectedTaskIds = [];
  todayPlan = [];
  ui.stopMinigame();
  pending.length = 0;
  accumulatedHours = 0;
  collectedIce = false;
  carriedIce = null;
  knownFacilityIds = null;
  knownStars = null;
  cancelBuild();
  indoors = state.player.indoors;
  world.teleportPlayer(state.player.x, state.player.z);
  if (fromSave && !indoors) {
    moveIntoNearestHabitat();
  }
  applyPlayerMode();
  refreshView();
}

/** いちばん近い居住モジュールの中に入れる（退避、セーブからの再開） */
function moveIntoNearestHabitat(): void {
  const habitats = state.facilities.filter((f) => f.kind === 'habitat');
  if (habitats.length === 0) {
    throw new Error('居住モジュールが1つもない（最初に1つあり、こわせない）');
  }
  const nearest = habitats.reduce((a, b) => (distanceToPlayer(a) <= distanceToPlayer(b) ? a : b));
  world.teleportPlayer(nearest.x, nearest.z);
  indoors = true;
}

function applyPlayerMode(): void {
  carryBadge.hidden = carriedIce === null;
  world.setPlayerVisible(!indoors);
  world.setMovementEnabled(
    !menuPaused &&
      !tutorial.isBlocking() &&
      !help.isOpen() &&
      !title.isOpen() &&
      !indoors &&
      !ui.isMinigameOpen(),
  );
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
    // いつでも外に出られる（中に入ってもその日は終わらない。1日を終えるのは「翌日へ」）。
    // 朝（まだ外に出ていない日）は外に出るのが先（E キー）。外から戻ったあとは「翌日へ」が先
    const actions: ContextAction[] = ['exitHabitat'];
    if (tutorial.allowsNextDay() && wentOutToday) {
      actions.unshift('nextDay');
    } else if (tutorial.allowsNextDay()) {
      actions.push('nextDay');
    }
    return actions;
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
      fx.sound('door');
      deliverIce();
      startRest();
      break;
    case 'nextDay':
      sleepUntilMorning();
      break;
    case 'exitHabitat': {
      sendQueuedOrder();
      indoors = false;
      wentOutToday = true;
      tankWarnings = 0;
      // 新しく選んだタスクがあれば、それを今日のタスクにする（なければ、さっきの続き）
      if (selectedTaskIds.length > 0) {
        todayPlan = selectedTaskIds.flatMap((id) =>
          currentCandidates().filter((task) => task.id === id),
        );
        selectedTaskIds = [];
      }
      fx.sound('door');
      // 居住モジュールの真ん中（倒れたあと、退避したあと）にいると、ドームの中に隠れてしまう。ドアの前に出す
      const home = state.facilities
        .filter((f) => f.kind === 'habitat')
        .reduce<Facility | null>(
          (best, f) => (best === null || distanceToPlayer(f) < distanceToPlayer(best) ? f : best),
          null,
        );
      if (home !== null && distanceToPlayer(home) < values.player.exitDistanceMeters.value) {
        world.teleportPlayer(home.x, home.z + values.player.exitDistanceMeters.value);
        world.pointCameraAwayFrom(home.x, home.z);
      }
      break;
    }
    case 'collectIce':
      // 氷は手で掘って運ぶ（docs/SPEC.md「水と酸素」）。居住モジュールに持ち帰ると水になる
      playMinigame('ice', () => {
        carriedIce = { x: p.x, z: p.z };
        fx.sound('pickup');
        earn('collectIce');
      });
      break;
    case 'repair': {
      const target = near.find(needsRepair);
      if (target === undefined) {
        break;
      }
      // 点検には、傷んだ分の交換部品がいる（sim は足りないと何もしない）。足りなければそう知らせる
      const need = (1 - target.condition) * values.maintenance.sparePartsPerFullRepair.value;
      if (state.stocks.spareParts < need) {
        ui.notify(
          t('repair.noParts', { need: need.toFixed(1), have: state.stocks.spareParts.toFixed(1) }),
          true,
        );
        fx.sound('warn');
        break;
      }
      playMinigame('repair', () => {
        pending.push({ type: 'repair', facilityId: target.id });
        dayLog.push({ kind: 'repair', facility: target.kind });
        earn('repairFacility');
        todayPlan = completeTask(todayPlan, 'repair', target.id);
        fx.sound('repair');
      });
      break;
    }
    case 'coverRegolith': {
      const target = near.find((f) => f.kind === 'habitat' && f.regolithCover !== true);
      if (target !== undefined) {
        playMinigame('regolith', () => {
          pending.push({ type: 'coverWithRegolith', facilityId: target.id });
          dayLog.push({ kind: 'regolith' });
          todayPlan = completeTask(todayPlan, 'regolith', target.id);
          fx.sound('dig');
          earn('coverRegolith');
        });
      }
      break;
    }
  }
  applyPlayerMode();
}

/** 太陽フレアの警報で「退避する」を選んだとき：いちばん近い居住モジュールに入る */
function shelter(): void {
  ui.stopMinigame();
  moveIntoNearestHabitat();
  fx.sound('door');
  deliverIce();
  startRest();
  applyPlayerMode();
}

/** 居住モジュールに入った：その日の活動はおしまい。休む理由を1つ見せ、自動でセーブする */
function startRest(): void {
  if (!wentOutToday) {
    return;
  }
  restReason = REST_REASONS[restDays % REST_REASONS.length];
  earn('firstRest');
  ui.notify(restReasonText(restReason), false);
  if (state.phase !== 'gameOver') {
    saves.autoSave(state);
    ui.setSaves(saves.list());
  }
}

function restReasonText(reason: (typeof REST_REASONS)[number]): string {
  const hours = {
    eva: values.eva.maxHours.value,
    sleep: values.crew.sleepHours.value,
    weekly: values.eva.weeklyHoursPerPerson.value,
  }[reason];
  return t(`rest.reason.${reason}`, { hours });
}

/** 休息フェーズの2D画面に出すもの。中にいる間だけ（タイトル画面の間は出さない） */
function restInfo(): RestInfo | null {
  if (!indoors || title.isOpen() || state.phase === 'gameOver') {
    return null;
  }
  const done = dayLog.map((entry) =>
    t(`review.did.${entry.kind}`, {
      name: entry.facility === undefined ? '' : t(`facility.${entry.facility}`),
    }),
  );
  const missed = todayPlan
    .filter((task) => !task.done)
    .map((task) => t('review.missed', { task: taskLabel(task) }));
  const review = [
    ...(done.length > 0 ? done : [t(wentOutToday ? 'review.nothing' : 'review.morning')]),
    ...missed,
    ...(restReason === null ? [] : [t('review.knowledge', { text: restReasonText(restReason) })]),
  ];
  const actions = contextActions();
  const home = mainHabitat();
  return {
    wentOutToday,
    queuedOrder,
    canGoOut: actions.includes('exitHabitat'),
    canNextDay: actions.includes('nextDay'),
    requiredPage: tutorial.requiredRestPage(),
    review,
    tasks: currentCandidates().map((task) => ({
      id: task.id,
      label: taskLabel(task),
      meters: Math.round(Math.hypot(task.x - home.x, task.z - home.z)),
      selected: selectedTaskIds.includes(task.id),
    })),
  };
}

/** 着陸のときからある居住モジュール（タスクの距離の起点） */
function mainHabitat(): Facility {
  const home = state.facilities.find((f) => f.kind === 'habitat');
  if (home === undefined) {
    throw new Error('居住モジュールが1つもない（最初に1つあり、こわせない）');
  }
  return home;
}

/** 今の基地の様子から出した、翌日のタスクの候補 */
function currentCandidates(): PlannedTask[] {
  return taskCandidates(taskDefs, state, values, env.iceSpots);
}

function taskLabel(task: PlannedTask): string {
  const facility = state.facilities.find((f) => f.id === task.facilityId);
  return t(taskDef(taskDefs, task.kind).textKey, {
    name: facility === undefined ? '' : t(`facility.${facility.kind}`),
  });
}

/** その場の行動の前に、ミニゲームをする。できたら反映する（やめたら何もしない） */
function playMinigame(kind: TaskKind, onSuccess: () => void): void {
  ui.startMinigame(taskDef(taskDefs, kind).minigame, (outcome) => {
    if (outcome === 'success') {
      onSuccess();
    }
    applyPlayerMode();
  });
  applyPlayerMode();
}

/** 休息の画面を、変わったときだけ描き直してもらう */
function updateRest(): void {
  const info = restInfo();
  const key = JSON.stringify(info);
  if (key !== lastRestKey) {
    lastRestKey = key;
    ui.setRest(info);
  }
}

/** 影に入って止まっている太陽電池（朝の窓で、寝ている間に影に入ったものを知らせる） */
function shadedSolarIds(): Set<string> {
  const view = describe(state, values, env);
  return new Set(
    state.facilities
      .filter((f) => f.kind === 'solar' && view.facilityStatus[f.id]?.reason === 'shadow')
      .map((f) => f.id),
  );
}

/**
 * 起こしてよい宇宙天気。くんれん中は本物を起こさない（太陽フレアは訓練の警報で教える）。
 * 記録が少ないので、さっき起きたものはすぐには続けない
 */
function eventsToRun(): DonkiTimeline {
  if (tutorial.isTutorial()) {
    return [];
  }
  const others = timeline.filter((e) => e.donkiId !== lastEventId);
  return others.length > 0 ? others : timeline;
}

/** 準備した注文を送る（「翌日へ」と「外に出る」のとき） */
function sendQueuedOrder(): void {
  if (queuedOrder !== null) {
    pending.push({ type: 'orderLaunch', items: queuedOrder });
    queuedOrder = null;
  }
}

/** 「翌日へ」：次の日の始まりまで、中で一気に進める。寝ている間に起きたことは朝の窓で見せる */
function sleepUntilMorning(): void {
  // 建てる・注文するなどの操作を先に反映する
  sendQueuedOrder();
  tick(0);
  const before = state;
  const shadedBefore = shadedSolarIds();
  // くんれん中は、本物の宇宙天気は起こさない（太陽フレアは訓練の警報で教える）
  const result = restUntilNextDay(state, env, values, eventsToRun(), Math.random);
  state = result.state;
  const shadedAfter = shadedSolarIds();
  restDays++;
  wentOutToday = false;
  dayLog = [];
  todayPlan = [];
  // 中にいたので、警報（退避するか）は出さない。届いた・宇宙天気は朝の窓にまとめる
  handleEvents(
    result.emitted.filter(
      (e) =>
        e.type !== 'eventStarted' &&
        e.type !== 'launchArrived' &&
        e.type !== 'commLost' &&
        e.type !== 'commRestored',
    ),
  );
  if (state.phase !== 'gameOver') {
    const summary: MorningSummary = {
      day: Math.floor(state.timeHours / HOURS_PER_DAY),
      stockChanges: MORNING_STOCKS.map((kind) => ({
        kind,
        delta: state.stocks[kind] - before.stocks[kind],
      })).filter((change) => Math.abs(change.delta) >= MORNING_MIN_DELTA),
      arrived: result.emitted.filter((e) => e.type === 'launchArrived').length,
      spaceWeather: result.emitted.flatMap((e) => (e.type === 'eventStarted' ? [e.event] : [])),
      newlyShaded: [...shadedAfter].filter((id) => !shadedBefore.has(id)).length,
      newlyLit: [...shadedBefore].filter(
        (id) => !shadedAfter.has(id) && state.facilities.some((f) => f.id === id),
      ).length,
    };
    ui.showMorning(summary);
    if (summary.arrived > 0) {
      fx.sound('coin');
    }
  }
  refreshView();
}

/** 外にいられる残りの時間が決めた時間を切ったら、知らせる（1時間と30分） */
function warnTank(): void {
  if (indoors) {
    return;
  }
  const hoursLeft = state.player.tankOxygen * values.eva.maxHours.value;
  const thresholds = [values.eva.warnHoursFirst.value, values.eva.warnHoursSecond.value];
  const next = thresholds[tankWarnings];
  if (next !== undefined && hoursLeft <= next) {
    tankWarnings++;
    ui.notify(t('eva.warn', { minutes: Math.round(next * MINUTES_PER_HOUR) }), true);
    fx.sound('warn');
  }
}

/** 運んできた氷を居住モジュールに届ける */
function deliverIce(): void {
  if (carriedIce !== null) {
    pending.push({ type: 'collectIce', ...carriedIce });
    carriedIce = null;
    collectedIce = true;
    dayLog.push({ kind: 'ice' });
    todayPlan = completeTask(todayPlan, 'ice', null);
    fx.banner(t('fx.iceWater', { kg: values.player.iceKgPerTrip.value }), 'small');
    fx.sound('coin');
  }
}

function currentPlacement(): { x: number; z: number; placement: Placement } | null {
  if (buildMode === null) {
    return null;
  }
  const spot = world.getBuildSpot();
  return { ...spot, placement: placementAt(buildMode.kind, buildMode.options, spot.x, spot.z) };
}

/** そこに建てたときの判定。着陸船の位置は SimState にないので、着陸船に重なる場所は main で止める */
function placementAt(kind: FacilityKind, options: BuildOptions, x: number, z: number): Placement {
  const [landerX, landerZ] = env.landerPosition;
  if (Math.hypot(x - landerX, z - landerZ) < values.terrain.landerClearanceMeters.value) {
    return { allowed: false, works: false, reason: 'tooClose' };
  }
  return checkPlacement(state, kind, x, z, options, values, env);
}

function needsRepair(f: Facility): boolean {
  return facilityNeedsRepair(f, values);
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
  dayLog.push({ kind: 'build', facility: buildMode.kind });
  if (buildMode.kind === 'solar' && !current.placement.works) {
    earn('buildSolarInShadow');
  }
  cancelBuild();
}

/** 実績の条件を満たした。初めてならトーストで知らせる */
/** 豆知識カードの条件を満たした。初めてなら短く知らせる（中身は休息の画面で読む） */
function collectCards(condition: AchievementCondition): void {
  announceCards(cardStore.unlock(condition));
}

/** 初めて手に入れたカードを短く知らせる（中身は右上の🃏で読む） */
function announceCards(cards: readonly Card[]): void {
  for (const card of cards) {
    help.learn(card.terms, false);
    ui.notify(t('cards.got', { title: t(`${card.textKey}.title`) }), false);
    fx.sound('star');
  }
  if (cards.length > 0) {
    ui.cardsChanged(true);
  }
}

function earn(condition: AchievementCondition): void {
  collectCards(condition);
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
  if (tutorial.isTutorial() || indoors) {
    return null;
  }
  // 氷を掘ったあとは、持ち帰る（居住モジュールの入口まで行けば水になる）
  if (carriedIce !== null) {
    return nearestToPlayer(habitats);
  }
  const task = nearestToPlayer(todayPlan.filter((t) => !t.done));
  if (task !== null) {
    return task;
  }
  if (currentAdvice !== null && currentAdvice.facilityId !== null) {
    const id = currentAdvice.facilityId;
    return state.facilities.find((f) => f.id === id) ?? null;
  }
  // することがなければ、帰り道（家）を指す
  return nearestToPlayer(habitats);
}

/** 歩いた音 */
function updateFootSounds(): void {
  const p = world.getPlayer();
  const moved = Math.hypot(p.x - lastFoot.x, p.z - lastFoot.z);
  lastFoot = { x: p.x, z: p.z };
  if (indoors) {
    walkedSinceStep = 0;
    return;
  }
  walkedSinceStep += moved;
  if (walkedSinceStep >= STEP_SOUND_METERS) {
    walkedSinceStep = 0;
    fx.sound('step');
  }
}

/** チュートリアルを進め、行く場所に光の柱を立てる */
function updateTutorial(): void {
  ui.setGuide(tutorial.currentInstruction());
  help.setGuide(tutorial.currentInstruction());
  const p = world.getPlayer();
  tutorial.update({
    state,
    playerX: p.x,
    playerZ: p.z,
    commReason,
    viewYawRad: world.getViewYawRad(),
    placing: buildMode === null ? null : buildMode.kind,
    restDays,
    indoors,
    onIce: env.isIceAt(p.x, p.z),
    carryingIce: carriedIce !== null,
    deliveredIce: collectedIce,
    manualSaves: manualSaveCount,
    userPaused: ui.isUserPaused(),
    readDictionary: help.hasRead(),
    helpOpen: help.isOpen(),
    inventoryOpen: ui.isInventoryOpen(),
    windowOpen: ui.isMenuOpen(),
    inventoryOpened,
    tasksSelected: selectedTaskIds.length + todayPlan.length,
    orderQueued: queuedOrder !== null,
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
  // 置く場所を選んでいる間は、下の建設のバーと重なるので出さない
  guideArrow.hidden =
    target === null || indoors || buildMode !== null || ui.isMenuOpen() || tutorial.isBlocking();
  if (target !== null) {
    const bearing = Math.atan2(target.x - p.x, target.z - p.z);
    const relative = bearing - world.getViewYawRad();
    // 前・右・後ろ・左の言葉（PC ではキーも）を添え、矢印もその4つの向きにそろえる（斜めだと言葉と合わない）
    const quarter = Math.round(
      (((relative % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 2),
    );
    guideArrowIcon.style.transform = `rotate(${(quarter % 4) * 90}deg)`;
    const direction = (['front', 'right', 'back', 'left'] as const)[quarter % 4];
    guideArrowText.innerHTML = t(`guide.dir.${direction}.${isTouch ? 'touch' : 'keys'}`, {
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

/**
 * 倒れた・ゲームオーバーのときの、ルナはかせのアドバイス。
 * 宇宙飛行士を居住モジュールに戻す前（倒れた場所にいるうち）に、そのときの基地の様子から原因を調べる
 */
function deathAdviceFor(events: GameEvent[]): DeathAdvice | null {
  let kind: DeathKind | null = null;
  for (const event of events) {
    if (event.type === 'gameOver') {
      kind = event.reason;
      break;
    }
    if (event.type === 'playerDowned') {
      kind = event.reason;
    }
  }
  if (kind === null) {
    return null;
  }
  const p = world.getPlayer();
  const habitats = state.facilities.filter((f) => f.kind === 'habitat');
  if (habitats.length === 0) {
    throw new Error('居住モジュールが1つもない（最初に1つあり、こわせない）');
  }
  return diagnoseDeath(kind, {
    state,
    view: describe(state, values, env),
    metersFromHabitat: Math.min(...habitats.map((h) => Math.hypot(h.x - p.x, h.z - p.z))),
  });
}

function handleEvents(events: GameEvent[]): void {
  const death = deathAdviceFor(events);
  for (const event of events) {
    // 退避が必要な警報は SEP と X 級のフレアだけ。ほかは HUD の「宇宙天気の嵐」だけで知らせる（docs/SPEC.md）
    if (event.type === 'eventStarted') {
      lastEventId = event.event.donkiId;
      earn('spaceWeather');
    }
    if (event.type === 'eventStarted' && needsShelterAlert(event.event)) {
      const donki = event.event.source === 'archived' ? findDonki(event.event.donkiId) : null;
      ui.showFlareAlert(event.event, donki);
      fx.sound('alarm');
      if (event.event.kind === 'sep') {
        help.learn(['sep'], true);
      }
    }
    if (event.type === 'commLost') {
      fx.sound('warn');
      if (commLostReason(state, describe(state, values, env)) === 'earthDown') {
        earn('earthSet');
      }
    }
    if (event.type === 'commRestored') {
      fx.sound('chime');
    }
    if (event.type === 'launchArrived') {
      earn('launchArrived');
      fx.banner(t('fx.arrived'), 'small');
      fx.sound('coin');
    }
    if (event.type === 'playerDowned' || event.type === 'gameOver') {
      fx.sound('down');
    }
    if (event.type === 'playerDowned') {
      // sim が着陸船の近くの居住モジュールに戻している。その日の活動はおしまい
      world.teleportPlayer(state.player.x, state.player.z);
      indoors = state.player.indoors;
      // 倒れると、運んでいた氷はなくなる。ミニゲームの途中でも閉じる
      carriedIce = null;
      ui.stopMinigame();
      startRest();
      applyPlayerMode();
    }
  }
  const gameOver = events.find((e) => e.type === 'gameOver');
  if (gameOver !== undefined && tutorial.isTutorial()) {
    // チュートリアル中は、セーブから再開させず、最初からやり直す（途中からだと今はできない指示が出る）
    if (death === null) {
      throw new Error('ゲームオーバーなのに、ルナはかせのアドバイスがない');
    }
    tutorial.failTutorial(
      t('gameOver.reason', { resource: t(`resource.${gameOver.reason}`) }),
      death,
    );
    ui.showEvents(
      events.filter((e) => e.type !== 'gameOver'),
      state,
      death,
    );
  } else {
    ui.showEvents(events, state, death);
  }
}

function tick(dtHours: number): void {
  const p = world.getPlayer();
  const commands: SimCommand[] = [
    { type: 'setPlayer', x: p.x, z: p.z, indoors },
    ...pending.splice(0),
  ];
  const launchesBefore = state.launches.length;
  // くんれん中は、本物の宇宙天気は起こさない（太陽フレアは訓練の警報で教える）
  const events = eventsToRun();
  const result = step(state, dtHours, env, commands, values, events, Math.random);
  state = result.state;
  // 宇宙飛行士が倒れたら（ボンベの酸素切れ、大量の被ばく）ゲームオーバー（docs/SPEC.md）。
  // sim は居住モジュールで目を覚まさせるので、それはチュートリアル中だけにする
  if (result.emitted.some((e) => e.type === 'playerDowned') && !tutorial.isTutorial()) {
    state = { ...state, phase: 'gameOver' };
  }
  // 注文が通ってロケットが飛び立った
  if (state.launches.length > launchesBefore) {
    fx.sound('launch');
    ui.notify(t('launch.sent', { days: values.launch.deliveryDays.value }), false);
  }
  handleEvents(result.emitted);
  warnTank();
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
  const adviceBefore = new Set(currentAdvices.map((a) => a.kind));
  commReason = view.comm.linked ? null : commLostReason(state, view);
  currentAdvices = pickAdvices(
    state,
    view,
    indoors,
    values,
    tutorial.isTutorial() || tutorial.isBlocking(),
  );
  // 新しい困りごとが出たら知らせる
  if (currentAdvices.some((a) => !adviceBefore.has(a.kind))) {
    fx.sound('warn');
  }
  adviceCard.show(currentAdvices);
  celebrateProgress();
  announceCards(cardStore.unlockByState(state));
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
    case 'i':
      ui.openMenu('status');
      break;
  }
});

applyPlayerMode();
refreshView();

engine.runRenderLoop(() => {
  const dtSec = engine.getDeltaTime() / 1000;
  // チュートリアルの大きな窓を出している間は、時間も移動も止める
  const blocking = tutorial.isBlocking() || help.isOpen() || title.isOpen();
  if (blocking !== lastBlocking) {
    lastBlocking = blocking;
    applyPlayerMode();
  }
  if (!menuPaused && !blocking && state.phase !== 'gameOver' && (indoors || !tutorial.timeRuns())) {
    // 中にいる間（休息フェーズ）と、くんれんで時間を止めている段：時間は進めず、建てる・出入りなどの操作だけを sim に反映する
    accumulatedHours = 0;
    if (pending.length > 0 || indoors !== state.player.indoors) {
      tick(0);
      refreshView();
    }
  } else if (!menuPaused && !blocking && state.phase !== 'gameOver') {
    const stepHours = values.time.stepHours.value;
    accumulatedHours += dtSec / values.time.evaSecondsPerHour.value;
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
  updateFootSounds();
  if (carriedIce !== null && !indoors && nearbyFacilities().some((f) => f.kind === 'habitat')) {
    deliverIce();
  }
  const actions = contextActions();
  updateRest();
  if (ui.isInventoryOpen()) {
    inventoryOpened = true;
  }
  ui.setTaskList(todayPlan.map((task) => ({ label: taskLabel(task), done: task.done })));
  const actionsKey = actions.join(',');
  if (actionsKey !== lastActionsKey) {
    lastActionsKey = actionsKey;
    ui.setContextActions(actions);
  }
  world.frame(dtSec);
  scene.render();
});

window.addEventListener('resize', () => engine.resize());
