import { describe, expect, it, vi } from 'vitest';
import cardsJson from '../../data/cards.json';
import nasaImagesJson from '../../data/nasa-images.json';
import en from '../../i18n/en.json';
import ja from '../../i18n/ja.json';
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

  it('写真のキーが data/nasa-images.json にないカードは読み込めない', () => {
    expect(() =>
      parseCards([{ ...cardsJson[0], photo: 'nope' }], Object.keys(nasaImagesJson)),
    ).toThrow();
  });
});
