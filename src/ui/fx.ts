// できた瞬間をお祝いする演出：大きな文字、紙ふぶき、短い効果音と BGM（WebAudio で合成。素材ファイルは使わない）。
// ごほうびは「学んだ・できた」に結びつけ、運まかせの報酬は作らない
import './fx.css';
import { onLangChange, t, tPlain } from './i18n.ts';
import { createMusic, makeNoise } from './music.ts';

export type FxSound =
  | 'pop'
  | 'chime'
  | 'coin'
  | 'fanfare'
  | 'star'
  | 'click'
  | 'jump'
  | 'land'
  | 'step'
  | 'pickup'
  | 'door'
  | 'launch'
  | 'repair'
  | 'dig'
  | 'warn'
  | 'alarm'
  | 'down';

export interface Fx {
  /** 大きな文字を一瞬出す。big は画面の真ん中、small は少し上 */
  banner(text: string, size: 'big' | 'small'): void;
  confetti(amount: 'burst' | 'shower'): void;
  sound(name: FxSound): void;
  /** 音の切り替え（タイトルの「せってい」からも変える） */
  soundMode(): SoundMode;
  setSoundMode(mode: SoundMode): void;
}

const STORAGE_KEY = 'lunar-outpost-sound';
const CONFETTI_COLORS = ['#ffd27a', '#6dff9a', '#6fd3ff', '#ff8ad8', '#ffffff', '#ffb05c'];
const CONFETTI_COUNT = { burst: 40, shower: 120 } as const;
const BANNER_MS = { big: 2200, small: 1500 } as const;
const CONFETTI_MS = 2600;
// 音の作り方。wave が noise のときは、from と to は音の明るさ（フィルターの周波数）
interface Voice {
  wave: OscillatorType | 'noise';
  from: number; // Hz
  to: number; // Hz
  at: number; // 鳴らしはじめ（秒）
  seconds: number;
  volume: number;
}
const note = (hz: number, at: number, seconds: number, volume = 0.12): Voice => ({
  wave: 'triangle',
  from: hz,
  to: hz,
  at,
  seconds,
  volume,
});
// どれも短く、うるさくしない
const SOUNDS: Record<FxSound, Voice[]> = {
  pop: [note(520, 0, 0.06), note(780, 0.06, 0.08)],
  chime: [note(880, 0, 0.1), note(1320, 0.1, 0.16)],
  coin: [note(988, 0, 0.07), note(1319, 0.07, 0.18)],
  star: [note(784, 0, 0.08), note(988, 0.08, 0.08), note(1175, 0.16, 0.16)],
  fanfare: [
    note(523, 0, 0.12),
    note(659, 0.12, 0.12),
    note(784, 0.24, 0.12),
    note(1047, 0.36, 0.32),
  ],
  click: [{ wave: 'square', from: 1200, to: 900, at: 0, seconds: 0.035, volume: 0.04 }],
  jump: [{ wave: 'square', from: 280, to: 760, at: 0, seconds: 0.2, volume: 0.06 }],
  land: [
    { wave: 'sine', from: 150, to: 55, at: 0, seconds: 0.14, volume: 0.25 },
    { wave: 'noise', from: 500, to: 200, at: 0, seconds: 0.1, volume: 0.12 },
  ],
  step: [{ wave: 'noise', from: 700, to: 300, at: 0, seconds: 0.07, volume: 0.07 }],
  pickup: [
    { wave: 'triangle', from: 600, to: 1200, at: 0, seconds: 0.1, volume: 0.12 },
    { wave: 'triangle', from: 900, to: 1800, at: 0.08, seconds: 0.14, volume: 0.12 },
  ],
  door: [{ wave: 'noise', from: 300, to: 1600, at: 0, seconds: 0.35, volume: 0.14 }],
  launch: [
    { wave: 'noise', from: 200, to: 2400, at: 0, seconds: 1.3, volume: 0.2 },
    { wave: 'sine', from: 70, to: 220, at: 0, seconds: 1.3, volume: 0.18 },
  ],
  repair: [
    { wave: 'square', from: 1500, to: 1100, at: 0, seconds: 0.05, volume: 0.07 },
    { wave: 'square', from: 1500, to: 1100, at: 0.13, seconds: 0.05, volume: 0.07 },
    { wave: 'square', from: 1800, to: 1300, at: 0.26, seconds: 0.08, volume: 0.07 },
  ],
  dig: [
    { wave: 'noise', from: 900, to: 300, at: 0, seconds: 0.15, volume: 0.16 },
    { wave: 'noise', from: 900, to: 300, at: 0.2, seconds: 0.15, volume: 0.16 },
  ],
  warn: [
    { wave: 'square', from: 440, to: 440, at: 0, seconds: 0.12, volume: 0.06 },
    { wave: 'square', from: 330, to: 330, at: 0.15, seconds: 0.2, volume: 0.06 },
  ],
  alarm: [0, 1, 2, 3].map((i) => ({
    wave: 'sawtooth' as const,
    from: i % 2 === 0 ? 880 : 660,
    to: i % 2 === 0 ? 880 : 660,
    at: i * 0.2,
    seconds: 0.18,
    volume: 0.05,
  })),
  down: [{ wave: 'triangle', from: 620, to: 140, at: 0, seconds: 0.8, volume: 0.15 }],
};
// 音のボタンを押すたびに、音楽と効果音 → 効果音だけ → 音なし、と切り替わる
export const SOUND_MODES = ['all', 'sfx', 'off'] as const;
export type SoundMode = (typeof SOUND_MODES)[number];
const MODE_ICON: Record<SoundMode, string> = { all: '🎵', sfx: '🔊', off: '🔇' };

