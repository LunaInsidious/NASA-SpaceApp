// BGM：「Calm Track」（pmiller、CC0、OpenGameArt）のループ版を、つなぎ目なくくり返す。出典は assets/LICENSES.md
const TRACK_URL = `${import.meta.env.BASE_URL}audio/calm-track-loop.m4a`;
/** BGM 全体の音量（元の曲は大きいので、効果音のじゃまにならないところまで下げる） */
const MASTER_VOLUME = 0.1;

/** 曲のファイルを読む。読めなければエラーにする（ほかの音で代わりに鳴らさない） */
async function loadTrack(audio: AudioContext): Promise<AudioBuffer> {
  const response = await fetch(TRACK_URL);
  if (!response.ok) {
    throw new Error(`BGM のファイルが読めない: ${TRACK_URL}（${response.status}）`);
  }
  return audio.decodeAudioData(await response.arrayBuffer());
}

export interface Music {
  setOn(on: boolean): void;
}

/** audio は最初に人が操作したあとで作ったもの（ブラウザの決まり） */
export function createMusic(getAudio: () => AudioContext): Music {
  let on = false;
  // 曲は最初に鳴らすときに1回だけ読む
  let track: Promise<AudioBuffer> | null = null;
  let playing: {
    source: AudioBufferSourceNode;
    gain: GainNode;
    startedAt: number;
    duration: number;
  } | null = null;
  // 止めたところ（秒）。ほかのタブから戻ったら続きから鳴らす
  let offset = 0;
  // 読み込みの間に止めたり鳴らしなおしたりしたら、前の「鳴らす」を取り消すための番号
  let request = 0;

  const start = () => {
    const audio = getAudio();
    track ??= loadTrack(audio);
    const mine = ++request;
    void track.then((buffer) => {
      if (mine !== request) {
        return;
      }
      const gain = audio.createGain();
      gain.gain.value = MASTER_VOLUME;
      gain.connect(audio.destination);
      const source = audio.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start(0, offset);
      playing = { source, gain, startedAt: audio.currentTime - offset, duration: buffer.duration };
    });
  };

  const stop = () => {
    request++;
    if (playing !== null) {
      const { source, gain, startedAt, duration } = playing;
      offset = (getAudio().currentTime - startedAt) % duration;
      source.stop();
      gain.disconnect();
      playing = null;
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
