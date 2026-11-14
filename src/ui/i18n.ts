// 文言（i18n/en.json、i18n/ja.json）。画面に出す文字はすべてここを通す
import en from '../../i18n/en.json';
import ja from '../../i18n/ja.json';

export type Lang = 'en' | 'ja';

const MESSAGES: Record<Lang, Record<string, string>> = { en, ja };
const STORAGE_KEY = 'lang';
// 保存された選択がなければ、ブラウザの言語が日本語なら日本語、それ以外は仕様の「英語が基本」
const DEFAULT_LANG: Lang = navigator.languages.some((l) => l.toLowerCase().startsWith('ja'))
  ? 'ja'
  : 'en';

const listeners: ((lang: Lang) => void)[] = [];
let current: Lang = readSavedLang();

function readSavedLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'en' || saved === 'ja' ? saved : DEFAULT_LANG;
  } catch {
    // localStorage が使えない環境（プライベートモードなど）では保存しないだけ
    return DEFAULT_LANG;
  }
}

// ふりがな：文言の中に「｜漢字《かんじ》」と書く（青空文庫と同じ書き方）
const RUBY = /｜([^｜《》]+)《([^《》]+)》/g;

/** ふりがなの書き方を、HTML の <ruby> にする */
export function rubyHtml(text: string): string {
  return text.replace(RUBY, '<ruby>$1<rt>$2</rt></ruby>');
}

/** ふりがなを外して、漢字だけにする（title や aria-label など、HTML を入れられない所に使う） */
export function stripRuby(text: string): string {
  return text.replace(RUBY, '$1');
}

/** key の文言を HTML で返す（ふりがなは <ruby>）。params の {name} を置き換える。キーや引数がなければ例外 */
export function t(key: string, params?: Record<string, string | number>): string {
  return rubyHtml(raw(key, params));
}

/** key の文言を、ふりがなを外した文字だけで返す（title、aria-label、タブの名前など） */
export function tPlain(key: string, params?: Record<string, string | number>): string {
  return stripRuby(raw(key, params));
}

function raw(key: string, params?: Record<string, string | number>): string {
  const text = MESSAGES[current][key];
  if (text === undefined) {
    throw new Error(`i18n にキーがない: ${key}`);
  }
  if (params === undefined) {
    return text;
  }
  return text.replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (!(name in params)) {
      throw new Error(`i18n の引数がない: ${key} の {${name}}`);
    }
    return String(params[name]);
  });
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // 保存できなくても、この回の表示は切り替わる
  }
  for (const listener of listeners) {
    listener(lang);
  }
}

export function onLangChange(listener: (lang: Lang) => void): void {
  listeners.push(listener);
}
