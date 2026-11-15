// 倒れたとき・ゲームオーバーのときに、ルナはかせが「どうしてそうなったか」と「つぎはどうするか」を話すための診断。
// そのときの基地の様子（施設が動いていたか、通信、居住モジュールからの距離）から、本当の原因を1つ選ぶ
import type { FacilityKind, ResourceKey, SimState } from '../contracts/index.ts';
import type { SimView } from '../sim/api.ts';

export type DeathKind = 'tankEmpty' | 'radiation' | ResourceKey;

// 文言は i18n の death.cause.<キー> と death.tip.<キー>
export const DEATH_CAUSES = [
  'tankEmpty',
  'radiationStorm',
  'radiationNoAlert',
  'oxygenNoLifeSupport',
  'oxygenNoPower',
  'oxygenBroken',
  'oxygenNoWater',
  'oxygenNotEnough',
  'waterNoSource',
  'waterDrillNoPower',
  'waterDrillBroken',
  'waterNotEnough',
  'foodNoGreenhouse',
  'foodNoFarmer',
  'foodNoPower',
  'foodBroken',
  'foodNotEnough',
] as const;
export const DEATH_TIPS = [
  'tankHalf',
  'tankOutpost',
  'shelter',
  'stormTime',
  'shield',
  'commForAlerts',
  'buildLifeSupport',
  'orderOxygen',
  'morePower',
  'repair',
  'getIce',
  'orderWater',
  'moreLifeSupport',
  'buildIceDrill',
  'moreIceDrill',
  'buildGreenhouse',
  'orderFood',
  'assignFarmer',
  'moreGreenhouse',
] as const;
export type DeathCause = (typeof DEATH_CAUSES)[number];
export type DeathTip = (typeof DEATH_TIPS)[number];

export interface DeathAdvice {
  kind: DeathKind;
  causes: { key: DeathCause; params?: Record<string, string | number> }[];
  tips: DeathTip[];
}

export interface DeathContext {
  state: SimState;
  view: SimView;
  /** 倒れた場所から、いちばん近い居住モジュールまで（m）。ボンベが切れたときだけ使う */
  metersFromHabitat: number;
}

type Stop = 'none' | 'noPower' | 'broken' | null;

/** その種類の施設が止まっていたか。none：1つもない、null：どれかは動いていた */
function stoppedBecause(kind: FacilityKind, ctx: DeathContext): Stop {
  const facilities = ctx.state.facilities.filter((f) => f.kind === kind);
  if (facilities.length === 0) {
    return 'none';
  }
  const statuses = facilities.map((f) => ctx.view.facilityStatus[f.id]);
  if (statuses.some((s) => s.working)) {
    return null;
  }
  return statuses.some((s) => s.reason === 'noPower') ? 'noPower' : 'broken';
}

export function diagnoseDeath(kind: DeathKind, ctx: DeathContext): DeathAdvice {
  switch (kind) {
    case 'tankEmpty': {
      return {
        kind,
        causes: [{ key: 'tankEmpty', params: { meters: Math.round(ctx.metersFromHabitat) } }],
        tips: ['tankHalf', 'tankOutpost'],
      };
    }
    case 'radiation': {
      const causes: DeathAdvice['causes'] = [{ key: 'radiationStorm' }];
      const tips: DeathTip[] = ['shelter', 'stormTime', 'shield'];
      if (!ctx.view.comm.linked) {
        // 通じていないと警報が届かない（sim は警報を出さない）
        causes.push({ key: 'radiationNoAlert' });
        tips.unshift('commForAlerts');
      }
      return { kind, causes, tips };
    }
    case 'oxygen': {
      const stop = stoppedBecause('lifeSupport', ctx);
      if (stop === 'none') {
        return {
          kind,
          causes: [{ key: 'oxygenNoLifeSupport' }],
          tips: ['buildLifeSupport', 'orderOxygen'],
        };
      }
      if (stop === 'noPower') {
        return { kind, causes: [{ key: 'oxygenNoPower' }], tips: ['morePower', 'orderOxygen'] };
      }
      if (stop === 'broken') {
        return { kind, causes: [{ key: 'oxygenBroken' }], tips: ['repair', 'orderOxygen'] };
      }
      if (ctx.view.lifeSupportDays.water < ctx.view.lifeSupportDays.oxygen) {
        return { kind, causes: [{ key: 'oxygenNoWater' }], tips: ['getIce', 'orderWater'] };
      }
      return {
        kind,
        causes: [{ key: 'oxygenNotEnough' }],
        tips: ['moreLifeSupport', 'orderOxygen'],
      };
    }
    case 'water': {
      const stop = stoppedBecause('iceDrill', ctx);
      if (stop === 'none') {
        return {
          kind,
          causes: [{ key: 'waterNoSource' }],
          tips: ['getIce', 'buildIceDrill', 'orderWater'],
        };
      }
      if (stop === 'noPower') {
        return { kind, causes: [{ key: 'waterDrillNoPower' }], tips: ['morePower', 'getIce'] };
      }
      if (stop === 'broken') {
        return { kind, causes: [{ key: 'waterDrillBroken' }], tips: ['repair', 'getIce'] };
      }
      return {
        kind,
        causes: [{ key: 'waterNotEnough' }],
        tips: ['moreIceDrill', 'getIce', 'orderWater'],
      };
    }
    case 'food': {
      const stop = stoppedBecause('greenhouse', ctx);
      if (stop === 'none') {
        return {
          kind,
          causes: [{ key: 'foodNoGreenhouse' }],
          tips: ['buildGreenhouse', 'orderFood'],
        };
      }
      if (!ctx.state.crew.some((c) => c.task === 'farming')) {
        return { kind, causes: [{ key: 'foodNoFarmer' }], tips: ['assignFarmer', 'orderFood'] };
      }
      if (stop === 'noPower') {
        return { kind, causes: [{ key: 'foodNoPower' }], tips: ['morePower', 'orderFood'] };
      }
      if (stop === 'broken') {
        return { kind, causes: [{ key: 'foodBroken' }], tips: ['repair', 'orderFood'] };
      }
      return { kind, causes: [{ key: 'foodNotEnough' }], tips: ['moreGreenhouse', 'orderFood'] };
    }
    case 'power':
      throw new Error('電力がなくなってもゲームオーバーにはならない（sim の LIFE_RESOURCES）');
  }
}
