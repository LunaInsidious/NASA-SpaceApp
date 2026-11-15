import { describe, expect, it } from 'vitest';
import achievements from '../data/achievements.json';
import missions from '../data/missions.json';
import nasaImages from '../data/nasa-images.json';
import values from '../data/values.json';
import en from '../i18n/en.json';
import ja from '../i18n/ja.json';
import type { ValueEntry } from '../src/contracts/index.ts';
import { parseAchievements } from '../src/save/achievements.ts';
import {
  INTRO_REPLY_PAGES,
  parseMissions,
  REPLY_COUNT,
  REPLY_STEPS,
  STEPS,
  STORY_INTRO_PAGES,
  STORY_STEPS,
} from '../src/tutorial/index.ts';
import { stripRuby } from '../src/ui/i18n.ts';
import { realValueEntries } from '../src/ui/index.ts';
import { parseNasaImages } from '../src/ui/photo.ts';

function isValueEntry(node: object): node is ValueEntry {
  const { value, unit, source, url, ...rest } = node as Record<string, unknown>;
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    typeof unit === 'string' &&
    unit !== '' &&
    typeof source === 'string' &&
    source !== '' &&
    (url === undefined || (typeof url === 'string' && /^https?:\/\//.test(url))) &&
    Object.keys(rest).length === 0
  );
}

// value を持つものを1つの値、それ以外をグループとして、形の合わない場所を集める
function findInvalidEntries(node: unknown, path: string): string[] {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    return [`${path}: グループか値のオブジェクトではない`];
  }
  if ('value' in node) {
    return isValueEntry(node) ? [] : [`${path}: { value, unit, source, url? } の形ではない`];
  }
  const children = Object.entries(node);
  if (children.length === 0) {
    return [`${path}: 空のグループ`];
  }
  return children.flatMap(([key, child]) =>
    findInvalidEntries(child, path === '' ? key : `${path}.${key}`),
  );
}

describe('data/values.json', () => {
  it('すべての値が { value, unit, source, url? } の形をしている', () => {
    expect(findInvalidEntries(values, '')).toEqual([]);
  });

  it('出典が決まっていない値（TBD・仮の値）がない。本物の資料か、ゲームの調整値と書く', () => {
    const pending: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node !== 'object' || node === null) return;
      if ('value' in node) {
        const { source } = node as unknown as { source: string };
        if (/TBD|仮の/.test(source)) pending.push(`${path}: ${source}`);
        return;
      }
      for (const [key, child] of Object.entries(node)) {
        walk(child, path === '' ? key : `${path}.${key}`);
      }
    };
    walk(values, '');
    expect(pending).toEqual([]);
  });
});

describe('i18n', () => {
  it('en.json と ja.json のキーがそろっている', () => {
    expect(Object.keys(ja).sort()).toEqual(Object.keys(en).sort());
  });

  it('空の文言がない', () => {
    const empty = Object.entries({ en, ja }).flatMap(([lang, messages]) =>
      Object.entries(messages)
        .filter(([, text]) => text.trim() === '')
        .map(([key]) => `${lang}: ${key}`),
    );
    expect(empty).toEqual([]);
  });
});

