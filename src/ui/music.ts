// BGM：WebAudio でその場で作る、静かでゆっくりした曲（素材ファイルは使わない。曲はこのファイルのオリジナル）。
// やわらかいピアノのような音と、うしろで鳴る和音。音と音のあいだを空け、こだまをかけて広い場所の感じにする。
// 8小節の分散和音 → 高いメロディを足した8小節 → 少し休む、をくり返す
const BPM = 72;
const STEPS_PER_BEAT = 2; // 8分音符で刻む
const STEPS_PER_BAR = 8;
const PHRASE_BARS = 8;
const REST_BARS = 4;
// 先にどこまで音を予約しておくか（秒）と、予約しなおす間隔（ミリ秒）
const LOOKAHEAD_SEC = 0.4;
const SCHEDULE_MS = 100;
/** BGM 全体の音量 */
export const MASTER_VOLUME = 0.2;
// こだま（秒、くり返しの強さ、混ぜる量）
const ECHO_SEC = 0.45;
const ECHO_FEEDBACK = 0.35;
const ECHO_MIX = 0.3;

// 小節ごとの和音。bass は左手の低い音、pad はうしろで鳴らす音（どれも MIDI の番号）
// D△7 → F#m7 → G△7 → Gm6 → D△7/A → Bm7 → Em7 → A
const BARS: { bass: number; pad: number[] }[] = [
  { bass: 38, pad: [54, 57, 61] },
  { bass: 42, pad: [54, 57, 61] },
  { bass: 43, pad: [55, 59, 62] },
  { bass: 43, pad: [55, 58, 62] },
  { bass: 45, pad: [54, 57, 62] },
  { bass: 47, pad: [54, 57, 62] },
  { bass: 40, pad: [55, 59, 62] },
  { bass: 45, pad: [52, 57, 61] },
];
// 右手の分散和音（1小節に8つ。null は休み）
const ARPEGGIO: (number | null)[][] = [
  [null, 66, 69, 73, null, 76, null, null],
  [null, 69, 73, 76, null, 73, null, null],
  [null, 71, 74, 78, null, 76, 74, null],
  [null, 70, 74, 76, null, 74, null, null],
  [null, 66, 69, 74, null, 78, 76, null],
  [null, 69, 74, 78, null, 81, null, 78],
  [null, 67, 71, 74, null, 79, 78, 76],
  [null, 69, 74, 76, null, 73, null, null],
];
// 2回目の8小節で足す、高いメロディ
const MELODY: (number | null)[][] = [
  [null, null, 78, null, 81, null, null, null],
  [null, null, 76, null, 73, null, null, null],
  [null, null, 74, null, 79, null, 78, null],
  [null, null, 76, null, 74, null, null, null],
  [null, null, 81, null, 78, null, 76, null],
  [null, null, 78, null, 74, null, null, null],
  [null, null, 79, null, 83, null, 81, null],
  [null, null, 76, null, null, null, 73, null],
];

const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12);
const STEP_SEC = 60 / BPM / STEPS_PER_BEAT;
const PHRASE_STEPS = PHRASE_BARS * STEPS_PER_BAR;
/** 1周（2回の8小節と休み）の歩数 */
export const LOOP_STEPS = (PHRASE_BARS * 2 + REST_BARS) * STEPS_PER_BAR;

/** ピアノのような音：すぐ鳴って、ゆっくり消える。倍音を少し重ねる */
function piano(
  audio: BaseAudioContext,
  out: AudioNode,
  note: number,
  at: number,
  volume: number,
): void {
  const hz = midiToHz(note);
  const seconds = 2.8;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  gain.connect(out);
  for (const [multiple, level] of [
    [1, 1],
    [2, 0.25],
    [3, 0.08],
  ]) {
    const osc = audio.createOscillator();
    const partial = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz * multiple;
    partial.gain.value = level;
    osc.connect(partial).connect(gain);
    osc.start(at);
    osc.stop(at + seconds);
  }
}

/** うしろの和音：ゆっくりふくらんで、ゆっくり消える */
function pad(
  audio: BaseAudioContext,
  out: AudioNode,
  notes: number[],
  at: number,
  seconds: number,
): void {
  for (const note of notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = midiToHz(note);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.05, at + seconds * 0.4);
    gain.gain.linearRampToValueAtTime(0.0001, at + seconds * 1.1);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + seconds * 1.1);
  }
}

