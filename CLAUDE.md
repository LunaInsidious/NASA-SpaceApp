# CLAUDE.md

NASA Space Apps Challenge 2026「Build a Junior Astronaut Mission Trainer」に提出する、ブラウザで遊ぶ月面基地の3Dゲーム。仕様と作業手順は [docs/SPEC.md](docs/SPEC.md)。指示されたステップの、指示された作業だけを行う。

## 共通ルール（docs/SPEC.md から写したもの）

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

## コマンド

- `pnpm dev`：開発サーバー
- `pnpm build`：型チェック（`pnpm typecheck`）のあと `dist/` に本番ビルド
- `pnpm test`：Vitest
- `pnpm lint`：Biome で書式とリントを確かめる。`pnpm format` で直せるものを直す
- `pnpm worker:dev`：Worker（`worker/`）をローカルで動かす

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
- `data/donki-events.json` は、DONKI のページで確かめた実際のフレア2件（M5.9、X8.7）。SEP はまだない。宇宙天気は一覧からランダムに起こす（平均 `events.meanIntervalDays` 日に1回）。取り直すときは `tools/fetch-donki.ts`（1回の実行で NASA に2回問い合わせる。繰り返し実行しない）
- 起動するとタイトル画面（`src/title/`）。「はじめから」で「あそんだことがある？」へ、「つづきから」でセーブの一覧から選んで再開。うしろにはいちばん新しいセーブの月面を見せる
- セーブ（`src/save/`）：ゲーム内の1日ごとに自動セーブ、手動は `save.manualSlots` 枠。形式を変えたら `SAVE_VERSION` を上げる
- 実績は `data/achievements.json`（条件の種類は `src/save/achievements.ts` の `ACHIEVEMENT_CONDITIONS`）。判定は main.ts
- 画面の確認は、ヘッドレスの Chrome を DevTools のプロトコルで動かしてスクリーンショットを撮る（Chrome 拡張なしでできる）
- 宇宙飛行士が倒れたら（ボンベの酸素切れ、大量の被ばく）ゲームオーバー。sim は居住モジュールで目を覚まさせるので、main がチュートリアルの外ではゲームオーバーにする（契約に「チュートリアル中か」がないため）。チュートリアル中は目を覚まし「本当ならゲームオーバー」と伝える
- ことばじてん（`src/help/`）は最初は空。チュートリアルの段（`STEP_TERMS`）、ミッション（`data/missions.json` の `terms`）、建てた施設、SEP の警報で説明した言葉を足す。「あそんだことがある」なら全部。覚えた言葉はブラウザに残す
- 地球への注文の画面の名前は「ほきゅう」（英語は Supply）。施設のキットはメニューに出さない（届くものが資材と同じなので、資材を頼んでもらう。仕様の「頼める荷物」からの変更。sim と契約は facilityKit をそのまま扱える）
- 実データの地形（ステップ5）、ランキング、結果画面はまだない
