import { describe, expect, it } from 'vitest';
import tasksJson from '../../data/tasks.json';
import valuesJson from '../../data/values.json';
import type { Env, Values } from '../contracts/index.ts';
import { createInitialState } from '../sim/index.ts';
import {
  completeTask,
  nextTask,
  parseTasks,
  settleTasks,
  suggestTasks,
  taskCandidates,
} from './index.ts';
import {
  dragFits,
  timingInZone,
  timingPosition,
  timingPress,
  timingResult,
  tracePoints,
  traceResult,
  traceVisit,
} from './minigame.ts';

const values: Values = valuesJson;
const defs = parseTasks(tasksJson);
const env: Env = {
  heightAt: () => 0,
  isSunlit: () => true,
  isEarthVisible: () => true,
  isIceAt: () => false,
  dustFactorAt: () => 1,
};

describe('タスク', () => {
  it('data/tasks.json の3種類（氷・点検・レゴリス）が読める', () => {
    expect(defs.map((d) => d.id).sort()).toEqual(['ice', 'regolith', 'repair']);
  });

  it('候補は、近い氷・傷んだ施設・レゴリスを盛っていない居住モジュールから出る', () => {
    const initial = createInitialState(values, env, [0, 0]);
    const habitat = initial.facilities.find((f) => f.kind === 'habitat');
    if (habitat === undefined) throw new Error('居住モジュールがない');
    const worn = {
      ...initial,
      facilities: initial.facilities.map((f) =>
        f.kind === 'habitat' ? { ...f, condition: 0 } : f,
      ),
    };
    const far = { x: habitat.x + 500, z: habitat.z };
    const near = { x: habitat.x + 50, z: habitat.z };
    const candidates = taskCandidates(defs, worn, values, [far, near]);
    expect(candidates.find((c) => c.kind === 'ice')).toMatchObject(near);
    expect(candidates.some((c) => c.kind === 'repair')).toBe(true);
    expect(candidates.some((c) => c.kind === 'regolith' && c.facilityId === habitat.id)).toBe(true);
    // 傷んでいなければ点検の候補は出ない
    expect(taskCandidates(defs, initial, values, [near]).some((c) => c.kind === 'repair')).toBe(
      false,
    );
  });

  it('こなすと同じ種類・同じ相手のものに印がつき、次のタスクに進む', () => {
    const plan = [
      { id: 'ice', kind: 'ice', facilityId: null, x: 0, z: 0, done: false },
      { id: 'repair:a', kind: 'repair', facilityId: 'a', x: 1, z: 0, done: false },
      { id: 'repair:b', kind: 'repair', facilityId: 'b', x: 2, z: 0, done: false },
    ] as const;
    const afterRepair = completeTask(plan, 'repair', 'b');
    expect(afterRepair.map((t) => t.done)).toEqual([false, false, true]);
    expect(nextTask(afterRepair)?.id).toBe('ice');
    const all = completeTask(completeTask(afterRepair, 'ice', null), 'repair', 'a');
    expect(nextTask(all)).toBeNull();
    // 選んでいないタスクをこなしても、何も変わらない
    expect(completeTask(plan, 'regolith', 'x')).toEqual(plan);
  });

  it('施設がもう直っている・盛ってあるタスクには印がつく（同じ施設を2回やらなくてよい）', () => {
    const initial = createInitialState(values, env, [0, 0]);
    const habitat = initial.facilities.find((f) => f.kind === 'habitat');
    if (habitat === undefined) throw new Error('居住モジュールがない');
    const plan = [
      { id: 'ice', kind: 'ice', facilityId: null, x: 0, z: 0, done: false },
      { id: 'repair', kind: 'repair', facilityId: habitat.id, x: 0, z: 0, done: false },
      { id: 'regolith', kind: 'regolith', facilityId: habitat.id, x: 0, z: 0, done: false },
      { id: 'gone', kind: 'repair', facilityId: 'gone', x: 0, z: 0, done: false },
    ] as const;
    const worn = {
      ...initial,
      facilities: initial.facilities.map((f) =>
        f.id === habitat.id ? { ...f, condition: 0, regolithCover: false } : f,
      ),
    };
    // 傷んでいて、まだ盛っていない：なくなった施設のタスクだけに印（報告には数えない）
    const wornResult = settleTasks(plan, worn, values);
    expect(wornResult.plan.map((t) => t.done)).toEqual([false, false, false, true]);
    expect(wornResult.crewFixed).toEqual([]);
    const fixed = {
      ...initial,
      facilities: initial.facilities.map((f) =>
        f.id === habitat.id ? { ...f, condition: 1, regolithCover: true } : f,
      ),
    };
    const fixedResult = settleTasks(plan, fixed, values);
    expect(fixedResult.plan.map((t) => t.done)).toEqual([false, true, true, true]);
    // 隊員が直した点検だけを、地球への報告に数える
    expect(fixedResult.crewFixed.map((t) => t.id)).toEqual(['repair']);
    // 一度印をつけたら、もう数えない。変わるものがなければ、同じ配列を返す
    const again = settleTasks(fixedResult.plan, fixed, values);
    expect(again.plan).toBe(fixedResult.plan);
    expect(again.crewFixed).toEqual([]);
  });
});

