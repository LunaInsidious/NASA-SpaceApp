// テストで public/terrain/ の地形のファイルを読むためだけの型。
// @types/node は入れていない（入れると src/ の型チェックにも Node の型が混ざるため）
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
