// ui/ が外（main.ts）に見せる型。実装は src/ui/index.ts の createUi(root, callbacks, values)
import type {
  ActiveEvent,
  CrewTask,
  DonkiEvent,
  FacilityKind,
  GameEvent,
  LaunchItem,
  SimState,
} from '../contracts/index.ts';
import type { SaveSummary } from '../save/api.ts';
import type { BuildOptions, Placement, SimView } from '../sim/api.ts';
import type { DeathAdvice } from '../tutorial/death.ts';
import type { PadInput } from '../world/api.ts';
import type { NasaImages } from './photo.ts';

/** その場でできること。E キー（スマホではボタン）で先頭のものを行う */
export type ContextAction =
  | 'enterHabitat'
  | 'exitHabitat'
  | 'collectIce'
  | 'repair'
  | 'coverRegolith'
  | 'nextDay';

/** 「翌日へ」で進めた間に起きたこと。翌朝の活動フェーズに入る前に1枚の窓で見せる */
export interface MorningSummary {
  /** 新しい日（着陸の日を 0 とする） */
  day: number;
  /** 物資の増減（変わらなかったものは入れない） */
  stockChanges: { kind: 'oxygen' | 'water' | 'food' | 'spareParts' | 'materials'; delta: number }[];
  /** 届いたロケットの数 */
  arrived: number;
  /** 寝ている間に起きた宇宙天気（中にいたので被ばくは基地の守りの分だけ） */
  spaceWeather: ActiveEvent[];
}

export interface UiCallbacks {
  /** メニューや解説を開くと true、閉じると false（main が時間を止める） */
  onPauseChange(paused: boolean): void;
  onBuildSelect(kind: FacilityKind, options: BuildOptions): void;
  onBuildConfirm(): void;
  onBuildCancel(): void;
  onOrderLaunch(items: LaunchItem[]): void;
  onAssignCrew(crewId: string, task: CrewTask): void;
  onContextAction(action: ContextAction): void;
  onFlareChoice(choice: 'shelter' | 'continue'): void;
  /** 新しく始める（セーブは消さない） */
  onRestart(): void;
  /** セーブの窓の「タイトルに戻る」。main がいまの状態を自動でセーブしてからタイトルを出す */
  onBackToTitle(): void;
  /** 手動セーブ。slot は 0 から values.save.manualSlots - 1 */
  onSave(slot: number): void;
  /** セーブから再開する。ui は先に窓とメニューを閉じる */
  onLoad(saveId: string): void;
}

export interface Ui {
  /** 時間が進むたびに呼ぶ */
  update(state: SimState, view: SimView): void;
  /**
   * step が出した GameEvent を見せる（トースト、警報、倒れたときの説明、クリア、ゲームオーバー）。
   * 倒れた・ゲームオーバーのときは、death にルナはかせのアドバイス（原因とつぎにやること）を渡す
   */
  showEvents(events: GameEvent[], state: SimState, death: DeathAdvice | null): void;
  /** 「翌日へ」のあとの朝の窓 */
  showMorning(summary: MorningSummary): void;
  /** 太陽フレアの警報。退避するか作業を続けるかを選ばせる。出典（過去の実際のイベントと日付）を必ず見せる */
  showFlareAlert(event: ActiveEvent, donki: DonkiEvent | null): void;
  getPadInput(): PadInput;
  /** 建てる場所を選んでいる間の表示。null で消す */
  setBuildMode(mode: { kind: FacilityKind; placement: Placement } | null): void;
  setContextActions(actions: ContextAction[]): void;
  /** キーボードの近道（B：建設、L：打ち上げ、C：隊員）から開く。'save' はセーブの窓 */
  openMenu(menu: 'build' | 'launch' | 'crew' | 'save' | 'data'): void;
  /** セーブの一覧が変わったら main が呼ぶ（新しい順） */
  setSaves(saves: SaveSummary[]): void;
  /** データ出典の窓に出す、ゲームで使う DONKI の記録（data/donki-events.json）。起動時に main が1回呼ぶ */
  setDonkiEvents(events: DonkiEvent[]): void;
  /** NASA の本物の写真（data/nasa-images.json）。太陽フレアの警報に出す。起動時に main が1回呼ぶ */
  setNasaImages(images: NasaImages): void;
  closeMenus(): void;
  /** 短いお知らせ（下の真ん中）。bad なら赤い線で出す */
  notify(text: string, bad: boolean): void;
  isMenuOpen(): boolean;
  /** 「一時停止」のボタンで止めているか */
  isUserPaused(): boolean;
  /** 窓（メニュー）のいちばん上に出す、博士の「やること」。null なら出さない */
  setGuide(html: string | null): void;
}
