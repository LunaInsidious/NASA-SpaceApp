// アクシデントのときに「何が起きたか」と「やること」を出すカード。いちばん急ぐもの1つだけを、直るまで出す
import type { SimState, Values } from '../contracts/index.ts';
import type { SimView } from '../sim/api.ts';
import { onLangChange, t } from '../ui/i18n.ts';

export type AdviceKind =
  | 'tankLow'
  | 'oxygenLow'
  | 'waterLow'
  | 'foodLow'
  | 'noPower'
  | 'broken'
  | 'noParts'
  | 'commLost';

export interface Advice {
  kind: AdviceKind;
  /** 行く場所を示す施設（壊れかけの施設など） */
  facilityId: string | null;
}

// カードのボタンで開くメニュー
const MENU_FOR: Partial<Record<AdviceKind, 'build' | 'launch' | 'crew'>> = {
  oxygenLow: 'build',
  waterLow: 'launch',
  foodLow: 'launch',
  noPower: 'build',
  broken: 'crew',
  noParts: 'launch',
  commLost: 'launch',
};

/** いちばん急ぐアクシデント。onlyUrgent のときはボンベだけを見る（チュートリアル中） */
export function pickAdvice(
  state: SimState,
  view: SimView,
  indoors: boolean,
  values: Values,
  onlyUrgent: boolean,
): Advice | null {
  const a = values.advice;
  if (!indoors && view.tankRatio < a.tankLowRatio.value) {
    return { kind: 'tankLow', facilityId: null };
  }
  if (onlyUrgent) {
    return null;
  }
  const days = view.lifeSupportDays;
  if (days.min < a.lifeSupportLowDays.value) {
    const kind: AdviceKind =
      days.oxygen === days.min ? 'oxygenLow' : days.water === days.min ? 'waterLow' : 'foodLow';
    return { kind, facilityId: null };
  }
  const stopped = Object.entries(view.facilityStatus).find(([, s]) => s.reason === 'noPower');
  if (stopped !== undefined) {
    return { kind: 'noPower', facilityId: null };
  }
  const broken = state.facilities.find((f) => f.condition < a.brokenCondition.value);
  if (broken !== undefined) {
    const partsNeeded = (1 - broken.condition) * values.maintenance.sparePartsPerFullRepair.value;
    return {
      kind: state.stocks.spareParts < partsNeeded ? 'noParts' : 'broken',
      facilityId: broken.id,
    };
  }
  if (!view.comm.linked) {
    return { kind: 'commLost', facilityId: null };
  }
  return null;
}

export interface AdviceCard {
  show(advice: Advice | null): void;
}

export function createAdviceCard(
  root: HTMLElement,
  openMenu: (menu: 'build' | 'launch' | 'crew') => void,
): AdviceCard {
  const card = document.createElement('div');
  card.className = 'advice-card';
  card.hidden = true;
  root.append(card);
  let current: AdviceKind | null = null;

  function render(): void {
    card.hidden = current === null;
    delete document.body.dataset.advice;
    if (current === null) {
      return;
    }
    const kind = current;
    document.body.dataset.advice = kind;
    const title = document.createElement('div');
    title.className = 'advice-title';
    title.textContent = `⚠ ${t(`advice.${kind}.title`)}`;
    const label = document.createElement('div');
    label.className = 'advice-label';
    label.textContent = t('advice.label');
    const todo = document.createElement('div');
    todo.className = 'advice-todo';
    todo.textContent = t(`advice.${kind}.todo`);
    card.replaceChildren(title, label, todo);
    const menu = MENU_FOR[kind];
    if (menu !== undefined) {
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = t(`advice.open.${menu}`);
      open.addEventListener('click', () => openMenu(menu));
      card.append(open);
    }
  }

  onLangChange(render);

  return {
    show(advice) {
      const next = advice === null ? null : advice.kind;
      if (next !== current) {
        current = next;
        render();
      }
    },
  };
}
