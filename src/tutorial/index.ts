// チュートリアル（docs/SPEC.md ステップ8）とミッション。
// 起動時に「あそんだことがある？」を聞き、初めてなら飛ばせない完全なチュートリアルで、全部の機能を1つずつ体験させる。
// 終わったら（経験者はすぐに）data/missions.json の目標をミッションとして順に出す。
// 押すボタンは光らせ（tutorial.css）、行く場所には world の光の柱を立てる（guide()）
import type { FacilityKind, SimState, Values } from '../contracts/index.ts';
import { asHelpTerm, HELP_TERMS, type HelpTerm } from '../help/terms.ts';
import type { CommLostReason } from '../sim/api.ts';
import { onLangChange, setLang, t, tPlain } from '../ui/i18n.ts';
import type { DeathAdvice } from './death.ts';
import { deathAdviceHtml } from './deathView.ts';
import { PROFESSOR_SVG, type Typing, typeText } from './professor.ts';
import './tutorial.css';

export const STEPS = [
  'move',
  'look',
  'jump',
  'buildSolar',
  'placeSolar',
  'power',
  'dictionary',
  'battery',
  'comm',
  'lifeLine',
  'order',
  'goInsideWait',
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
  'pause',
  'resume',
  'save',
  'data',
] as const;
type Step = (typeof STEPS)[number];
// その段で説明する言葉。段を見せたときに、ことばじてんに足す
const STEP_TERMS: Partial<Record<Step, readonly HelpTerm[]>> = {
  buildSolar: ['solar', 'materials'],
  power: ['power'],
  battery: ['battery'],
  comm: ['antenna', 'horizon'],
  order: ['launch'],
  goInsideWait: ['tank'],
  assignCrew: ['repair', 'research'],
  toIce: ['ice'],
  goHome: ['habitat'],
  flareDrill: ['flare', 'radiation', 'dose'],
  regolith: ['regolith'],
  data: ['donki'],
};
// その段で押すボタン。前から順に、画面に見えている最初のものを矢印で指す（メニューの中のボタンを先に書く）
const STEP_POINTS: Partial<Record<Step, readonly string[]>> = {
  move: ['.ui-pad'],
  jump: ['[data-action="jump"]'],
  buildSolar: [
    '[data-action="buildSelect"][data-kind="solar"]',
    '[data-action="menu"][data-menu="build"]',
  ],
  placeSolar: ['[data-action="buildConfirm"]'],
  dictionary: ['.help-card details[data-term="solar"] summary', '.help-toggle'],
  battery: [
    '[data-action="buildConfirm"]',
    '[data-action="buildSelect"][data-kind="battery"]',
    '[data-action="menu"][data-menu="build"]',
  ],
  goInsideWait: ['[data-action="context"][data-context="enterHabitat"]'],
  fastForward: ['[data-action="speed"][data-speed="4"]'],
  normalSpeed: ['[data-action="speed"][data-speed="1"]'],
  assignCrew: [
    '[data-action="assign"][data-task="farming"]',
    '[data-action="menu"][data-menu="crew"]',
  ],
  takeIce: ['[data-action="context"][data-context="collectIce"]'],
  goHome: ['[data-action="context"][data-context="enterHabitat"]'],
  flareDrill: ['[data-action="flare"][data-choice="shelter"]'],
  goOutside: ['[data-action="context"][data-context="exitHabitat"]'],
  regolith: ['[data-action="context"][data-context="coverRegolith"]'],
  pause: ['[data-action="pause"]'],
  resume: ['.ui-pause [data-action="pause"]', '[data-action="pause"]'],
  save: ['[data-action="save"][data-slot="0"]', '[data-action="menu"][data-menu="save"]'],
  data: ['[data-action="menu"][data-menu="data"]'],
};
// 「ちゅうもん」の段は、食料の＋ → 隊員の＋ → 注文を送る、の順に1つずつ指す
const ORDER_POINTS = [
  '[data-action="cart"][data-kind="food"][data-delta="1"]',
  '[data-action="cart"][data-kind="crew"][data-delta="1"]',
] as const;
// 矢印とボタンのあいだ（px）。上に場所がなければ下に出す
const POINTER_GAP_PX = 6;
const POINTER_SIZE_PX = 44;

