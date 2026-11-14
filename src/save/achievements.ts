// 実績（docs/SPEC.md「実績」）。条件と文言のキーは data/achievements.json、取ったものは localStorage に保存する。
// 仕様どおり、localStorage が使えない環境でも落ちないよう try/catch で囲み、失敗はコンソールに出す

export const ACHIEVEMENT_CONDITIONS = [
  'buildSolarInShadow',
  'shelterDuringFlare',
  'collectIce',
  // 豆知識カードの条件（docs/SPEC.md ステップ17。実績はない）
  'coverRegolith',
  'firstRest',
] as const;
export type AchievementCondition = (typeof ACHIEVEMENT_CONDITIONS)[number];

export interface Achievement {
  id: string;
  condition: AchievementCondition;
  textKey: string;
}

const STORAGE_KEY = 'lunar-outpost-achievements';

/** data/achievements.json の形を確かめる。形が違えば止める */
export function parseAchievements(json: unknown): Achievement[] {
  if (!Array.isArray(json)) {
    throw new Error('data/achievements.json が配列ではない');
  }
  return json.map((entry: Record<string, unknown>, i): Achievement => {
    const { id, condition, textKey } = entry;
    const known = ACHIEVEMENT_CONDITIONS.find((c) => c === condition);
    if (typeof id !== 'string' || known === undefined || typeof textKey !== 'string') {
      throw new Error(`data/achievements.json の ${i} 件目の形が違う`);
    }
    return { id, condition: known, textKey };
  });
}

function readUnlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : []);
  } catch (error) {
    console.warn('実績を読めない（localStorage が使えないか、壊れている）', error);
    return new Set();
  }
}

export interface AchievementStore {
  /** 条件を満たしたときに呼ぶ。初めて取った実績の id を返す（取り済みなら null） */
  unlock(condition: AchievementCondition): string | null;
}

export function createAchievementStore(achievements: Achievement[]): AchievementStore {
  const unlocked = readUnlocked();
  return {
    unlock(condition) {
      const achievement = achievements.find((a) => a.condition === condition);
      if (achievement === undefined || unlocked.has(achievement.id)) {
        return null;
      }
      unlocked.add(achievement.id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocked]));
      } catch (error) {
        console.warn('実績を保存できない（localStorage が使えないか、いっぱい）', error);
      }
      return achievement.id;
    },
  };
}
