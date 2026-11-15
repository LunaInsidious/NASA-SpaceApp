// sim の入口。step と、main.ts・ui/ が使う計算（docs/SPEC.md の決定済みのゲーム仕様）
import type {
  ActiveEvent,
  CrewMember,
  DailyRecord,
  DonkiTimeline,
  Env,
  Facility,
  FacilityKind,
  GameEvent,
  LaunchItem,
  LaunchItemKind,
  ResourceKey,
  SimCommand,
  SimState,
  Step,
  Values,
} from '../contracts/index.ts';
import type { BuildCost, BuildOptions, CommLostReason, Placement, SimView } from './api.ts';
import { computeDevelopment } from './development.ts';
import { type Evaluation, evaluate, evaluateComm, isEarthUp, sunlitAt } from './model.ts';

const HOURS_PER_DAY = 24;
const EPSILON = 1e-9;
const LIFE_RESOURCES = ['oxygen', 'water', 'food'] as const;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emptyRecord(day: number): DailyRecord {
  const zero = (): Record<ResourceKey, number> => ({ oxygen: 0, water: 0, food: 0, power: 0 });
  return {
    day,
    produced: zero(),
    consumed: zero(),
    minBatteryRatio: 1,
    research: 0,
    downedCount: 0,
    commHours: 0,
  };
}

function sunAzimuth(timeHours: number, values: Values): number {
  const periodHours = values.moon.sunPeriodDays.value * HOURS_PER_DAY;
  return ((2 * Math.PI * timeHours) / periodHours) % (2 * Math.PI);
}

function playerOf(state: SimState): CrewMember {
  const player = state.crew.find((c) => c.isPlayer);
  if (player === undefined) {
    throw new Error('隊員にプレイヤーがいない');
  }
  return player;
}

function batteryRatio(state: SimState, evaluation: Evaluation): number {
  return evaluation.batteryCapacityKwh > 0 ? state.batteryKwh / evaluation.batteryCapacityKwh : 0;
}

function averageCondition(state: SimState): number {
  if (state.facilities.length === 0) return 0;
  return state.facilities.reduce((sum, f) => sum + f.condition, 0) / state.facilities.length;
}

function lifeSupportDays(state: SimState, evaluation: Evaluation, values: Values) {
  const maxDays = values.display.maxLifeSupportDays.value;
  const p = evaluation.perDay;
  const days = (stock: number, drainPerDay: number) =>
    drainPerDay > EPSILON ? Math.min(maxDays, Math.max(0, stock / drainPerDay)) : maxDays;
  const oxygen = days(state.stocks.oxygen, p.crewOxygen + p.tankOxygen - p.lifeSupportOxygen);
  const water = days(
    state.stocks.water,
    p.crewWater + p.lifeSupportWater + p.greenhouseWater - p.drillWater,
  );
  const food = days(state.stocks.food, p.crewFood - p.greenhouseFood);
  return { oxygen, water, food, min: Math.min(oxygen, water, food) };
}

/** 作るのが止まったら（生命維持装置・氷の採掘機・栽培室）、いまの在庫であと何日もつか */
function lifeSupportDaysIfStopped(state: SimState, evaluation: Evaluation, values: Values) {
  const maxDays = values.display.maxLifeSupportDays.value;
  const p = evaluation.perDay;
  const days = (stock: number, usePerDay: number) =>
    usePerDay > EPSILON ? Math.min(maxDays, Math.max(0, stock / usePerDay)) : maxDays;
  const oxygen = days(state.stocks.oxygen, p.crewOxygen + p.tankOxygen);
  const water = days(state.stocks.water, p.crewWater + p.lifeSupportWater + p.greenhouseWater);
  const food = days(state.stocks.food, p.crewFood);
  return { oxygen, water, food, min: Math.min(oxygen, water, food) };
}

function developmentOf(
  state: SimState,
  completed: DailyRecord[],
  evaluation: Evaluation,
  values: Values,
): SimState['development'] {
  return computeDevelopment(
    state,
    {
      completed,
      currentBatteryRatio: batteryRatio(state, evaluation),
      lifeSupportDays: lifeSupportDays(state, evaluation, values).min,
      averageCondition: averageCondition(state),
      indoorProtection: evaluation.indoorProtection,
      commLinkedNow: state.commLinked,
    },
    values,
  );
}

