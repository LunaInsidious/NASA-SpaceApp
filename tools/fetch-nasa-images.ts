// NASA の画像・動画ライブラリ（images.nasa.gov）から、ゲームで見せる写真の候補を集める。
// ゲームの中からは NASA に問い合わせない。開発のときに1回だけ実行し、結果を .scratch/ に保存して使い回す。
// 題材ごとに1回だけ、順番に、間を1秒以上あけて検索する。エラーや 429 が出たらすぐ止める。
// 使い方: node tools/fetch-nasa-images.ts .scratch/nasa-images-candidates.json [題材,題材,...]
//   題材を指定すると、その題材だけを検索する（足りない題材だけを探し直すとき）

import { existsSync, writeFileSync } from 'node:fs';

const SEARCH_API = 'https://images-api.nasa.gov/search';
const WAIT_MS = 1500;
const MAX_ITEMS = 6;

// キー：ゲームの中の使いどころ。値：検索の言葉
const TOPICS: Record<string, string> = {
  habitat: 'lunar habitat concept',
  solar: 'solar array moon',
  battery: 'space station battery',
  antenna: 'Deep Space Network antenna',
  greenhouse: 'Veggie plant growth space station',
  lifeSupport: 'water recovery system space station',
  iceDrill: 'PRIME-1 drill',
  shield: 'radiation shielding',
  solarInShadow: 'lunar south pole shadow LRO',
  shelteredFromFlare: 'Orion storm shelter',
  foundIce: 'lunar ice map',
  clearedWithoutDowned: 'Artemis lunar base',
  flareX87: 'X8.7 flare May 14 2024',
  flareM59: 'solar flare May 10 2024',
  flare: 'solar flare SDO',
  // 1回目で合う写真がなかった題材を、言葉を変えて探す
  habitatInflatable: 'inflatable habitat',
  flare2024: 'solar flare 2024',
  iceShadowed: 'permanently shadowed region ice',
  shackleton: 'Shackleton crater',
};

interface Item {
  data: {
    nasa_id: string;
    title: string;
    center?: string;
    date_created?: string;
    description?: string;
  }[];
}

const [outFile, onlyTopics] = process.argv.slice(2);
if (outFile === undefined) {
  throw new Error('使い方: node tools/fetch-nasa-images.ts <出力ファイル>');
}
if (existsSync(outFile)) {
  throw new Error(`${outFile} はもうある。問い合わせを繰り返さないため、消してから実行する`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const result: Record<string, unknown[]> = {};
const selected = onlyTopics === undefined ? Object.keys(TOPICS) : onlyTopics.split(',');
for (const topic of selected) {
  const query = TOPICS[topic];
  if (query === undefined) {
    throw new Error(`知らない題材: ${topic}`);
  }
  const url = `${SEARCH_API}?q=${encodeURIComponent(query)}&media_type=image`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`NASA の画像検索に失敗（${response.status}）。ここで止める: ${url}`);
  }
  const body = (await response.json()) as { collection: { items: Item[] } };
  result[topic] = body.collection.items.slice(0, MAX_ITEMS).map((item) => {
    const d = item.data[0];
    return {
      nasaId: d.nasa_id,
      title: d.title,
      center: d.center,
      date: d.date_created,
      description: (d.description ?? '').slice(0, 400),
    };
  });
  console.error(`${topic}: ${result[topic].length} 件`);
  await sleep(WAIT_MS);
}
writeFileSync(outFile, JSON.stringify(result, null, 2));
