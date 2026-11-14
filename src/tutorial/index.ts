// チュートリアル（docs/SPEC.md ステップ8）の最小版：仕様の3課題を目標の一覧で見せ、できたら印を付ける
import type { SimState } from '../contracts/index.ts';
import { onLangChange, t } from '../ui/i18n.ts';
import './tutorial.css';

type Goal = 'solar' | 'battery' | 'ice' | 'flare';
const GOALS: Goal[] = ['solar', 'battery', 'ice', 'flare'];

export interface TutorialProgress {
  state: SimState;
  indoors: boolean;
  /** 氷の場所で「氷を取る」をしたか */
  collectedIce: boolean;
}

export interface Tutorial {
  update(progress: TutorialProgress): void;
}

export function createTutorial(root: HTMLElement): Tutorial {
  const done = new Set<Goal>();
  let skipped = false;

  const panel = document.createElement('div');
  panel.className = 'tutorial';
  root.append(panel);
  const narrowScreen = window.matchMedia('(max-width: 640px)');

  function render(): void {
    panel.hidden = skipped;
    panel.replaceChildren();
    const title = document.createElement('div');
    title.className = 'tutorial-title';
    title.textContent = t('tutorial.title');
    const list = document.createElement('ul');
    // 狭い画面では、まだ終わっていない最初の目標だけを出す
    const shown = narrowScreen.matches ? GOALS.filter((g) => !done.has(g)).slice(0, 1) : GOALS;
    for (const goal of shown) {
      const item = document.createElement('li');
      item.className = done.has(goal) ? 'tutorial-done' : '';
      item.textContent = `${done.has(goal) ? '✓' : '・'} ${t(`tutorial.${goal}`)}`;
      list.append(item);
    }
    const next = document.createElement('div');
    next.className = 'tutorial-next';
    next.textContent = t(done.size === GOALS.length ? 'tutorial.allDone' : 'tutorial.goal');
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = t('tutorial.skip');
    skip.addEventListener('click', () => {
      skipped = true;
      render();
    });
    panel.append(title, list, next, skip);
  }

  onLangChange(render);
  narrowScreen.addEventListener('change', render);
  render();

  return {
    update({ state, indoors, collectedIce }) {
      const before = done.size;
      if (state.facilities.some((f) => f.kind === 'solar')) {
        done.add('solar');
      }
      if (state.facilities.some((f) => f.kind === 'battery')) {
        done.add('battery');
      }
      if (collectedIce && indoors) {
        done.add('ice');
      }
      if (state.activeEvents.length > 0 && indoors) {
        done.add('flare');
      }
      if (done.size !== before) {
        render();
      }
    },
  };
}
