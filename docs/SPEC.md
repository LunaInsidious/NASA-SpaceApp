# AI開発用 仕様書とタスク（Junior Astronaut Mission Trainer）

Nov 14, 2026 · @takatsuno itsuki

## 使い方とAIへの共通ルール

この文書は、オーケストレーターがコーディングエージェントに渡すための仕様と作業手順です。Markdownで書き出してリポジトリの `docs/SPEC.md` に置き、エージェントには「仕様はここ、今回はステップNだけ」と渡します。共通ルールは `CLAUDE.md`（または使うエージェントの設定ファイル）にも写いておきます。

**AIへの共通ルール**

1. ゲーム内の数値は `data/values.json` からだけ読む。数値を自分で考えたり、コードに直接書いたりしない。値がなければ仮の値を入れ、`"source": "TBD"` と書く
2. 画面に出る文言は `i18n/en.json` と `i18n/ja.json` からだけ読む。文言をコードに直接書かない
3. シミュレーション（`src/sim/`）はBabylon.jsもDOMも使わない純粋なTypeScriptにする。変更したら `pnpm test` を通す
4. 型定義（`src/contracts/`）は勝手に変えない。変える必要があれば、PRの説明に理由を書いて人間に確認を求める
5. NASAのロゴやデザイン要素を使わない。静的なデータを「ライブ」と表示しない
6. 子どもから自由入力の文字を受け取らない。個人情報を集めない。IPアドレスや端末情報を保存しない
7. 新しいnpmパッケージを足すときはPRの説明に書く。素材（画像、3Dモデル、音）は `assets/LICENSES.md` に出典とライセンスを書く
8. 生成したコードには、ファイルの先頭かリポジトリのREADMEでAIを使ったことを明記する（提出ルールのため）
9. 1つのPRは1つのステップの1つの作業だけ。PRの説明に「完成の基準」をどう確かめたかを書く
10. 仕様にないことを勝手に足さない。迷ったら仮の実装にして `// TODO(人間に確認):` と書く

## 前提

NASA Space Apps Challenge 2026の「Build a Junior Astronaut Mission Trainer」に提出する、ブラウザで遊ぶ月面基地の3Dゲームです。

