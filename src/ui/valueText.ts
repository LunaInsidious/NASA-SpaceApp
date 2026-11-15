// data/values.json の値を、子どもに読める形で見せる（データの窓と豆知識カードで同じ見せ方にする）
import type { Values } from '../contracts/index.ts';
import { t } from './i18n.ts';

const PERCENT = 100;

export interface ValueEntryLike {
  value: number;
  unit: string;
  source: string;
  url?: string;
}

/** values の中の "a.b.c" の値。なければ作りの誤りなので例外 */
export function valueAt(values: Values, path: string): ValueEntryLike {
  let node: unknown = values;
  for (const part of path.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) {
      throw new Error(`values に ${path} がない`);
    }
    node = (node as Record<string, unknown>)[part];
  }
  return node as ValueEntryLike;
}

/** 数と単位（ratio は % にする）。単位の言葉は i18n の unit.* */
export function valueText(entry: ValueEntryLike): string {
  if (entry.unit === 'ratio') {
    return `${(entry.value * PERCENT).toFixed(0)}%`;
  }
  return t(`unit.${entry.unit}`, { value: String(entry.value) });
}
