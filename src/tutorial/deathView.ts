// ルナはかせの「どうして こうなったか」「つぎは こうしよう」を HTML にする（ui の窓とチュートリアルの窓で使う）
import { t } from '../ui/i18n.ts';
import type { DeathAdvice } from './death.ts';
import { PROFESSOR_SVG } from './professor.ts';

/** 原因とアドバイスだけ（博士の絵は付けない） */
export function deathAdviceHtml(advice: DeathAdvice): string {
  const causes = advice.causes
    .map(({ key, params }) => `<p>${t(`death.cause.${key}`, params)}</p>`)
    .join('');
  const tips = advice.tips.map((key) => `<li>${t(`death.tip.${key}`)}</li>`).join('');
  return `<div class="death-advice">
    <div class="death-label">${t('death.causeLabel')}</div>
    ${causes}
    <div class="death-label">${t('death.tipsLabel')}</div>
    <ol>${tips}</ol>
  </div>`;
}

/** 博士の顔と、吹き出しに入ったアドバイス */
export function professorDeathAdviceHtml(advice: DeathAdvice): string {
  return `<div class="death-professor">
    <div class="death-face">${PROFESSOR_SVG}</div>
    <div class="death-bubble">
      <div class="death-name">${t('death.professor')}</div>
      ${deathAdviceHtml(advice)}
    </div>
  </div>`;
}
