// チュートリアル（docs/SPEC.md ステップ8）とミッション。
// 起動時に「あそんだことがある？」を聞き、初めてなら飛ばせない完全なチュートリアルで、全部の機能を1つずつ体験させる。
// 終わったら（経験者はすぐに）data/missions.json の目標をミッションとして順に出す。
// 押すボタンは光らせ（tutorial.css）、行く場所には world の光の柱を立てる（guide()）
import type { FacilityKind, SimState, Values } from '../contracts/index.ts';
import { onLangChange, t } from '../ui/i18n.ts';
import './tutorial.css';

const STEPS = [
  'move',
  'look',
  'jump',
  'buildSolar',
  'placeSolar',
  'power',
  'battery',
  'comm',
  'order',
  'fastForward',
  'waitArrival',
  'normalSpeed',
  'assignCrew',
  'toIce',
  'takeIce',
  'goHome',
  'flareDrill',
  'goOutside',
  'regolith',
  'save',
  'data',
] as const;
type Step = (typeof STEPS)[number];
// 読んで「わかった」を押すと進む段
const ACK_STEPS: readonly Step[] = ['power', 'comm'];
const STORAGE_KEY = 'lunar-outpost-tutorial';

export const MISSION_CONDITIONS = [
  'hasFacility',
  'farmingRunning',
  'crewAtLeast',
  'relayAtLeast',
  'developmentAtLeast',
  'cleared',
] as const;
type MissionCondition = (typeof MISSION_CONDITIONS)[number];

const FACILITY_KINDS: readonly FacilityKind[] = [
  'habitat',
  'solar',
  'battery',
  'antenna',
  'greenhouse',
  'lifeSupport',
  'iceDrill',
  'shield',
];

export type Mission = { id: string; textKey: string } & (
  | { condition: 'hasFacility'; kind: FacilityKind }
  | { condition: 'farmingRunning' | 'cleared' }
  | { condition: 'crewAtLeast' | 'relayAtLeast' | 'developmentAtLeast'; threshold: number }
);

/** data/missions.json の形を確かめる。形が違えば止める */
export function parseMissions(json: unknown): Mission[] {
  if (!Array.isArray(json)) {
    throw new Error('data/missions.json が配列ではない');
  }
  return json.map((entry: Record<string, unknown>, i): Mission => {
    const { id, condition, kind, threshold, textKey } = entry;
    const known: MissionCondition | undefined = MISSION_CONDITIONS.find((c) => c === condition);
    const bad = () => new Error(`data/missions.json の ${i} 件目の形が違う`);
    if (typeof id !== 'string' || typeof textKey !== 'string' || known === undefined) {
      throw bad();
    }
    if (known === 'hasFacility') {
      const facility = FACILITY_KINDS.find((k) => k === kind);
      if (facility === undefined) throw bad();
      return { id, textKey, condition: known, kind: facility };
    }
    if (known === 'farmingRunning' || known === 'cleared') {
      return { id, textKey, condition: known };
    }
    if (typeof threshold !== 'number') throw bad();
    return { id, textKey, condition: known, threshold };
  });
}

export interface TutorialProgress {
  state: SimState;
  /** 最初の位置から歩いた距離 */
  movedMeters: number;
  /** カメラが見ている水平の向き */
  viewYawRad: number;
  /** 宇宙飛行士が地面から離れているか（ジャンプ中） */
  airborne: boolean;
  /** 建設メニューで選んで、置く場所を選んでいる施設 */
  placing: FacilityKind | null;
  speed: 1 | 4;
  indoors: boolean;
  onIce: boolean;
  carryingIce: boolean;
  /** 氷を居住モジュールに持ち帰った */
  deliveredIce: boolean;
  manualSaves: number;
}

export interface Tutorial {
  /** 毎フレーム呼ぶ。段が変わったときだけ描き直す */
  update(progress: TutorialProgress): void;
  /** 光の柱を立てる場所 */
  guide(): 'ice' | 'home' | null;
  /** 大きな窓を出していて、ゲームを止めておくべきか */
  isBlocking(): boolean;
  /** 飛ばせないチュートリアルの最中か（アクシデントのカードはボンベだけにする） */
  isTutorial(): boolean;
  /** 太陽フレアの訓練の警報を出す段に来たら、1回だけ true を返す */
  takeFlareDrillRequest(): boolean;
  /** 太陽フレアの警報で選んだこと */
  answerFlare(choice: 'shelter' | 'continue'): void;
}

type Mode = 'ask' | 'tutorial' | 'finishedModal' | 'missions' | 'confirmRestart';

function readFinished(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'finished';
  } catch (error) {
    console.warn('チュートリアルの進み具合を読めない', error);
    return false;
  }
}

function clearFinished(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('チュートリアルの進み具合を消せない', error);
  }
}

