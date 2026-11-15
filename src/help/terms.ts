// ことばじてんの言葉（文言は i18n の help.term.<id>.* と help.group.<id>）。
// チュートリアルとミッションで説明した言葉から、じてんに足していく
export const HELP_GROUPS = [
  { id: 'power', terms: ['solar', 'battery', 'power'] },
  { id: 'life', terms: ['lifeSupport', 'habitat', 'tank', 'ice', 'iceDrill', 'greenhouse'] },
  { id: 'protect', terms: ['radiation', 'flare', 'sep', 'dose', 'shield', 'regolith'] },
  { id: 'build', terms: ['materials', 'repair', 'launch'] },
  { id: 'earth', terms: ['antenna', 'horizon', 'relay'] },
  { id: 'growth', terms: ['development', 'research', 'donki'] },
] as const;

export type HelpTerm = (typeof HELP_GROUPS)[number]['terms'][number];

export const HELP_TERMS: readonly HelpTerm[] = HELP_GROUPS.flatMap((group) => group.terms);

/** 知らない言葉なら作りの誤りなので例外 */
export function asHelpTerm(value: unknown, where: string): HelpTerm {
  const found = HELP_TERMS.find((term) => term === value);
  if (found === undefined) {
    throw new Error(`${where}：ことばじてんにない言葉 ${String(value)}`);
  }
  return found;
}