function canOrderNow(state: SimState, values: Values): boolean {
  return (
    state.phase !== 'gameOver' &&
    state.commLinked &&
    state.timeHours >= state.nextLaunchAtHours &&
    state.tasksSinceLaunch >= values.launch.tasksPerLaunch.value
  );
}

function crewCapacityOf(state: SimState, values: Values): number {
  const beds =
    state.facilities.filter((f) => f.kind === 'habitat').length *
    values.facilities.habitat.crewCapacity.value;
  return Math.min(beds, values.crew.maxCount.value);
}

function newFacility(
  kind: FacilityKind,
  x: number,
  z: number,
  options: BuildOptions,
  state: SimState,
  values: Values,
  env: Env,
): Facility {
  const facility: Facility = {
    id: `${kind}-${Math.round(state.timeHours)}-${Math.round(x)}-${Math.round(z)}`,
    kind,
    x,
    z,
    condition: 1,
    dustCover: options.dustCover,
    sunlit: sunlitAt(env, x, z, state.sunAzimuthRad, values),
  };
  if (kind === 'shield') facility.shieldMaterial = options.shieldMaterial ?? 'regolith';
  if (kind === 'habitat') facility.regolithCover = false;
  return facility;
}

/** 着陸直後の状態。landerPosition は着陸船の位置 [x, z] */
export function createInitialState(
  values: Values,
  env: Env,
  landerPosition: [number, number],
): SimState {
  const s = values.start;
  const [landerX, landerZ] = landerPosition;
  const state: SimState = {
    timeHours: 0,
    sunAzimuthRad: 0,
    stocks: {
      oxygen: s.oxygenKg.value,
      water: s.waterKg.value,
      food: s.foodKg.value,
      spareParts: s.spareParts.value,
      materials: s.materialsKg.value,
    },
    batteryKwh: 0,
    facilities: [],
    crew: [{ id: 'player', isPlayer: true, task: null, doseMsv: 0 }],
    player: {
      x: landerX + s.playerOffsetX.value,
      z: landerZ + s.playerOffsetZ.value,
      tankOxygen: 1,
      indoors: false,
      downed: false,
    },
    history: [emptyRecord(0)],
    development: { selfSufficiency: 0, stability: 0, safety: 0, scale: 0, total: 0, best: 0 },
    activeEvents: [],
    launches: [],
    nextLaunchAtHours: 0,
    tasksSinceLaunch: values.launch.tasksPerLaunch.value,
    relaySatellites: 0,
    commLinked: false,
    unsentResearch: 0,
    phase: 'main',
  };
  const noCover: BuildOptions = { dustCover: false };
  state.facilities.push(
    newFacility(
      'habitat',
      landerX + s.habitatOffsetX.value,
      landerZ + s.habitatOffsetZ.value,
      noCover,
      state,
      values,
      env,
    ),
  );
  const evaluation = evaluate(state, values, env, values.time.stepHours.value);
  state.commLinked = evaluateComm(state, evaluation, values, env).linked;
  state.development = developmentOf(state, [], evaluation, values);
  return state;
}

export function buildCost(kind: FacilityKind, options: BuildOptions, values: Values): BuildCost {
  const fv = values.facilities;
  let materials: number;
  let energyKwh: number;
  if (kind === 'shield') {
    materials =
      options.shieldMaterial === 'water'
        ? fv.shield.waterFrameMaterialsKg.value
        : fv.shield.regolithMaterialsKg.value;
    energyKwh = fv.shield.buildEnergyKwh.value;
  } else {
    materials = fv[kind].buildMaterialsKg.value;
    energyKwh = fv[kind].buildEnergyKwh.value;
  }
  if (options.dustCover) {
    materials *= fv.dustCover.materialsMultiplier.value;
    energyKwh += fv.dustCover.extraEnergyKwh.value;
  }
  return { materials, energyKwh };
}