describe('data/achievements.json', () => {
  it('形が正しく、文言のキーが en と ja にある', () => {
    const missing = parseAchievements(achievements).flatMap(({ textKey }) =>
      Object.entries({ en, ja })
        .filter(([, messages]) => !(textKey in messages))
        .map(([lang]) => `${lang}: ${textKey}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('data/missions.json', () => {
  it('形が正しく、文言のキーが en と ja にある', () => {
    const missing = parseMissions(missions).flatMap(({ textKey }) =>
      Object.entries({ en, ja })
        .filter(([, messages]) => !(textKey in messages))
        .map(([lang]) => `${lang}: ${textKey}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('data/nasa-images.json', () => {
  it('形が正しく、写真のファイルが public/nasa/ にある', () => {
    const present = Object.keys(import.meta.glob('../public/nasa/*'));
    const missing = Object.values(parseNasaImages(nasaImages))
      .map((image) => image.file)
      .filter((file) => !present.includes(`../public/nasa/${file}`));
    expect(missing).toEqual([]);
  });
});

describe('チュートリアルの段', () => {
  it('どの段にも「どうして？」と「やること」（キーボード・タッチ）の文言が en と ja にある', () => {
    const keys = STEPS.flatMap((step) => [
      `tutorial.why.${step}`,
      `tutorial.step.${step}.keys`,
      `tutorial.step.${step}.touch`,
    ]);
    const missing = keys.flatMap((key) =>
      Object.entries({ en, ja })
        .filter(([, messages]) => !(key in messages))
        .map(([lang]) => `${lang}: ${key}`),
    );
    expect(missing).toEqual([]);
  });
});

describe('ふりがな', () => {
  it('ja の「｜漢字《かんじ》」は閉じていて、外すと記号が残らない。en にはふりがながない', () => {
    const broken = Object.entries(ja as Record<string, string>)
      .filter(([, text]) => /[｜《》]/.test(stripRuby(text)))
      .map(([key]) => key);
    expect(broken).toEqual([]);
    const inEnglish = Object.entries(en as Record<string, string>)
      .filter(([, text]) => /[｜《》]/.test(text))
      .map(([key]) => key);
    expect(inEnglish).toEqual([]);
  });

  it('写真の日本語のタイトルの漢字にも、すべてふりがなが付いている', () => {
    const bare = Object.entries(parseNasaImages(nasaImages))
      .filter(([, image]) =>
        /[\u4e00-\u9fff々〆]/.test(image.titleJa.replace(/｜[^｜《》]+《[^《》]+》/g, '')),
      )
      .map(([key]) => key);
    expect(bare).toEqual([]);
  });

  it('ja の漢字には、すべてふりがなが付いている', () => {
    const bare = Object.entries(ja as Record<string, string>)
      .filter(([, text]) =>
        /[\u4e00-\u9fff々〆]/.test(text.replace(/｜[^｜《》]+《[^《》]+》/g, '')),
      )
      .map(([key]) => key);
    expect(bare).toEqual([]);
  });

  it('本物の資料で決めた値には、データの窓に出す名前・単位の言葉・まとまりの見出しがある（ratio は % にする）', () => {
    for (const { path, entry } of realValueEntries(values)) {
      expect(Object.keys(ja), path).toContain(`valueName.${path}`);
      expect(Object.keys(en), path).toContain(`valueName.${path}`);
      expect(Object.keys(ja), path).toContain(`valueGroup.${path.split('.')[0]}`);
      if (entry.unit !== 'ratio') {
        expect(Object.keys(ja), path).toContain(`unit.${entry.unit}`);
        expect(Object.keys(en), path).toContain(`unit.${entry.unit}`);
      }
    }
  });

  it('物語：はじまりの話の各ページ、博士がお話をする段、ミッションの章の題とお話が、日本語と英語の両方にある', () => {
    const keys = [
      ...Array.from({ length: STORY_INTRO_PAGES }, (_, i) => [
        `story.intro.${i + 1}.title`,
        `story.intro.${i + 1}.body`,
      ]).flat(),
      ...STORY_STEPS.map((step) => `tutorial.story.${step}`),
      ...parseMissions(missions).flatMap((m) => [
        `mission.chapter.${m.id}`,
        `mission.story.${m.id}`,
      ]),
      // 博士への返事と、博士の反応
      ...INTRO_REPLY_PAGES.flatMap((page) =>
        Array.from({ length: REPLY_COUNT }, (_, i) => [
          `story.intro.${page}.reply.${i + 1}`,
          `story.intro.${page}.react.${i + 1}`,
        ]).flat(),
      ),
      ...REPLY_STEPS.flatMap((step) =>
        Array.from({ length: REPLY_COUNT }, (_, i) => [
          `tutorial.reply.${step}.${i + 1}`,
          `tutorial.react.${step}.${i + 1}`,
        ]).flat(),
      ),
      'story.feeling.excited',
      'story.feeling.nervous',
    ];
    for (const lang of [ja, en]) {
      expect(keys.filter((key) => !(key in lang))).toEqual([]);
    }
    expect(STORY_STEPS.every((step) => STEPS.includes(step))).toBe(true);
  });
});
