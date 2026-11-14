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

/**
 * いま起きているアクシデントを、急ぐ順にすべて返す。直るまで出し続けるため、毎刻み呼ぶ。
 * onlyUrgent のときはボンベと生命維持の不足だけを見る（チュートリアル中）
 */
export function pickAdvices(
  state: SimState,
  view: SimView,
  indoors: boolean,
  values: Values,
  onlyUrgent: boolean,
): Advice[] {
  const a = values.advice;
  const list: Advice[] = [];
  if (!indoors && view.tankRatio < a.tankLowRatio.value) {
    list.push({ kind: 'tankLow', facilityId: null });
  }
  // 命に関わる不足は、チュートリアル中も出す
  const days = view.lifeSupportDays;
  const low = a.lifeSupportLowDays.value;
  if (days.oxygen < low) list.push({ kind: 'oxygenLow', facilityId: null });
  if (days.water < low) list.push({ kind: 'waterLow', facilityId: null });
  if (days.food < low) list.push({ kind: 'foodLow', facilityId: null });
  if (onlyUrgent) {
    return list;
  }
  if (Object.values(view.facilityStatus).some((s) => s.reason === 'noPower')) {
    list.push({ kind: 'noPower', facilityId: null });
  }
  const broken = state.facilities.find((f) => f.condition < a.brokenCondition.value);
  if (broken !== undefined) {
    const partsNeeded = (1 - broken.condition) * values.maintenance.sparePartsPerFullRepair.value;
    list.push({
      kind: state.stocks.spareParts < partsNeeded ? 'noParts' : 'broken',
      facilityId: broken.id,
    });
  }
  if (!view.comm.linked) {
    list.push({ kind: 'commLost', facilityId: null });
  }
  return list;
}

export interface AdviceCard {
  show(advices: Advice[]): void;
}

/** アクシデントの一覧。見出しはいつも出し、「やること」は折りたたみ。新しく出た項目は最初だけ開いておく */
export function createAdviceCard(
  root: HTMLElement,
  openMenu: (menu: 'build' | 'launch' | 'crew') => void,
): AdviceCard {
  const card = document.createElement('div');
  card.className = 'advice-card';
  card.hidden = true;
  root.append(card);
  let current: AdviceKind[] = [];
  // 子どもが開いた・閉じたを覚えておく（直って消えたら忘れる）
  const open = new Set<AdviceKind>();

  function render(): void {
    card.hidden = current.length === 0;
    if (current.length === 0) {
      delete document.body.dataset.advice;
      return;
    }
    document.body.dataset.advice = current[0];
    const items = current.map((kind) => {
      const item = document.createElement('details');
      item.className = 'advice-item';
      item.open = open.has(kind);
      item.addEventListener('toggle', () => {
        if (item.open) open.add(kind);
        else open.delete(kind);
      });
      const title = document.createElement('summary');
      title.className = 'advice-title';
      title.textContent = `⚠ ${t(`advice.${kind}.title`)}`;
      const label = document.createElement('div');
      label.className = 'advice-label';
      label.textContent = t('advice.label');
      const todo = document.createElement('div');
      todo.className = 'advice-todo';
      todo.textContent = t(`advice.${kind}.todo`);
      item.append(title, label, todo);
      const menu = MENU_FOR[kind];
      if (menu !== undefined) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = t(`advice.open.${menu}`);
        button.addEventListener('click', () => openMenu(menu));
        item.append(button);
      }
      return item;
    });
    card.replaceChildren(...items);
  }

  onLangChange(render);

  return {
    show(advices) {
      const next = advices.map((a) => a.kind);
      if (next.join() === current.join()) {
        return;
      }
      for (const kind of next) {
        if (!current.includes(kind)) open.add(kind);
      }
      for (const kind of current) {
        if (!next.includes(kind)) open.delete(kind);
      }
      current = next;
      render();
    },
  };
}
