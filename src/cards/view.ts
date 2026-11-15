// 豆知識カードの一覧の見た目。休息の画面とタイトル画面で同じものを出す

import type { Values } from '../contracts/index.ts';
import { t } from '../ui/i18n.ts';
import { type NasaImages, photoFigureHtml } from '../ui/photo.ts';
import { valueAt, valueText } from '../ui/valueText.ts';
import type { Card } from './index.ts';

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** カードの本物のデータ：名前・数・出典（資料へのリンク） */
function cardValuesHtml(card: Card, values: Values): string {
  if (card.values.length === 0) {
    return '';
  }
  const rows = card.values
    .map((path) => {
      const entry = valueAt(values, path);
      if (entry.url === undefined) {
        throw new Error(`豆知識カード ${card.id} の ${path} に出典の url がない`);
      }
      return `<li><b>${t(`valueName.${path}`)}</b>：${valueText(entry)}<br><a class="ui-small" href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">${t('source.label')} ${esc(entry.source)}</a></li>`;
    })
    .join('');
  return `<div class="card-data"><b>${t('cards.dataTitle')}</b><ul>${rows}</ul></div>`;
}

/** 集めた枚数と、カードの一覧。まだのカードは手に入れ方だけ見せる。言葉のボタンは data-term でことばじてんを開く */
export function cardsHtml(
  entries: { card: Card; owned: boolean }[],
  images: NasaImages,
  values: Values,
): string {
  const count = entries.filter((entry) => entry.owned).length;
  // 集めたカードを先に（新しく手に入れたカードをすぐ読めるように）。まだのカードはそのあと
  const items = [...entries.filter((e) => e.owned), ...entries.filter((e) => !e.owned)]
    .map(({ card, owned }) => {
      if (!owned) {
        return `<li class="card locked" data-card-id="${esc(card.id)}"><b>${t('cards.locked')}</b><p class="ui-small">${t(`${card.textKey}.hint`)}</p></li>`;
      }
      const photo = card.photo === null ? undefined : images[card.photo];
      const terms = card.terms
        .map(
          (term) =>
            `<button class="card-term" data-action="openTerm" data-term="${term}">📖 ${t(`help.term.${term}.name`)}</button>`,
        )
        .join('');
      return `<li class="card" data-card-id="${esc(card.id)}">
        <b class="card-title">${t(`${card.textKey}.title`)}</b>
        ${photo === undefined ? '' : photoFigureHtml(photo)}
        <p>${t(`${card.textKey}.body`)}</p>
        ${cardValuesHtml(card, values)}
        <div class="card-terms">${terms}</div>
      </li>`;
    })
    .join('');
  return `
    <h2>${t('cards.title')}</h2>
    <p>${t('cards.count', { count, total: entries.length })}</p>
    <ul class="cards">${items}</ul>`;
}