function saveFinished(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'finished');
  } catch (error) {
    console.warn('チュートリアルの進み具合を保存できない', error);
  }
}

export function createTutorial(
  root: HTMLElement,
  isTouch: boolean,
  values: Values,
  missions: Mission[],
  /** 「さいしょから」を確かめたあとに呼ぶ。main が新しいゲームにする */
  onRestart: () => void,
): Tutorial {
  let mode: Mode = readFinished() ? 'missions' : 'ask';
  let index = 0;
  let stepYaw: number | null = null;
  let flareDrillRequested = false;
  let flareChoice: 'shelter' | 'continue' | null = null;
  let dataOpened = false;
  let missionIndex = 0;
  let lastProgress: TutorialProgress | null = null;
  // 「さいしょから」の確かめで「やめる」を選んだときに戻る先
  let previousMode: Mode = mode;

  const panel = document.createElement('div');
  panel.className = 'tutorial';
  const modal = document.createElement('div');
  modal.className = 'tutorial-modal-layer';
  root.append(panel, modal);

  // データ出典の窓を開いたか（ui の「データ」ボタン）
  document.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-menu="data"]') !== null) {
      dataOpened = true;
    }
  });

  const step = (): Step => STEPS[index];
  const variant = isTouch ? 'touch' : 'keys';

  function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function showModal(titleKey: string, bodyKey: string, buttons: HTMLButtonElement[]): void {
    const card = document.createElement('div');
    card.className = 'tutorial-modal';
    const title = document.createElement('h2');
    title.textContent = t(titleKey);
    const body = document.createElement('p');
    body.textContent = t(bodyKey);
    const row = document.createElement('div');
    row.className = 'tutorial-modal-buttons';
    row.append(...buttons);
    card.append(title, body, row);
    modal.replaceChildren(card);
    modal.hidden = false;
  }

  function render(): void {
    modal.hidden = true;
    panel.hidden = false;
    delete document.body.dataset.tutorialStep;
    if (mode === 'ask') {
      panel.hidden = true;
      showModal('tutorial.welcome.title', 'tutorial.welcome.question', [
        button(t('tutorial.welcome.firstTime'), 'tutorial-big primary', () => {
          mode = 'tutorial';
          render();
        }),
        button(t('tutorial.welcome.played'), 'tutorial-big', () => {
          saveFinished();
          mode = 'missions';
          render();
        }),
      ]);
      return;
    }
    if (mode === 'confirmRestart') {
      panel.hidden = true;
      showModal('restart.title', 'restart.body', [
        button(t('restart.yes'), 'tutorial-big danger', restart),
        button(t('restart.no'), 'tutorial-big', () => {
          mode = previousMode;
          render();
        }),
      ]);
      return;
    }
    if (mode === 'finishedModal') {
      panel.hidden = true;
      showModal('tutorial.finished.title', 'tutorial.finished.body', [
        button(t('tutorial.finished.start'), 'tutorial-big primary', () => {
          mode = 'missions';
          render();
        }),
      ]);
      return;
    }
    if (mode === 'tutorial') {
      renderStep();
      return;
    }
    renderMission();
  }

  function header(titleText: string, progressText: string): HTMLElement {
    const head = document.createElement('div');
    head.className = 'tutorial-head';
    const title = document.createElement('span');
    title.textContent = titleText;
    const progress = document.createElement('span');
    progress.className = 'tutorial-progress';
    progress.textContent = progressText;
    const restart = button(t('restart.button'), 'tutorial-restart', confirmRestart);
    head.append(title, progress, restart);
    return head;
  }

  function confirmRestart(): void {
    previousMode = mode;
    mode = 'confirmRestart';
    render();
  }

  /** 新しいゲームにして、「あそんだことがある？」から始める */
  function restart(): void {
    clearFinished();
    mode = 'ask';
    index = 0;
    stepYaw = null;
    flareDrillRequested = false;
    flareChoice = null;
    dataOpened = false;
    missionIndex = 0;
    onRestart();
    render();
  }

  function renderStep(): void {
    document.body.dataset.tutorialStep = step();
    const text = document.createElement('p');
    text.className = 'tutorial-text';
    const key =
      step() === 'flareDrill' && flareChoice === 'continue'
        ? 'tutorial.step.flareDrillRetry'
        : `tutorial.step.${step()}.${variant}`;
    text.textContent = t(key);
    const parts: HTMLElement[] = [
      header(t('tutorial.title'), t('tutorial.progress', { n: index + 1, total: STEPS.length })),
      text,
    ];
    if (ACK_STEPS.includes(step())) {
      const row = document.createElement('div');
      row.className = 'tutorial-buttons';
      row.append(button(t('tutorial.ok'), 'tutorial-ok', advance));
      parts.push(row);
    }
    panel.replaceChildren(...parts);
  }

  function renderMission(): void {
    const mission = missions[missionIndex];
    const text = document.createElement('p');
    text.className = 'tutorial-text';
    text.textContent = mission === undefined ? t('mission.allDone') : t(mission.textKey);
    panel.replaceChildren(
      header(
        t('mission.title'),
        t('tutorial.progress', {
          n: Math.min(missionIndex + 1, missions.length),
          total: missions.length,
        }),
      ),
      text,
    );
  }

  function advance(): void {
    stepYaw = null;
    if (index === STEPS.length - 1) {
      saveFinished();
      mode = 'finishedModal';
    } else {
      index++;
    }
    render();
  }

  function stepDone(s: Step, p: TutorialProgress): boolean {
    const has = (kind: FacilityKind) => p.state.facilities.some((f) => f.kind === kind);
    switch (s) {
      case 'move':
        return p.movedMeters >= values.tutorial.moveMeters.value;
      case 'look': {
        if (stepYaw === null) {
          stepYaw = p.viewYawRad;
          return false;
        }
        const turned = Math.abs(
          Math.atan2(Math.sin(p.viewYawRad - stepYaw), Math.cos(p.viewYawRad - stepYaw)),
        );
        return turned >= values.tutorial.lookTurnRad.value;
      }
      case 'jump':
        return p.airborne;
      case 'buildSolar':
        return p.placing === 'solar' || has('solar');
      case 'placeSolar':
        return has('solar');
      case 'battery':
        return has('battery');
      case 'order':
        return p.state.launches.length > 0;
      case 'fastForward':
        return p.speed === 4;
      case 'waitArrival':
        return p.state.launches.length === 0;
      case 'normalSpeed':
        return p.speed === 1;
      case 'assignCrew':
        return p.state.crew.some((c) => !c.isPlayer && c.task !== null && c.task !== 'research');
      case 'toIce':
        return p.onIce || p.carryingIce || p.deliveredIce;
      case 'takeIce':
        return p.carryingIce || p.deliveredIce;
      case 'goHome':
        return p.deliveredIce;
      case 'flareDrill':
        return flareChoice === 'shelter';
      case 'goOutside':
        return !p.indoors;
      case 'regolith':
        return p.state.facilities.some((f) => f.kind === 'habitat' && f.regolithCover === true);
      case 'save':
        return p.manualSaves > 0;
      case 'data':
        return dataOpened;
      case 'power':
      case 'comm':
        return false;
    }
  }

  function missionDone(m: Mission, s: SimState): boolean {
    switch (m.condition) {
      case 'hasFacility':
        return s.facilities.some((f) => f.kind === m.kind);
      case 'farmingRunning':
        return (
          s.facilities.some((f) => f.kind === 'greenhouse') &&
          s.crew.some((c) => c.task === 'farming')
        );
      case 'crewAtLeast':
        return s.crew.length >= m.threshold;
      case 'relayAtLeast':
        return s.relaySatellites >= m.threshold;
      case 'developmentAtLeast':
        return s.development.total >= m.threshold;
      case 'cleared':
        return s.phase === 'cleared';
    }
  }

  function update(progress: TutorialProgress): void {
    lastProgress = progress;
    if (mode === 'tutorial') {
      while (mode === 'tutorial' && !ACK_STEPS.includes(step()) && stepDone(step(), progress)) {
        advance();
      }
      return;
    }
    if (mode === 'missions') {
      let changed = false;
      while (
        missionIndex < missions.length &&
        missionDone(missions[missionIndex], progress.state)
      ) {
        missionIndex++;
        changed = true;
      }
      if (changed) {
        render();
      }
    }
  }

  onLangChange(render);
  render();

  return {
    update,
    guide() {
      if (mode !== 'tutorial') {
        return null;
      }
      switch (step()) {
        case 'toIce':
        case 'takeIce':
          return 'ice';
        case 'goHome':
        case 'regolith':
          return 'home';
        default:
          return null;
      }
    },
    isBlocking() {
      return mode === 'ask' || mode === 'finishedModal' || mode === 'confirmRestart';
    },
    isTutorial() {
      return mode === 'tutorial';
    },
    takeFlareDrillRequest() {
      if (mode !== 'tutorial' || step() !== 'flareDrill' || flareChoice === 'shelter') {
        return false;
      }
      if (flareDrillRequested) {
        return false;
      }
      flareDrillRequested = true;
      return true;
    },
    answerFlare(choice) {
      if (mode !== 'tutorial' || step() !== 'flareDrill') {
        return;
      }
      flareChoice = choice;
      if (choice === 'continue') {
        // もう一度警報を出して、中に入る練習をする
        flareDrillRequested = false;
      }
      if (lastProgress !== null) {
        update(lastProgress);
      }
      render();
    },
  };
}
