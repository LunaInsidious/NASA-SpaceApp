// テストで public/ のファイル（地形・画像）を読む・あるか確かめるためだけの型。
// @types/node は入れていない（入れると src/ の型チェックにも Node の型が混ざるため）
declare module 'node:fs' {
  export function readFileSync(path: string): Uint8Array;
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function existsSync(path: string): boolean;
}