/** 画面に見えている要素か（隠れた窓の中のものは指さない） */
function visibleElement(selector: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(selector);
  if (el === null || el.getClientRects().length === 0) {
    return null;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? el : null;
}

/** その段で、いま押すボタン */
function pointTarget(step: Step): HTMLElement | null {
  if (step === 'order') {
    for (const selector of ORDER_POINTS) {
      const plus = visibleElement(selector);
      if (plus !== null && plus.previousElementSibling?.textContent?.trim() === '0') {
        return plus;
      }
    }
    return (
      visibleElement('[data-action="order"]') ??
      visibleElement('[data-action="menu"][data-menu="launch"]')
    );
  }
  for (const selector of STEP_POINTS[step] ?? []) {
    const el = visibleElement(selector);
    if (el !== null) {
      return el;
    }
  }
  return null;
}

// くんれん中に時間が進む段（はやおくり・ロケット待ち・こおり運び・一時停止）。ほかの段は時間を止めて、読んでいる間に物資やボンベが減らないようにする
const TIME_STEPS: readonly Step[] = [
  'fastForward',
  'waitArrival',
  'normalSpeed',
  'toIce',
  'takeIce',
  'goHome',
  'pause',
  'resume',
];

// 外でやる段。中にいるときは「外に出る」を指して、ひとこと出す
const OUTDOOR_STEPS: readonly Step[] = ['move', 'look', 'jump', 'toIce', 'takeIce', 'regolith'];
const MS_PER_SECOND = 1000;

// 読んで「わかった」を押すと進む段
const ACK_STEPS: readonly Step[] = ['power', 'comm', 'lifeLine'];
// 大きな窓が出たときに、博士の口が動く長さ（見た目だけ）
const MODAL_SPEAK_MS = 1500;

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

/** terms：そのミッションで説明する言葉（ことばじてんに足す） */
export type Mission = { id: string; textKey: string; terms: readonly HelpTerm[] } & (
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
    const { id, condition, kind, threshold, textKey, terms: rawTerms } = entry;
    const known: MissionCondition | undefined = MISSION_CONDITIONS.find((c) => c === condition);
    const bad = () => new Error(`data/missions.json の ${i} 件目の形が違う`);
    if (
      typeof id !== 'string' ||
      typeof textKey !== 'string' ||
      known === undefined ||
      !Array.isArray(rawTerms)
    ) {
      throw bad();
    }
    const terms = rawTerms.map((term) => asHelpTerm(term, `data/missions.json の ${id}`));
    if (known === 'hasFacility') {
      const facility = FACILITY_KINDS.find((k) => k === kind);
      if (facility === undefined) throw bad();
      return { id, textKey, terms, condition: known, kind: facility };
    }
    if (known === 'farmingRunning' || known === 'cleared') {
      return { id, textKey, terms, condition: known };
    }
    if (typeof threshold !== 'number') throw bad();
    return { id, textKey, terms, condition: known, threshold };
  });
}

export interface TutorialProgress {
  state: SimState;
  /** 宇宙飛行士の位置（「あるく」の段で、段を始めた場所から歩いた距離を測る） */
  playerX: number;
  playerZ: number;
  /** 地球と話せないときの理由（話せていれば null） */
  commReason: CommLostReason | null;
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
  /** ことばじてんで、言葉を1つでも開いて読んだか */
  readDictionary: boolean;
  /** 「一時停止」のボタンで止めているか（メニューや窓で止まっているのは含まない） */
  userPaused: boolean;
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
  /** チュートリアル中にゲームオーバーになった。理由とルナはかせのアドバイスを見せ、新しいゲームで1段目からやり直す */
  failTutorial(reason: string, advice: DeathAdvice): void;
  /** 太陽フレアの訓練の警報を出す段に来たら、1回だけ true を返す */
  takeFlareDrillRequest(): boolean;
  /** 太陽フレアの警報で選んだこと */
  answerFlare(choice: 'shelter' | 'continue'): void;
  /** 「ゲームを さいしょから やりなおす」（セーブの窓のボタン）。本当にやり直すかを確かめる窓を出す */
  confirmRestart(): void;
  /** いまゲームの時間を進めてよいか（くんれん中は、時間が要る段だけ進める） */
  timeRuns(): boolean;
  /** タイトルの「はじめから」：新しいゲームにして「あそんだことがある？」から */
  startNew(): void;
  /** タイトルの「つづきから」：くんれんを終えていればミッション、まだなら「あそんだことがある？」から */
  startContinue(): void;
}

