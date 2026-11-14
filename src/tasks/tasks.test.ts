import { describe, expect, it } from 'vitest';
import tasksJson from '../../data/tasks.json';
import valuesJson from '../../data/values.json';
import type { Env, Values } from '../contracts/index.ts';
import { createInitialState } from '../sim/index.ts';
import { completeTask, nextTask, parseTasks, taskCandidates } from './index.ts';
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
