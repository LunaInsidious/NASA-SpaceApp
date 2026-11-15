import { describe, expect, it } from 'vitest';
import ja from '../../i18n/ja.json';
import {
  composeNightReport,
  GREETING_COUNT,
  type NightReportInput,
  STAR_ELEMENTS,
} from './report.ts';

const stars = { selfSufficiency: 2, stability: 3, safety: 3, scale: 2 };
const calm: NightReportInput = {
  day: 5,
  linked: true,
  wentOut: true,
  did: [{ kind: 'ice' }],
  stopped: { noPower: 0, shadow: 0, condition: 0 },
  lifeSupport: 'working',
  days: { oxygen: 999, water: 20, food: 15 },
  lowDays: 5,
  arrivingTomorrow: false,
  canOrder: false,
  tasksLeftForOrder: 0,
  stars,
  starsBefore: stars,
};

describe('夜の地球管制からの通信', () => {
  it('何も起きていない日は、ねぎらい・今日の一言・明日への一言だけ（危ないことも★の変化もない）', () => {
    const report = composeNightReport(calm);
    expect(report.greeting?.key).toBe('comm.greet.5');
    expect(report.lines.map((l) => l.key)).toEqual(['comm.today.ice']);
    expect(report.dangers).toEqual([]);
    expect(report.starChanges).toEqual([]);
    expect(report.tomorrow.key).toBe('comm.tomorrow.free');
  });

  it('ねぎらいは2晩続けて同じにならない', () => {
    const keys = [1, 2, 3, 4, 5, 6, 7].map(
      (day) => composeNightReport({ ...calm, day }).greeting?.key,
    );
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i]).not.toBe(keys[i - 1]);
    }
  });

  it('電気が足りずに機械が止まっている日は、台数と「明日は電気を確保しよう」を言う', () => {
    const report = composeNightReport({
      ...calm,
      stopped: { noPower: 2, shadow: 0, condition: 0 },
    });
    expect(report.lines).toContainEqual({ key: 'comm.base.noPower', params: { count: 2 } });
    expect(report.tomorrow.key).toBe('comm.tomorrow.power');
  });

  it('物資が足りなくなりそうなら、急ぐ順に、あと何日・何日目まで・何をすればよいかを言う', () => {
    const report = composeNightReport({
      ...calm,
      lifeSupport: 'noPower',
      days: { oxygen: 3.6, water: 2.2, food: 15 },
    });
    expect(report.dangers).toEqual([
      { key: 'comm.danger.water', params: { days: 2, lastDay: 8 } },
      { key: 'comm.danger.oxygen.power', params: { days: 3, lastDay: 9 } },
    ]);
  });

  it('酸素の対策は、生命維持装置がない・電気がない・傷んだ・人が多い、で変わる', () => {
    const how = (lifeSupport: NightReportInput['lifeSupport']) =>
      composeNightReport({ ...calm, lifeSupport, days: { ...calm.days, oxygen: 1 } }).dangers[0]
        ?.key;
    expect(how('none')).toBe('comm.danger.oxygen.build');
    expect(how('noPower')).toBe('comm.danger.oxygen.power');
    expect(how('condition')).toBe('comm.danger.oxygen.repair');
    expect(how('working')).toBe('comm.danger.oxygen.more');
  });

  it('★が変わった要素だけ、変わった向きとわけを言う', () => {
    const report = composeNightReport({
      ...calm,
      stars: { ...stars, stability: 2, scale: 3 },
    });
    expect(report.starChanges).toEqual([
      { key: 'comm.star.down.stability', params: { from: 3, to: 2 } },
      { key: 'comm.star.up.scale', params: { from: 2, to: 3 } },
    ]);
  });

  it('地球と話せない日は、ねぎらいはなく（基地の端末が知らせる）、危ないことはそのまま出す', () => {
    const report = composeNightReport({
      ...calm,
      linked: false,
      canOrder: true,
      days: { ...calm.days, food: 2 },
    });
    expect(report.greeting).toBeNull();
    expect(report.dangers.map((d) => d.key)).toEqual(['comm.danger.food']);
    // 話せないので、補給を頼もうとは言わない
    expect(report.tomorrow.key).not.toBe('comm.tomorrow.order');
  });

  it('使うキーは日本語と英語の両方にある', () => {
    const keys = [
      'comm.greet.first',
      ...Array.from({ length: GREETING_COUNT }, (_, i) => `comm.greet.${i}`),
      ...['built', 'repair', 'ice', 'regolith', 'walked', 'stayed'].map((k) => `comm.today.${k}`),
      ...['noPower', 'condition', 'shadow', 'arriving'].map((k) => `comm.base.${k}`),
      'comm.danger.water',
      'comm.danger.food',
      ...['build', 'power', 'repair', 'more'].map((k) => `comm.danger.oxygen.${k}`),
      ...STAR_ELEMENTS.flatMap((e) => [`comm.star.up.${e}`, `comm.star.down.${e}`]),
      ...['power', 'repair', 'shadow', 'order', 'tasks', 'free'].map((k) => `comm.tomorrow.${k}`),
    ];
    const missing = keys.filter((key) => !(key in ja));
    expect(missing).toEqual([]);
  });
});
