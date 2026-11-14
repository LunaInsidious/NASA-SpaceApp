import { describe, expect, it } from 'vitest';
import valuesJson from '../../data/values.json';
import type {
  DonkiTimeline,
  Env,
  Facility,
  GameEvent,
  SimCommand,
  SimState,
  Values,
} from '../contracts/index.ts';
import { computeDevelopment } from './development.ts';
import {
  createInitialState,
  describe as describeState,
  outdoorDoseMsvPerHour,
  step,
} from './index.ts';

const values: Values = valuesJson;
const rng = () => 0.5;
const HOURS = values.time.stepHours.value;

const flares: DonkiTimeline = [
  {
    kind: 'solarFlare',
    donkiId: 'flare-m',
    eventTime: '2024-05-10T14:11Z',
    classOrIntensity: 'M5.9',
    link: 'https://example.com/m',
  },
  {
    kind: 'solarFlare',
    donkiId: 'flare-x',
    eventTime: '2024-05-14T16:51Z',
    classOrIntensity: 'X8.7',
    link: 'https://example.com/x',
  },
];

function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
}

function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    heightAt: () => 0,
    isSunlit: () => true,
    isEarthVisible: () => true,
    isIceAt: () => false,
    dustFactorAt: () => 1,
    ...overrides,
  };
}

function facility(id: string, kind: Facility['kind'], x: number): Facility {
  return { id, kind, x, z: 50, condition: 1, dustCover: false, sunlit: true };
}

/** 決めた時間まで回して、出てきた GameEvent を集める */
function run(
  start: SimState,
  env: Env,
  hours: number,
  commands: () => SimCommand[] = () => [],
): { state: SimState; emitted: GameEvent[] } {
  let state = start;
  const emitted: GameEvent[] = [];
  for (let t = 0; t < hours; t += HOURS) {
    const result = step(state, HOURS, env, commands(), values, [], rng);
    state = result.state;
    emitted.push(...result.emitted);
  }
  return { state, emitted };
}

