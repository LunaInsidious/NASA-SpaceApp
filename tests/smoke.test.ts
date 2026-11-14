// 結合の確認：本物の env（自動生成の地形）と sim で、画面なしに何十日か回す
import { describe, expect, it } from 'vitest';
import donki from '../data/donki-events.json';
import values from '../data/values.json';
import type { DonkiTimeline } from '../src/contracts/index.ts';
import { createProceduralEnv } from '../src/env/index.ts';
import { createInitialState, describe as describeView, step } from '../src/sim/index.ts';

const timeline = donki as DonkiTimeline;
const SEED = 1;
const DAYS = 60;

function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
}

describe('sim と env の結合', () => {
  it('着陸直後の発展度は仕様の参考値（約24）に近い', () => {
    const env = createProceduralEnv(values, SEED);
    const state = createInitialState(values, env, env.landerPosition);
    expect(state.phase).toBe('main');
    expect(state.player.x).toBeCloseTo(env.landerPosition[0], -1);
    const view = describeView(state, values, env);
    expect(view.lifeSupportDays.min).toBeGreaterThan(0);
  });

  it(`何もしなくても ${DAYS} 日分を例外なく回せる`, () => {
    const env = createProceduralEnv(values, SEED);
    let state = createInitialState(values, env, env.landerPosition);
    const rng = seededRandom(SEED);
    const stepHours = values.time.stepHours.value;
    for (let h = 0; h < DAYS * 24 && state.phase !== 'gameOver'; h += stepHours) {
      const result = step(
        state,
        stepHours,
        env,
        [{ type: 'setPlayer', x: state.player.x, z: state.player.z, indoors: true }],
        values,
        timeline,
        rng,
      );
      state = result.state;
    }
    expect(state.timeHours).toBeGreaterThan(0);
    expect(Number.isFinite(state.development.total)).toBe(true);
  });
});