/** 荷物1行ぶん（quantity 込み）のコスト。コスト ＝ max(実際の重さ, 大きさを重さに換算した値) */
export function launchItemCost(item: LaunchItem, values: Values): number {
  const lv = values.launch;
  const volumetric = lv.volumetricKgPerM3.value;
  let unitCost: number;
  if (item.kind === 'facilityKit') {
    if (item.facilityKind === undefined) {
      throw new Error('facilityKit には facilityKind が必要');
    }
    const mass =
      buildCost(item.facilityKind, { dustCover: false }, values).materials *
      lv.items.facilityKit.massPerMaterialKg.value;
    unitCost = Math.max(mass, lv.items.facilityKit.volumeM3.value * volumetric);
  } else {
    const spec = lv.items[item.kind];
    unitCost = Math.max(spec.massKg.value, spec.volumeM3.value * volumetric);
  }
  // 荷物ごとに、きりのよい数（costRoundTo の倍数）に丸める。画面とメーターと注文の判定は、この同じ数を使う。
  // 荷物があるなら、少なくとも1単位は使う（0 にならない）
  const step = lv.costRoundTo.value;
  return Math.max(step, Math.round((unitCost * item.quantity) / step) * step);
}

export function checkPlacement(
  state: SimState,
  kind: FacilityKind,
  x: number,
  z: number,
  options: BuildOptions,
  values: Values,
  env: Env,
): Placement {
  const cost = buildCost(kind, options, values);
  if (state.stocks.materials < cost.materials) {
    return { allowed: false, works: false, reason: 'notEnoughMaterials' };
  }
  const waterReserve =
    state.crew.length *
    values.crew.waterKgPerDay.value *
    values.facilities.shield.waterReserveDays.value;
  if (
    kind === 'shield' &&
    options.shieldMaterial === 'water' &&
    state.stocks.water - values.facilities.shield.waterKg.value < waterReserve
  ) {
    return { allowed: false, works: false, reason: 'notEnoughMaterials' };
  }
  const spacing = values.facilities.common.minSpacingMeters.value;
  if (state.facilities.some((f) => Math.hypot(f.x - x, f.z - z) < spacing)) {
    return { allowed: false, works: false, reason: 'tooClose' };
  }
  const lit = sunlitAt(env, x, z, state.sunAzimuthRad, values);
  if (kind === 'iceDrill') {
    if (!env.isIceAt(x, z)) return { allowed: false, works: false, reason: 'noIce' };
    if (lit) return { allowed: false, works: false, reason: 'needsShadow' };
    return { allowed: true, works: true, reason: null };
  }
  if (kind === 'solar' && !lit) return { allowed: true, works: false, reason: 'noSunlight' };
  if (kind === 'antenna' && !env.isEarthVisible(x, z)) {
    return { allowed: true, works: false, reason: 'noEarth' };
  }
  return { allowed: true, works: true, reason: null };
}

function addPlayerOutdoorDose(state: SimState, hours: number, values: Values): void {
  playerOf(state).doseMsv += outdoorDoseMsvPerHour(state.activeEvents, values) * hours;
}

function countItems(items: LaunchItem[], kind: LaunchItemKind): number {
  return items.filter((i) => i.kind === kind).reduce((sum, i) => sum + i.quantity, 0);
}

function orderLaunch(state: SimState, items: LaunchItem[], values: Values): void {
  if (!canOrderNow(state, values) || items.length === 0) return;
  if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity <= 0)) return;
  if (items.some((i) => i.kind === 'facilityKit' && i.facilityKind === undefined)) return;
  const totalCost = items.reduce((sum, i) => sum + launchItemCost(i, values), 0);
  if (totalCost > values.launch.capacityKg.value + EPSILON) return;
  const inFlight = state.launches.flatMap((l) => l.items);
  const newCrew = countItems(items, 'crew');
  if (
    newCrew > 0 &&
    state.crew.length + countItems(inFlight, 'crew') + newCrew > crewCapacityOf(state, values)
  ) {
    return;
  }
  const relays =
    state.relaySatellites +
    countItems(inFlight, 'relaySatellite') +
    countItems(items, 'relaySatellite');
  if (relays > values.comm.maxRelaySatellites.value) return;
  state.launches.push({
    id: `launch-${Math.round(state.timeHours)}`,
    items: clone(items),
    totalCost,
    arrivesAtHours: state.timeHours + values.launch.deliveryDays.value * HOURS_PER_DAY,
  });
  // 次に頼めるのは、間隔の日数がたった日の朝から（「翌日へ」で朝にしたのに「あと0.1日」で頼めない、とならないように）
  const ready = state.timeHours + values.launch.intervalDays.value * HOURS_PER_DAY;
  state.nextLaunchAtHours = Math.floor(ready / HOURS_PER_DAY + EPSILON) * HOURS_PER_DAY;
  // 地球への報告は、次の注文のために数え直す
  state.tasksSinceLaunch = 0;
}

