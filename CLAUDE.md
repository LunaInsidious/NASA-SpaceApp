# CLAUDE.md

NASA Space Apps Challenge 2026「Build a Junior Astronaut Mission Trainer」に提出する、ブラウザで遊ぶ月面基地の3Dゲーム。仕様と作業手順は [docs/SPEC.md](docs/SPEC.md)。指示されたステップの、指示された作業だけを行う。

## 共通ルール（docs/SPEC.md から写したもの）

1. ゲーム内の数値は `data/values.json` からだけ読む。数値を自分で考えたり、コードに直接書いたりしない。出典は、本物の資料（名前と `url`）か、`"ゲームの調整値：理由"`（本物の答えがない値。本物と違う値にしたときは「実際は〜」と資料も書く）のどちらか。`"TBD"` や「仮の値」は使わない（2026-11-15 人間の判断で仕様から変更。`tests/data.test.ts` で確かめる）
2. 画面に出る文言は `i18n/en.json` と `i18n/ja.json` からだけ読む。文言をコードに直接書かない
3. シミュレーション（`src/sim/`）はBabylon.jsもDOMも使わない純粋なTypeScriptにする。変更したら `pnpm test` を通す
4. 型定義（`src/contracts/`）は勝手に変えない。変える必要があれば、PRの説明に理由を書いて人間に確認を求める
5. NASAのロゴやデザイン要素を使わない。静的なデータを「ライブ」と表示しない
6. 子どもから自由入力の文字を受け取らない。個人情報を集めない。IPアドレスや端末情報を保存しない
7. 新しいnpmパッケージを足すときはPRの説明に書く。素材（画像、3Dモデル、音）は `assets/LICENSES.md` に出典とライセンスを書く
8. 生成したコードには、ファイルの先頭かリポジトリのREADMEでAIを使ったことを明記する（提出ルールのため）
9. 1つのPRは1つのステップの1つの作業だけ。PRの説明に「完成の基準」をどう確かめたかを書く
10. 仕様にないことを勝手に足さない。迷ったら仮の実装にして `// TODO(人間に確認):` と書く

## コマンド

- `pnpm dev`：開発サーバー
- `pnpm build`：型チェック（`pnpm typecheck`）のあと `dist/` に本番ビルド
- `pnpm test`：Vitest
- `pnpm lint`：Biome で書式とリントを確かめる。`pnpm format` で直せるものを直す
- `pnpm worker:dev`：Worker（`worker/`）をローカルで動かす
- `pnpm screens <dev の URL> [段の名前]`：iPhone 16・iPad（縦・横）・小さめの PC の大きさで、くんれんの画面（最初の段・建設の段・置く場所を選ぶところ・ミッション）を `.scratch/screens/` に撮る。先に `pnpm dev` を動かしておく。開発のときだけ、URL の `?step=段の名前` でくんれんをその段から始められる
- `pnpm terrain`：`.scratch/terrain/Site01_final_adj_5mpp_surf.tif`（PGDA からダウンロードしたもの。リポジトリには入れない）から `public/terrain/site01/` を作り直す。範囲・縮尺・解像度などの引数はすべて package.json に書いてある（`tools/make-terrain.ts`）

PRを出す前に `pnpm lint`、`pnpm test`、`pnpm build` を通す。

## ステップ0で決めたこと

- リントと書式は ESLint ではなく Biome を使う（仕様の「ESLint」から変更）。`docs/SPEC.md` は整形しない
- `Values` は `data/values.json` の中身から決まる型。値を足すときは JSON に `{ "value", "unit", "source", "url"? }` の形で足すだけでよく、`src/contracts/` を変える必要はない。形は `tests/data.test.ts` で確かめる
- 文言のキーは `区分.名前` の平らな形（例：`facility.solar`）。名前は契約の識別子（`FacilityKind` など）にそろえる。`en.json` と `ja.json` は同じキーを持つ（`tests/data.test.ts` で確かめる）
- `src/sim/` と `src/contracts/` は DOM のない設定（`tsconfig.pure.json`）でも型チェックする。Biome で Babylon とほかの層の読み込み、`Date`、`Math.random` を禁止している。`src/sim/` ではさらに `data/` の読み込みと、計算式に直接書いた数値も禁止（テストは対象外）
- 自分のモジュールは拡張子 `.ts` を付けて読み込む

## MVP（2026-11-14 15時）で決めたこと

