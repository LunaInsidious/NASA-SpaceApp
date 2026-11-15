// 豆知識カード（docs/SPEC.md 追加の仕様 ステップ17）。チュートリアルの説明を深掘りして読み返す読み物で、集めて増えていくコレクション。
// 手に入る条件は2種類：その場で起きたこと（実績と同じ条件の種類）と、基地の様子（施設の数・日数・人数など）。
// 集めたカードは localStorage に残す（実績と同じく、使えない環境でも落とさない）
import type { FacilityKind, SimState } from '../contracts/index.ts';
import { asHelpTerm, type HelpTerm } from '../help/terms.ts';
import { ACHIEVEMENT_CONDITIONS, type AchievementCondition } from '../save/achievements.ts';

// 基地の様子で決まる条件。facilityCount は kind と threshold、cleared 以外は threshold を持つ
export const CARD_STATE_CONDITIONS = [
  'facilityCount',
  'dayAtLeast',
  'crewAtLeast',
  'relayAtLeast',
  'developmentAtLeast',
  'cleared',
] as const;
type CardStateCondition = (typeof CARD_STATE_CONDITIONS)[number];
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
const HOURS_PER_DAY = 24;

export type CardCondition =
  | { condition: AchievementCondition }
  | { condition: 'facilityCount'; kind: FacilityKind; threshold: number }
  | {
      condition: 'dayAtLeast' | 'crewAtLeast' | 'relayAtLeast' | 'developmentAtLeast';
      threshold: number;
    }
  | { condition: 'cleared' };

export type Card = CardCondition & {
  id: string;
  /** 文言は <textKey>.title・<textKey>.body（3〜4行）・<textKey>.hint（手に入れ方） */
  textKey: string;
  terms: readonly HelpTerm[];
  /** data/nasa-images.json のキー（写真がなければ null） */
  photo: string | null;
  source: string;
  url: string;
  /** このカードの本物のデータ（data/values.json の "a.b.c"）。カードに数と出典を出し、データの窓からはこのカードへ行ける */
  values: readonly string[];
};

const STORAGE_KEY = 'lunar-outpost-cards';

/** data/cards.json の形を確かめる。写真のキーは data/nasa-images.json にあるものだけ。形が違えば止める */
export function parseCards(json: unknown, photoKeys: readonly string[]): Card[] {
  if (!Array.isArray(json)) {
    throw new Error('data/cards.json が配列ではない');
  }
  const cards = json.map((entry: Record<string, unknown>, i): Card => {
    const { id, condition, kind, threshold, textKey, terms, photo, source, url, values } = entry;
    const bad = () => new Error(`data/cards.json の ${i} 件目の形が違う`);
    if (
      typeof id !== 'string' ||
      typeof textKey !== 'string' ||
      !Array.isArray(terms) ||
      (photo !== null && (typeof photo !== 'string' || !photoKeys.includes(photo))) ||
      typeof source !== 'string' ||
      typeof url !== 'string' ||
      !Array.isArray(values) ||
      !values.every((path) => typeof path === 'string')
    ) {
      throw bad();
    }
    const base = {
      id,
      textKey,
      terms: terms.map((term) => asHelpTerm(term, `data/cards.json の ${id}`)),
      photo,
      source,
      url,
      values: values as string[],
    };
    const event = ACHIEVEMENT_CONDITIONS.find((c) => c === condition);
    if (event !== undefined) {
      return { ...base, condition: event };
    }
    const state: CardStateCondition | undefined = CARD_STATE_CONDITIONS.find(
      (c) => c === condition,
    );
    if (state === undefined) throw bad();
    if (state === 'cleared') return { ...base, condition: state };
    if (typeof threshold !== 'number') throw bad();
    if (state === 'facilityCount') {
      const facility = FACILITY_KINDS.find((k) => k === kind);
      if (facility === undefined) throw bad();
      return { ...base, condition: state, kind: facility, threshold };
    }
    return { ...base, condition: state, threshold };
  });
  const ids = new Set(cards.map((card) => card.id));
  if (ids.size !== cards.length) {
    throw new Error('data/cards.json に同じ id のカードがある');
  }
  return cards;
}

/** 基地の様子で決まる条件を満たしているか（その場で起きたことの条件なら false） */
export function cardEarnedByState(card: Card, state: SimState): boolean {
  switch (card.condition) {
    case 'facilityCount':
      return state.facilities.filter((f) => f.kind === card.kind).length >= card.threshold;
    case 'dayAtLeast':
      return Math.floor(state.timeHours / HOURS_PER_DAY) + 1 >= card.threshold;
    case 'crewAtLeast':
      return state.crew.length >= card.threshold;
    case 'relayAtLeast':
      return state.relaySatellites >= card.threshold;
    case 'developmentAtLeast':
      return state.development.total >= card.threshold;
    case 'cleared':
      return state.phase === 'cleared';
    default:
      return false;
  }
}

export interface CardStore {
  /** その場で起きたことの条件を満たしたときに呼ぶ。初めて手に入れたカードを返す */
  unlock(condition: AchievementCondition): Card[];
  /** 基地の様子で決まる条件を見て、初めて手に入れたカードを返す（main が時間が進むたびに呼ぶ） */
  unlockByState(state: SimState): Card[];
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
  const take = (added: Card[]): Card[] => {
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
  };
  return {
    unlock(condition) {
      return take(cards.filter((card) => card.condition === condition && !owned.has(card.id)));
    },
    unlockByState(state) {
      return take(cards.filter((card) => !owned.has(card.id) && cardEarnedByState(card, state)));
    },
    list() {
      return cards.map((card) => ({ card, owned: owned.has(card.id) }));
    },
  };
}
