// チュートリアル（docs/SPEC.md ステップ8）。1つずつ指示を出し、できたら次へ進む。
// 押すボタンは光らせ（tutorial.css）、行く場所には world の光の柱を立てる（guide()）
import type { FacilityKind, SimState, Values } from '../contracts/index.ts';
import { onLangChange, t } from '../ui/i18n.ts';
import './tutorial.css';

const STEPS = [
  'move',
  'build',
  'place',
  'power',
  'battery',
  'toIce',
  'takeIce',
  'goHome',
  'done',
] as const;
type Step = (typeof STEPS)[number];
// 読んで「わかった」を押すと進む段
const ACK_STEPS: readonly Step[] = ['power', 'done'];
const STORAGE_KEY = 'lunar-outpost-tutorial';

export interface TutorialProgress {
  state: SimState;
  /** 最初の位置から歩いた距離 */
  movedMeters: number;
  /** 建設メニューで選んで、置く場所を選んでいる施設 */
  placing: FacilityKind | null;
  onIce: boolean;
  carryingIce: boolean;
  /** 氷を居住モジュールに持ち帰った */
  deliveredIce: boolean;
}

export interface Tutorial {
  /** 毎フレーム呼ぶ。段が変わったときだけ描き直す */
  update(progress: TutorialProgress): void;
  /** 光の柱を立てる場所 */
  guide(): 'ice' | 'home' | null;
}

function readFinished(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'finished';
  } catch (error) {
    console.warn('チュートリアルの進み具合を読めない', error);
    return false;
  }
}

function saveFinished(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'finished');
  } catch (error) {
    console.warn('チュートリアルの進み具合を保存できない', error);
  }
}

export function createTutorial(root: HTMLElement, isTouch: boolean, values: Values): Tutorial {
  let index = 0;
  let finished = readFinished();

  const panel = document.createElement('div');
  panel.className = 'tutorial';
  root.append(panel);

  const step = (): Step => STEPS[index];

  function finish(): void {
    finished = true;
    saveFinished();
    render();
  }

  function next(): void {
    index = Math.min(STEPS.length - 1, index + 1);
    render();
  }

  function render(): void {
    panel.hidden = finished;
    if (finished) {
      delete document.body.dataset.tutorialStep;
      return;
    }
    document.body.dataset.tutorialStep = step();
    panel.replaceChildren();

    const head = document.createElement('div');
    head.className = 'tutorial-head';
    const title = document.createElement('span');
    title.className = 'tutorial-title';
    title.textContent = t('tutorial.title');
    const progress = document.createElement('span');
    progress.className = 'tutorial-progress';
    progress.textContent = t('tutorial.progress', { n: index + 1, total: STEPS.length });
    head.append(title, progress);

    const text = document.createElement('p');
    text.className = 'tutorial-text';
    text.textContent = t(`tutorial.step.${step()}.${isTouch ? 'touch' : 'keys'}`);

    const buttons = document.createElement('div');
    buttons.className = 'tutorial-buttons';
    if (ACK_STEPS.includes(step())) {
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'tutorial-ok';
      ok.textContent = t('tutorial.ok');
      ok.addEventListener('click', () => (step() === 'done' ? finish() : next()));
      buttons.append(ok);
    }
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = t('tutorial.skip');
    skip.addEventListener('click', finish);
    buttons.append(skip);

    panel.append(head, text, buttons);
  }

  /** 今の段ができたか（読んで進む段は false） */
  function isDone(s: Step, p: TutorialProgress): boolean {
    const has = (kind: FacilityKind) => p.state.facilities.some((f) => f.kind === kind);
    switch (s) {
      case 'move':
        return p.movedMeters >= values.tutorial.moveMeters.value;
      case 'build':
        return p.placing === 'solar' || has('solar');
      case 'place':
        return has('solar');
      case 'battery':
        return has('battery');
      case 'toIce':
        return p.onIce || p.carryingIce || p.deliveredIce;
      case 'takeIce':
        return p.carryingIce || p.deliveredIce;
      case 'goHome':
        return p.deliveredIce;
      case 'power':
      case 'done':
        return false;
    }
  }

  onLangChange(render);
  render();

  return {
    update(progress) {
      if (finished) {
        return;
      }
      let advanced = false;
      while (!ACK_STEPS.includes(step()) && isDone(step(), progress)) {
        index++;
        advanced = true;
      }
      if (advanced) {
        render();
      }
    },
    guide() {
      if (finished) {
        return null;
      }
      if (step() === 'toIce' || step() === 'takeIce') {
        return 'ice';
      }
      return step() === 'goHome' ? 'home' : null;
    },
  };
}
