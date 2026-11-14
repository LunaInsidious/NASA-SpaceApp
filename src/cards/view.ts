// 豆知識カードの一覧の見た目。休息の画面とタイトル画面で同じものを出す
import { t } from '../ui/i18n.ts';
import { type NasaImages, photoFigureHtml } from '../ui/photo.ts';
import type { Card } from './index.ts';

/** 集めた枚数と、カードの一覧。まだのカードは手に入れ方だけ見せる。言葉のボタンは data-term でことばじてんを開く */
export function cardsHtml(entries: { card: Card; owned: boolean }[], images: NasaImages): string {
  const count = entries.filter((entry) => entry.owned).length;
  // 集めたカードを先に（新しく手に入れたカードをすぐ読めるように）。まだのカードはそのあと
  const items = [...entries.filter((e) => e.owned), ...entries.filter((e) => !e.owned)]
    .map(({ card, owned }) => {
      if (!owned) {
        return `<li class="card locked"><b>${t('cards.locked')}</b><p class="ui-small">${t(`${card.textKey}.hint`)}</p></li>`;
      }
      const photo = card.photo === null ? undefined : images[card.photo];
      const terms = card.terms
        .map(
          (term) =>
            `<button class="card-term" data-action="openTerm" data-term="${term}">📖 ${t(`help.term.${term}.name`)}</button>`,
        )
        .join('');
      return `<li class="card">
        <b class="card-title">${t(`${card.textKey}.title`)}</b>
        ${photo === undefined ? '' : photoFigureHtml(photo)}
        <p>${t(`${card.textKey}.body`)}</p>
        <div class="card-terms">${terms}</div>
      </li>`;
    })
    .join('');
  return `
    <h2>${t('cards.title')}</h2>
    <p>${t('cards.count', { count, total: entries.length })}</p>
    <ul class="cards">${items}</ul>`;
}
