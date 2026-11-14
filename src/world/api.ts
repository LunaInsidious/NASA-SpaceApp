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
  /**
   * 毎フレーム呼ぶ。dtSec は実際の経過秒。キーボード（WASD・矢印・Space）は world が自分で読む
   */
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
  /**
   * 建てる場所（values.build.gridMeters の格子にそろえる）。建設モードの間はマウス（PC）やタップ（スマホ）が
   * 指した地面。まだ指していなければ宇宙飛行士の前
   */
  getBuildSpot(): { x: number; z: number };
  /** 建設モードに入るとき true、出るとき false。置く場所がマウスやタップについてくるようになる */
  setBuildCursor(enabled: boolean): void;
  /** 建設モードの間に、PC で地面を左クリック（ドラッグでない）したとき呼ばれる */
  onGroundClick(listener: () => void): void;
  getPlayer(): PlayerPose;
  teleportPlayer(x: number, z: number): void;
  /** カメラを、宇宙飛行士から見て (x, z) と反対側に回す（ドームなどが宇宙飛行士を隠さないように） */
  pointCameraAwayFrom(x: number, z: number): void;
  setPlayerVisible(visible: boolean): void;
  /** カメラが見ている水平の向き（+z から +x へ回る角度） */
  getViewYawRad(): number;
  /** チュートリアルで行く場所に光の柱を立てる。null で消す */
  setGuideMarker(target: { x: number; z: number } | null): void;
}
