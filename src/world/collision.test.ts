import { describe, expect, it } from 'vitest';
import { pushOutOfBoxes } from './collision.ts';

const box = { minX: -2, maxX: 2, minZ: -1, maxZ: 1 };

describe('建物の当たり判定', () => {
  it('箱の外にいれば、そのまま', () => {
    expect(pushOutOfBoxes(5, 0, 0.4, [box])).toEqual({ x: 5, z: 0 });
  });

  it('箱に入りこんだら、いちばん近い辺の外（体の半径ぶん離れた所）へ押し出す', () => {
    // 右の辺の近く → 右へ
    expect(pushOutOfBoxes(1.9, 0.1, 0.4, [box])).toEqual({ x: 2.4, z: 0.1 });
    // 手前の辺の近く → 手前へ
    expect(pushOutOfBoxes(0, -0.9, 0.4, [box])).toEqual({ x: 0, z: -1.4 });
  });

  it('体の半径の分だけでも重なれば押し出す（壁にめりこまない）', () => {
    expect(pushOutOfBoxes(-2.2, 0, 0.4, [box])).toEqual({ x: -2.4, z: 0 });
  });
});