/** こだまをかける入り口を作る。ここに音をつなぐと、そのままの音とこだまの両方が out に出る */
function createEchoBus(audio: BaseAudioContext, out: AudioNode): AudioNode {
  const input = audio.createGain();
  const delay = audio.createDelay(1);
  delay.delayTime.value = ECHO_SEC;
  const feedback = audio.createGain();
  feedback.gain.value = ECHO_FEEDBACK;
  const soften = audio.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 2000;
  const wet = audio.createGain();
  wet.gain.value = ECHO_MIX;
  input.connect(out);
  input.connect(delay);
  delay.connect(soften).connect(feedback).connect(delay);
  soften.connect(wet).connect(out);
  return input;
}

/** 曲の step 歩目（0 から LOOP_STEPS - 1）を、時刻 at に予約する */
function playStep(audio: BaseAudioContext, out: AudioNode, step: number, at: number): void {
  if (step >= PHRASE_STEPS * 2) {
    return; // 休み
  }
  const second = step >= PHRASE_STEPS;
  const inPhrase = step % PHRASE_STEPS;
  const bar = Math.floor(inPhrase / STEPS_PER_BAR);
  const inBar = inPhrase % STEPS_PER_BAR;
  const chord = BARS[bar];
  if (inBar === 0) {
    piano(audio, out, chord.bass, at, 0.3);
    pad(audio, out, chord.pad, at, STEP_SEC * STEPS_PER_BAR);
  }
  if (inBar === 4) {
    piano(audio, out, chord.bass + 7, at, 0.16);
  }
  const arpeggio = ARPEGGIO[bar][inBar];
  if (arpeggio !== null) {
    // 2回目は、メロディが聞こえるように分散和音を少し小さく
    piano(audio, out, arpeggio, at, second ? 0.1 : 0.16);
  }
  const melody = second ? MELODY[bar][inBar] : null;
  if (melody !== null) {
    piano(audio, out, melody, at, 0.2);
  }
}

/** 曲を count 歩ぶん、時刻 startAt から予約する（ファイルに書き出して聞くときにも使う） */
export function scheduleMusic(
  audio: BaseAudioContext,
  out: AudioNode,
  count: number,
  startAt: number,
): void {
  const bus = createEchoBus(audio, out);
  for (let i = 0; i < count; i++) {
    playStep(audio, bus, i % LOOP_STEPS, startAt + i * STEP_SEC);
  }
}

export interface Music {
  setOn(on: boolean): void;
}

/** audio は最初に人が操作したあとで作ったもの（ブラウザの決まり） */
export function createMusic(getAudio: () => AudioContext): Music {
  let on = false;
  let timer: number | null = null;
  let master: GainNode | null = null;
  let bus: AudioNode | null = null;
  let nextTime = 0;
  let stepIndex = 0;

  const schedule = () => {
    const audio = getAudio();
    if (bus === null) {
      return;
    }
    while (nextTime < audio.currentTime + LOOKAHEAD_SEC) {
      playStep(audio, bus, stepIndex, nextTime);
      nextTime += STEP_SEC;
      stepIndex = (stepIndex + 1) % LOOP_STEPS;
    }
  };

  const start = () => {
    const audio = getAudio();
    master = audio.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(audio.destination);
    bus = createEchoBus(audio, master);
    nextTime = audio.currentTime + 0.05;
    stepIndex = 0;
    timer = window.setInterval(schedule, SCHEDULE_MS);
    schedule();
  };

  const stop = () => {
    if (timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
    if (master !== null) {
      // 予約ずみの音も含めて、すぐ消す
      master.disconnect();
      master = null;
      bus = null;
    }
  };

  // ほかのタブを見ている間は止める
  document.addEventListener('visibilitychange', () => {
    if (!on) {
      return;
    }
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });

  return {
    setOn(next) {
      if (next === on) {
        return;
      }
      on = next;
      if (on && !document.hidden) {
        start();
      } else {
        stop();
      }
    },
  };
}

/** 1秒分の白いノイズ（効果音の足音やドアなどに使う） */
export function makeNoise(audio: BaseAudioContext): AudioBuffer {
  const buffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}
