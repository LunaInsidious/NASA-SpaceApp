// アクシデントのときに「何が起きたか」と「やること」を出すカード。いちばん急ぐもの1つだけを、直るまで出す
import type { SimState, Values } from '../contracts/index.ts';
import type { CommLostReason, SimView } from '../sim/api.ts';
import { commLostReason } from '../sim/index.ts';
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
  /** 地球と話せないときの理由（commLost のときだけ） */
  commReason: CommLostReason | null;
}

// スマホ幅では、新しい項目も見出しだけで出す（開くと画面の多くをふさぐため）
const NARROW_QUERY = '(max-width: 640px)';

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
    list.push({ kind: 'tankLow', facilityId: null, commReason: null });
  }
  // 命に関わる不足は、チュートリアル中も出す
  const days = view.lifeSupportDays;
  const low = a.lifeSupportLowDays.value;
  if (days.oxygen < low) list.push({ kind: 'oxygenLow', facilityId: null, commReason: null });
  if (days.water < low) list.push({ kind: 'waterLow', facilityId: null, commReason: null });
  if (days.food < low) list.push({ kind: 'foodLow', facilityId: null, commReason: null });
  if (onlyUrgent) {
    return list;
  }
  if (Object.values(view.facilityStatus).some((s) => s.reason === 'noPower')) {
    list.push({ kind: 'noPower', facilityId: null, commReason: null });
  }
  const broken = state.facilities.find((f) => f.condition < a.brokenCondition.value);
  if (broken !== undefined) {
    const partsNeeded = (1 - broken.condition) * values.maintenance.sparePartsPerFullRepair.value;
    list.push({
      kind: state.stocks.spareParts < partsNeeded ? 'noParts' : 'broken',
      facilityId: broken.id,
      commReason: null,
    });
  }
  if (!view.comm.linked) {
    list.push({ kind: 'commLost', facilityId: null, commReason: commLostReason(state, view) });
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
  let current: Advice[] = [];
  // 子どもが開いた・閉じたを覚えておく（直って消えたら忘れる）
  const open = new Set<AdviceKind>();

  function render(): void {
    card.hidden = current.length === 0;
    if (current.length === 0) {
      delete document.body.dataset.advice;
      return;
    }
    document.body.dataset.advice = current[0].kind;
    const items = current.map(({ kind, commReason }) => {
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
      todo.textContent =
        commReason === null
          ? t(`advice.${kind}.todo`)
          : t(`advice.${kind}.todo`, { reason: t(`commHint.${commReason}`) });
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
      const key = (list: Advice[]) => list.map((a) => `${a.kind}:${a.commReason}`).join();
      if (key(advices) === key(current)) {
        return;
      }
      const before = current.map((a) => a.kind);
      const after = advices.map((a) => a.kind);
      const narrow = window.matchMedia(NARROW_QUERY).matches;
      for (const kind of after) {
        if (!before.includes(kind) && !narrow) open.add(kind);
      }
      for (const kind of before) {
        if (!after.includes(kind)) open.delete(kind);
      }
      current = advices;
      render();
    },
  };
}
