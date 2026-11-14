// 発展度（docs/SPEC.md「発展度」）。4要素の幾何平均で、各要素の最低値は values.development.elementMin
import type { DailyRecord, ResourceKey, SimState, Values } from '../contracts/index.ts';

const RESOURCES: ResourceKey[] = ['oxygen', 'water', 'food', 'power'];

export interface DevelopmentInput {
  /** 終わった日の記録（今日の途中の分は入れない） */
  completed: DailyRecord[];
  currentBatteryRatio: number;
  lifeSupportDays: number;
  averageCondition: number;
}

function lastDays(records: DailyRecord[], days: number): DailyRecord[] {
  return records.slice(Math.max(0, records.length - days));
}

export function computeDevelopment(
  state: SimState,
  input: DevelopmentInput,
  values: Values,
): SimState['development'] {
  const dv = values.development;
  const min = dv.elementMin.value;
  const max = dv.elementMax.value;
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  // 自給：直近の日々で現地で用意できた割合の、資源ごとの最低
  const selfWindow = lastDays(input.completed, dv.selfSufficiencyWindowDays.value);
  let selfRatio = 0;
  if (selfWindow.length > 0) {
    selfRatio = Math.min(
      ...RESOURCES.map((key) => {
        const produced = selfWindow.reduce((sum, r) => sum + r.produced[key], 0);
        const consumed = selfWindow.reduce((sum, r) => sum + r.consumed[key], 0);
        return consumed > 0 ? Math.min(1, produced / consumed) : 1;
      }),
    );
  }
  const selfSufficiency = clamp(selfRatio * max);

  // 安定：蓄電池の最低残量、生命維持の日数、機器の平均の状態
  const batteryWindow = lastDays(input.completed, dv.stabilityBatteryWindowDays.value);
  const batteryRatio =
    batteryWindow.length > 0
      ? Math.min(...batteryWindow.map((r) => r.minBatteryRatio))
      : input.currentBatteryRatio;
  const supplyRatio = Math.min(1, input.lifeSupportDays / dv.stabilityFullSupplyDays.value);
  const parts = [batteryRatio, supplyRatio, input.averageCondition];
  const stability = clamp((parts.reduce((a, b) => a + b, 0) / parts.length) * max);

  // 安全：被ばくの上限までの余裕の平均 × 倒れた回数の罰
  const limit = values.crew.doseLimitMsv.value;
  const margin =
    state.crew.reduce((sum, c) => sum + Math.max(0, 1 - c.doseMsv / limit), 0) /
    Math.max(1, state.crew.length);
  const downed = lastDays(input.completed, dv.safetyDownedWindowDays.value).reduce(
    (sum, r) => sum + r.downedCount,
    0,
  );
  const safety = clamp(margin * max * dv.safetyDownedFactor.value ** downed);

  // 規模：隊員の人数と、直近の1日あたりの研究量（上限なし）
  const researchWindow = lastDays(input.completed, dv.scaleResearchWindowDays.value);
  const researchPerDay =
    researchWindow.length > 0
      ? researchWindow.reduce((sum, r) => sum + r.research, 0) / researchWindow.length
      : 0;
  const scale = Math.max(
    min,
    dv.scalePerCrew.value * state.crew.length + dv.scalePerResearch.value * researchPerDay,
  );

  const elements = [selfSufficiency, stability, safety, scale];
  const total = elements.reduce((a, b) => a * b, 1) ** (1 / elements.length);
  return {
    selfSufficiency,
    stability,
    safety,
    scale,
    total,
    best: Math.max(state.development.best, total),
  };
}