// title：タイトル画面で「はじめから」か「つづきから」を選ぶのを待っている（何も出さない）
type Mode =
  | 'title'
  | 'ask'
  | 'tutorial'
  | 'finishedModal'
  | 'missions'
  | 'confirmRestart'
  | 'failed';

export function createTutorial(
  root: HTMLElement,
  isTouch: boolean,
  values: Values,
  missions: Mission[],
  /** 「さいしょから」を確かめたあとに呼ぶ。main が新しいゲームにする */
  onRestart: () => void,
  /** できた瞬間（段・ミッション・チュートリアルの完了）。main がお祝いの演出を出す */
  onCelebrate: (what: 'step' | 'mission' | 'trainingDone') => void,
  /** 段やミッションで説明した言葉。main がことばじてんに足す */
  onLearn: (terms: readonly HelpTerm[], announce: boolean) => void,
): Tutorial {
  let mode: Mode = 'title';
  let index = 0;
  let stepYaw: number | null = null;
  // 「あるく」の段を始めた場所
  let stepOrigin: { x: number; z: number } | null = null;
  // いまの段を出した時刻（読み終わる前に次の段へ進まないように使う）
  let stepShownAt = performance.now();
  let flareDrillRequested = false;
  let flareChoice: 'shelter' | 'continue' | null = null;
  let dataOpened = false;
  let missionIndex = 0;
  let lastProgress: TutorialProgress | null = null;
  // 「さいしょから」の確かめで「やめる」を選んだときに戻る先
  let previousMode: Mode = mode;

  const panel = document.createElement('div');
  panel.className = 'tutorial';
  // 吹き出しをクリック・タップすると、出している途中の文をすぐ全部出す
  panel.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || e.target.closest('button') === null) {
      typing?.finish();
    }
  });
  let typing: Typing | null = null;
  // いま出している（出し終えた）文の段。同じ段を描き直すときは、1文字ずつ出し直さない
  let typedKey = '';
  // ミッションのパネルを閉じたあと、また開くための小さなボタン（記号だけ）
  let panelClosed = false;
  const reopen = document.createElement('button');
  reopen.type = 'button';
  reopen.className = 'tutorial-reopen';
  reopen.textContent = '📋';
  reopen.hidden = true;
  reopen.addEventListener('click', () => {
    panelClosed = false;
    render();
  });
  root.append(reopen);
  const modal = document.createElement('div');
  modal.className = 'tutorial-modal-layer';
  root.append(panel, modal);
  // 外でやる段なのに中にいるときの、ひとこと
  const outdoorNote = document.createElement('p');
  outdoorNote.className = 'tutorial-note';
  outdoorNote.hidden = true;
  const renderOutdoorNote = () => {
    outdoorNote.innerHTML = t('tutorial.goOutsideFirst');
  };
  renderOutdoorNote();
  onLangChange(renderOutdoorNote);

  // いま押すボタンを指す矢印（ボタンの上に出し、上に場所がなければ下に出す）
  const pointer = document.createElement('div');
  pointer.className = 'tutorial-pointer';
  pointer.hidden = true;
  root.append(pointer);

  function placePointer(): void {
    const mustGoOut = lastProgress?.indoors === true && OUTDOOR_STEPS.includes(step());
    const target =
      mode !== 'tutorial' || rereading
        ? null
        : mustGoOut
          ? visibleElement('[data-action="context"][data-context="exitHabitat"]')
          : pointTarget(step());
    if (target === null) {
      pointer.hidden = true;
      return;
    }
    const rect = target.getBoundingClientRect();
    const room = POINTER_SIZE_PX + POINTER_GAP_PX;
    // 上に場所があれば上から、なければ左から、それもなければ下から指す
    const side = rect.top >= room ? 'above' : rect.left >= room ? 'left' : 'below';
    pointer.hidden = false;
    pointer.dataset.side = side;
    pointer.textContent = side === 'above' ? '⬇' : side === 'left' ? '➡' : '⬆';
    if (side === 'left') {
      pointer.style.left = `${rect.left - room}px`;
      pointer.style.top = `${rect.top + rect.height / 2 - POINTER_SIZE_PX / 2}px`;
    } else {
      pointer.style.left = `${rect.left + rect.width / 2 - POINTER_SIZE_PX / 2}px`;
      pointer.style.top =
        side === 'below' ? `${rect.bottom + POINTER_GAP_PX}px` : `${rect.top - room}px`;
    }
  }

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
    b.innerHTML = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function showModal(titleKey: string, bodyKey: string, buttons: HTMLButtonElement[]): void {
    showModalText(t(titleKey), t(bodyKey), buttons);
  }

  function showModalText(titleText: string, bodyText: string, buttons: HTMLButtonElement[]): void {
    const card = document.createElement('div');
    card.className = 'tutorial-modal';
    const title = document.createElement('h2');
    title.innerHTML = titleText;
    const body = document.createElement('p');
    body.innerHTML = bodyText;
    const row = document.createElement('div');
    row.className = 'tutorial-modal-buttons';
    row.append(...buttons);
    const big = document.createElement('div');
    big.className = 'tutorial-modal-professor';
    big.innerHTML = PROFESSOR_SVG;
    card.append(big);
    // 言葉を選べるのは、いちばん最初の「あそんだことがある？」の窓だけ（あとは右上のボタンで変えられる）
    if (mode === 'ask') {
      const langRow = document.createElement('div');
      langRow.className = 'tutorial-modal-lang';
      langRow.append(
        button('English', 'tutorial-lang', () => setLang('en')),
        button('日本語', 'tutorial-lang', () => setLang('ja')),
      );
      card.append(langRow);
    }
    card.append(title, body, row);
    // 窓が出たときに、博士が少しのあいだ話す
    card.classList.add('speaking');
    window.setTimeout(() => card.classList.remove('speaking'), MODAL_SPEAK_MS);
    modal.replaceChildren(card);
    modal.hidden = false;
  }

  function render(): void {
    if (rereading) {
      renderReread();
      return;
    }
    modal.hidden = true;
    panel.hidden = false;
    reopen.hidden = true;
    delete document.body.dataset.tutorialStep;
    if (mode === 'title') {
      panel.hidden = true;
      return;
    }
    if (mode === 'ask') {
      panel.hidden = true;
      showModal('tutorial.welcome.title', 'tutorial.welcome.question', [
        // 初めてなら、セーブがあっても新しいゲームで始める（途中の状態だと、今はできない指示が出る）
        button(t('tutorial.welcome.firstTime'), 'tutorial-big primary', () => resetTo('tutorial')),
        button(t('tutorial.welcome.played'), 'tutorial-big', () => {
          // あそんだことがあるなら、ことばじてんは全部の言葉を見せる（自分で選んだので、お知らせは出さない）
          onLearn(HELP_TERMS, false);
          mode = 'missions';
          render();
        }),
      ]);
      return;
    }
    if (mode === 'failed') {
      panel.hidden = true;
      showModalText(
        t('tutorial.failed.title'),
        t('tutorial.failed.body', { reason: failedReason }),
        [button(t('tutorial.failed.retry'), 'tutorial-big primary', () => resetTo('tutorial'))],
      );
      if (failedAdvice === null) {
        throw new Error('くんれんの失敗に、ルナはかせのアドバイスがない');
      }
      // 博士の顔は窓の上に出ているので、原因とアドバイスだけを本文のあとに足す
      modal
        .querySelector('.tutorial-modal p')
        ?.insertAdjacentHTML('afterend', deathAdviceHtml(failedAdvice));
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
    panel.hidden = panelClosed;
    reopen.hidden = !panelClosed;
    renderMission();
  }

  /** 吹き出しの左にいる博士（スマホでは小さな顔だけ） */
  function professor(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'tutorial-professor';
    el.innerHTML = PROFESSOR_SVG;
    const name = document.createElement('div');
    name.className = 'tutorial-professor-name';
    name.innerHTML = t('tutorial.professorName');
    el.append(name);
    return el;
  }

  /** 段が変わったときだけ、博士が話すように文を1文字ずつ出す */
  function speak(key: string, elements: HTMLElement[], skip: HTMLButtonElement): void {
    if (key === typedKey) {
      skip.hidden = true;
      return;
    }
    typing?.finish();
    typedKey = key;
    panel.classList.add('speaking');
    typing = typeText(elements, () => {
      panel.classList.remove('speaking');
      skip.hidden = true;
    });
  }

  function skipButton(): HTMLButtonElement {
    const skip = button(t('tutorial.skipTyping'), 'tutorial-skip', () => typing?.finish());
    return skip;
  }

  function header(titleText: string, progressText: string): HTMLElement {
    const head = document.createElement('div');
    head.className = 'tutorial-head';
    const title = document.createElement('span');
    title.innerHTML = titleText;
    const progress = document.createElement('span');
    progress.className = 'tutorial-progress';
    progress.innerHTML = progressText;
    // 説明を読み直すだけ（ゲームは進めも戻しもしない）
    const reread = button('', 'tutorial-restart', openReread);
    // スマホ幅では短い名前にして、見出しの行に収める（CSS で切り替える）
    const long = document.createElement('span');
    long.className = 'tutorial-long';
    long.innerHTML = t('tutorial.reread');
    const short = document.createElement('span');
    short.className = 'tutorial-short';
    short.innerHTML = t('tutorial.rereadShort');
    reread.append(long, short);
    reread.setAttribute('aria-label', tPlain('tutorial.reread'));
    head.append(title, progress, reread);
    return head;
  }

  /** これまでの「どうして？」と「やること」を1段目から並べて見せる。ミッション中は全部の段 */
  function openReread(): void {
    rereading = true;
    render();
  }

  function confirmRestart(): void {
    previousMode = mode;
    mode = 'confirmRestart';
    render();
  }

  let failedReason = '';
  let failedAdvice: DeathAdvice | null = null;

  let rereading = false;

  function renderReread(): void {
    const last = mode === 'tutorial' ? index : STEPS.length - 1;
    const card = document.createElement('div');
    card.className = 'tutorial-modal tutorial-reread';
    const title = document.createElement('h2');
    title.innerHTML = t('tutorial.rereadTitle');
    const list = document.createElement('ol');
    for (const s of STEPS.slice(0, last + 1)) {
      const item = document.createElement('li');
      const why = document.createElement('p');
      why.className = 'tutorial-why';
      why.innerHTML = t(`tutorial.why.${s}`);
      const what = document.createElement('p');
      what.innerHTML = t(`tutorial.step.${s}.${variant}`);
      item.append(why, what);
      list.append(item);
    }
    const close = button(t('tutorial.rereadClose'), 'tutorial-big primary', () => {
      rereading = false;
      render();
    });
    card.append(title, list, close);
    modal.replaceChildren(card);
    modal.hidden = false;
  }

  /** 新しいゲームにして、「あそんだことがある？」から始める */
  function restart(): void {
    resetTo('ask');
  }

  function resetTo(next: Mode): void {
    mode = next;
    index = 0;
    stepYaw = null;
    stepOrigin = null;
    stepShownAt = performance.now();
    flareDrillRequested = false;
    flareChoice = null;
    dataOpened = false;
    missionIndex = 0;
    panelClosed = false;
    onRestart();
    render();
  }

  function renderStep(): void {
    document.body.dataset.tutorialStep = step();
    onLearn(STEP_TERMS[step()] ?? [], true);
    const text = document.createElement('p');
    text.className = 'tutorial-text';
    const commReason = lastProgress?.commReason ?? null;
    if (step() === 'comm' && commReason !== null) {
      // 地球と話せていないときは、そのわけを言う（画面の「地球と通信できない」と合わせる）
      text.innerHTML = t('tutorial.step.commLost', { reason: t(`commHint.${commReason}`) });
    } else {
      text.innerHTML = t(
        step() === 'flareDrill' && flareChoice === 'continue'
          ? 'tutorial.step.flareDrillRetry'
          : `tutorial.step.${step()}.${variant}`,
      );
    }
    // 小学生が指示の意味を分かって進めるよう、「どうして？」（理由と新しい言葉の意味）を先に出す
    const whyLabel = document.createElement('div');
    whyLabel.className = 'tutorial-label';
    whyLabel.innerHTML = t('tutorial.whyLabel');
    const why = document.createElement('p');
    why.className = 'tutorial-why';
    why.innerHTML = t(`tutorial.why.${step()}`);
    const doLabel = document.createElement('div');
    doLabel.className = 'tutorial-label';
    doLabel.innerHTML = t('tutorial.doLabel');
    const skip = skipButton();
    const parts: HTMLElement[] = [
      professor(),
      header(t('tutorial.title'), t('tutorial.progress', { n: index + 1, total: STEPS.length })),
      whyLabel,
      why,
      doLabel,
      text,
      outdoorNote,
      skip,
    ];
    if (!TIME_STEPS.includes(step())) {
      // 時間を止めていることを、見出しのすぐ下に小さく出す
      const frozen = document.createElement('div');
      frozen.className = 'tutorial-frozen';
      frozen.innerHTML = t('tutorial.timeStopped');
      parts.splice(2, 0, frozen);
    }
    speak(`step:${index}:${flareChoice ?? ''}`, [why, text], skip);
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
    if (mission !== undefined) {
      onLearn(mission.terms, true);
    }
    const text = document.createElement('p');
    text.className = 'tutorial-text';
    text.innerHTML = mission === undefined ? t('mission.allDone') : t(mission.textKey);
    const skip = skipButton();
    const parts: HTMLElement[] = [
      professor(),
      header(
        t('mission.title'),
        t('tutorial.progress', {
          n: Math.min(missionIndex + 1, missions.length),
          total: missions.length,
        }),
      ),
      text,
      skip,
    ];
    speak(`mission:${missionIndex}`, [text], skip);
    // 全部おわったら、パネルを閉じられるようにする（閉じても 📋 からまた開ける）
    if (mission === undefined) {
      const row = document.createElement('div');
      row.className = 'tutorial-buttons';
      row.append(
        button(t('mission.closePanel'), 'tutorial-ok', () => {
          panelClosed = true;
          render();
        }),
      );
      parts.push(row);
    }
    panel.replaceChildren(...parts);
  }

  function advance(): void {
    stepYaw = null;
    stepOrigin = null;
    stepShownAt = performance.now();
    panel.classList.remove('tutorial-cleared');
    // 再描画のあとにつけ直して、アニメーションをもう一度動かす
    requestAnimationFrame(() => panel.classList.add('tutorial-cleared'));
    if (index === STEPS.length - 1) {
      mode = 'finishedModal';
      onCelebrate('trainingDone');
    } else {
      index++;
      onCelebrate('step');
    }
    render();
  }

  function stepDone(s: Step, p: TutorialProgress): boolean {
    const has = (kind: FacilityKind) => p.state.facilities.some((f) => f.kind === kind);
    switch (s) {
      case 'move':
        return (
          stepOrigin !== null &&
          Math.hypot(p.playerX - stepOrigin.x, p.playerZ - stepOrigin.z) >=
            values.tutorial.moveMeters.value
        );
      case 'look': {
        if (stepYaw === null) {
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
      case 'goInsideWait':
        return p.indoors;
      case 'fastForward':
        return p.speed === 4 && p.indoors;
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
      case 'dictionary':
        return p.readDictionary;
      case 'pause':
        return p.userPaused;
      case 'resume':
        return !p.userPaused;
      case 'save':
        return p.manualSaves > 0;
      case 'data':
        return dataOpened;
      case 'power':
      case 'comm':
      case 'lifeLine':
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
    placePointer();
    if (mode === 'tutorial') {
      // 氷を運ぶ途中で倒れて氷をなくしたら、氷を取りに行く段に戻る
      if (
        (step() === 'goHome' || step() === 'takeIce') &&
        !progress.carryingIce &&
        !progress.deliveredIce &&
        !progress.onIce
      ) {
        index = STEPS.indexOf('toIce');
        render();
      }
      // 段を出したときの場所と向き（読み終わる前に歩いたり見回したりしても数える）
      stepOrigin ??= { x: progress.playerX, z: progress.playerZ };
      stepYaw ??= progress.viewYawRad;
      // 1回に1段だけ。文を出し終えて、少し時間がたってから進む（すでにできていた段も、読む前に飛ばさない）
      const readEnough =
        typing?.isTyping() !== true &&
        performance.now() - stepShownAt >= values.tutorial.minStepSeconds.value * MS_PER_SECOND;
      if (readEnough && !ACK_STEPS.includes(step()) && stepDone(step(), progress)) {
        advance();
      }
      outdoorNote.hidden = !(OUTDOOR_STEPS.includes(step()) && progress.indoors);
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
        onCelebrate('mission');
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
    confirmRestart,
    timeRuns() {
      return mode !== 'tutorial' || TIME_STEPS.includes(step());
    },
    startNew() {
      resetTo('ask');
    },
    startContinue() {
      // セーブを選んで続けるので、「あそんだことがある？」は聞かずにミッションへ
      mode = 'missions';
      render();
    },
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
      return (
        rereading ||
        mode === 'ask' ||
        mode === 'finishedModal' ||
        mode === 'confirmRestart' ||
        mode === 'failed'
      );
    },
    isTutorial() {
      return mode === 'tutorial';
    },
    failTutorial(reason, advice) {
      // チュートリアルの途中のゲームオーバー：セーブからではなく、新しいゲームで1段目からやり直す
      failedReason = reason;
      failedAdvice = advice;
      mode = 'failed';
      render();
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