function deliver(state: SimState, items: LaunchItem[], values: Values): void {
  for (const item of items) {
    switch (item.kind) {
      case 'oxygen':
      case 'water':
      case 'food':
      case 'spareParts':
      case 'materials':
        state.stocks[item.kind] += item.quantity;
        break;
      case 'facilityKit':
        if (item.facilityKind === undefined) {
          throw new Error('facilityKit には facilityKind が必要');
        }
        // TODO(人間に確認): 契約にキットの置き場がないので、その施設の建設コスト分の資材として届ける
        state.stocks.materials +=
          buildCost(item.facilityKind, { dustCover: false }, values).materials * item.quantity;
        break;
      case 'crew':
        for (let i = 0; i < item.quantity; i++) {
          state.crew.push({
            id: `crew-${Math.round(state.timeHours)}-${state.crew.length}`,
            isPlayer: false,
            task: 'research',
            doseMsv: 0,
          });
        }
        break;
      case 'relaySatellite':
        state.relaySatellites = Math.min(
          values.comm.maxRelaySatellites.value,
          state.relaySatellites + item.quantity,
        );
        break;
    }
  }
}

function applyCommand(
  state: SimState,
  command: SimCommand,
  values: Values,
  env: Env,
  today: DailyRecord,
): void {
  switch (command.type) {
    case 'setPlayer':
      state.player.x = command.x;
      state.player.z = command.z;
      state.player.indoors = command.indoors;
      return;
    case 'build': {
      const options: BuildOptions = {
        dustCover: command.dustCover,
        shieldMaterial: command.shieldMaterial,
      };
      const placement = checkPlacement(
        state,
        command.kind,
        command.x,
        command.z,
        options,
        values,
        env,
      );
      if (!placement.allowed) return;
      const cost = buildCost(command.kind, options, values);
      state.stocks.materials -= cost.materials;
      state.batteryKwh = Math.max(0, state.batteryKwh - cost.energyKwh);
      if (command.kind === 'shield' && command.shieldMaterial === 'water') {
        const water = values.facilities.shield.waterKg.value;
        state.stocks.water -= water;
        today.consumed.water += water;
      }
      state.facilities.push(
        newFacility(command.kind, command.x, command.z, options, state, values, env),
      );
      return;
    }
    case 'demolish': {
      const index = state.facilities.findIndex((f) => f.id === command.facilityId);
      if (index < 0) return;
      const [removed] = state.facilities.splice(index, 1);
      const refund = buildCost(
        removed.kind,
        { dustCover: removed.dustCover, shieldMaterial: removed.shieldMaterial },
        values,
      ).materials;
      state.stocks.materials += refund * values.facilities.common.demolishRefundRatio.value;
      return;
    }
    case 'repair': {
      const facility = state.facilities.find((f) => f.id === command.facilityId);
      if (facility === undefined) return;
      const parts = (1 - facility.condition) * values.maintenance.sparePartsPerFullRepair.value;
      if (parts <= EPSILON || state.stocks.spareParts < parts) return;
      state.stocks.spareParts -= parts;
      facility.condition = 1;
      addPlayerOutdoorDose(state, values.player.repairDoseHours.value, values);
      state.tasksSinceLaunch += 1;
      return;
    }
    case 'coverWithRegolith': {
      const habitat = state.facilities.find((f) => f.id === command.facilityId);
      if (habitat === undefined || habitat.kind !== 'habitat' || habitat.regolithCover === true) {
        return;
      }
      habitat.regolithCover = true;
      addPlayerOutdoorDose(state, values.player.regolithCoverDoseHours.value, values);
      state.tasksSinceLaunch += 1;
      return;
    }
    case 'assignCrew': {
      const member = state.crew.find((c) => c.id === command.crewId);
      if (member === undefined || member.isPlayer) return;
      member.task = command.task;
      return;
    }
    case 'orderLaunch':
      orderLaunch(state, command.items, values);
      return;
    case 'collectIce': {
      // (x, z) で取った氷を、居住モジュールに持ち帰って届けた（main が持ち帰ったときに送る）
      if (!env.isIceAt(command.x, command.z)) return;
      const kg = values.player.iceKgPerTrip.value;
      state.stocks.water += kg;
      today.produced.water += kg;
      state.tasksSinceLaunch += 1;
      return;
    }
    case 'reportTask':
      // 今日のタスクに選んだ施設を、隊員が先に直した（main が送る）。プレイヤーがこなしたのと同じに数える
      state.tasksSinceLaunch += 1;
      return;
  }
}

