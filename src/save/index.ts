// セーブ（docs/SPEC.md ステップ9）。localStorage に保存する。
// 仕様どおり、localStorage が使えない環境でも落ちないよう try/catch で囲み、失敗はコンソールに出す
import type { SimState, Values } from '../contracts/index.ts';
import type { SaveStore, SaveSummary } from './api.ts';

const STORAGE_KEY = 'lunar-outpost-saves';
// SimState の形を変えたら上げる。違う版のセーブは読まない
const SAVE_VERSION = 1;
const HOURS_PER_DAY = 24;

interface StoredSave extends SaveSummary {
  version: number;
  seq: number; // 保存した順番。新しいほど大きい
  state: SimState;
}

function isStoredSave(value: unknown): value is StoredSave {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const save = value as Partial<StoredSave>;
  return (
    save.version === SAVE_VERSION &&
    typeof save.id === 'string' &&
    typeof save.seq === 'number' &&
    typeof save.state === 'object'
  );
}

function readAll(): StoredSave[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn('セーブの形が違うので読まない');
      return [];
    }
    return parsed.filter(isStoredSave);
  } catch (error) {
    console.warn('セーブを読めない（localStorage が使えないか、壊れている）', error);
    return [];
  }
}

function writeAll(saves: StoredSave[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  } catch (error) {
    console.warn('セーブを書けない（localStorage が使えないか、いっぱい）', error);
  }
}

function summarize({ id, kind, slot, day, developmentTotal }: StoredSave): SaveSummary {
  return { id, kind, slot, day, developmentTotal };
}

export function createSaveStore(values: Values): SaveStore {
  const newest = (saves: StoredSave[]) => [...saves].sort((a, b) => b.seq - a.seq);
  const nextSeq = (saves: StoredSave[]) => saves.reduce((max, s) => Math.max(max, s.seq), 0) + 1;
  const entry = (
    saves: StoredSave[],
    state: SimState,
    kind: 'auto' | 'manual',
    slot: number,
  ): StoredSave => {
    const seq = nextSeq(saves);
    return {
      version: SAVE_VERSION,
      id: kind === 'auto' ? `auto-${seq}` : `manual-${slot}`,
      kind,
      slot,
      seq,
      day: Math.floor(state.timeHours / HOURS_PER_DAY),
      developmentTotal: state.development.total,
      state,
    };
  };

  return {
    list: () => newest(readAll()).map(summarize),
    load(id) {
      const found = readAll().find((s) => s.id === id);
      if (found === undefined) {
        throw new Error(`セーブ ${id} がない`);
      }
      return found.state;
    },
    autoSave(state) {
      const saves = readAll();
      const added = entry(saves, state, 'auto', Math.floor(state.timeHours / HOURS_PER_DAY));
      const autos = newest([...saves, added].filter((s) => s.kind === 'auto'));
      const keep = new Set(autos.slice(0, values.save.autoSaveDays.value).map((s) => s.id));
      writeAll([...saves, added].filter((s) => s.kind === 'manual' || keep.has(s.id)));
    },
    manualSave(state, slot) {
      const saves = readAll().filter((s) => !(s.kind === 'manual' && s.slot === slot));
      writeAll([...saves, entry(saves, state, 'manual', slot)]);
    },
    latest() {
      const [first] = newest(readAll());
      return first === undefined ? null : first.state;
    },
  };
}
