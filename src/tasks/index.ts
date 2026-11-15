// タスク（docs/SPEC.md 追加の仕様 ステップ14）。休息フェーズで翌日のタスクを選び、活動フェーズで現場まで歩いて、
// ミニゲームでこなす。ここは画面に依存しない部分（タスクの定義、候補、こなした印）
import type { Facility, SimCommand, SimState, Values } from '../contracts/index.ts';
import { asHelpTerm, type HelpTerm } from '../help/terms.ts';
import type { MinigameKind } from './minigame.ts';

export const TASK_KINDS = ['ice', 'repair', 'regolith'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
const TARGETS = ['ice', 'facilityNeedsRepair', 'habitatWithoutCover'] as const;
const MINIGAMES: readonly MinigameKind[] = ['timing', 'drag', 'trace'];
// 反映するコマンド（今ある SimCommand だけ。契約は変えない）
const COMMANDS = [
  'collectIce',
  'repair',
  'coverWithRegolith',
] as const satisfies readonly SimCommand['type'][];

/** data/tasks.json の1件。terms：そのタスクで説明する言葉（ことばじてんに足す） */
export interface TaskDef {
  id: TaskKind;
  target: (typeof TARGETS)[number];
  minigame: MinigameKind;
  command: (typeof COMMANDS)[number];
  textKey: string;
  terms: readonly HelpTerm[];
}

/** 選んだタスク。facilityId は点検・レゴリスの相手（氷は null） */
export interface PlannedTask {
  id: string;
  kind: TaskKind;
  facilityId: string | null;
  x: number;
  z: number;
  done: boolean;
}

/** data/tasks.json の形を確かめる。形が違えば止める */
export function parseTasks(json: unknown): TaskDef[] {
  if (!Array.isArray(json)) {
    throw new Error('data/tasks.json が配列ではない');
  }
  const defs = json.map((entry: Record<string, unknown>, i): TaskDef => {
    const bad = () => new Error(`data/tasks.json の ${i} 件目の形が違う`);
    const id = TASK_KINDS.find((k) => k === entry.id);
    const target = TARGETS.find((k) => k === entry.target);
    const minigame = MINIGAMES.find((k) => k === entry.minigame);
    const command = COMMANDS.find((k) => k === entry.command);
    if (
      id === undefined ||
      target === undefined ||
      minigame === undefined ||
      command === undefined ||
      typeof entry.textKey !== 'string' ||
      !Array.isArray(entry.terms)
    ) {
      throw bad();
    }
    const terms = entry.terms.map((term) => asHelpTerm(term, `data/tasks.json の ${id}`));
    return { id, target, minigame, command, textKey: entry.textKey, terms };
  });
  for (const kind of TASK_KINDS) {
    if (defs.filter((d) => d.id === kind).length !== 1) {
      throw new Error(`data/tasks.json に ${kind} がちょうど1件ない`);
    }
  }
  return defs;
}

export function taskDef(defs: readonly TaskDef[], kind: TaskKind): TaskDef {
  const def = defs.find((d) => d.id === kind);
  if (def === undefined) {
    throw new Error(`タスクの定義がない: ${kind}`);
  }
  return def;
}

/** 点検したほうがよい施設か（点検のタスクの候補と、その場の「点検する」） */
export function needsRepair(f: Facility, values: Values): boolean {
  return f.condition < values.player.repairPromptBelowCondition.value;
}

/**
 * 今の基地の様子から、翌日のタスクの候補を出す。
 * 氷：いちばん近い氷の場所（居住モジュールから）。点検：傷んだ施設ごと。レゴリス：まだ盛っていない居住モジュールごと
 */
export function taskCandidates(
  defs: readonly TaskDef[],
  state: SimState,
  values: Values,
  iceSpots: readonly { x: number; z: number }[],
): PlannedTask[] {
  const home = state.facilities.find((f) => f.kind === 'habitat');
  if (home === undefined) {
    throw new Error('居住モジュールが1つもない（最初に1つあり、こわせない）');
  }
  const candidates: PlannedTask[] = [];
  for (const def of defs) {
    switch (def.target) {
      case 'ice': {
        const nearest = [...iceSpots].sort(
          (a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z),
        )[0];
        if (nearest !== undefined) {
          candidates.push({ id: def.id, kind: def.id, facilityId: null, ...nearest, done: false });
        }
        break;
      }
      case 'facilityNeedsRepair':
        for (const f of state.facilities.filter((f) => needsRepair(f, values))) {
          candidates.push({
            id: `${def.id}:${f.id}`,
            kind: def.id,
            facilityId: f.id,
            x: f.x,
            z: f.z,
            done: false,
          });
        }
        break;
      case 'habitatWithoutCover':
        for (const f of state.facilities.filter(
          (f) => f.kind === 'habitat' && f.regolithCover !== true,
        )) {
          candidates.push({
            id: `${def.id}:${f.id}`,
            kind: def.id,
            facilityId: f.id,
            x: f.x,
            z: f.z,
            done: false,
          });
        }
        break;
    }
  }
  return candidates;
}

/** こなしたタスクに印をつける（同じ種類・同じ相手のまだのものを1つ）。選んでいなければそのまま */
export function completeTask(
  plan: readonly PlannedTask[],
  kind: TaskKind,
  facilityId: string | null,
): PlannedTask[] {
  const index = plan.findIndex(
    (task) =>
      !task.done && task.kind === kind && (kind === 'ice' || task.facilityId === facilityId),
  );
  return plan.map((task, i) => (i === index ? { ...task, done: true } : task));
}

/**
 * もう要らなくなったタスクに印をつける。点検：施設が直っている（隊員が直した、その場の「点検する」で直したなど）。
 * レゴリス：もう盛ってある。同じ施設をもう一度やらなくてよいように。施設がなくなっていても印をつける。
 * crewFixed：まだの点検のタスクのうち、施設がもう直っていたもの（プレイヤーが直したものは、その場で印がつくので入らない。
 * main が地球への報告に数える）
 */
export function settleTasks(
  plan: readonly PlannedTask[],
  state: SimState,
  values: Values,
): { plan: readonly PlannedTask[]; crewFixed: PlannedTask[] } {
  const settled = (task: PlannedTask): boolean => {
    if (task.done || task.kind === 'ice') {
      return false;
    }
    const facility = state.facilities.find((f) => f.id === task.facilityId);
    if (facility === undefined) {
      return true;
    }
    return task.kind === 'repair'
      ? !needsRepair(facility, values)
      : facility.regolithCover === true;
  };
  if (!plan.some(settled)) {
    return { plan, crewFixed: [] };
  }
  const crewFixed = plan.filter(
    (task) =>
      settled(task) &&
      task.kind === 'repair' &&
      state.facilities.some((f) => f.id === task.facilityId),
  );
  return { plan: plan.map((task) => (settled(task) ? { ...task, done: true } : task)), crewFixed };
}

/** 次に行くタスク（選んだ順で、まだのもの） */
export function nextTask(plan: readonly PlannedTask[]): PlannedTask | null {
  return plan.find((task) => !task.done) ?? null;
}
