// チュートリアルで話しかける、オリジナルのおじいちゃん博士「ルナはかせ」の絵と、文を1文字ずつ出す演出。
// 絵はここで描いた SVG だけを使う（外部の素材、既存のキャラクター、NASA のマークは使わない）

/** 博士の絵。口（.prof-mouth）は話している間だけ CSS で動かす */
export const PROFESSOR_SVG = `
<svg viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- 白衣 -->
  <path d="M18 140 C20 112 38 100 60 100 C82 100 100 112 102 140 Z" fill="#f4f6f8" stroke="#c9d1d9" stroke-width="2"/>
  <path d="M60 100 L48 140 M60 100 L72 140" stroke="#c9d1d9" stroke-width="2" fill="none"/>
  <!-- 蝶ネクタイ -->
  <path d="M60 106 L48 100 L48 112 Z M60 106 L72 100 L72 112 Z" fill="#e8743b"/>
  <circle cx="60" cy="106" r="3" fill="#c95f2b"/>
  <!-- 首と顔 -->
  <rect x="52" y="86" width="16" height="14" rx="6" fill="#f2c9a0"/>
  <ellipse cx="60" cy="58" rx="30" ry="34" fill="#f6d2ad"/>
  <!-- 耳 -->
  <ellipse cx="29" cy="60" rx="6" ry="9" fill="#efc39b"/>
  <ellipse cx="91" cy="60" rx="6" ry="9" fill="#efc39b"/>
  <!-- 横の白い髪（頭のてっぺんはつるつる） -->
  <path d="M30 50 C22 38 30 26 38 30 C34 38 36 46 34 54 Z" fill="#ffffff"/>
  <path d="M90 50 C98 38 90 26 82 30 C86 38 84 46 86 54 Z" fill="#ffffff"/>
  <!-- まゆげ -->
  <path d="M40 44 Q47 39 54 43" stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M66 43 Q73 39 80 44" stroke="#ffffff" stroke-width="4" stroke-linecap="round" fill="none"/>
  <!-- まるい眼鏡 -->
  <circle cx="47" cy="55" r="10" fill="#dff4ff" fill-opacity="0.5" stroke="#5a4a3a" stroke-width="2.5"/>
  <circle cx="73" cy="55" r="10" fill="#dff4ff" fill-opacity="0.5" stroke="#5a4a3a" stroke-width="2.5"/>
  <path d="M57 55 L63 55" stroke="#5a4a3a" stroke-width="2.5"/>
  <!-- やさしい目 -->
  <path d="M42 56 Q47 52 52 56" stroke="#3b2f25" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <path d="M68 56 Q73 52 78 56" stroke="#3b2f25" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <!-- ほっぺ -->
  <ellipse cx="38" cy="68" rx="5" ry="3" fill="#f2a08a" fill-opacity="0.6"/>
  <ellipse cx="82" cy="68" rx="5" ry="3" fill="#f2a08a" fill-opacity="0.6"/>
  <!-- 鼻 -->
  <ellipse cx="60" cy="66" rx="5" ry="4" fill="#e9b48c"/>
  <!-- 白いひげ -->
  <path d="M34 72 C38 96 50 104 60 104 C70 104 82 96 86 72 C78 80 70 78 60 80 C50 78 42 80 34 72 Z" fill="#ffffff"/>
  <path d="M46 74 Q60 68 74 74" stroke="#ffffff" stroke-width="6" stroke-linecap="round" fill="none"/>
  <!-- 口（話すと動く） -->
  <ellipse class="prof-mouth" cx="60" cy="82" rx="6" ry="3" fill="#8a3b2e"/>
</svg>`;

// 1文字を出す間隔。1文（20〜40文字）が1〜2秒で出る速さ
const MS_PER_CHAR = 40;

export interface Typing {
  /** すぐ全部を出す */
  finish(): void;
  isTyping(): boolean;
}

/** 要素の中身を、1文字ずつ出すための単位（HTML）に分ける。ふりがなの付いた言葉（<ruby>）はまとめて1つ */
function units(el: HTMLElement): string[] {
  const out: string[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node instanceof HTMLElement) {
      out.push(node.outerHTML);
    } else {
      const holder = document.createElement('span');
      for (const ch of Array.from(node.textContent ?? '')) {
        // 文字は HTML として安全な形にしてから並べる
        holder.textContent = ch;
        out.push(holder.innerHTML);
      }
    }
  }
  return out;
}

/**
 * elements の文を、順番に1文字ずつ出す（ふりがなの付いた言葉は1度に出す）。
 * onDone は出し終わったとき（finish で飛ばしたときも）に1回だけ呼ぶ
 */
export function typeText(elements: HTMLElement[], onDone: () => void): Typing {
  const texts = elements.map((el) => el.innerHTML);
  const pieces = elements.map(units);
  // まだ出していない文字は透明にして置いておく。文の大きさが最初から決まり、下のボタンが動かない
  const parts = elements.map((el, i) => {
    const shownPart = document.createElement('span');
    const restPart = document.createElement('span');
    restPart.className = 'typing-rest';
    restPart.innerHTML = texts[i];
    el.replaceChildren(shownPart, restPart);
    return { shownPart, restPart };
  });
  let current = 0;
  let shown = 0;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.clearInterval(timer);
    elements.forEach((el, i) => {
      el.innerHTML = texts[i];
    });
    onDone();
  };
  const timer = window.setInterval(() => {
    const list = pieces[current];
    shown++;
    parts[current].shownPart.innerHTML = list.slice(0, shown).join('');
    parts[current].restPart.innerHTML = list.slice(shown).join('');
    if (shown >= list.length) {
      current++;
      shown = 0;
      if (current >= elements.length) finish();
    }
  }, MS_PER_CHAR);
  return { finish, isTyping: () => !done };
}
