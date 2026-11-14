// 豆知識カード（docs/SPEC.md 追加の仕様 ステップ17）。チュートリアルの説明を深掘りして読み返す読み物。
// 条件は実績と同じ種類を使い、集めたカードは localStorage に残す（実績と同じく、使えない環境でも落とさない）

import { asHelpTerm, type HelpTerm } from '../help/terms.ts';
import { ACHIEVEMENT_CONDITIONS, type AchievementCondition } from '../save/achievements.ts';

export interface Card {
  id: string;
  condition: AchievementCondition;
  /** 文言は <textKey>.title・<textKey>.body（3〜4行）・<textKey>.hint（手に入れ方） */
  textKey: string;
  terms: readonly HelpTerm[];
  /** data/nasa-images.json のキー（写真がなければ null） */
  photo: string | null;
  source: string;
  url: string;
}

const STORAGE_KEY = 'lunar-outpost-cards';

/** data/cards.json の形を確かめる。写真のキーは data/nasa-images.json にあるものだけ。形が違えば止める */
export function parseCards(json: unknown, photoKeys: readonly string[]): Card[] {
  if (!Array.isArray(json)) {
    throw new Error('data/cards.json が配列ではない');
  }
  return json.map((entry: Record<string, unknown>, i): Card => {
    const { id, condition, textKey, terms, photo, source, url } = entry;
    const known = ACHIEVEMENT_CONDITIONS.find((c) => c === condition);
    if (
      typeof id !== 'string' ||
      known === undefined ||
      typeof textKey !== 'string' ||
      !Array.isArray(terms) ||
      (photo !== null && (typeof photo !== 'string' || !photoKeys.includes(photo))) ||
      typeof source !== 'string' ||
      typeof url !== 'string'
    ) {
      throw new Error(`data/cards.json の ${i} 件目の形が違う`);
    }
    return {
      id,
      condition: known,
      textKey,
      terms: terms.map((term) => asHelpTerm(term, `data/cards.json の ${id}`)),
      photo,
      source,
      url,
    };
  });
}

export interface CardStore {
  /** 条件を満たしたときに呼ぶ。初めて手に入れたカードを返す */
  unlock(condition: AchievementCondition): Card[];
  /** すべてのカードと、手に入れたか */
  list(): { card: Card; owned: boolean }[];
}

function readOwned(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch (error) {
    console.warn('豆知識カードを読めない（localStorage が使えないか、壊れている）', error);
    return new Set();
  }
}

export function createCardStore(cards: readonly Card[]): CardStore {
  const owned = readOwned();
  return {
    unlock(condition) {
      const added = cards.filter((card) => card.condition === condition && !owned.has(card.id));
      if (added.length === 0) {
        return [];
      }
      for (const card of added) {
        owned.add(card.id);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...owned]));
      } catch (error) {
        console.warn('豆知識カードを保存できない（localStorage が使えないか、いっぱい）', error);
      }
      return added;
    },
    list() {
      return cards.map((card) => ({ card, owned: owned.has(card.id) }));
    },
  };
}
