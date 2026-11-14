// バランス調整用：決めた操作列で画面なしに回し、発展度の推移を CSV で出す（docs/SPEC.md ステップ2）
// 使い方: node tools/simulate-csv.ts > .scratch/development.csv
import donki from '../data/donki-events.json' with { type: 'json' };
import values from '../data/values.json' with { type: 'json' };
import type { DonkiTimeline, SimCommand, SimState } from '../src/contracts/index.ts';
import { createProceduralEnv } from '../src/env/index.ts';
import { createInitialState, step } from '../src/sim/index.ts';

const SEED = 1;
const DAYS = 60;
const timeline = donki as DonkiTimeline;

/** 決めた操作列：日ごとに送るコマンド。着陸船の近くに太陽電池と蓄電池を建てる */
function plannedCommands(day: number, state: SimState): SimCommand[] {
  const [x, z] = [state.player.x, state.player.z];
  if (day === 1) {
    return [{ type: 'build', kind: 'solar', x: x + 12, z, dustCover: false }];
  }
  if (day === 2) {
    return [{ type: 'build', kind: 'battery', x: x - 12, z, dustCover: false }];
  }
  return [];
}

let a = SEED;
const rng = () => {
  a = (a * 16807) % 2147483647;
  return a / 2147483647;
};

const env = createProceduralEnv(values, SEED);
let state = createInitialState(values, env, env.landerPosition);
const stepHours = values.time.stepHours.value;
const rows = [
  'day,total,selfSufficiency,stability,safety,scale,oxygen,water,food,batteryKwh,phase',
];
let lastDay = -1;
for (let h = 0; h < DAYS * 24 && state.phase !== 'gameOver'; h += stepHours) {
  const day = Math.floor(state.timeHours / 24);
  const commands: SimCommand[] = [
    { type: 'setPlayer', x: state.player.x, z: state.player.z, indoors: true },
    ...(day !== lastDay ? plannedCommands(day, state) : []),
  ];
  if (day !== lastDay) {
    const d = state.development;
    const s = state.stocks;
    rows.push(
      [day, d.total, d.selfSufficiency, d.stability, d.safety, d.scale, s.oxygen, s.water, s.food]
        .map((v) => (typeof v === 'number' ? v.toFixed(2) : v))
        .concat([state.batteryKwh.toFixed(2), state.phase])
        .join(','),
    );
    lastDay = day;
  }
  state = step(state, stepHours, env, commands, values, timeline, rng).state;
}
console.log(rows.join('\n'));