function readSoundMode(): SoundMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    // まだ選んでいない（前の版の 'on' も）ときは、音楽と効果音の両方
    return SOUND_MODES.find((mode) => mode === saved) ?? 'all';
  } catch (error) {
    console.warn('音の設定を読めない', error);
    return 'all';
  }
}

export function createFx(root: HTMLElement): Fx {
  let mode = readSoundMode();
  let audio: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  // ブラウザは人が操作するまで音を出させないので、最初の操作のあとで作る
  const getAudio = () => {
    audio ??= new AudioContext();
    return audio;
  };
  const music = createMusic(getAudio);
  // 最初の操作より前の音（起動したときの警告など）は鳴らさない
  let unlocked = false;
  const startOnFirstInput = () => {
    window.removeEventListener('pointerdown', startOnFirstInput);
    window.removeEventListener('keydown', startOnFirstInput);
    unlocked = true;
    music.setOn(mode === 'all');
  };
  window.addEventListener('pointerdown', startOnFirstInput);
  window.addEventListener('keydown', startOnFirstInput);

  // 音の切り替え（記号だけのボタン。押すと、いまの切り替えを文字でも出す）
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'fx-sound-toggle';
  const renderToggle = () => {
    toggle.textContent = MODE_ICON[mode];
    toggle.title = tPlain(`sound.${mode}`);
    toggle.setAttribute('aria-label', tPlain(`sound.${mode}`));
  };
  renderToggle();
  onLangChange(renderToggle);
  const setSoundMode = (next: SoundMode) => {
    mode = next;
    renderToggle();
    music.setOn(mode === 'all');
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch (error) {
      console.warn('音の設定を保存できない', error);
    }
  };
  toggle.addEventListener('click', () => {
    setSoundMode(SOUND_MODES[(SOUND_MODES.indexOf(mode) + 1) % SOUND_MODES.length]);
    banner(t(`sound.${mode}`), 'small');
  });
  root.append(toggle);

  // ボタンを押したら小さく「カチッ」
  document.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('button') !== null) {
      sound('click');
    }
  });

  function banner(text: string, size: 'big' | 'small'): void {
    const el = document.createElement('div');
    el.className = `fx-banner fx-banner-${size}`;
    el.innerHTML = text;
    root.append(el);
    window.setTimeout(() => el.remove(), BANNER_MS[size]);
  }

  function sound(name: FxSound): void {
    if (mode === 'off' || !unlocked) {
      return;
    }
    const ctx = getAudio();
    const now = ctx.currentTime;
    for (const voice of SOUNDS[name]) {
      const at = now + voice.at;
      const end = at + voice.seconds;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(voice.volume, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      gain.connect(ctx.destination);
      if (voice.wave === 'noise') {
        noise ??= makeNoise(ctx);
        const src = ctx.createBufferSource();
        src.buffer = noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(voice.from, at);
        filter.frequency.exponentialRampToValueAtTime(voice.to, end);
        src.connect(filter).connect(gain);
        src.start(at);
        src.stop(end);
      } else {
        const osc = ctx.createOscillator();
        osc.type = voice.wave;
        osc.frequency.setValueAtTime(voice.from, at);
        osc.frequency.exponentialRampToValueAtTime(voice.to, end);
        osc.connect(gain);
        osc.start(at);
        osc.stop(end);
      }
    }
  }

  return {
    banner,
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
    sound,
    soundMode: () => mode,
    setSoundMode,
  };
}
