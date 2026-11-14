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
  launchItemCost,
  outdoorDoseMsvPerHour,
  restUntilNextDay,
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
          // 場所は costRoundTo の倍数に丸めるので、丸めても上限を超える量にする
          items: [
            {
              kind: 'materials',
              quantity: values.launch.capacityKg.value + values.launch.costRoundTo.value,
            },
          ],
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
        // アンテナは最初からはない（くんれんで建てる）
        facility('antenna-test', 'antenna', 20),
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
    // 最初は居住モジュールだけ（アンテナはくんれんで建てる）
    expect(Object.keys(view.facilityStatus)).toHaveLength(1);
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
      values.crew.oxygenKgPerDay.value * (values.eva.maxHours.value / 24) * 0.5;
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

  it('作るのが止まったら何日もつかは、在庫を使う量だけで割る（減っていないときに見せる）', () => {
    const env = fakeEnv();
    const state = createInitialState(values, env, [0, 0]);
    const inside: SimState = { ...state, player: { ...state.player, indoors: true } };
    const view = describeState(inside, values, env);
    expect(view.lifeSupportDaysIfStopped.oxygen).toBeCloseTo(
      inside.stocks.oxygen / (values.crew.oxygenKgPerDay.value * inside.crew.length),
    );
    expect(view.lifeSupportDaysIfStopped.food).toBeCloseTo(
      inside.stocks.food / (values.crew.foodKgPerDay.value * inside.crew.length),
    );
  });

  it('ロケットの場所は荷物ごとに costRoundTo の倍数に丸め、0 にはしない', () => {
    const step = values.launch.costRoundTo.value;
    for (const item of [
      { kind: 'crew', quantity: 1 },
      { kind: 'relaySatellite', quantity: 1 },
      { kind: 'water', quantity: values.launch.bulkOrderStep.value },
      { kind: 'oxygen', quantity: values.launch.bulkOrderStep.value },
      { kind: 'spareParts', quantity: 1 },
    ] as const) {
      const cost = launchItemCost(item, values);
      expect(cost % step).toBe(0);
      expect(cost).toBeGreaterThanOrEqual(step);
    }
  });

  it('翌日へは、次の日の始まりまで刻みを1つずつ回したのと同じ結果になり、届くはずのロケットも届く', () => {
    const env = fakeEnv();
    const initial = createInitialState(values, env, [0, 0]);
    // 外で3時間働いてから中に入り、ロケットを頼んだあと
    const outside = run(initial, env, 3).state;
    const ordered = step(
      { ...outside, commLinked: true },
      0,
      env,
      [
        { type: 'setPlayer', x: outside.player.x, z: outside.player.z, indoors: true },
        { type: 'orderLaunch', items: [{ kind: 'food', quantity: 100 }] },
      ],
      values,
      [],
      rng,
    ).state;
    expect(ordered.launches).toHaveLength(1);

    const rested = restUntilNextDay(ordered, env, values, [], rng);
    expect(rested.state.timeHours).toBe(24);
    expect(rested.state).toEqual(run(ordered, env, 24 - ordered.timeHours).state);

    // 届くまでの日数のぶん翌日へを押すと、ロケットが届く
    let state = rested.state;
    const emitted: GameEvent[] = [...rested.emitted];
    for (let day = 0; day < Math.ceil(values.launch.deliveryDays.value); day++) {
      const next = restUntilNextDay(state, env, values, [], rng);
      state = next.state;
      emitted.push(...next.emitted);
    }
    expect(state.launches).toHaveLength(0);
    expect(emitted.some((e) => e.type === 'launchArrived')).toBe(true);
  });

  it('次に頼めるのは、間隔の日数がたった日の朝から（朝に翌日へで来たら頼める）', () => {
    const env = fakeEnv();
    const initial = { ...createInitialState(values, env, [0, 0]), commLinked: true };
    const later = { ...initial, timeHours: 2.5 };
    const ordered = step(
      later,
      0,
      env,
      [{ type: 'orderLaunch', items: [{ kind: 'food', quantity: 50 }] }],
      values,
      [],
      rng,
    ).state;
    expect(ordered.nextLaunchAtHours).toBe(values.launch.intervalDays.value * 24);
  });

  it('次の注文には、前の注文からタスク（氷を運ぶ・点検・レゴリス）を決まった回数こなす必要がある（最初の注文はいらない）', () => {
    const env = fakeEnv({ isIceAt: () => true });
    const need = values.launch.tasksPerLaunch.value;
    const initial = { ...createInitialState(values, env, [0, 0]), commLinked: true };
    const order: SimCommand = { type: 'orderLaunch', items: [{ kind: 'food', quantity: 50 }] };
    const first = step(initial, 0, env, [order], values, [], rng).state;
    expect(first.launches).toHaveLength(1);
    expect(first.tasksSinceLaunch).toBe(0);
    // 間隔の日数がたっても、報告が足りなければ頼めない
    const later = { ...first, launches: [], timeHours: first.nextLaunchAtHours };
    expect(step(later, 0, env, [order], values, [], rng).state.launches).toHaveLength(0);
    // 氷を持ち帰る（タスク）を決まった回数こなすと、頼める
    const ice: SimCommand = { type: 'collectIce', x: 0, z: 0 };
    const reported = step(
      later,
      0,
      env,
      Array.from({ length: need }, () => ice),
      values,
      [],
      rng,
    ).state;
    expect(reported.tasksSinceLaunch).toBe(need);
    // 通信はアンテナがないと途切れるので、ここでは通じていることにする
    expect(
      step({ ...reported, commLinked: true }, 0, env, [order], values, [], rng).state.launches,
    ).toHaveLength(1);
  });
});
