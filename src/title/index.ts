// タイトル画面：ロゴと「はじめから」「つづきから」「せってい」。
// 開いている間は main が時間と移動を止める。ロゴはこのファイルで描いたオリジナル（NASA のロゴやデザインは使わない）
import type { SaveSummary } from '../save/api.ts';
import { SOUND_MODES, type SoundMode } from '../ui/fx.ts';
import { getLang, onLangChange, setLang, t } from '../ui/i18n.ts';
import './title.css';

// 月の地平線、ドームの基地と太陽電池とアンテナ、遠くの地球
const LOGO_SVG = `<svg viewBox="0 0 320 150" aria-hidden="true">
  <defs>
    <radialGradient id="title-earth" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="#9fd8ff"/>
      <stop offset="0.6" stop-color="#2f7fd0"/>
      <stop offset="1" stop-color="#173f78"/>
    </radialGradient>
    <linearGradient id="title-ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c9ccd4"/>
      <stop offset="0.6" stop-color="#8a8f9c"/>
      <stop offset="1" stop-color="#6c7180" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="title-fade">
      <stop offset="0" stop-color="#000"/>
      <stop offset="0.18" stop-color="#fff"/>
      <stop offset="0.82" stop-color="#fff"/>
      <stop offset="1" stop-color="#000"/>
    </linearGradient>
    <mask id="title-ground-mask">
      <rect width="320" height="150" fill="url(#title-fade)"/>
    </mask>
  </defs>
  <circle cx="252" cy="34" r="20" fill="url(#title-earth)"/>
  <path d="M238 30 q8 -6 14 2 q-4 6 -10 4 z M256 40 q6 -2 8 4 q-6 4 -10 0 z" fill="#5fbf6a" opacity="0.85"/>
  <g fill="#fff">
    <circle cx="40" cy="26" r="1.4"/><circle cx="92" cy="14" r="1"/><circle cx="150" cy="30" r="1.2"/>
    <circle cx="196" cy="12" r="1"/><circle cx="296" cy="70" r="1.2"/><circle cx="20" cy="70" r="1"/>
  </g>
  <g mask="url(#title-ground-mask)">
    <path d="M0 150 L0 112 Q160 70 320 112 L320 150 Z" fill="url(#title-ground)"/>
    <ellipse cx="70" cy="118" rx="14" ry="3.5" fill="#8a8f9c"/>
    <ellipse cx="250" cy="122" rx="10" ry="2.5" fill="#8a8f9c"/>
  </g>
  <path d="M128 98 a32 32 0 0 1 64 0 z" fill="#f4f6fa" stroke="#9fb3cc" stroke-width="2"/>
  <rect x="150" y="84" width="20" height="14" rx="3" fill="#ffd27a"/>
  <g transform="translate(92 86) rotate(-12)">
    <rect width="28" height="12" fill="#2a5aa8" stroke="#9fd3ff" stroke-width="1.5"/>
    <path d="M9.3 0 v12 M18.6 0 v12" stroke="#9fd3ff" stroke-width="1"/>
  </g>
  <path d="M106 98 v-10" stroke="#c9ccd4" stroke-width="2"/>
  <path d="M212 98 v-26" stroke="#c9ccd4" stroke-width="2"/>
  <path d="M202 70 q10 -10 20 0" fill="none" stroke="#f4f6fa" stroke-width="3"/>
  <circle cx="212" cy="66" r="2" fill="#ff8a5c"/>
</svg>`;

type View = 'main' | 'continue' | 'settings';

export interface TitleCallbacks {
  /** セーブの一覧（新しい順） */
  saves(): SaveSummary[];
  onNew(): void;
  onContinue(saveId: string): void;
  soundMode(): SoundMode;
  setSoundMode(mode: SoundMode): void;
}

export interface Title {
  isOpen(): boolean;
  /** ゲームの途中からタイトル画面に戻る */
  show(): void;
}

export function createTitle(root: HTMLElement, callbacks: TitleCallbacks): Title {
  let open = true;
  let view: View = 'main';
  const layer = document.createElement('div');
  layer.className = 'title-layer';
  root.append(layer);

  const button = (label: string, className: string, onClick: () => void, disabled = false) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.innerHTML = label;
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  };
  const show = (next: View) => {
    view = next;
    render();
  };
  const close = () => {
    open = false;
    render();
  };

  function mainView(): HTMLElement[] {
    const hasSave = callbacks.saves().length > 0;
    return [
      button(t('title.new'), 'title-button primary', () => {
        close();
        callbacks.onNew();
      }),
      button(t('title.continue'), 'title-button', () => show('continue'), !hasSave),
      button(t('title.settings'), 'title-button', () => show('settings')),
    ];
  }

  function continueView(): HTMLElement[] {
    const heading = document.createElement('h2');
    heading.innerHTML = t('title.continueTitle');
    const list = document.createElement('ul');
    list.className = 'title-list';
    for (const save of callbacks.saves()) {
      const item = document.createElement('li');
      item.append(
        button(
          `${t(save.kind === 'auto' ? 'save.auto' : 'save.manual')}　${t('save.summary', {
            day: Math.floor(save.day) + 1,
            development: save.developmentTotal.toFixed(0),
          })}`,
          'title-button title-save',
          () => {
            close();
            callbacks.onContinue(save.id);
          },
        ),
      );
      list.append(item);
    }
    return [heading, list, button(t('title.back'), 'title-button small', () => show('main'))];
  }

  function settingsView(): HTMLElement[] {
    const heading = document.createElement('h2');
    heading.innerHTML = t('title.settingsTitle');
    const row = (label: string, buttons: HTMLButtonElement[]) => {
      const box = document.createElement('div');
      box.className = 'title-setting';
      const name = document.createElement('div');
      name.className = 'title-setting-name';
      name.innerHTML = label;
      const choices = document.createElement('div');
      choices.className = 'title-choices';
      choices.append(...buttons);
      box.append(name, choices);
      return box;
    };
    const lang = getLang();
    const sound = callbacks.soundMode();
    return [
      heading,
      row(t('title.language'), [
        button('English', `title-choice ${lang === 'en' ? 'on' : ''}`, () => setLang('en')),
        button('日本語', `title-choice ${lang === 'ja' ? 'on' : ''}`, () => setLang('ja')),
      ]),
      row(
        t('title.sound'),
        SOUND_MODES.map((mode) =>
          button(t(`sound.${mode}`), `title-choice ${sound === mode ? 'on' : ''}`, () => {
            callbacks.setSoundMode(mode);
            render();
          }),
        ),
      ),
      button(t('title.back'), 'title-button small', () => show('main')),
    ];
  }

  function render(): void {
    layer.hidden = !open;
    if (open) {
      document.body.dataset.title = 'open';
    } else {
      delete document.body.dataset.title;
      return;
    }
    const logo = document.createElement('div');
    logo.className = 'title-logo';
    logo.innerHTML = LOGO_SVG;
    const name = document.createElement('h1');
    name.className = 'title-name';
    name.innerHTML = t('app.title');
    const subtitle = document.createElement('p');
    subtitle.className = 'title-subtitle';
    subtitle.innerHTML = t('title.subtitle');
    const menu = document.createElement('div');
    menu.className = 'title-menu';
    menu.append(
      ...(view === 'main' ? mainView() : view === 'continue' ? continueView() : settingsView()),
    );
    layer.replaceChildren(logo, name, subtitle, menu);
  }

  onLangChange(render);
  render();

  return {
    isOpen: () => open,
    show() {
      open = true;
      view = 'main';
      render();
    },
  };
}
