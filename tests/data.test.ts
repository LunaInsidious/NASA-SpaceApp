import { describe, expect, it } from 'vitest';
import achievements from '../data/achievements.json';
import missions from '../data/missions.json';
import nasaImages from '../data/nasa-images.json';
import values from '../data/values.json';
import en from '../i18n/en.json';
import ja from '../i18n/ja.json';
import type { ValueEntry } from '../src/contracts/index.ts';
import { parseAchievements } from '../src/save/achievements.ts';
import { parseMissions, STEPS } from '../src/tutorial/index.ts';
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
