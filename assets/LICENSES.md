# 素材の出典とライセンス

## NASA の写真（public/nasa/）

NASA の画像・動画ライブラリ（https://images.nasa.gov）から取った写真。NASA の画像は原則として著作権の対象外（NASA Images and Media Usage Guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/ ）。NASA のロゴ（ミートボール、ワーム）が写っている写真は使わない（仕様の共通ルール5）。ゲームの中からは NASA に問い合わせず、ここにある縮小版（`~small.jpg`）だけを使う。

- `iss047e057658~small.jpg` — "Universal Battery Charger (UBC) Install" — NASA (JSC) — https://images.nasa.gov/details/iss047e057658
- `PIA25136~small.jpg` — "A New Antenna for NASA's Deep Space Network" — NASA/JPL-Caltech — https://images.nasa.gov/details/PIA25136
- `KSC-20180307-PH_CSH01_0015~small.jpg` — "PONDS Watering System for Veggie" — NASA (KSC) — https://images.nasa.gov/details/KSC-20180307-PH_CSH01_0015
- `KSC-08pd3209~small.jpg` — "KSC-08pd3209"（Water Recovery System rack 2）— NASA (KSC) — https://images.nasa.gov/details/KSC-08pd3209
- `KSC-20231102-PH-FMX01_0020~small.jpg` — "MSOLO PRIME-1 Simulation" — NASA (KSC) — https://images.nasa.gov/details/KSC-20231102-PH-FMX01_0020
- `iss053e238888~small.jpg` — "Personal Radiation Shielding Garment" — NASA (JSC) — https://images.nasa.gov/details/iss053e238888
- `PIA00001~small.jpg` — "South Pole Region of the Moon as Seen by Clementine" — NASA/JPL — https://images.nasa.gov/details/PIA00001
- `PIA24161~small.jpg` — "Lunar Trailblazer to Support NASA's Artemis Program" — NASA/JPL-Caltech — https://images.nasa.gov/details/PIA24161
- `GSFC_20171208_Archive_e001209~small.jpg` — "NASA's SDO Shows Images of Significant Solar Flare" — NASA/SDO (GSFC) — https://images.nasa.gov/details/GSFC_20171208_Archive_e001209

候補にしたが、ロゴやほかの会社の商標が写っていたので使わないもの：`art001e001712`（Orion の機体に NASA のロゴの一部）、`iss053e238886`（ベストの丸いワッペン）、`jsc2026e020764`（モニターの会社のロゴ）。

## 月の地形（public/terrain/site01/）

NASA ゴダード宇宙飛行センターの Planetary Geodynamics Data Archive（PGDA）の「High-Resolution LOLA Topography for Lunar South Pole Sites」（https://pgda.gsfc.nasa.gov/products/78 ）の `Site01_final_adj_5mpp_surf.tif`（Site01 Connecting ridge、5 m/画素）を、`tools/make-terrain.ts`（`pnpm terrain`）で切り出して縮めたもの。元の GeoTIFF（約 41MB）は 2026-11-15 に1回だけダウンロードし、リポジトリには入れていない（`.scratch/terrain/` に置いて変換する）。NASA のデータは原則として著作権の対象外。論文の引用：Barker, M.K. et al. (2021) Improved LOLA elevation maps for south pole landing sites: Error estimates and their impact on illumination conditions. Planetary and Space Science 203, 105119. doi:10.1016/j.pss.2020.105119

- `height.bin` — 高さ（ゲームの m）。中心 X −11470 m、Y −13070 m（南極の極投影）のまわり 1500 m 四方を 201×201 点にし、縦横とも 1/5 に縮めた
- `illumination.png` — ゲームと同じ計算で求めた平均の日照率（上が地球の向き）。PGDA の日照の画像と見比べる用
- `site.json` — 出典、範囲、縮尺、緯度、着陸船の位置、氷の場所（永久影）

## 音

効果音と BGM は WebAudio でその場で作る（効果音は `src/ui/fx.ts`、BGM は `src/ui/music.ts`。BGM の曲はこのリポジトリのオリジナル）。外部の音の素材は使っていない。

## favicon（public/favicon._、public/apple-touch-icon.png、public/favicon-_.png）

このリポジトリのオリジナル。月の地平線、基地のドーム、地平線すれすれの太陽を SVG で描き、各サイズの PNG と ICO はその SVG から書き出した。AI（Claude）を使って作成した（提出ルールの AI 使用の記載のため）。NASA のロゴやデザイン要素は使っていない。
