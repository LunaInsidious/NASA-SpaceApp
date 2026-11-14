// できた瞬間をお祝いする演出：大きな文字、紙ふぶき、短い効果音（WebAudio で合成。素材ファイルは使わない）。
// ごほうびは「学んだ・できた」に結びつけ、運まかせの報酬は作らない
import './fx.css';

export type FxSound = 'pop' | 'chime' | 'coin' | 'fanfare' | 'star';

export interface Fx {
  /** 大きな文字を一瞬出す。big は画面の真ん中、small は少し上 */
  banner(text: string, size: 'big' | 'small'): void;
  confetti(amount: 'burst' | 'shower'): void;
  sound(name: FxSound): void;
}

const STORAGE_KEY = 'lunar-outpost-sound';
const CONFETTI_COLORS = ['#ffd27a', '#6dff9a', '#6fd3ff', '#ff8ad8', '#ffffff', '#ffb05c'];
const CONFETTI_COUNT = { burst: 40, shower: 120 } as const;
const BANNER_MS = { big: 2200, small: 1500 } as const;
const CONFETTI_MS = 2600;
// 音の高さ（Hz）と長さ（秒）。どれも短く、うるさくしない
const NOTES: Record<FxSound, [number, number][]> = {
  pop: [
    [520, 0.06],
    [780, 0.08],
  ],
  chime: [
    [880, 0.1],
    [1320, 0.16],
  ],
  coin: [
    [988, 0.07],
    [1319, 0.18],
  ],
  star: [
    [784, 0.08],
    [988, 0.08],
    [1175, 0.16],
  ],
  fanfare: [
    [523, 0.12],
    [659, 0.12],
    [784, 0.12],
    [1047, 0.32],
  ],
};
const VOLUME = 0.12;

function readSoundOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch (error) {
    console.warn('音の設定を読めない', error);
    return true;
  }
}

export function createFx(root: HTMLElement): Fx {
  let soundOn = readSoundOn();
  let audio: AudioContext | null = null;

  // 音の切り替え（記号だけのボタン）
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'fx-sound-toggle';
  const renderToggle = () => {
    toggle.textContent = soundOn ? '🔊' : '🔇';
  };
  renderToggle();
  toggle.addEventListener('click', () => {
    soundOn = !soundOn;
    renderToggle();
    try {
      localStorage.setItem(STORAGE_KEY, soundOn ? 'on' : 'off');
    } catch (error) {
      console.warn('音の設定を保存できない', error);
    }
  });
  root.append(toggle);

  return {
    banner(text, size) {
      const el = document.createElement('div');
      el.className = `fx-banner fx-banner-${size}`;
      el.textContent = text;
      root.append(el);
      window.setTimeout(() => el.remove(), BANNER_MS[size]);
    },
    confetti(amount) {
      const layer = document.createElement('div');
      layer.className = 'fx-confetti';
      for (let i = 0; i < CONFETTI_COUNT[amount]; i++) {
        const piece = document.createElement('span');
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        piece.style.animationDelay = `${Math.random() * 0.5}s`;
        piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
        piece.style.setProperty('--spin', `${Math.random() * 720}deg`);
        layer.append(piece);
      }
      root.append(layer);
      window.setTimeout(() => layer.remove(), CONFETTI_MS);
    },
    sound(name) {
      if (!soundOn) {
        return;
      }
      // ブラウザは人が操作するまで音を出させないので、最初に鳴らすときに作る
      audio ??= new AudioContext();
      let at = audio.currentTime;
      for (const [frequency, seconds] of NOTES[name]) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'triangle';
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(VOLUME, at);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
        osc.connect(gain).connect(audio.destination);
        osc.start(at);
        osc.stop(at + seconds);
        at += seconds;
      }
    },
  };
}
