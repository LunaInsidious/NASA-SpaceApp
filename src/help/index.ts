// ことばじてん：あとで見返したくなる言葉（蓄電池、太陽フレアなど）を、いつでも引けるようにする。
// 最初は空で、チュートリアルやミッションで説明した言葉を足していく（覚えた言葉はブラウザに残す）。
// 開いている間は main が時間を止める
import { onLangChange, t } from '../ui/i18n.ts';
import './help.css';
import { HELP_GROUPS, HELP_TERMS, type HelpTerm } from './terms.ts';

const STORAGE_KEY = 'lunar-outpost-help-terms';
// 新しい言葉が足されたときに、ボタンを光らせてお知らせを出す長さ
const PULSE_MS = 4000;

export interface Help {
  isOpen(): boolean;
  /** 言葉を1つでも開いて読んだか（チュートリアルの「ことばじてん」の段） */
  hasRead(): boolean;
  /** 説明した言葉を足す。announce なら、新しく足した言葉をボタンのそばで知らせる */
  learn(terms: readonly HelpTerm[], announce: boolean): void;
}

function readLearned(): Set<HelpTerm> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    // 前の版で使っていて、いまはない言葉は読まない
    return new Set(Array.isArray(saved) ? HELP_TERMS.filter((term) => saved.includes(term)) : []);
  } catch (error) {
    console.warn('ことばじてんの覚えた言葉を読めない', error);
    return new Set();
  }
}

export function createHelp(
  root: HTMLElement,
  /** 新しく言葉を足したとき（main が音を鳴らす） */
  onLearned: () => void,
): Help {
  let open = false;
  let read = false;
  const learned = readLearned();

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'help-toggle';
  toggle.addEventListener('click', () => {
    open = true;
    render();
  });

  const layer = document.createElement('div');
  layer.className = 'help-layer';
  layer.hidden = true;
  // 足した言葉のお知らせ（ボタンのそばの小さな吹き出し。建てたときのお祝いの文字と重ねない）
  const note = document.createElement('div');
  note.className = 'help-note';
  note.hidden = true;
  let noteTimer: number | null = null;
  root.append(toggle, note, layer);

  function render(): void {
    // スマホでは「?」だけを見せる（CSS で名前を隠す）。名前は読み上げとホバーに残す
    const icon = document.createElement('span');
    icon.textContent = t('help.icon');
    const label = document.createElement('span');
    label.className = 'help-toggle-label';
    label.textContent = t('help.label');
    toggle.replaceChildren(icon, label);
    toggle.title = t('help.label');
    toggle.setAttribute('aria-label', t('help.label'));
    // まだ1つも言葉がなければ、ボタンも出さない
    toggle.hidden = learned.size === 0;
    layer.hidden = !open;
    if (!open) {
      return;
    }
    const card = document.createElement('div');
    card.className = 'help-card';
    const title = document.createElement('h2');
    title.textContent = t('help.title');
    card.append(title);
    for (const group of HELP_GROUPS) {
      const terms = group.terms.filter((id) => learned.has(id));
      if (terms.length === 0) {
        continue;
      }
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = t(`help.group.${group.id}`);
      section.append(heading);
      for (const id of terms) {
        const item = document.createElement('details');
        const name = document.createElement('summary');
        name.textContent = t(`help.term.${id}.name`);
        const what = document.createElement('p');
        what.textContent = t(`help.term.${id}.what`);
        const why = document.createElement('p');
        why.className = 'help-why';
        why.textContent = `${t('help.whyLabel')} ${t(`help.term.${id}.why`)}`;
        item.dataset.term = id;
        item.addEventListener('toggle', () => {
          if (item.open) {
            read = true;
          }
        });
        item.append(name, what, why);
        section.append(item);
      }
      card.append(section);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'help-close';
    close.textContent = t('help.close');
    close.addEventListener('click', () => {
      open = false;
      render();
    });
    card.append(close);
    layer.replaceChildren(card);
  }

  onLangChange(render);
  render();

  return {
    isOpen: () => open,
    hasRead: () => read,
    learn(terms, announce) {
      const added = terms.filter((term) => !learned.has(term));
      if (added.length === 0) {
        return;
      }
      for (const term of added) {
        learned.add(term);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...learned]));
      } catch (error) {
        console.warn('ことばじてんの覚えた言葉を保存できない', error);
      }
      render();
      if (!announce) {
        return;
      }
      toggle.classList.add('help-pulse');
      note.textContent = t('help.learned', {
        names: added.map((term) => t(`help.term.${term}.name`)).join('・'),
      });
      note.hidden = false;
      if (noteTimer !== null) {
        window.clearTimeout(noteTimer);
      }
      noteTimer = window.setTimeout(() => {
        toggle.classList.remove('help-pulse');
        note.hidden = true;
      }, PULSE_MS);
      onLearned();
    },
  };
}