/** イベント1件の線量の倍率。フレアは等級の先頭の文字（C/M/X）で、SEP は別の倍率 */
function eventMultiplier(
  event: Pick<ActiveEvent, 'kind' | 'classOrIntensity'>,
  values: Values,
): number {
  const ev = values.events;
  if (event.kind === 'sep') return ev.sepMultiplier.value;
  switch (event.classOrIntensity.charAt(0).toUpperCase()) {
    case 'C':
      return ev.flareMultiplierC.value;
    case 'M':
      return ev.flareMultiplierM.value;
    case 'X':
      return ev.flareMultiplierX.value;
    default:
      throw new Error(`フレアの等級が C/M/X のどれでもない: ${event.classOrIntensity}`);
  }
}

/** 今起きているイベントのうち一番強いものの倍率（なければ 1） */
function activeMultiplier(active: ActiveEvent[], values: Values): number {
  return active.reduce((m, a) => Math.max(m, eventMultiplier(a, values)), 1);
}

/** 屋外での1時間あたりの線量。active はそのとき起きているイベント（警報の窓で、これから浴びる量を見せるのにも使う） */
export function outdoorDoseMsvPerHour(active: ActiveEvent[], values: Values): number {
  return (values.moon.radiationMsvPerDay.value / HOURS_PER_DAY) * activeMultiplier(active, values);
}

/**
 * 活動中のイベントがなければ、平均 meanIntervalDays に1回の割合で、一覧から1件をランダムに選んで始める。
 * 記憶のないランダムなので、同じイベントが続けて選ばれてもよい
 */
function maybeStartEvent(
  state: SimState,
  timeline: DonkiTimeline,
  dtHours: number,
  startHours: number,
  values: Values,
  rng: () => number,
): ActiveEvent | null {
  if (state.activeEvents.length > 0 || timeline.length === 0) return null;
  const chance = dtHours / (values.events.meanIntervalDays.value * HOURS_PER_DAY);
  if (rng() >= chance) return null;
  const donki = timeline[Math.min(timeline.length - 1, Math.floor(rng() * timeline.length))];
  const duration =
    donki.kind === 'sep'
      ? values.events.sepDurationHours.value
      : values.events.flareDurationHours.value;
  return {
    kind: donki.kind,
    source: 'archived',
    donkiId: donki.donkiId,
    classOrIntensity: donki.classOrIntensity,
    endsAtHours: startHours + duration,
  };
}

function maintain(state: SimState, values: Values, dayFraction: number): void {
  const workers = state.crew.filter((c) => c.task === 'maintenance').length;
  let budget = workers * values.maintenance.conditionPerPersonDay.value * dayFraction;
  const partsPerFull = values.maintenance.sparePartsPerFullRepair.value;
  const byCondition = [...state.facilities].sort((a, b) => a.condition - b.condition);
  for (const facility of byCondition) {
    if (budget <= EPSILON) break;
    const affordable = state.stocks.spareParts / partsPerFull;
    const amount = Math.min(budget, 1 - facility.condition, affordable);
    if (amount <= EPSILON) continue;
    facility.condition += amount;
    state.stocks.spareParts -= amount * partsPerFull;
    budget -= amount;
  }
}

