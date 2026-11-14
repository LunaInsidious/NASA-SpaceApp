// 施設の動き（電力の割り当て、生産、屋内の守り）と通信の判定。step と describe の両方が使う
import type { Env, Facility, FacilityKind, SimState, Values } from '../contracts/index.ts';

export type StopReason = 'shadow' | 'condition' | 'noPower' | 'noEarth' | null;

export interface FacilityRun {
  working: boolean;
  reason: StopReason;
}

export interface Evaluation {
  sunlit: Record<string, boolean>;
  status: Record<string, FacilityRun>;
  generationKw: number;
  consumptionKw: number;
  batteryCapacityKwh: number;
  crewCapacity: number;
  indoorProtection: number;
  /** 1日あたりの量（今動いている施設から） */
  perDay: {
    crewOxygen: number;
    crewWater: number;
    crewFood: number;
    lifeSupportOxygen: number;
    lifeSupportWater: number;
    greenhouseFood: number;
    greenhouseWater: number;
    drillWater: number;
  };
}

// 電力が足りないときに先に回す順
const POWER_PRIORITY: FacilityKind[] = [
  'habitat',
  'lifeSupport',
  'antenna',
  'greenhouse',
  'iceDrill',
];

export function powerKw(kind: FacilityKind, values: Values): number {
  const f = values.facilities;
  switch (kind) {
    case 'habitat':
      return f.habitat.powerKw.value;
    case 'antenna':
      return f.antenna.powerKw.value;
    case 'greenhouse':
      return f.greenhouse.powerKw.value;
    case 'lifeSupport':
      return f.lifeSupport.powerKw.value;
    case 'iceDrill':
      return f.iceDrill.powerKw.value;
    default:
      return 0;
  }
}

export function sunlitAt(
  env: Env,
  x: number,
  z: number,
  sunAzimuthRad: number,
  values: Values,
): boolean {
  const y = env.heightAt(x, z) + values.facilities.common.sunlitCheckHeightMeters.value;
  return env.isSunlit(x, z, y, sunAzimuthRad);
}

export function crewCount(state: SimState): number {
  return state.crew.length;
}

