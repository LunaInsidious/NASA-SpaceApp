import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Scene } from '@babylonjs/core/scene';
import en from '../i18n/en.json';
import './style.css';

// ステップ0：Babylon の空のシーンを開くだけ。言語の切り替えはステップ3で作る
document.title = en['app.title'];

const canvas = document.getElementById('renderCanvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('index.html に #renderCanvas がない');
}

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
// カメラがないと描画できないので、仮のカメラを置く
scene.activeCamera = new FreeCamera('camera', Vector3.Zero(), scene);

engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
