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

## 音

効果音と BGM は WebAudio でその場で作る（効果音は `src/ui/fx.ts`、BGM は `src/ui/music.ts`。BGM の曲はこのリポジトリのオリジナル）。外部の音の素材は使っていない。

## favicon（public/favicon._、public/apple-touch-icon.png、public/favicon-_.png）

このリポジトリのオリジナル。月の地平線、基地のドーム、地平線すれすれの太陽を SVG で描き、各サイズの PNG と ICO はその SVG から書き出した。AI（Claude）を使って作成した（提出ルールの AI 使用の記載のため）。NASA のロゴやデザイン要素は使っていない。