| 項目 | 内容 |
| --- | --- |
| 対象 | 7〜12歳。推奨ではなくチャレンジの必須の対象 |
| チャレンジの必須要件 | 月か火星の前哨基地を運営し、生命維持、放射線遮蔽、電力配分、食料生産、通信の遅れを判断させる。トレードオフがはっきり伝わる動く試作品 |
| チャレンジの推奨 | 専門用語は場面の中で説明。ゲーム内でデータの出典を示す。コストのない安全な選択を作らない。中心の資源は2〜3個。繰り返し遊べる |
| 画面 | 三人称の追従カメラ。PC（キーボードとマウス）とスマホ（仮想パッド） |
| 言語 | 英語が基本、日本語に切り替え可能 |
| 技術 | Vite、TypeScript、`@babylonjs/core`、pnpm、Vitest |
| ホスト | Cloudflare Pages（本体）、Workers（DONKIの中継、ランキングのAPI）、D1（ランキング） |
| データ | PGDAの月南極DEMと日照マップ、DONKI（太陽フレア、SEP）、OSDR/RadLab、BVAD、CSAの食料生産の資料 |
| 試作 | [月面 三人称 試作（Babylon.js）](https://claude.ai/artifact/GSJjdtXyvrLtJHUVC5aagb)。追従カメラ、跳ねる移動、日照判定、仮想パッドの実装例として使う |

## 決定済みのゲーム仕様

プレイヤーは月の南極に着陸し、実データの地形を歩いて基地を広げ、「発展度」を60以上にするとクリアです。クリア後も生き延びるかぎり遊び続けられ、最高の発展度でランキングします。

### 枠組み

- **チュートリアル**（合計3〜5分、3つの短い課題）
  1. 電力：太陽電池を置き、影に入ると発電が止まるのを見る → 蓄電池を置く
  2. 放射線：実際の太陽フレアの警報（DONKI）で、屋内に退避するか作業を続けるかを選ぶ
  3. 氷と酸素：影のクレーターへ氷を取りに行き、ボンベの酸素が尽きる前に戻る
- **本編**：時間制限なし。待っている間も生命維持の物資は減り続ける
- **ゲームオーバー**：基地の生命維持（酸素、水、食料のいずれか）が尽きる、または宇宙飛行士が倒れる（ボンベの酸素切れ、大量の被ばく）。原因と次にやることを説明し、その後はセーブの一覧から選んで再開できる
- **チュートリアル中に倒れたとき**：居住モジュールで目を覚まして続け、「本当のミッションならゲームオーバー」と伝える。チュートリアルで、ボンベの酸素切れ、大量の被ばく、生命維持の物資切れがゲームオーバーになることを教える

### 時間

- 常に進む。地球の1日 ＝ 約20秒（1倍のとき）。太陽は約29.5地球日で空を一周する（約10分）
- メニューや解説を開いている間は自動で止まる。1倍と4倍を切り替えられる
- 計算は固定の刻み（例：ゲーム内の1時間）で `step` を呼ぶ。4倍のときは呼ぶ回数を増やすだけで、刻みは変えない

### 中心の資源（HUDに常に表示）

- **生命維持**：酸素、水、食料をまとめて「あと何日もつか」で表示。押すと内訳が出る
- **電力**：今の発電と蓄電池の残り
- **遮蔽**：宇宙飛行士の被ばく量と、基地の守りの強さ
- 加えて、操作中の宇宙飛行士のボンベの酸素と、発展度（4要素の星）

### 隊員と割り当て

- 新しい隊員は地球への打ち上げの注文で呼ぶ（下の「打ち上げ」）。呼ぶと人手と規模が増え、消費も増える。居住モジュールの空きが必要
- 隊員は「点検」「研究」「栽培」に人数を振り分ける
- 操作する宇宙飛行士も隊員の1人で、施設を置く、氷を運ぶ、自分で点検する、居住モジュールにレゴリスを盛るなどの手作業を担当する

### 研究と改善

- 研究担当の隊員の人数に応じて、毎日一定の研究が進む（係数は `data/values.json`）
- 地球と通信できるときに送った分だけが「研究ポイント」になる。送れていない分はたまっていて、通信が戻ると送られる
- 研究ポイントを使って、改善の一覧から選んで手に入れる（例：栽培の効率、劣化の遅さ、遮蔽の強さ、水の再利用）。どこを先に良くするかが判断になる
- 改善の一覧と効果は `data/upgrades.json` に置き、効果は values.json の係数を変える形で実装する
- 改善の数には上限があるので、研究をためて放置しても発展度は伸び続けない

### 機器の劣化

- 施設ごとに「状態」（0〜1）があり、月のほこりと時間で下がる。下がると性能が落ち、ある値を下回ると止まる
- 点検すると元に戻る。点検には時間、屋外での被ばく、交換部品がかかる。点検担当の隊員は自動で点検する
- 予防（ほこりよけ、着陸場から離して置く）で劣化が遅くなるが、建てるときに資材と電力が余分にかかる

### 打ち上げ（地球への注文）

地球から運べる量には限りがあり、補給の物資、部品、隊員、中継衛星が同じ枠を取り合う。地球に頼るほど枠を使い、自給できるほど枠を発展に回せる。

- 打ち上げは一定の日数ごとに1回。注文から届くまでに数日かかる（数値は `data/values.json`）
- 1回の打ち上げには「コスト」の上限がある。画面にはコストのメーター1本だけを出す
- 荷物のコスト ＝ max（実際の重さ、大きさを重さに換算した値）。航空貨物の容積重量と同じ考え方で、重さと大きさは出典つきの実データから決める
- 頼める荷物：生命維持の物資（食料、水、酸素）、交換部品、資材、施設のキット、新しい隊員、中継衛星
- 火星では打ち上げの間隔が大きく伸びる（打ち上げの好機は約26か月ごと）

### 着陸地点と段階の解放

- 地形は縦横を同じ割合で縮める（斜面の角度と影のでき方を実際のまま保つ）。距離の表示は実寸に換算する
- 段階1：南極の候補地2〜3か所（日がよく当たり、氷が近い）。段階2：南極のほかの候補地。段階3：南極のどこでも。段階4：北極やアポロの着陸地点。段階5：火星
- その段階のどこかで発展度60に届くと、次の段階が開く。進み具合はlocalStorageに保存
- MVPで遊べるのは段階1だけ。先の段階は地図に鍵のマークで表示する
- 太陽の動きの計算は、段階4に備えて最初から緯度で変わる形にする

### 通信と中継衛星

- アンテナは地球が見えるときだけ通じる。地球が見えるかは場所（地形）と時期（月の約半分は地球が沈む）で変わる
- 通信が途切れると、太陽フレアの警報と打ち上げの注文が届かず、研究の成果も送れない（研究は送れた分だけ発展度に入る）
- 中継衛星を打ち上げで頼むと1機で地球が沈む時期の大半、2機で常に通じる（軌道は計算しない。NASAのLCRNSの資料に合わせた単純化）

### 放射線の遮蔽

- 退避：太陽フレアのときに屋内に入る。屋外の作業は止まる
- 居住モジュールにレゴリスを盛る：屋内の遮蔽が強まる。作業の時間と屋外での被ばくがかかる
- 遮蔽の壁：建てるときに材料を選ぶ。レゴリス製は資材と時間がかかる。水製は同じ厚さならより効くが、生命維持の水を使う

### 太陽フレア（宇宙天気）

- 頻度と起こり方は実データどおりにする。DONKIの実際の記録から、ある期間（数か月分）を切り出し、ゲーム内の1日を実際の1日として順に起こす。どの期間を使うかは `rng` でランダムに選ぶ
- 退避が必要な警報はSEPとX級のフレアだけ。それ以外のフレアは画面に小さく出す程度
- 太陽活動の周期（約11年）のどの時期の記録を使うかを地点ごとに指定できるようにし、難しさの調整に使う（易しい地点は静かな時期、難しい地点は活発な時期）
- 警報には元のイベントの実際の日付と等級を出し、「過去の実際のイベント」と明示する
- 通信が途切れているときは警報が届かない

### セーブ

- 自動セーブと手動セーブを持ち、ゲームオーバーの後やタイトル画面で、一覧から選んで再開できる
- 枚数は未決（仮：自動セーブはゲーム内の1日ごとで直近7日分、手動セーブは3枚）。保存先は localStorage

### 水と酸素

- 序盤：宇宙飛行士が影のクレーターから氷を手で運ぶ（ボンベの酸素と時間を使う）
- 氷の採掘機を建てると自動で掘る。影の中にしか置けず、暗く寒いので電力を多く使い、劣化も早い
- 生命維持装置が、電力を使って氷から水と酸素を作る

### MVPの施設（8つ）

居住モジュール、太陽電池、蓄電池、アンテナ、生命維持装置、栽培室、氷の採掘機、遮蔽の壁。中継衛星は施設ではなく打ち上げで頼む。

### 発展度

4要素をゲーム内の1日に1回計算し、**発展度 ＝ 4要素の幾何平均**とする。各要素の最低値は5。貯めていくポイントではなく「今の基地の状態」を表すので、放置しても上がらない。

| 要素 | 計算 | 上限 |
| --- | --- | --- |
| 自給 | 直近7日で現地で用意できた割合（酸素、水、食料、電力のうち最低のもの）× 100 | 100 |
| 安定 | ①直近3日の蓄電池の最低残量の割合 ②生命維持の物資の日数（14日で満点）③機器の平均の状態、の平均 × 100 | 100 |
| 安全 | ①基地の守り（屋内で放射線をさえぎる割合）②直近7日に地球と通信できていた時間の割合（警報が届くか）、の平均 × 100 | 100 |
| 規模 | 20 × 隊員の人数 ＋ 10 × 手に入れた改善の数 | なし |

- 参考：着陸直後は約24、隊員3人で釣り合いが取れると約78
- 係数（20、10、14日、0.9など）は `data/values.json` に置き、バランス調整で変えられるようにする

### クリアとその後

- 発展度が60を超えたら基地の完成。次の段階の着陸地点が解放される（最後の段階が火星。MVPでは段階1だけ遊べ、先は地図の鍵のマークと予告）
- クリア後も生き延びるかぎり続けられる
- 結果画面：最高の発展度、生き延びた日数、実績、使ったNASAデータの一覧

### ランキングと名前

- MVPには含めない（余裕があれば作る）。指標はゲーム中に達した最高の発展度。生き延びた日数も一緒に表示する
- 名前は「形容詞＋動物＋2桁の数字」（例：Lunar Fox 42）を自動で付け、引き直せる。自由入力はなし
- ブラウザからは単語の番号だけを送り、名前はサーバーで組み立てる。D1で名前の組に一意の制約をかけ、重なったら数字だけ引き直す
- 本人確認はブラウザに保存したランダムなID。保存するのは名前の番号、最高発展度、日数、ランダムなID、日付だけ

### 実績

- ブラウザ内（localStorage）に保存。条件と文言は `data/achievements.json` の一覧で持つ
- 学びにつながるものにする（例：影の中に太陽電池を置いた、太陽フレアで退避した、氷を見つけた）

## アーキテクチャ

シミュレーションは画面から切り離した純粋関数 `step` で、画面とUIは `SimState` を読んで `SimCommand` を送るだけです。各エージェントはこの契約を境に並行して作業します。

### ディレクトリ構成

```
/
├─ src/
│  ├─ contracts/     型定義（下の契約）。人間の確認なしに変えない
│  ├─ sim/           step、資源、施設、隊員、劣化、イベント、発展度（純粋なTS、Vitestでテスト）
│  ├─ world/         Babylonのシーン、地形、太陽と影、宇宙飛行士、カメラ、施設の見た目
│  ├─ env/           Envの実装（地形、日照、地球が見えるか、氷の場所）
│  ├─ ui/            HUD、メニュー、解説、結果、ランキング、仮想パッド（HTML/CSSをゲーム画面に重ねる）
│  ├─ tutorial/      チュートリアル3課題の進行
│  ├─ save/          localStorageへの保存（try/catch必須）
│  └─ main.ts
├─ data/            values.json、facilities.json、donki-events.json、achievements.json、names.json
├─ i18n/            en.json、ja.json
├─ public/terrain/  着陸地点ごとの高さマップ、日照、地球が見えるかの画像
├─ tools/           地形変換やDONKI取得のスクリプト（ビルド時に使うだけ）
├─ worker/          Cloudflare Worker（DONKIの中継、ランキングのAPI、D1）
└─ docs/SPEC.md     この文書
```

### 契約（`src/contracts/index.ts` のたたき台）

```ts
export type ResourceKey = 'oxygen' | 'water' | 'food' | 'power';
export type FacilityKind =
  | 'habitat' | 'solar' | 'battery' | 'antenna' | 'greenhouse'
  | 'lifeSupport' | 'iceDrill' | 'shield';
export type CrewTask = 'maintenance' | 'research' | 'farming';
export type LaunchItemKind =
  | 'oxygen' | 'water' | 'food' | 'spareParts' | 'materials'
  | 'facilityKit' | 'crew' | 'relaySatellite';

export interface LaunchItem {
  kind: LaunchItemKind;
  quantity: number;
  facilityKind?: FacilityKind;  // facilityKit のときだけ
}

/** コスト ＝ max(実際の重さ, 大きさを重さに換算した値)。値は values.json */
export interface Launch {
  id: string;
  items: LaunchItem[];
  totalCost: number;
  arrivesAtHours: number;
}

export interface PlanetConfig {
  id: 'moon' | 'mars';
  gravity: number;              // m/s^2
  sunElevationDeg: number;      // 太陽の高度（月の南極は地平線すれすれ）
  sunPeriodDays: number;        // 太陽が一周する地球日数（月は約29.5）
  commDelaySec: number;         // 地球との片道の通信の遅れ
  radiationMsvPerDay: number;   // 屋外での1日あたりの線量
  sites: SiteConfig[];
}

export interface SiteConfig {
  id: string;                   // 着陸地点
  stage: 1 | 2 | 3 | 4 | 5;     // 解放の段階
  latitudeDeg: number;          // 太陽の動きの計算に使う
  scale: number;                // 縦横同じ縮尺（例 0.1）。距離の表示は実寸に戻す
  heightmapUrl: string;         // 16bit PNG
  illuminationUrl: string;      // 平均日照率の画像（表示と説明用）
  earthVisibilityUrl: string;   // 地球が見えるかの画像
  sizeMeters: number;           // ゲーム内の一辺の長さ（縮尺は未決）
  heightRangeMeters: [number, number];
  landerPosition: [number, number];
}

/** 地形と日照を問い合わせる関数。実装は env/。sim/ はこれだけを通して世界を知る */
export interface Env {
  heightAt(x: number, z: number): number;
  isSunlit(x: number, z: number, y: number, sunAzimuthRad: number): boolean;
  isEarthVisible(x: number, z: number): boolean;
  isIceAt(x: number, z: number): boolean;
  dustFactorAt(x: number, z: number): number; // 着陸場に近いほど大きい
}

export interface Facility {
  id: string;
  kind: FacilityKind;
  x: number; z: number;
  condition: number;            // 0〜1。劣化で下がり、点検で戻る
  dustCover: boolean;           // ほこりよけの有無
  shieldMaterial?: 'regolith' | 'water'; // 遮蔽の壁の材料
  regolithCover?: boolean;      // 居住モジュールにレゴリスを盛ったか
  sunlit: boolean;              // 直前の判定結果（太陽電池等）
}

export interface CrewMember {
  id: string;
  isPlayer: boolean;
  task: CrewTask | null;        // プレイヤーは null
  doseMsv: number;              // 累積の被ばく量
}

export interface SimState {
  timeHours: number;            // ゲーム内の経過時間
  sunAzimuthRad: number;
  stocks: Record<'oxygen' | 'water' | 'food' | 'spareParts' | 'materials', number>;
  batteryKwh: number;
  facilities: Facility[];
  crew: CrewMember[];
  player: { x: number; z: number; tankOxygen: number; indoors: boolean; downed: boolean };
  history: DailyRecord[];       // 発展度の計算に使う直近の記録
  development: { selfSufficiency: number; stability: number; safety: number; scale: number; total: number; best: number };
  activeEvents: ActiveEvent[];
  launches: Launch[];           // 注文済みで、まだ届いていない打ち上げ
  nextLaunchAtHours: number;    // 次に注文できる打ち上げ
  relaySatellites: number;      // 0〜2
  commLinked: boolean;          // 今、地球と通じているか
  unsentResearch: number;       // 通信が途切れて送れていない研究
  researchPoints: number;       // 送れた研究。改善に使う
  upgrades: string[];           // 手に入れた改善のID
  phase: 'tutorial' | 'main' | 'cleared' | 'gameOver';
}

export interface DailyRecord {
  day: number;
  produced: Record<ResourceKey, number>;
  consumed: Record<ResourceKey, number>;
  minBatteryRatio: number;
  research: number;
  downedCount: number;
}

export type SimCommand =
  | { type: 'build'; kind: FacilityKind; x: number; z: number; dustCover: boolean; shieldMaterial?: 'regolith' | 'water' }
  | { type: 'coverWithRegolith'; facilityId: string }
  | { type: 'demolish'; facilityId: string }
  | { type: 'repair'; facilityId: string }       // プレイヤーが自分で点検
  | { type: 'assignCrew'; crewId: string; task: CrewTask }
  | { type: 'orderLaunch'; items: LaunchItem[] }
  | { type: 'buyUpgrade'; upgradeId: string }
  | { type: 'collectIce'; x: number; z: number }
  | { type: 'setPlayer'; x: number; z: number; indoors: boolean };

export interface ActiveEvent {
  kind: 'solarFlare' | 'sep';
  source: 'archived' | 'live';  // 画面に必ず表示する
  donkiId: string;
  classOrIntensity: string;
  endsAtHours: number;
}

export type GameEvent =
  | { type: 'facilityStopped'; facilityId: string; reason: 'shadow' | 'condition' | 'noPower' }
  | { type: 'eventStarted'; event: ActiveEvent }
  | { type: 'launchArrived'; launchId: string }
  | { type: 'commLost' }
  | { type: 'commRestored' }
  | { type: 'playerDowned'; reason: 'tankEmpty' | 'radiation' }
  | { type: 'developmentChanged'; total: number }
  | { type: 'cleared' }
  | { type: 'gameOver'; reason: ResourceKey }
  | { type: 'achievement'; id: string };

/** 純粋関数。dtHours は固定の刻み。乱数は rng を通してのみ使う */
export type Step = (
  state: SimState, dtHours: number, env: Env, commands: SimCommand[],
  values: Values, events: DonkiTimeline, rng: () => number,
) => { state: SimState; emitted: GameEvent[] };
```

`Values`（`data/values.json` の型）と `DonkiTimeline`（`data/donki-events.json` の型）も `contracts/` に置きます。

### データファイル

| ファイル | 中身 | 作る人 |
| --- | --- | --- |
| `data/values.json` | すべての数値。各値は `{ "value": 0.84, "unit": "kg/person/day", "source": "BVAD ...", "url": "..." }` の形 | 科学・データ担当（人間）。AIは形だけ作る |
| `data/facilities.json` | 施設ごとの建設コスト、消費、生産、劣化の速さ、置ける条件 | ゲームデザイン担当（人間） |
| `data/donki-events.json` | ゲーム内で起こしてよい過去の実際のフレアとSEPの一覧（DONKIのID、日時、等級）。いつ起こすかはランダム | `tools/` のスクリプトで取得し、科学・データ担当が選ぶ |
| `data/achievements.json` | 実績のID、条件の種類としきい値、文言のキー | 教育・文言担当 |
| `data/names.json` | 名前の形容詞100語と動物100語（英語と日本語） | 教育・文言担当 |
| `i18n/en.json`, `i18n/ja.json` | 画面のすべての文言 | 教育・文言担当 |
| `public/terrain/<site>/` | `height.png`（16bit、グレースケール）、`illumination.png`、`earth.png`、`site.json`（縮尺、高さの範囲、出典） | `tools/` のスクリプトで変換し、科学・データ担当が範囲を選ぶ |

## ステップごとのタスク

ステップ0を終えたら、1・2・3・5は別々のエージェントで並行して進められます。ステップ4で結合し、そのあと6・7を並行、最後に8〜11を進めます。各ステップの完成は、プレビューURLで人間が確かめて判断します。

順番：0 →（1、2、3、5）→ 4 →（6、7）→（8、9）→ 10 → 11

### ステップ0：土台（最初の1時間）

- 作業：Vite＋TypeScript＋`@babylonjs/core`、pnpm、Vitest、ESLint。`src/contracts/` に上の型を入れる。`data/values.json` と `i18n/*.json` を仮の値で置く。Cloudflare Pagesに公開し、PRごとにプレビューを出す。`worker/` に `/api/health` だけのWorkerを置く。`CLAUDE.md` に共通ルールを書く
- 完成の基準：本番とプレビューのURLでBabylonの空のシーンが開く。`pnpm build` と `pnpm test` が通る。`/api/health` が応答する

### ステップ1：世界と操作（world/、env/）

- 作業：試作を移植する。地形は `height.png` があれば読み、なければ自動生成。Envを実装（日照は太陽の方向へ地形を調べる計算）。地形の影は同じ計算で頂点の明るさに焼き込む。宇宙飛行士（簡単な形、PlanetConfigの重力で跳ねる）、追従カメラ（地形にめり込まない）、キーボードと仮想パッド、着陸船、星空と地球
- 完成の基準：PCとスマホで歩ける。画面で日なたに見える場所で `isSunlit` が true になる。中程度のPCで滑らかに動く
- 依存：ステップ0

### ステップ2：シミュレーションの核（sim/）

- 作業：`step` を固定の刻みで実装。隊員による消費、施設の生産と消費（日照と状態で変わる）、蓄電池、生命維持の日数、ゲームオーバー、日ごとの記録、発展度の計算。乱数は引数の `rng` だけを使う
- 完成の基準：テストが通る。「着陸直後は発展度が約24」など、仕様の参考値に近いことをテストで確かめる。決めた操作列で60日分を画面なしで回し、発展度の推移をCSVで出すスクリプトがある（バランス調整用）
- 依存：ステップ0（Envはテスト用の偽物でよい）

### ステップ3：UIの土台（ui/）

- 作業：HUD（生命維持の日数と内訳、電力、遮蔽、ボンベの酸素、発展度と4要素の星）、速さの切り替え（1倍、4倍）、メニューを開くと一時停止、日英の切り替え、スマホのレイアウト。画面の配置は見た目・体験担当のラフに従う
- 完成の基準：偽物の SimState を切り替える開発用のページで、すべての表示を確かめられる。文言はすべて i18n から出ている
- 依存：ステップ0

### ステップ4：結合と建設

- 作業：ゲームループ（固定の刻みで `step` を呼ぶ）で、1・2・3をつなぐ。建設メニュー → 宇宙飛行士の前に置くプレビュー（日なたかどうか、アンテナは地球が見えるか、採掘機は氷があるかを色で示す）→ 資材を払って建つ。施設の見た目。ミニマップ（日照の画像の上に自分と施設）
- 完成の基準：太陽電池を置くとHUDの電力が増え、太陽が動いて影に入ると発電が止まる。居住モジュールに入ると屋内扱いになる
- 依存：ステップ1、2、3

### ステップ5：実データの地形（tools/、public/terrain/）

- 作業：PGDAのGeoTIFFから、指定した範囲を切り出して `height.png`、`illumination.png`、`earth.png`、`site.json` を作るスクリプト。範囲、解像度、縮尺（縦横を同じ割合で縮める）は引数で渡す。氷の場所は永久影（平均日照率がほぼ0）から求める
- 完成の基準：科学・データ担当が選んだ範囲で実際に歩ける。ゲーム内で影になりやすい場所と、PGDAの平均日照率の画像の暗い場所が一致する（人間が目で確かめる）
- 依存：ステップ0。縮尺は人間が決める（未決事項）

### ステップ6：打ち上げ、隊員、劣化、通信

- 作業：打ち上げの注文画面（コストのメーター、荷物ごとのコスト、届くまでの日数。隊員と中継衛星もここで頼む）、通信の判定（地球が見えるかと中継衛星の数）、送れていない研究の扱い、割り当てのメニュー、点検担当による自動点検、プレイヤーの手動点検（屋外で被ばく、部品を消費）、ほこりによる劣化（着陸場の近くほど速い）、ほこりよけの選択、劣化の見た目
- 完成の基準：「点検しないと安定が下がり、やがて施設が止まる」「隊員を呼ぶと規模は上がり、消費が増える」「1回の打ち上げのコストを超えては頼めない」「中継衛星がないと地球が沈む時期に通信が途切れる」ことをテストで確かめる
- 依存：ステップ4

### ステップ7：宇宙天気（DONKI）

- 作業：`tools/` にDONKIのFLRとSEPを取得するスクリプト（結果は `data/donki-events.json` の候補として出し、人間が選ぶ）。ゲーム内では過去の実イベントの中からランダムに起こす。警報の画面で「退避する」「作業を続ける」を選ばせ、被ばくを計算。Workerに `/api/donki`（APIキーはシークレット、1時間キャッシュ）を作り、ライブ表示は余裕があれば
- 完成の基準：警報に必ず「過去の実際のイベント（日付）」か「今の宇宙天気」が表示され、DONKIの出典にたどれる。ブラウザのコードにAPIキーが含まれない
- 依存：ステップ4

### ステップ8：チュートリアル

- 作業：3つの課題を、目標の一覧（文言のキーと達成条件）で進める仕組み。台本は教育・文言担当のものを使う。飛ばすボタンを付ける
- 完成の基準：初めて遊ぶ人が5分以内に3課題を終えられる（テスト・発表担当が確かめる）
- 依存：ステップ4、6、7

### ステップ9：クリア、結果、実績、セーブ

- 作業：発展度60で完成の演出と火星の予告。結果画面（最高発展度、日数、実績、使ったデータの出典）。実績の判定。自動セーブと手動セーブ（形式にバージョン番号を付ける）、ゲームオーバー後やタイトル画面でのセーブの一覧と再開。データ出典の画面
- 完成の基準：リロードしても続きから遊べる。localStorageが使えない環境でも落ちない
- 依存：ステップ4、6

### ステップ10：ランキング（MVP外。余裕があれば）

- 作業：名前の自動生成と引き直し。Workerの `POST /api/scores` と `GET /api/ranking`、D1のテーブル（名前の組に一意の制約、重なったら数字を引き直す）。同じIDからの送信は1分に1回まで。ランキング画面（自分の行を強調）
- 完成の基準：異なる2台の端末から送ったスコアが並んで表示される。任意の文字列を送っても登録されない。保存されるのは仕様の項目だけ
- 依存：ステップ9

### ステップ11：仕上げ（2日目の昼に機能の追加を止める）

- 作業：スマホでの性能、読み込み中の画面、不具合の修正、READMEとメタデータへのAI使用の記載、`assets/LICENSES.md` の確認
- 完成の基準：テスト・発表担当の実機確認の一覧をすべて通る。審査員がログインなしで本番URLを開ける

## 未決事項

どれも人間が決めてからAIに渡します。決まるまでは、AIは仮の値で実装して `TODO(人間に確認)` を残します。

| 未決事項 | 決める人 | 影響するステップ | 決まるまでの仮の値 |
| --- | --- | --- | --- |
| 地形の縮尺の値（縦横を同じ割合で何分の1にするか） | ゲームデザイン、科学・データ | 1、5 | 一辺300mの自動生成の地形 |
| 段階1の着陸候補地（2〜3か所、易しい順） | 科学・データ | 5 | 1か所 |
| 施設ごとの数値（コスト、生産、消費、劣化の速さ） | ゲームデザイン、科学・データ | 2、4、6 | `source: TBD` の仮の値 |
| 打ち上げの間隔、届くまでの日数、1回のコストの上限、荷物ごとの重さと大きさ | ゲームデザイン | 2、4 | 10日に1回、届くまで3日、他は仮の値 |
| 隊員の人数の上限 | ゲームデザイン | 6 | 上限10人 |
| ゲームのタイトル | 全員 | 3、9 | 「Lunar Outpost」 |
| 名前の単語リスト（形容詞100、動物100） | 教育・文言 | 10 | 10語ずつ |
| 実績の一覧 | 教育・文言 | 9 | 4つ（仕様の例） |
| チュートリアルの台本 | 教育・文言 | 8 | 仕様の3課題の説明文 |
| ゲーム内で起こすDONKIのイベント | 科学・データ | 7 | 取得スクリプトの候補から3件 |
| 画面の配置と色 | 見た目・体験 | 3 | 試作のHUDの配置 |
| 名前の引き直しの回数 | ゲームデザイン | 10 | 無制限 |

このほかの未決事項：

- **改善の一覧と効果**（ゲームデザインと科学・データで決める。仮：栽培の効率、劣化の遅さ、遮蔽の強さ、水の再利用の4つ）
- **セーブの枚数**（仮：自動セーブは直近7日分、手動セーブは3枚）
- **太陽フレアで使う実際の期間**（科学・データ担当が、太陽活動が静かな時期と活発な時期からそれぞれ選ぶ。仮：直近の1年分）
