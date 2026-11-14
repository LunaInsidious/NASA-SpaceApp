// BGM：WebAudio でその場で作る、元気の出るループ（素材ファイルは使わない。曲はこのファイルのオリジナル）。
// 4小節をくり返す。四つ打ちのキック、手拍子、ハイハット、ベース、アルペジオ、メロディ
const BPM = 124;
const STEPS_PER_BEAT = 4;
const STEPS_PER_BAR = 16;
const BARS = 4;
// 先にどこまで音を予約しておくか（秒）と、予約しなおす間隔（ミリ秒）
const LOOKAHEAD_SEC = 0.25;
const SCHEDULE_MS = 60;
/** BGM 全体の音量 */
export const MASTER_VOLUME = 0.07;

// 和音（小節ごと）：C → G → Am → F。音は MIDI の番号
const CHORDS = [
  [60, 64, 67],
  [55, 59, 62],
  [57, 60, 64],
  [53, 57, 60],
];
const BASS_ROOTS = [36, 31, 33, 29];
// メロディ：小節ごとに16歩。null は休み
const MELODY: (number | null)[][] = [
  [72, null, 76, null, 79, null, 76, 79, 84, null, 79, null, 76, null, 74, null],
  [74, null, 79, null, 83, null, 79, 83, 86, null, 83, null, 79, null, 76, null],
  [76, null, 72, null, 76, null, 81, 79, 76, null, 72, null, 69, null, 72, 74],
  [77, null, 76, null, 74, null, 72, null, 74, null, 77, 79, 81, null, 79, null],
];

const midiToHz = (note: number) => 440 * 2 ** ((note - 69) / 12);

const STEP_SEC = 60 / BPM / STEPS_PER_BEAT;
/** 1周（4小節）の歩数 */
export const LOOP_STEPS = STEPS_PER_BAR * BARS;

function tone(
  audio: BaseAudioContext,
  out: AudioNode,
  wave: OscillatorType,
  hz: number,
  at: number,
  seconds: number,
  volume: number,
): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = wave;
  osc.frequency.value = hz;
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + seconds);
}

function kick(audio: BaseAudioContext, out: AudioNode, at: number): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.setValueAtTime(150, at);
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  gain.gain.setValueAtTime(1, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + 0.18);
}

function hiss(
  audio: BaseAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  at: number,
  seconds: number,
  volume: number,
  highpassHz: number,
): void {
  const src = audio.createBufferSource();
  src.buffer = noise;
  const filter = audio.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = highpassHz;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  src.connect(filter).connect(gain).connect(out);
  src.start(at);
  src.stop(at + seconds);
}

/** 曲の step 歩目（0 から LOOP_STEPS - 1）を、時刻 at に予約する */
function playStep(
  audio: BaseAudioContext,
  out: AudioNode,
  noise: AudioBuffer,
  step: number,
  at: number,
): void {
  const bar = Math.floor(step / STEPS_PER_BAR) % BARS;
  const inBar = step % STEPS_PER_BAR;
  // ドラム：四つ打ち、2拍目と4拍目に手拍子、裏拍にハイハット
  if (inBar % STEPS_PER_BEAT === 0) {
    kick(audio, out, at);
  }
  if (inBar === 4 || inBar === 12) {
    hiss(audio, out, noise, at, 0.12, 0.35, 1200);
  }
  if (inBar % STEPS_PER_BEAT === 2) {
    hiss(audio, out, noise, at, 0.04, 0.18, 7000);
  }
  // ベース：8分音符でオクターブを行き来する
  if (inBar % 2 === 0) {
    const octave = inBar % STEPS_PER_BEAT === 0 ? 0 : 12;
    tone(audio, out, 'triangle', midiToHz(BASS_ROOTS[bar] + octave), at, STEP_SEC * 1.8, 0.5);
  }
  // アルペジオ：16分音符で和音の音を順に
  const chord = CHORDS[bar];
  tone(audio, out, 'square', midiToHz(chord[inBar % chord.length] + 12), at, STEP_SEC * 0.9, 0.06);
  // メロディ
  const note = MELODY[bar][inBar];
  if (note !== null) {
    tone(audio, out, 'triangle', midiToHz(note), at, STEP_SEC * 1.9, 0.28);
  }
}

/** 曲を count 歩ぶん、時刻 startAt から予約する（ファイルに書き出して聞くときにも使う） */
export function scheduleMusic(
  audio: BaseAudioContext,
  out: AudioNode,
  count: number,
  startAt: number,
): void {
  const noise = makeNoise(audio);
  for (let i = 0; i < count; i++) {
    playStep(audio, out, noise, i % LOOP_STEPS, startAt + i * STEP_SEC);
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
  let noise: AudioBuffer | null = null;
  let nextTime = 0;
  let stepIndex = 0;

  const schedule = () => {
    const audio = getAudio();
    if (master === null) {
      return;
    }
    noise ??= makeNoise(audio);
    while (nextTime < audio.currentTime + LOOKAHEAD_SEC) {
      playStep(audio, master, noise, stepIndex, nextTime);
      nextTime += STEP_SEC;
      stepIndex = (stepIndex + 1) % LOOP_STEPS;
    }
  };

  const start = () => {
    const audio = getAudio();
    master = audio.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(audio.destination);
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

/** 1秒分の白いノイズ（手拍子とハイハットに使う） */
export function makeNoise(audio: BaseAudioContext): AudioBuffer {
  const buffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}
