// ルナはかせの「どうして倒れたか・つぎはどうするか」の診断
import { describe, expect, it } from 'vitest';
import en from '../i18n/en.json';
import ja from '../i18n/ja.json';
import type { Facility, SimState } from '../src/contracts/index.ts';
import type { SimView } from '../src/sim/api.ts';
import {
  DEATH_CAUSES,
  DEATH_TIPS,
  type DeathContext,
  diagnoseDeath,
} from '../src/tutorial/death.ts';

function facility(id: string, kind: Facility['kind']): Facility {
  return { id, kind, x: 0, z: 0, condition: 1, dustCover: false, sunlit: true };
}

function context(options: {
  facilities?: Facility[];
  status?: SimView['facilityStatus'];
  farming?: boolean;
  linked?: boolean;
  days?: Partial<SimView['lifeSupportDays']>;
}): DeathContext {
  const state = {
    facilities: options.facilities ?? [],
    crew: [
      { id: 'me', isPlayer: true, task: null, doseMsv: 0 },
      { id: 'c1', isPlayer: false, task: options.farming ? 'farming' : 'research', doseMsv: 0 },
    ],
  } as unknown as SimState;
  const view = {
    facilityStatus: options.status ?? {},
    comm: { linked: options.linked ?? true, earthUp: true, relaySatellites: 0, unsentResearch: 0 },
    lifeSupportDays: { oxygen: 5, water: 5, food: 5, min: 5, ...options.days },
  } as unknown as SimView;
  return { state, view, metersFromHabitat: 123.4 };
}

describe('diagnoseDeath', () => {
  it('ボンベ切れ：居住モジュールからの距離を言う', () => {
    const advice = diagnoseDeath('tankEmpty', context({}));
    expect(advice.causes).toEqual([{ key: 'tankEmpty', params: { meters: 123 } }]);
  });

  it('放射線：通信できなかったら、警報が届かなかったことを原因に挙げる', () => {
    expect(diagnoseDeath('radiation', context({})).causes.map((c) => c.key)).toEqual([
      'radiationStorm',
    ]);
    expect(diagnoseDeath('radiation', context({ linked: false })).causes.map((c) => c.key)).toEqual(
      ['radiationStorm', 'radiationNoAlert'],
    );
  });

  it('酸素：装置がない・電気がない・こわれた・水がない・足りない を見分ける', () => {
    const ls = facility('ls', 'lifeSupport');
    const cause = (ctx: DeathContext) => diagnoseDeath('oxygen', ctx).causes[0].key;
    expect(cause(context({}))).toBe('oxygenNoLifeSupport');
    expect(
      cause(context({ facilities: [ls], status: { ls: { working: false, reason: 'noPower' } } })),
    ).toBe('oxygenNoPower');
    expect(
      cause(context({ facilities: [ls], status: { ls: { working: false, reason: 'condition' } } })),
    ).toBe('oxygenBroken');
    const working = { ls: { working: true, reason: null } };
    expect(cause(context({ facilities: [ls], status: working, days: { water: 1 } }))).toBe(
      'oxygenNoWater',
    );
    expect(cause(context({ facilities: [ls], status: working }))).toBe('oxygenNotEnough');
  });

  it('食料：栽培室があっても栽培の係がいなければ、それを原因に挙げる', () => {
    const gh = facility('gh', 'greenhouse');
    const status = { gh: { working: true, reason: null } };
    expect(diagnoseDeath('food', context({ facilities: [gh], status })).causes[0].key).toBe(
      'foodNoFarmer',
    );
    expect(
      diagnoseDeath('food', context({ facilities: [gh], status, farming: true })).causes[0].key,
    ).toBe('foodNotEnough');
  });

  it('原因とアドバイスの文言が、英語と日本語の両方にある', () => {
    for (const messages of [en, ja] as Record<string, string>[]) {
      for (const key of DEATH_CAUSES) {
        expect(messages[`death.cause.${key}`]).toBeTypeOf('string');
      }
      for (const key of DEATH_TIPS) {
        expect(messages[`death.tip.${key}`]).toBeTypeOf('string');
      }
    }
  });
});