describe('地球管制がすすめる明日のタスク', () => {
  const initial = createInitialState(values, env, [0, 0]);
  const habitat = initial.facilities[0];
  if (habitat === undefined) throw new Error('居住モジュールがない');
  const state = {
    ...initial,
    facilities: [
      { ...habitat, id: 'a', condition: 0.7 },
      { ...habitat, id: 'b', condition: 0.4 },
    ],
  };
  const candidates = [
    { id: 'ice', kind: 'ice', facilityId: null, x: 0, z: 0, done: false },
    { id: 'repair:a', kind: 'repair', facilityId: 'a', x: 0, z: 0, done: false },
    { id: 'repair:b', kind: 'repair', facilityId: 'b', x: 0, z: 0, done: false },
    { id: 'regolith:a', kind: 'regolith', facilityId: 'a', x: 0, z: 0, done: false },
  ] as const;

  it('ふだんは傷みのひどい施設の点検から、決めた数まで', () => {
    expect(suggestTasks(candidates, state, false, 3).map((t) => t.id)).toEqual([
      'repair:b',
      'repair:a',
      'regolith:a',
    ]);
  });

  it('水が足りなくなりそうなら、氷を運ぶのを先にすすめる', () => {
    expect(suggestTasks(candidates, state, true, 2).map((t) => t.id)).toEqual(['ice', 'repair:b']);
  });
});

describe('ミニゲーム', () => {
  it('氷を掘る：帯の中で押すと数え、外すと最初から。決めた回数で成功、時間切れで失敗', () => {
    const period = values.minigame.timingPeriodSec.value;
    // 真ん中に来るのは周期の 1/4
    const center = timingPosition(period / 4, values);
    expect(timingInZone(center, values)).toBe(true);
    expect(timingInZone(timingPosition(0, values), values)).toBe(false);
    let hits = 0;
    for (let i = 0; i < values.minigame.timingHits.value; i++) {
      hits = timingPress(hits, center, values);
    }
    expect(timingResult(hits, 1, values)).toBe('success');
    expect(timingPress(2, 0, values)).toBe(0);
    expect(timingResult(0, values.minigame.timingTimeLimitSec.value, values)).toBe('failed');
  });

  it('フィルター交換：はめる場所の近くで離すとはまる', () => {
    const slot = { x: 0.8, z: 0.5 };
    expect(dragFits({ x: 0.81, z: 0.5 }, slot, values)).toBe(true);
    expect(dragFits({ x: 0.2, z: 0.5 }, slot, values)).toBe(false);
  });

  it('レゴリスを盛る：順になぞると数え、飛ばした山は数えない', () => {
    const points = tracePoints(values);
    expect(points).toHaveLength(values.minigame.tracePoints.value);
    expect(traceVisit(0, points[1], values)).toBe(0);
    let visited = 0;
    for (const point of points) {
      visited = traceVisit(visited, point, values);
    }
    expect(traceResult(visited, 1, values)).toBe('success');
    expect(traceResult(1, values.minigame.traceTimeLimitSec.value, values)).toBe('failed');
  });
});
