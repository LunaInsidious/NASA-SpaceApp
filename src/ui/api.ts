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
import type { MinigameKind } from '../tasks/minigame.ts';
import type { DeathAdvice } from '../tutorial/death.ts';
import type { PadInput } from '../world/api.ts';
import type { SoundMode } from './fx.ts';
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
  /** 太陽が動いて、影に入って止まった太陽電池の数と、日なたに戻った数 */
  newlyShaded: number;
  newlyLit: number;
  /** 寝ている間に起きた宇宙天気（中にいたので被ばくは基地の守りの分だけ） */
  spaceWeather: ActiveEvent[];
}

/** 休息フェーズの2D画面（居住モジュールの中）に出すもの。main が作る */
/** 夜の通信に出すもの（main が src/comm/report.ts の中身を文にしたもの） */
export interface NightReportView {
  linked: boolean;
  /** 「地球管制より」か「基地の端末より」 */
  from: string;
  /** 基地の端末のときの、話せないわけ */
  lead: string | null;
  greeting: string | null;
  lines: string[];
  /** 放っておくと命に関わること（急ぐ順） */
  dangers: string[];
  stars: { label: string; stars: number }[];
  starChanges: string[];
  tomorrow: string;
  /** 明日のタスク（地球のおすすめか、自分で選んだもの） */
  tomorrowTasks: string;
  /** 宇宙で働く人の知識の一言（休む理由）。なければ null */
  tip: string | null;
}

export interface RestInfo {
  /** その日にもう外に出たか（出たあとなら振り返りから、朝なら明日の計画のページから見せる） */
  wentOutToday: boolean;
  /** 準備した注文（「翌日へ」か「外に出る」で送る。それまでは取り消せる）。なければ null */
  queuedOrder: LaunchItem[] | null;
  /** 外に出られるか */
  canGoOut: boolean;
  /** 博士の「やること」をする夜の画面（launch は返信、crew・tasks は管制モニター、plan は通信）。済むまで「翌朝へ」は押せない */
  requiredPage: 'crew' | 'launch' | 'tasks' | 'plan' | 'save' | null;
  /** 「翌日へ」を押せるか（くんれん中は段による） */
  canNextDay: boolean;
  /** 地球管制からの通信（話せない日は基地の端末）。文は i18n から作った HTML */
  report: NightReportView;
  /** 翌日のタスクの候補（label は i18n から作った HTML、meters は居住モジュールからの距離）。selected は選んだもの */
  tasks: { id: string; label: string; meters: number; selected: boolean }[];
}

export interface UiCallbacks {
  /** メニューや解説を開くと true、閉じると false（main が時間を止める） */
  onPauseChange(paused: boolean): void;
  onBuildSelect(kind: FacilityKind, options: BuildOptions): void;
  onBuildConfirm(): void;
  onBuildCancel(): void;
  /** 注文を準備する（送るのは「翌日へ」か「外に出る」のとき） */
  onOrderLaunch(items: LaunchItem[]): void;
  /** 準備した注文を取り消す */
  onCancelOrder(): void;
  onAssignCrew(crewId: string, task: CrewTask): void;
  onContextAction(action: ContextAction): void;
  /** 休息の画面で、翌日のタスクを選ぶ・やめる */
  onTaskToggle(taskId: string): void;
  /** メニューの窓から、ことばじてんを開く */
  onOpenDictionary(): void;
  /** 音の切り替え（メニューの窓で選ぶ） */
  soundMode(): SoundMode;
  setSoundMode(mode: SoundMode): void;
  /** 集めたカードの数（右上のカードのボタンに出す） */
  cardsCount(): { owned: number; total: number };
  /** 豆知識カードの一覧（HTML。メニューの窓に出す） */
  cardsHtml(): string;
  /** 豆知識カードの言葉から、ことばじてんを開く */
  onOpenTerm(term: string): void;
  /** ミニゲームの音（当たった・外した・できた） */
  onMinigameSound(name: 'hit' | 'miss' | 'success'): void;
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
  /** カードの数が変わった（新しく手に入れたら isNew。ボタンを光らせる） */
  cardsChanged(isNew: boolean): void;
  /** 「翌日へ」のあとの朝の窓 */
  showMorning(summary: MorningSummary): void;
  /** 太陽フレアの警報。退避するか作業を続けるかを選ばせる。出典（過去の実際のイベントと日付）を必ず見せる */
  showFlareAlert(event: ActiveEvent, donki: DonkiEvent | null): void;
  getPadInput(): PadInput;
  /** 建てる場所を選んでいる間の表示。null で消す */
  setBuildMode(mode: { kind: FacilityKind; placement: Placement } | null): void;
  setContextActions(actions: ContextAction[]): void;
  /**
   * 建設・くわしい様子（インベントリ画面、I キー）・データは 3D の窓を開く。隊員・ほきゅう・セーブは休息の画面のタブ（中にいればそのタブにし、外ならひとこと出す）。
   * キーボードの近道（B：建設、L：ほきゅう、C：隊員）と困りごとカードから呼ぶ
   */
  openMenu(menu: 'build' | 'status' | 'launch' | 'crew'): void;
  /** 休息フェーズの2D画面を出す（中にいる間）。null で閉じる */
  setRest(info: RestInfo | null): void;
  /** 外で今日こなすタスクの一覧（ボンベの下に出す）。中では出さない */
  setTaskList(tasks: { label: string; done: boolean }[]): void;
  /** ミニゲームを開く。成功するか「やめる」で onFinish を呼ぶ（時間切れは中で「もう一度」を選ぶ） */
  startMinigame(kind: MinigameKind, onFinish: (outcome: 'success' | 'quit') => void): void;
  /** 開いているミニゲームを閉じる（倒れた、警報など。onFinish は呼ばない） */
  stopMinigame(): void;
  isMinigameOpen(): boolean;
  /** セーブの一覧が変わったら main が呼ぶ（新しい順） */
  setSaves(saves: SaveSummary[]): void;
  /** データ出典の窓に出す、ゲームで使う DONKI の記録（data/donki-events.json）。起動時に main が1回呼ぶ */
  setDonkiEvents(events: DonkiEvent[]): void;
  /** NASA の本物の写真（data/nasa-images.json）。太陽フレアの警報に出す。起動時に main が1回呼ぶ */
  setNasaImages(images: NasaImages): void;
  closeMenus(): void;
  /** メニュー（一時停止）の窓を閉じる。開いていなければ false */
  closePause(): boolean;
  /** 短いお知らせ（下の真ん中）。bad なら赤い線で出す */
  notify(text: string, bad: boolean): void;
  isMenuOpen(): boolean;
  /** くわしい様子（インベントリ画面）を見ているか（3D の窓か、休息の画面のページ） */
  isInventoryOpen(): boolean;
  /** 「一時停止」のボタンで止めているか */
  isUserPaused(): boolean;
  /** 窓（メニュー）のいちばん上に出す、博士の「やること」。null なら出さない */
  setGuide(html: string | null): void;
}
