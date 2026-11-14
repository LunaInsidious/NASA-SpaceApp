// world/ が外（main.ts）に見せる型。実装は src/world/index.ts の createWorld(scene, env, values)。Engine と Scene は main.ts が作る
import type { Facility, FacilityKind } from '../contracts/index.ts';
import type { Placement } from '../sim/api.ts';

/** 仮想パッドの入力。x は右が +、y は前が +（-1〜1） */
export interface PadInput {
  x: number;
  y: number;
  jump: boolean;
}

export interface PlayerPose {
  x: number;
  y: number;
  z: number;
  headingRad: number;
}

export interface World {
  /** 毎フレーム呼ぶ。dtSec は実際の経過秒。キーボード（WASD・矢印・Space）は world が自分で読む */
  frame(dtSec: number): void;
  setPadInput(input: PadInput): void;
  /** false の間は宇宙飛行士が動かない（メニュー、屋内、一時停止） */
  setMovementEnabled(enabled: boolean): void;
  setSunAzimuth(sunAzimuthRad: number): void;
  /** 施設の見た目をそろえる。working は SimView.facilityStatus から */
  syncFacilities(facilities: Facility[], working: Record<string, boolean>): void;
  /** 建てる前のプレビュー。null で消す */
  setBuildPreview(
    preview: { kind: FacilityKind; x: number; z: number; placement: Placement } | null,
  ): void;
  /** 宇宙飛行士の前の、建てる場所 */
  getBuildSpot(): { x: number; z: number };
  getPlayer(): PlayerPose;
  teleportPlayer(x: number, z: number): void;
  setPlayerVisible(visible: boolean): void;
  /** チュートリアルで行く場所に光の柱を立てる。null で消す */
  setGuideMarker(target: { x: number; z: number } | null): void;
}
