// NASA の画像・動画ライブラリ（images.nasa.gov）の本物の写真を見せる。
// 写真は tools/fetch-nasa-images.ts で選んで public/nasa/ に置いたものだけを使い、ゲームの中から NASA には問い合わせない
import { getLang, onLangChange, rubyHtml, stripRuby, t } from './i18n.ts';
import './photo.css';

export interface NasaImage {
  nasaId: string;
  /** public/nasa/ の中のファイル名 */
  file: string;
  titleEn: string;
  titleJa: string;
  credit: string;
}

/** キー：施設の種類・実績の ID・'flare' */
export type NasaImages = Record<string, NasaImage>;

const PHOTO_MS = 9000;

/** ゲームで使っている画像（地球のテクスチャなど）の出典。data/textures.json */
export interface TextureSource {
  id: string;
  /** public/ の中のファイル */
  file: string;
  titleEn: string;
  titleJa: string;
  credit: string;
  url: string;
}

/** data/textures.json の形を確かめる。形が違えば止める */
export function parseTextureSources(json: unknown): TextureSource[] {
  if (!Array.isArray(json)) {
    throw new Error('data/textures.json が配列ではない');
  }
  return json.map((entry: Record<string, unknown>, i) => {
    const { id, file, titleEn, titleJa, credit, url } = entry;
    if (
      typeof id !== 'string' ||
      typeof file !== 'string' ||
      typeof titleEn !== 'string' ||
      typeof titleJa !== 'string' ||
      typeof credit !== 'string' ||
      typeof url !== 'string'
    ) {
      throw new Error(`data/textures.json の ${i} 件目の形が違う`);
    }
    return { id, file, titleEn, titleJa, credit, url };
  });
}

/** data/nasa-images.json の形を確かめる。形が違えば止める */
export function parseNasaImages(json: unknown): NasaImages {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('data/nasa-images.json がオブジェクトではない');
  }
  const images: NasaImages = {};
  for (const [key, entry] of Object.entries(json as Record<string, Record<string, unknown>>)) {
    const { nasaId, file, titleEn, titleJa, credit } = entry;
    if (
      typeof nasaId !== 'string' ||
      typeof file !== 'string' ||
      typeof titleEn !== 'string' ||
      typeof titleJa !== 'string' ||
      typeof credit !== 'string'
    ) {
      throw new Error(`data/nasa-images.json の ${key} の形が違う`);
    }
    images[key] = { nasaId, file, titleEn, titleJa, credit };
  }
  return images;
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** 写真・タイトル・出典の HTML。警報の窓の中でも使う */
export function photoFigureHtml(image: NasaImage): string {
  const title = getLang() === 'ja' ? image.titleJa : image.titleEn;
  // クレジットは著作権の表示なので、説明とは分けて写真の隅に小さく出す
  return `<figure class="nasa-photo">
    <div class="nasa-photo-frame">
      <img src="/nasa/${esc(image.file)}" alt="${esc(stripRuby(title))}" loading="lazy">
      <small class="nasa-photo-credit">${t('photo.credit', { credit: esc(image.credit) })}</small>
    </div>
    <figcaption>
      <b>${rubyHtml(esc(title))}</b>
    </figcaption>
  </figure>`;
}

export interface PhotoCard {
  /** key の写真があれば、少しのあいだ見せる（なければ何もしない） */
  show(key: string): void;
}

export function createPhotoCard(root: HTMLElement, images: NasaImages): PhotoCard {
  const card = document.createElement('div');
  card.className = 'nasa-photo-card';
  card.hidden = true;
  root.append(card);
  let current: string | null = null;
  let timer: number | null = null;

  const hide = () => {
    card.hidden = true;
    current = null;
  };

  const render = () => {
    if (current === null) {
      return;
    }
    const image = images[current];
    card.innerHTML = `<div class="nasa-photo-head">${t('photo.title')}</div>${photoFigureHtml(image)}`;
    const close = document.createElement('button');
    close.type = 'button';
    close.innerHTML = t('photo.close');
    close.addEventListener('click', hide);
    card.append(close);
  };

  onLangChange(render);

  return {
    show(key) {
      if (images[key] === undefined) {
        return;
      }
      current = key;
      card.hidden = false;
      render();
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(hide, PHOTO_MS);
    },
  };
}
