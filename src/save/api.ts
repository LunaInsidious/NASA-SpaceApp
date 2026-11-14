// save/ が外（main.ts、ui/）に見せる型。実装は src/save/index.ts の createSaveStore(values)
import type { SimState } from '../contracts/index.ts';

/** セーブの一覧に出す1件 */
export interface SaveSummary {
  id: string;
  kind: 'auto' | 'manual';
  slot: number; // 手動セーブの枠（0 から）。自動セーブは保存した日
  day: number; // 保存したときのゲーム内の日（着陸の日が 0）
  developmentTotal: number;
}

export interface SaveStore {
  /** ゲーム内の時間が新しい順 */
  list(): SaveSummary[];
  /** id のセーブを読む。なければ例外 */
  load(id: string): SimState;
  /** 自動セーブ。新しいものから values.save.autoSaveDays 件だけ残す */
  autoSave(state: SimState): void;
  manualSave(state: SimState, slot: number): void;
  /** いちばん新しいセーブ。なければ null（初めて遊ぶ） */
  latest(): SimState | null;
}
