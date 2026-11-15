// 建物の当たり判定：真上から見た箱（建物の形）から、円（宇宙飛行士の体）を外へ押し出す。Babylon を使わない計算だけ

export interface FootprintBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * 位置 (x, z)・半径 r の体が箱に入りこんでいたら、いちばん近い辺の外へ押し出した位置を返す。
 * 入りこんでいなければそのまま
 */
export function pushOutOfBoxes(
  x: number,
  z: number,
  r: number,
  boxes: Iterable<FootprintBox>,
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (const box of boxes) {
    const left = px - (box.minX - r);
    const right = box.maxX + r - px;
    const back = pz - (box.minZ - r);
    const front = box.maxZ + r - pz;
    if (left <= 0 || right <= 0 || back <= 0 || front <= 0) {
      continue;
    }
    const least = Math.min(left, right, back, front);
    if (least === left) px = box.minX - r;
    else if (least === right) px = box.maxX + r;
    else if (least === back) pz = box.minZ - r;
    else pz = box.maxZ + r;
  }
  return { x: px, z: pz };
}
