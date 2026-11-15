// 夜の地球管制からの通信（居住モジュールに戻ったときに見せる）。ゲームの様子から、何を言うかを決める。
// 文言は i18n のキーで返し、画面の文にするのは main（ここは DOM も i18n も使わない）

import type { FacilityKind } from '../contracts/index.ts';

export const STAR_ELEMENTS = ['selfSufficiency', 'stability', 'safety', 'scale'] as const;
export type StarElement = (typeof STAR_ELEMENTS)[number];
export type Stars = Record<StarElement, number>;

const RESOURCES = ['oxygen', 'water', 'food'] as const;
type Resource = (typeof RESOURCES)[number];

/** ねぎらいの言葉の数（i18n の comm.greet.0〜）。毎晩ちがう言葉にする */
export const GREETING_COUNT = 6;

export interface ReportLine {
  key: string;
  /** facility は施設の種類（main が名前にする）。ほかは数字や、そのまま入れる文 */
  params?: Record<string, string | number>;
}

export interface NightReportInput {
  /** 着陸の日を 0 とした今日 */
  day: number;
  /** 地球と話せるか。話せなければ、基地の端末が知らせる */
  linked: boolean;
  /** 今日、外に出たか */
  wentOut: boolean;
  /** 今日、外でしたこと */
  did: { kind: 'ice' | 'repair' | 'regolith' | 'build'; facility?: FacilityKind }[];
  /** 止まっている機械の数（理由ごと） */
  stopped: { noPower: number; shadow: number; condition: number };
  /** 生命維持装置があるか、止まっていればその理由 */
  lifeSupport: 'none' | 'working' | 'noPower' | 'condition';
  /** 基地の酸素・水・食料が、このままだとあと何日もつか（減っていなければ大きな数） */
  days: Record<Resource, number>;
  /** これより少なければ危ないと知らせる日数 */
  lowDays: number;
  /** 明日のうちにロケットが届くか */
  arrivingTomorrow: boolean;
  /** いま補給を頼めるか */
  canOrder: boolean;
  /** 補給を頼むのに、あと何回タスクが要るか（足りていれば 0） */
  tasksLeftForOrder: number;
  /** 発展度の4要素の★（今と、きのうの夜） */
  stars: Stars;
  starsBefore: Stars | null;
}

export interface NightReport {
  linked: boolean;
  /** ねぎらい（話せない日は null） */
  greeting: ReportLine | null;
  /** 今日の行動への一言と、基地の変化 */
  lines: ReportLine[];
  /** 放っておくと命に関わること（急ぐ順）。目立たせて出す */
  dangers: ReportLine[];
  /** ★が変わった要素と、そのわけ */
  starChanges: ReportLine[];
  /** 明日への一言（明日の判断につながること） */
  tomorrow: ReportLine;
}

export function composeNightReport(input: NightReportInput): NightReport {
  const lines: ReportLine[] = [todayLine(input)];
  const { noPower, shadow, condition } = input.stopped;
  if (noPower > 0) lines.push({ key: 'comm.base.noPower', params: { count: noPower } });
  if (condition > 0) lines.push({ key: 'comm.base.condition', params: { count: condition } });
  if (shadow > 0) lines.push({ key: 'comm.base.shadow', params: { count: shadow } });
  if (input.arrivingTomorrow) lines.push({ key: 'comm.base.arriving' });

  const dangers = RESOURCES.filter((r) => input.days[r] < input.lowDays)
    .sort((a, b) => input.days[a] - input.days[b])
    .map((r) => dangerLine(r, input));

  const starChanges =
    input.starsBefore === null
      ? []
      : STAR_ELEMENTS.flatMap((element): ReportLine[] => {
          const from = input.starsBefore?.[element] ?? input.stars[element];
          const to = input.stars[element];
          if (from === to) return [];
          return [
            { key: `comm.star.${to > from ? 'up' : 'down'}.${element}`, params: { from, to } },
          ];
        });

  return {
    linked: input.linked,
    greeting: input.linked
      ? { key: input.day === 0 ? 'comm.greet.first' : `comm.greet.${input.day % GREETING_COUNT}` }
      : null,
    lines,
    dangers,
    starChanges,
    tomorrow: tomorrowLine(input),
  };
}

/** 今日の行動への一言。建てた > 点検 > 氷 > レゴリス の順に、いちばん大きなことを言う */
function todayLine(input: NightReportInput): ReportLine {
  const built = input.did.find((d) => d.kind === 'build');
  if (built?.facility !== undefined) {
    return { key: 'comm.today.built', params: { facility: built.facility } };
  }
  const repaired = input.did.find((d) => d.kind === 'repair');
  if (repaired?.facility !== undefined) {
    return { key: 'comm.today.repair', params: { facility: repaired.facility } };
  }
  const ice = input.did.filter((d) => d.kind === 'ice').length;
  if (ice > 0) return { key: 'comm.today.ice', params: { count: ice } };
  if (input.did.some((d) => d.kind === 'regolith')) return { key: 'comm.today.regolith' };
  return { key: input.wentOut ? 'comm.today.walked' : 'comm.today.stayed' };
}

/** 足りなくなりそうな物資：あと何日・何日目に尽きるか・何をすれば間に合うか */
function dangerLine(resource: Resource, input: NightReportInput): ReportLine {
  const days = Math.max(0, Math.floor(input.days[resource]));
  // 画面の「○日目」は着陸の日を 1日目と数える
  const params = { days, lastDay: input.day + 1 + days };
  if (resource !== 'oxygen') {
    return { key: `comm.danger.${resource}`, params };
  }
  const how =
    input.lifeSupport === 'none'
      ? 'build'
      : input.lifeSupport === 'noPower'
        ? 'power'
        : input.lifeSupport === 'condition'
          ? 'repair'
          : 'more';
  return { key: `comm.danger.oxygen.${how}`, params };
}

/** 明日への一言。止まっている機械 → 補給を頼める → 報告が足りない → 自由に、の順 */
function tomorrowLine(input: NightReportInput): ReportLine {
  if (input.stopped.noPower > 0) return { key: 'comm.tomorrow.power' };
  if (input.stopped.condition > 0) return { key: 'comm.tomorrow.repair' };
  if (input.stopped.shadow > 0) return { key: 'comm.tomorrow.shadow' };
  if (input.linked && input.canOrder) return { key: 'comm.tomorrow.order' };
  if (input.tasksLeftForOrder > 0) {
    return { key: 'comm.tomorrow.tasks', params: { count: input.tasksLeftForOrder } };
  }
  return { key: 'comm.tomorrow.free' };
}