function longestWindowDays(values: Values): number {
  const dv = values.development;
  return Math.max(
    dv.selfSufficiencyWindowDays.value,
    dv.stabilityBatteryWindowDays.value,
    dv.safetyCommWindowDays.value,
    dv.scaleResearchWindowDays.value,
  );
}

export const step: Step = (prev, dtHours, env, commands, values, events, rng) => {
  if (prev.phase === 'gameOver') return { state: prev, emitted: [] };
  const state = clone(prev);
  const emitted: GameEvent[] = [];
  const today = () => state.history[state.history.length - 1];

  for (const command of commands) {
    applyCommand(state, command, values, env, today());
  }

  const t0 = state.timeHours;
  const t1 = t0 + dtHours;
  const dayFraction = dtHours / HOURS_PER_DAY;
  const before = evaluate(state, values, env, dtHours).status;
  state.timeHours = t1;
  state.sunAzimuthRad = sunAzimuth(t1, values);

  // 施設の動き。止まった瞬間を知らせる
  const evaluation = evaluate(state, values, env, dtHours);
  for (const facility of state.facilities) {
    facility.sunlit = evaluation.sunlit[facility.id];
  }

  // 電力と蓄電池
  const record = today();
  state.batteryKwh = Math.min(
    evaluation.batteryCapacityKwh,
    Math.max(0, state.batteryKwh + (evaluation.generationKw - evaluation.consumptionKw) * dtHours),
  );
  record.produced.power += evaluation.generationKw * dtHours;
  record.consumed.power += evaluation.consumptionKw * dtHours;
  record.minBatteryRatio = Math.min(record.minBatteryRatio, batteryRatio(state, evaluation));

  // 物資：隊員の消費と、施設の生産・消費
  const p = evaluation.perDay;
  const flow = (
    key: 'oxygen' | 'water' | 'food',
    producedPerDay: number,
    consumedPerDay: number,
  ) => {
    const produced = producedPerDay * dayFraction;
    const consumed = consumedPerDay * dayFraction;
    state.stocks[key] += produced - consumed;
    record.produced[key] += produced;
    record.consumed[key] += consumed;
  };
  flow('oxygen', p.lifeSupportOxygen, p.crewOxygen);
  flow('water', p.drillWater, p.crewWater + p.lifeSupportWater + p.greenhouseWater);
  flow('food', p.greenhouseFood, p.crewFood);

  // 劣化と、点検担当の自動の点検
  for (const facility of state.facilities) {
    const rate = values.facilities[facility.kind].degradationPerDay.value;
    const cover = facility.dustCover ? values.facilities.dustCover.degradationMultiplier.value : 1;
    facility.condition = Math.max(
      0,
      facility.condition - rate * dayFraction * env.dustFactorAt(facility.x, facility.z) * cover,
    );
  }
  maintain(state, values, dayFraction);

  // 止まった瞬間を知らせる。この刻みの劣化と蓄電池の減りを入れたあとで比べる
  const after = evaluate(state, values, env, dtHours).status;
  for (const facility of state.facilities) {
    const was = before[facility.id];
    const now = after[facility.id];
    if (was?.working === true && !now.working) {
      const reason = now.reason;
      if (reason === 'shadow' || reason === 'condition' || reason === 'noPower') {
        emitted.push({ type: 'facilityStopped', facilityId: facility.id, reason });
      }
    }
  }

  // 通信
  const comm = evaluateComm(state, evaluation, values, env);
  if (comm.linked !== prev.commLinked) {
    emitted.push({ type: comm.linked ? 'commRestored' : 'commLost' });
  }
  state.commLinked = comm.linked;
  if (state.commLinked) {
    record.commHours += dtHours;
  }

  // 研究。通じていれば送れて発展度に入る
  const researchers = state.crew.filter((c) => c.task === 'research').length;
  const researched = researchers * values.research.perPersonDay.value * dayFraction;
  if (state.commLinked) {
    record.research += researched + state.unsentResearch;
    state.unsentResearch = 0;
  } else {
    state.unsentResearch += researched;
  }

  // 打ち上げの到着
  const arrived = state.launches.filter((l) => l.arrivesAtHours <= t1);
  state.launches = state.launches.filter((l) => l.arrivesAtHours > t1);
  for (const launch of arrived) {
    deliver(state, launch.items, values);
    emitted.push({ type: 'launchArrived', launchId: launch.id });
  }

  // 宇宙天気。過去の実際のイベントの一覧からランダムに起こす。通じていなければ警報は届かない
  const started = maybeStartEvent(state, events, dtHours, t0, values, rng);
  if (started !== null) {
    state.activeEvents.push(started);
    if (state.commLinked) emitted.push({ type: 'eventStarted', event: started });
  }

  // 被ばく。プレイヤー以外の隊員は屋内にいる
  const duringEvent = state.activeEvents.length > 0;
  const outdoorDose = outdoorDoseMsvPerHour(state.activeEvents, values) * dtHours;
  const indoorDose = outdoorDose * (1 - evaluation.indoorProtection);
  const player = playerOf(state);
  const playerDoseBefore = player.doseMsv;
  for (const member of state.crew) {
    const outdoors = member.isPlayer && !state.player.indoors;
    member.doseMsv += outdoors ? outdoorDose : indoorDose;
  }
  state.activeEvents = state.activeEvents.filter((a) => a.endsAtHours > t1);

  // ボンベと、倒れたとき
  let downed: 'tankEmpty' | 'radiation' | null = null;
  if (state.player.indoors) {
    // ボンベが空から満タンになる量 ＝ ボンベがもつ時間に、1人が吸う酸素
    const fullTankKg =
      values.crew.oxygenKgPerDay.value * (values.eva.maxHours.value / HOURS_PER_DAY);
    const refill = (1 - state.player.tankOxygen) * fullTankKg;
    state.stocks.oxygen -= refill;
    record.consumed.oxygen += refill;
    state.player.tankOxygen = 1;
  } else {
    state.player.tankOxygen = Math.max(
      0,
      state.player.tankOxygen - dtHours / values.eva.maxHours.value,
    );
    const acute = values.player.acuteDoseMsv.value;
    if (state.player.tankOxygen <= 0) {
      downed = 'tankEmpty';
    } else if (
      duringEvent &&
      Math.floor(playerDoseBefore / acute) < Math.floor(player.doseMsv / acute)
    ) {
      downed = 'radiation';
    }
  }
  if (downed !== null) {
    emitted.push({ type: 'playerDowned', reason: downed });
    record.downedCount += 1;
    // 着陸船のそばの居住モジュールで目を覚ます
    const home = state.facilities.find((f) => f.kind === 'habitat');
    if (home !== undefined) {
      state.player.x = home.x;
      state.player.z = home.z;
    }
    state.player.indoors = true;
    state.player.tankOxygen = 1;
    state.player.downed = false;
  }

  // 日が変わったら発展度を計算する
  if (Math.floor(t1 / HOURS_PER_DAY) > Math.floor(t0 / HOURS_PER_DAY)) {
    const previousTotal = state.development.total;
    state.development = developmentOf(state, state.history, evaluation, values);
    state.history.push(emptyRecord(Math.floor(t1 / HOURS_PER_DAY)));
    state.history = state.history.slice(-(longestWindowDays(values) + 1));
    if (Math.abs(state.development.total - previousTotal) > EPSILON) {
      emitted.push({ type: 'developmentChanged', total: state.development.total });
    }
    if (
      state.phase === 'main' &&
      state.development.total >= values.development.clearThreshold.value
    ) {
      state.phase = 'cleared';
      emitted.push({ type: 'cleared' });
    }
  }

  for (const key of LIFE_RESOURCES) {
    if (state.stocks[key] <= 0) {
      state.stocks[key] = 0;
      state.phase = 'gameOver';
      emitted.push({ type: 'gameOver', reason: key });
      break;
    }
  }

  return { state, emitted };
};

