// スマホ（iPhone 16）・タブレット・小さめの PC の大きさで、くんれんの画面をまとめて撮る。
// 先に `pnpm dev` を動かしておき、その URL を渡す。Chrome をヘッドレスで起動し、DevTools のプロトコルで動かす。
// 使い方: pnpm screens http://localhost:5173/ [段の名前]
//   段の名前を渡すと、その段の画面も撮る（名前は src/tutorial/index.ts の STEPS）。
//   出力は .scratch/screens/<端末>-<場面>.png

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9412;
const OUT_DIR = '.scratch/screens';
const PROFILE_DIR = '.scratch/chrome-screens';
const WAIT_LIMIT_MS = 15000;

interface Device {
  name: string;
  width: number;
  height: number;
  scale: number;
  touch: boolean;
}

// スマホとタブレットはブラウザのバーを除いた、ページに使える高さ
const DEVICES: Device[] = [
  { name: 'iphone16', width: 393, height: 659, scale: 3, touch: true },
  { name: 'ipad-portrait', width: 820, height: 1106, scale: 2, touch: true },
  { name: 'ipad-landscape', width: 1180, height: 746, scale: 2, touch: true },
  { name: 'pc-small', width: 1280, height: 720, scale: 1, touch: false },
];

interface Scene {
  name: string;
  /** くんれんを始める段。null なら「あそんだことがある」を選んでミッションから */
  step: string | null;
  /** 段を出したあとにする操作（ページの中で動かす式） */
  actions: string[];
}

const SCENES: Scene[] = [
  { name: 'start', step: 'move', actions: [] },
  { name: 'buildSolar', step: 'buildSolar', actions: [] },
  { name: 'missions', step: null, actions: [] },
  {
    name: 'placing',
    step: 'placeSolar',
    actions: [
      `document.querySelector('[data-action="menu"][data-menu="build"]').click()`,
      `document.querySelector('[data-action="buildSelect"][data-kind="solar"]').click()`,
    ],
  },
];

const [url, extraStep] = process.argv.slice(2);
if (url === undefined) {
  throw new Error('使い方: pnpm screens http://localhost:5173/ [段の名前]');
}
if (!existsSync(CHROME)) {
  throw new Error(`Chrome が見つからない: ${CHROME}`);
}
if (extraStep !== undefined) {
  SCENES.push({ name: extraStep, step: extraStep, actions: [] });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(OUT_DIR, { recursive: true });
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--window-size=1280,800',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

try {
  await sleep(3000);
  const targets = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) as {
    type: string;
    webSocketDebuggerUrl: string;
  }[];
  const page = targets.find((target) => target.type === 'page');
  if (page === undefined) {
    throw new Error('Chrome のページが見つからない');
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  let nextId = 1;
  const waiting = new Map<number, (message: Record<string, unknown>) => void>();
  const errors: string[] = [];
  const loadWaiters: (() => void)[] = [];
  const nextLoad = () => new Promise<void>((resolve) => loadWaiters.push(resolve));
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined && waiting.has(message.id)) {
      waiting.get(message.id)?.(message);
      waiting.delete(message.id);
    } else if (message.method === 'Page.loadEventFired') {
      for (const resolve of loadWaiters.splice(0)) {
        resolve();
      }
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(String(message.params.exceptionDetails.exception?.description));
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<Record<string, unknown>>((resolve) => {
      const id = nextId++;
      waiting.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression: string) => {
    const reply = (await send('Runtime.evaluate', { expression, returnByValue: true })) as {
      result: { exceptionDetails?: { text: string } };
    };
    if (reply.result.exceptionDetails !== undefined) {
      throw new Error(`${expression}: ${reply.result.exceptionDetails.text}`);
    }
  };
  // 読み込みに時間がかかることがあるので、押すボタンが出るまで待つ（出なければ止める）
  const clickWhenReady = async (selector: string, index: number) => {
    const deadline = Date.now() + WAIT_LIMIT_MS;
    while (Date.now() < deadline) {
      const reply = (await send('Runtime.evaluate', {
        expression: `(() => { const b = document.querySelectorAll('${selector}')[${index}]; if (!b) return false; b.click(); return true; })()`,
        returnByValue: true,
      })) as { result: { result: { value: boolean } } };
      if (reply.result.result.value) {
        return;
      }
      await sleep(250);
    }
    const shot = (await send('Page.captureScreenshot', { format: 'png' })) as {
      result: { data: string };
    };
    writeFileSync(`${OUT_DIR}/failed.png`, Buffer.from(shot.result.data, 'base64'));
    throw new Error(`${selector} [${index}] が出てこない（そのときの画面: ${OUT_DIR}/failed.png）`);
  };
  await send('Page.enable');
  await send('Runtime.enable');

  for (const device of DEVICES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: device.width,
      height: device.height,
      deviceScaleFactor: device.scale,
      mobile: device.touch,
    });
    await send('Emulation.setTouchEmulationEnabled', {
      enabled: device.touch,
      maxTouchPoints: 5,
    });
    for (const scene of SCENES) {
      const sceneUrl = new URL(url);
      if (scene.step !== null) {
        sceneUrl.searchParams.set('step', scene.step);
      }
      let loaded = nextLoad();
      await send('Page.navigate', { url: sceneUrl.href });
      await loaded;
      await evaluate("localStorage.clear(); localStorage.setItem('lang', 'ja')");
      // 読み込み直しが終わるまで待つ（前のページのボタンを押さないように）
      loaded = nextLoad();
      await send('Page.reload');
      await loaded;
      await clickWhenReady('.title-button', 0);
      // 「はじめて」（くんれんが ?step の段から始まる）か、「あそんだことがある」（ミッションから）を選ぶ
      const choice = scene.step === null ? 1 : 0;
      await clickWhenReady('.tutorial-modal .tutorial-big', choice);
      await sleep(3500);
      for (const action of scene.actions) {
        await evaluate(action);
        await sleep(800);
      }
      // 博士が話し終えるまで待つ
      await sleep(2500);
      const shot = (await send('Page.captureScreenshot', { format: 'png' })) as {
        result: { data: string };
      };
      const file = `${OUT_DIR}/${device.name}-${scene.name}.png`;
      writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      console.log(file);
    }
  }
  ws.close();
  if (errors.length > 0) {
    throw new Error(`ページでエラーが出た:\n${errors.join('\n')}`);
  }
} finally {
  chrome.kill();
}