- モジュールのつなぎ目は `src/sim/api.ts`、`src/env/api.ts`、`src/world/api.ts`、`src/ui/api.ts`、`src/save/api.ts`。Engine と Scene は `src/main.ts` が作り、`step` を固定の刻みで呼ぶ
- 施設ごとの数値は当面 `data/values.json` の `facilities.<種類>` に置く。仕様のデータ表は `data/facilities.json` を別に置く形なので、どちらにするかは人間に確認する
- `data/donki-events.json` は、DONKI のページで確かめた実際のフレア2件（M5.9、X8.7）と、GOES 衛星が測った SEP 3件（2024-05-10・11・13。2026-11-15 に api.nasa.gov の DONKI から1回だけ取った。kauai.ccmc.gsfc.nasa.gov はこの環境からつながらなかった）。フレアの光そのものは被ばくを増やさず（倍率 1）、危ないのは SEP だけ。宇宙天気は一覧からランダムに起こす（平均 `events.meanIntervalDays` 日に1回）。取り直すときは `tools/fetch-donki.ts`（1回の実行で NASA に2回問い合わせる。繰り返し実行しない）
- 起動するとタイトル画面（`src/title/`）。「はじめから」で「あそんだことがある？」へ、「つづきから」でセーブの一覧から選んで再開。うしろにはいちばん新しいセーブの月面を見せる
- セーブ（`src/save/`）：休息フェーズの始まり（居住モジュールに入ったとき）に自動セーブ、手動は `save.manualSlots` 枠。形式を変えたら `SAVE_VERSION` を上げる
- 実績は `data/achievements.json`（条件の種類は `src/save/achievements.ts` の `ACHIEVEMENT_CONDITIONS`）。判定は main.ts
- 画面の確認は、ヘッドレスの Chrome を DevTools のプロトコルで動かしてスクリーンショットを撮る（Chrome 拡張なしでできる）
- 宇宙飛行士が倒れたら（ボンベの酸素切れ、大量の被ばく）ゲームオーバー。sim は居住モジュールで目を覚まさせるので、main がチュートリアルの外ではゲームオーバーにする（契約に「チュートリアル中か」がないため）。チュートリアル中は目を覚まし「本当ならゲームオーバー」と伝える
- ことばじてん（`src/help/`）は最初は空。チュートリアルの段（`STEP_TERMS`）、ミッション（`data/missions.json` の `terms`）、建てた施設、SEP の警報で説明した言葉を足す。「あそんだことがある」なら全部。覚えた言葉はブラウザに残す
- 地球への注文の画面の名前は「ほきゅう」（英語は Supply）。施設のキットはメニューに出さない（届くものが資材と同じなので、資材を頼んでもらう。仕様の「頼める荷物」からの変更。2026-11-15 人間の判断で、契約・sim・values.json からも施設のキットをなくした）
- 活動フェーズと休息フェーズ（docs/SPEC.md「追加の仕様」ステップ12）：時間は外にいる間だけ `time.evaSecondsPerHour` で進む。中では止まり、「翌日へ」（sim の `restUntilNextDay`）で次の日の始まりまで一気に進める。中に入ってもまた外に出られる（人間の判断。1日を終えるのは「翌日へ」だけ）。注文は「翌日へ」か「外に出る」まで送らず、取り消せる（中では時間が止まっているので、結果は変わらない）。4× はなくした。セーブから再開すると中から始まる
- 休息フェーズの2D画面（ステップ13〜17）：中にいる間は `src/ui/index.ts` の「ノート」を出す。タブではなく「振り返り → 隊員 → 補給 → 明日のタスク → 明日の計画」の順に「次へ」で進み、先のページへは飛べない（子どもが何から開くかを選ばなくてよいように、という人間の判断）。マス目の地図で建てる仕組み（仕様のステップ15）は、人間の判断で休息の画面から外した。建設は外の 3D（B キー）だけ。セーブ（とタイトルに戻る）は一時停止の画面でいつでも、くわしい様子は振り返りのページ、豆知識カードはタイトル画面だけ（人間の判断）。博士の「やること」がそのページの操作なら、済むまで「次へ」は押せず、押すとその場で理由を吹き出しで出す。隊員・補給・セーブは 3D の画面からは開かない
- タスク（`src/tasks/`、`data/tasks.json`）：氷・点検・レゴリスの3つ。今ある SimCommand だけで反映し、その場の行動はミニゲーム（`src/ui/minigame.ts`）をこなしてから送る。3D の画面に常に出す数字はボンベと残り時間だけで、くわしい数字はインベントリ画面（I キー）
- 補給の注文には、間隔の日数に加えて、前の注文からタスク（氷を運ぶ・点検・レゴリス）を `launch.tasksPerLaunch` 回こなす必要がある（地球への報告。最初の注文はいらない）。数は契約の `SimState.tasksSinceLaunch`（人間が承認して足した。`SAVE_VERSION` は 3）。今日のタスクに選んだ施設を隊員が先に直したら、main が `reportTask` の命令を送って1回に数える（人間が承認して契約に足した。そのタスクには印がつき、2回やらなくてよい）
- 豆知識カード（`src/cards/`、`data/cards.json`）：条件は実績の条件の種類（`ACHIEVEMENT_CONDITIONS`）を使う。出典は JSON に持たせ、ふだんの画面には出さない
- 実データの地形（ステップ5）：NASA PGDA の LOLA 5 m/画素の GeoTIFF（Site01 Connecting ridge。人間が選んだ）から、尾根の頂上と永久影のクレーターが入る 1.5 km 四方を切り出し、縦横とも 1/5 に縮めて一辺 300 m にした（縮尺も人間が決めた）。`public/terrain/site01/` の `site.json` と `height.bin` を main が起動時に読む（読めなければ止める。自動生成の地形はなくした）。日照と氷（永久影）は、ゲームと同じ計算（`src/env` の `createTerrainEnv`）で変換の道具が求める。着陸船は、まわり 20 m がどの向きの太陽でも日なたになる平らな場所。画面に出す距離は実寸（× scale）。地形を変えたので `SAVE_VERSION` は 4。地図の外の遠くの山の影は入れていない（切り出した範囲の中だけで影を計算する）
- ランキング、結果画面はまだない
