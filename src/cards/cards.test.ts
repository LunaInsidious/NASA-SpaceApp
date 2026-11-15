import { describe, expect, it, vi } from 'vitest';
import cardsJson from '../../data/cards.json';
import nasaImagesJson from '../../data/nasa-images.json';
import valuesJson from '../../data/values.json';
import en from '../../i18n/en.json';
import ja from '../../i18n/ja.json';
import { createInitialState } from '../sim/index.ts';
import { SOURCE_KEYS } from '../ui/index.ts';
import { createCardStore, parseCards } from './index.ts';

const cards = parseCards(cardsJson, Object.keys(nasaImagesJson));

describe('豆知識カード', () => {
  it('data/cards.json は3枚以上あり、どのカードにも題・本文・手に入れ方の文言がある', () => {
    expect(cards.length).toBeGreaterThanOrEqual(3);
    for (const card of cards) {
      for (const part of ['title', 'body', 'hint']) {
        expect(Object.keys(ja)).toContain(`${card.textKey}.${part}`);
        expect(Object.keys(en)).toContain(`${card.textKey}.${part}`);
      }
      expect(card.url).toMatch(/^https:\/\//);
    }
  });

  it('条件を満たすと1回だけ手に入る', () => {
    // テストでは localStorage がないので、保存できないことの警告は出るが、遊ぶのは止めない
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createCardStore(cards);
    const first = store.unlock('firstRest');
    expect(first.map((card) => card.id)).toEqual(['evaHours']);
    expect(store.unlock('firstRest')).toEqual([]);
    expect(store.list().filter((entry) => entry.owned)).toHaveLength(1);
  });

  it('カードの本物のデータは values.json にあり、本物の資料（url つき）で、名前と単位の言葉があり、データの窓にも出る', () => {
    const inDataWindow = Object.values(SOURCE_KEYS).flat() as string[];
    for (const card of cards) {
      for (const path of card.values) {
        const entry = path
          .split('.')
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], valuesJson) as
          | { unit: string; source: string; url?: string }
          | undefined;
        expect(entry, `${card.id}: ${path}`).toBeDefined();
        expect(entry?.url, `${card.id}: ${path}`).toMatch(/^https:\/\//);
        expect(entry?.source.startsWith('ゲームの調整値'), `${card.id}: ${path}`).toBe(false);
        for (const lang of [ja, en]) {
          expect(Object.keys(lang), path).toContain(`valueName.${path}`);
          if (entry?.unit !== 'ratio') {
            expect(Object.keys(lang), path).toContain(`unit.${entry?.unit}`);
          }
        }
        expect(inDataWindow, `${card.id}: ${path}`).toContain(path);
      }
    }
    // データが主役のカードは、本物のデータを1つ以上持つ
    for (const id of ['gravity', 'sleep', 'dailyNeeds', 'commDelay', 'moonRadiation']) {
      expect(cards.find((card) => card.id === id)?.values.length, id).toBeGreaterThan(0);
    }
  });

  it('写真のキーが data/nasa-images.json にないカードは読み込めない', () => {
    expect(() =>
      parseCards([{ ...cardsJson[0], photo: 'nope' }], Object.keys(nasaImagesJson)),
    ).toThrow();
  });
});

describe('基地の様子で手に入るカード', () => {
  it('施設の数・日数・人数・発展度などの条件を満たすと手に入る', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = createCardStore(cards);
    const env = {
      heightAt: () => 0,
      isSunlit: () => true,
      isEarthVisible: () => true,
      isIceAt: () => false,
      dustFactorAt: () => 1,
    };
    const state = createInitialState(valuesJson, env, [0, 0]);
    const before = store.unlockByState(state).map((card) => card.id);
    // 最初からある居住モジュール1つだけでは、居住モジュール2つのカードは手に入らない
    expect(before).not.toContain('habitat2');
    const later = {
      ...state,
      timeHours: 24 * 14,
      facilities: [...state.facilities, { ...state.facilities[0], id: 'h2' }],
    };
    expect(store.unlockByState(later).map((card) => card.id)).toEqual(
      expect.arrayContaining(['habitat2', 'day15']),
    );
    // 一度手に入れたカードは、もう一度は出ない
    expect(store.unlockByState(later)).toEqual([]);
  });
});