/**
 * 休息フェーズの「翌日へ」：次の日の始まり（24時間の区切り）まで、屋内で step を固定の刻みで回して一気に進める。
 * 刻みを1つずつ回したのと同じ結果になる。ゲームオーバーになったらそこで止める
 */
export function restUntilNextDay(
  prev: SimState,
  env: Env,
  values: Values,
  events: DonkiTimeline,
  rng: () => number,
): { state: SimState; emitted: GameEvent[] } {
  const target = (Math.floor(prev.timeHours / HOURS_PER_DAY + EPSILON) + 1) * HOURS_PER_DAY;
  const stepHours = values.time.stepHours.value;
  let state = prev;
  const emitted: GameEvent[] = [];
  while (state.timeHours < target - EPSILON && state.phase !== 'gameOver') {
    const commands: SimCommand[] = state.player.indoors
      ? []
      : [{ type: 'setPlayer', x: state.player.x, z: state.player.z, indoors: true }];
    const result = step(
      state,
      Math.min(stepHours, target - state.timeHours),
      env,
      commands,
      values,
      events,
      rng,
    );
    state = result.state;
    emitted.push(...result.emitted);
  }
  return { state, emitted };
}

/** 地球と話せない理由。理由ごとに「やること」が違うので、画面で分けて見せる */
export function commLostReason(state: SimState, view: SimView): CommLostReason {
  const antennas = state.facilities.filter((f) => f.kind === 'antenna');
  if (antennas.length === 0) {
    return 'noAntenna';
  }
  const reasons = antennas.map((f) => view.facilityStatus[f.id].reason);
  if (reasons.every((r) => r === 'noPower' || r === 'condition')) {
    return 'noPower';
  }
  if (!view.comm.earthUp) {
    return 'earthDown';
  }
  return 'blocked';
}

