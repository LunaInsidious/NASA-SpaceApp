// ことばじてん：あとで見返したくなる言葉（蓄電池、太陽フレアなど）を、いつでも引けるようにする。
// 開いている間は main が時間を止める
import { onLangChange, t } from '../ui/i18n.ts';
import './help.css';

// 分類と、その中の言葉（文言は i18n の help.term.<id>.* と help.group.<id>）
const GROUPS = [
  { id: 'power', terms: ['solar', 'battery', 'power'] },
  { id: 'life', terms: ['lifeSupport', 'habitat', 'tank', 'ice', 'iceDrill', 'greenhouse'] },
  { id: 'protect', terms: ['radiation', 'flare', 'sep', 'dose', 'shield', 'regolith'] },
  { id: 'build', terms: ['materials', 'repair', 'launch'] },
  { id: 'earth', terms: ['antenna', 'horizon', 'relay'] },
  { id: 'growth', terms: ['development', 'research', 'donki'] },
] as const;

export interface Help {
  isOpen(): boolean;
}

export function createHelp(root: HTMLElement): Help {
  let open = false;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'help-toggle';
  toggle.addEventListener('click', () => {
    open = true;
    render();
  });

  const layer = document.createElement('div');
  layer.className = 'help-layer';
  layer.hidden = true;
  root.append(toggle, layer);

  function render(): void {
    toggle.textContent = t('help.button');
    layer.hidden = !open;
    if (!open) {
      return;
    }
    const card = document.createElement('div');
    card.className = 'help-card';
    const title = document.createElement('h2');
    title.textContent = t('help.title');
    card.append(title);
    for (const group of GROUPS) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = t(`help.group.${group.id}`);
      section.append(heading);
      for (const id of group.terms) {
        const item = document.createElement('details');
        const name = document.createElement('summary');
        name.textContent = t(`help.term.${id}.name`);
        const what = document.createElement('p');
        what.textContent = t(`help.term.${id}.what`);
        const why = document.createElement('p');
        why.className = 'help-why';
        why.textContent = `${t('help.whyLabel')} ${t(`help.term.${id}.why`)}`;
        item.append(name, what, why);
        section.append(item);
      }
      card.append(section);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'help-close';
    close.textContent = t('help.close');
    close.addEventListener('click', () => {
      open = false;
      render();
    });
    card.append(close);
    layer.replaceChildren(card);
  }

  onLangChange(render);
  render();

  return { isOpen: () => open };
}