describe('sim', () => {
  it('着陸直後の発展度は仕様の参考値（約24）に近い', () => {
    const state = createInitialState(values, fakeEnv(), [0, 0]);
    // 最初から居住モジュールとアンテナがある分、安定は上がる。安全は基地の守り 50% と通信なしで 25 になり、合計は約20
    expect(state.development.total).toBeGreaterThan(15);
    expect(state.development.total).toBeLessThan(30);
    expect(state.development.selfSufficiency).toBe(values.development.elementMin.value);
  });

  it('酸素が尽きるとゲームオーバーになる', () => {
    const env = fakeEnv();
    const initial = createInitialState(values, env, [0, 0]);
    // 屋内にいる（基地の酸素で吸う）。屋外ではボンベで吸うので基地の酸素は減らない
    const low: SimState = {
      ...initial,
      stocks: { ...initial.stocks, oxygen: 0.5 },
      player: { ...initial.player, indoors: true },
    };
    const { state, emitted } = run(low, env, 48);
    expect(state.phase).toBe('gameOver');
    expect(emitted).toContainEqual({ type: 'gameOver', reason: 'oxygen' });
  });

  it('1回の打ち上げのコストの上限を超えては頼めない', () => {
    const env = fakeEnv();
    const linked: SimState = { ...createInitialState(values, env, [0, 0]), commLinked: true };
    const tooMuch = step(
      linked,
      HOURS,
      env,
      [
        {
          type: 'orderLaunch',
          items: [{ kind: 'materials', quantity: values.launch.capacityKg.value + 1 }],
        },
      ],
      values,
      [],
      rng,
    );
    expect(tooMuch.state.launches).toHaveLength(0);
    const ok = step(
      linked,
      HOURS,
      env,
      [{ type: 'orderLaunch', items: [{ kind: 'materials', quantity: 100 }] }],
      values,
      [],
      rng,
    );
    expect(ok.state.launches).toHaveLength(1);
  });

  it('中継衛星がないと地球が沈む時期に通信が途切れ、2機あれば途切れない', () => {
    const env = fakeEnv();
    const initial = createInitialState(values, env, [0, 0]);
    const powered: SimState = {
      ...initial,
      batteryKwh: values.facilities.battery.capacityKwh.value,
      facilities: [
        ...initial.facilities,
        facility('solar-test', 'solar', 0),
        facility('battery-test', 'battery', 10),
      ],
      player: { ...initial.player, indoors: true },
    };
    // 地球が沈む時期（周期の後半）に入るまで回す
    const hours = values.comm.earthPeriodDays.value * 24 * 0.6;
    const indoors = (): SimCommand[] => [{ type: 'setPlayer', x: 0, z: 0, indoors: true }];

    const withoutRelay = run(powered, env, hours, indoors);
    expect(withoutRelay.state.commLinked).toBe(false);
    expect(withoutRelay.emitted).toContainEqual({ type: 'commLost' });

    const withRelays = run({ ...powered, relaySatellites: 2 }, env, hours, indoors);
    expect(withRelays.state.commLinked).toBe(true);
    expect(withRelays.emitted).not.toContainEqual({ type: 'commLost' });
  });

  it('何十日か回すと、一覧からランダムに選んだイベントが少なくとも1回始まる', () => {
    const env = fakeEnv();
    const initial = createInitialState(values, env, [0, 0]);
    const plenty = { ...initial.stocks, oxygen: 1000, water: 1000, food: 1000 };
    let state: SimState = { ...initial, stocks: plenty };
    const random = seededRandom(1);
    const started = new Set<string>();
    for (let h = 0; h < 60 * 24; h += HOURS) {
      const known = new Set(state.activeEvents.map((a) => a.donkiId));
      state = step(
        state,
        HOURS,
        env,
        [{ type: 'setPlayer', x: 0, z: 0, indoors: true }],
        values,
        flares,
        random,
      ).state;
      for (const a of state.activeEvents) {
        if (!known.has(a.donkiId)) started.add(a.donkiId);
      }
    }
    expect(started.size).toBeGreaterThan(0);
    for (const id of started) {
      expect(flares.map((f) => f.donkiId)).toContain(id);
    }
  });

  it('線量の倍率は等級で決まり、X は M より強い', () => {
    const env = fakeEnv();
    const initial = createInitialState(values, env, [0, 0]);
    const doseDuring = (classOrIntensity: string) => {
      const during: SimState = {
        ...initial,
        activeEvents: [
          {
            kind: 'solarFlare',
            source: 'archived',
            donkiId: 'd',
            classOrIntensity,
            endsAtHours: 100,
          },
        ],
      };
      const result = step(
        during,
        HOURS,
        env,
        [{ type: 'setPlayer', x: 0, z: 0, indoors: false }],
        values,
        [],
        rng,
      );
      return result.state.crew[0].doseMsv;
    };
    expect(doseDuring('X8.7')).toBeGreaterThan(doseDuring('M5.9'));
    // 警報の窓に出す見込みの量は、実際に外で浴びる量と同じ計算
    const x87 = {
      kind: 'solarFlare',
      source: 'archived',
      donkiId: 'd',
      classOrIntensity: 'X8.7',
      endsAtHours: 100,
    } as const;
    expect(doseDuring('X8.7') - initial.crew[0].doseMsv).toBeCloseTo(
      outdoorDoseMsvPerHour([x87], values) * HOURS,
    );
  });

  it('describe が SimView を埋める', () => {
    const env = fakeEnv();
    const view = describeState(createInitialState(values, env, [0, 0]), values, env);
    expect(view.lifeSupportDays.min).toBeGreaterThanOrEqual(
      values.development.stabilityFullSupplyDays.value,
    );
    expect(view.crew.count).toBe(1);
    expect(Object.keys(view.facilityStatus)).toHaveLength(2);
  });

  it('外でボンベから吸う酸素は中と同じ量で、生命維持の日数は出入りで変わらない', () => {
    const env = fakeEnv();
    const initial = createInitialState(values, env, [0, 0]);
    const outside: SimState = { ...initial, player: { ...initial.player, indoors: false } };
    const inside: SimState = { ...initial, player: { ...initial.player, indoors: true } };
    expect(describeState(outside, values, env).lifeSupportDays.oxygen).toBeCloseTo(
      describeState(inside, values, env).lifeSupportDays.oxygen,
    );
    // 半分になったボンベを中で満たすと、半日ぶんではなく「ボンベの時間の半分」に吸う量を在庫から引く
    const halfTank: SimState = { ...inside, player: { ...inside.player, tankOxygen: 0.5 } };
    const result = step(
      halfTank,
      HOURS,
      env,
      [{ type: 'setPlayer', x: 0, z: 0, indoors: true }],
      values,
      [],
      rng,
    );
    const breathedFromTank =
      values.crew.oxygenKgPerDay.value * (values.player.tankDurationHours.value / 24) * 0.5;
    const crewBreathing = values.crew.oxygenKgPerDay.value * (HOURS / 24);
    expect(halfTank.stocks.oxygen - result.state.stocks.oxygen).toBeCloseTo(
      breathedFromTank + crewBreathing,
    );
  });

  it('安全は、基地の守りと、直近の日々に地球と通信できていた時間の割合で上がる', () => {
    const env = fakeEnv();
    const initial = createInitialState(values, env, [0, 0]);
    const day = (commHours: number) => ({
      day: 0,
      produced: { oxygen: 0, water: 0, food: 0, power: 0 },
      consumed: { oxygen: 0, water: 0, food: 0, power: 0 },
      minBatteryRatio: 1,
      research: 0,
      downedCount: 0,
      commHours,
    });
    const input = {
      currentBatteryRatio: 1,
      lifeSupportDays: 10,
      averageCondition: 1,
      commLinkedNow: false,
    };
    const safety = (indoorProtection: number, commHours: number) =>
      computeDevelopment(
        initial,
        { ...input, indoorProtection, completed: [day(commHours), day(commHours)] },
        values,
      ).safety;
    // 守り 50%・通信なし → 25、守り 50%・半日通信 → 50、守り 90%・ずっと通信 → 95
    expect(safety(0.5, 0)).toBeCloseTo(25);
    expect(safety(0.5, 12)).toBeCloseTo(50);
    expect(safety(0.9, 24)).toBeCloseTo(95);
  });
});