export function evaluate(state: SimState, values: Values, env: Env, dtHours: number): Evaluation {
  const fv = values.facilities;
  const stopBelow = fv.common.stopBelowCondition.value;
  const status: Record<string, FacilityRun> = {};
  const sunlit: Record<string, boolean> = {};
  let generationKw = 0;
  let batteryCapacityKwh = 0;
  let crewCapacity = 0;
  let shieldProtection = 0;
  let hasHabitat = false;
  let hasRegolithCover = false;

  for (const f of state.facilities) {
    const lit = sunlitAt(env, f.x, f.z, state.sunAzimuthRad, values);
    sunlit[f.id] = lit;
    if (f.kind === 'habitat') {
      hasHabitat = true;
      crewCapacity += fv.habitat.crewCapacity.value;
      if (f.regolithCover === true) hasRegolithCover = true;
    }
    if (f.condition < stopBelow) {
      status[f.id] = { working: false, reason: 'condition' };
      continue;
    }
    if (f.kind === 'solar') {
      if (lit) {
        generationKw += fv.solar.generationKw.value * f.condition;
        status[f.id] = { working: true, reason: null };
      } else {
        status[f.id] = { working: false, reason: 'shadow' };
      }
    } else if (f.kind === 'battery') {
      batteryCapacityKwh += fv.battery.capacityKwh.value;
      status[f.id] = { working: true, reason: null };
    } else if (f.kind === 'shield') {
      shieldProtection +=
        f.shieldMaterial === 'water'
          ? fv.shield.waterProtection.value
          : fv.shield.regolithProtection.value;
      status[f.id] = { working: true, reason: null };
    }
  }

  // 電力：蓄電池の残りと今の発電を、優先の順に割り当てる
  let energy = state.batteryKwh + generationKw * dtHours;
  let consumptionKw = 0;
  for (const kind of POWER_PRIORITY) {
    for (const f of state.facilities) {
      if (f.kind !== kind || status[f.id] !== undefined) continue;
      const kw = powerKw(kind, values);
      const need = kw * dtHours;
      if (energy >= need) {
        energy -= need;
        consumptionKw += kw;
        status[f.id] = { working: true, reason: null };
      } else {
        status[f.id] = { working: false, reason: 'noPower' };
      }
    }
  }

  const crew = crewCount(state);
  const crewOxygen = crew * values.crew.oxygenKgPerDay.value;
  // 生命維持装置が動いていれば、隊員の使った水の一部を再生して使う
  const recycling = state.facilities.some(
    (f) => f.kind === 'lifeSupport' && status[f.id]?.working === true,
  );
  const waterRecovery = recycling ? fv.lifeSupport.waterRecoveryRatio.value : 0;
  const crewWater = crew * values.crew.waterKgPerDay.value * (1 - waterRecovery);
  const crewFood = crew * values.crew.foodKgPerDay.value;

  let lifeSupportCapacity = 0;
  let drillWater = 0;
  let greenhouseFood = 0;
  let greenhouseWater = 0;
  let farmersLeft = state.crew.filter((c) => c.task === 'farming').length;
  for (const f of state.facilities) {
    if (status[f.id]?.working !== true) continue;
    if (f.kind === 'lifeSupport') {
      lifeSupportCapacity += fv.lifeSupport.oxygenKgPerDay.value * f.condition;
    } else if (f.kind === 'iceDrill') {
      drillWater += fv.iceDrill.waterKgPerDay.value * f.condition;
    } else if (f.kind === 'greenhouse') {
      const needed = fv.greenhouse.farmersNeeded.value;
      const assigned = Math.min(needed, farmersLeft);
      farmersLeft -= assigned;
      const share = needed > 0 ? assigned / needed : 1;
      greenhouseFood += fv.greenhouse.foodKgPerDay.value * f.condition * share;
      greenhouseWater += fv.greenhouse.waterKgPerDay.value * share;
    }
  }
  // 生命維持装置は隊員が吸う分だけ酸素を作る（水を無駄にしない）
  const lifeSupportOxygen = Math.min(lifeSupportCapacity, crewOxygen);
  const lifeSupportWater = lifeSupportOxygen * fv.lifeSupport.waterPerOxygen.value;

  const baseProtection = hasHabitat ? fv.habitat.indoorProtection.value : 0;
  const coverBonus = hasRegolithCover ? values.protection.regolithCoverBonus.value : 0;
  const indoorProtection = Math.min(
    values.protection.max.value,
    baseProtection + coverBonus + shieldProtection,
  );

  return {
    sunlit,
    status,
    generationKw,
    consumptionKw,
    batteryCapacityKwh,
    crewCapacity,
    indoorProtection,
    perDay: {
      crewOxygen,
      crewWater,
      crewFood,
      lifeSupportOxygen,
      lifeSupportWater,
      greenhouseFood,
      greenhouseWater,
      drillWater,
    },
  };
}

/** 地球が地平線の上にいる時期か（一定の周期の前半） */
export function isEarthUp(timeHours: number, values: Values): boolean {
  const periodHours = values.comm.earthPeriodDays.value * 24;
  return Math.sin((2 * Math.PI * timeHours) / periodHours) >= 0;
}

/** 中継衛星が今つないでくれるか。1機は軌道の一部、最大数でいつも */
export function isRelayCovering(timeHours: number, relays: number, values: Values): boolean {
  if (relays >= values.comm.maxRelaySatellites.value) return true;
  if (relays <= 0) return false;
  const orbit = values.comm.relayOrbitHours.value;
  const phase = (timeHours % orbit) / orbit;
  return phase < values.comm.relayOneCoverage.value;
}

export interface CommResult {
  linked: boolean;
  direct: boolean;
  relay: boolean;
  antennaWorking: boolean;
}

export function evaluateComm(
  state: SimState,
  evaluation: Evaluation,
  values: Values,
  env: Env,
): CommResult {
  const antennas: Facility[] = state.facilities.filter(
    (f) => f.kind === 'antenna' && evaluation.status[f.id]?.working === true,
  );
  const antennaWorking = antennas.length > 0;
  const earthUp = isEarthUp(state.timeHours, values);
  const direct = antennaWorking && earthUp && antennas.some((a) => env.isEarthVisible(a.x, a.z));
  const relay = antennaWorking && isRelayCovering(state.timeHours, state.relaySatellites, values);
  return { linked: direct || relay, direct, relay, antennaWorking };
}