export function describe(state: SimState, values: Values, env: Env): SimView {
  const evaluation = evaluate(state, values, env, values.time.stepHours.value);
  const comm = evaluateComm(state, evaluation, values, env);
  const byTask = { maintenance: 0, research: 0, farming: 0 };
  for (const member of state.crew) {
    if (member.task !== null) byTask[member.task] += 1;
  }
  const facilityStatus: SimView['facilityStatus'] = {};
  for (const facility of state.facilities) {
    const status = evaluation.status[facility.id];
    facilityStatus[facility.id] =
      facility.kind === 'antenna' && status.working && !(comm.direct || comm.relay)
        ? { working: false, reason: 'noEarth' }
        : { working: status.working, reason: status.reason };
  }
  return {
    day: state.timeHours / HOURS_PER_DAY,
    lifeSupportDays: lifeSupportDays(state, evaluation, values),
    lifeSupportDaysIfStopped: lifeSupportDaysIfStopped(state, evaluation, values),
    power: {
      generationKw: evaluation.generationKw,
      consumptionKw: evaluation.consumptionKw,
      batteryKwh: state.batteryKwh,
      batteryCapacityKwh: evaluation.batteryCapacityKwh,
    },
    shielding: {
      playerDoseMsv: playerOf(state).doseMsv,
      doseLimitMsv: values.crew.doseLimitMsv.value,
      indoorProtection: evaluation.indoorProtection,
    },
    tankRatio: state.player.tankOxygen,
    comm: {
      linked: state.commLinked,
      earthUp: isEarthUp(state.timeHours, values),
      relaySatellites: state.relaySatellites,
      unsentResearch: state.unsentResearch,
    },
    launch: {
      capacity: values.launch.capacityKg.value,
      canOrderNow: canOrderNow(state, values),
      tasksDone: state.tasksSinceLaunch,
      tasksNeeded: values.launch.tasksPerLaunch.value,
      hoursUntilNext: Math.max(0, state.nextLaunchAtHours - state.timeHours),
      deliveryHours: values.launch.deliveryDays.value * HOURS_PER_DAY,
      inFlight: state.launches.map((l) => ({
        id: l.id,
        hoursUntilArrival: Math.max(0, l.arrivesAtHours - state.timeHours),
        totalCost: l.totalCost,
      })),
    },
    crew: { count: state.crew.length, capacity: crewCapacityOf(state, values), byTask },
    facilityStatus,
  };
}
