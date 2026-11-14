// DONKI（NASA の宇宙天気の記録）から太陽フレア（FLR）と SEP を取り、data/donki-events.json の候補を出す。
// 候補から、ゲームで起こしてよいものを選ぶのは科学・データ担当。
// 使い方: node tools/fetch-donki.ts 2024-05-01 2024-05-31 > .scratch/donki-candidates.json

const DONKI_API = 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get';

interface FlareRecord {
  flrID: string;
  beginTime: string;
  peakTime: string | null;
  classType: string;
  link: string;
}

interface SepRecord {
  sepID: string;
  eventTime: string;
  instruments: { displayName: string }[];
  link: string;
}

const [startDate, endDate] = process.argv.slice(2);
if (startDate === undefined || endDate === undefined) {
  throw new Error('使い方: node tools/fetch-donki.ts <startDate> <endDate>（YYYY-MM-DD）');
}

async function fetchDonki<T>(kind: 'FLR' | 'SEP'): Promise<T[]> {
  const url = `${DONKI_API}/${kind}?startDate=${startDate}&endDate=${endDate}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`DONKI ${kind} の取得に失敗: ${response.status} ${url}`);
  }
  return (await response.json()) as T[];
}

const flares = (await fetchDonki<FlareRecord>('FLR')).map((r) => ({
  kind: 'solarFlare',
  donkiId: r.flrID,
  eventTime: r.peakTime ?? r.beginTime,
  classOrIntensity: r.classType,
  link: r.link,
}));
const seps = (await fetchDonki<SepRecord>('SEP')).map((r) => ({
  kind: 'sep',
  donkiId: r.sepID,
  eventTime: r.eventTime,
  classOrIntensity: r.instruments.map((i) => i.displayName).join(', '),
  link: r.link,
}));

console.log(JSON.stringify([...flares, ...seps], null, 2));
