// 施設の見た目（本物の機械に似せた、いくつかの部品の形と色）。原点は地面の中心、+z が正面（地球の向き）
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { FacilityKind } from '../contracts/index.ts';
import { MIN_CONDITION_TINT, STOPPED_TINT } from './tuning.ts';

type Rgb = [number, number, number];

interface Part {
  mesh: Mesh;
  base: Rgb;
}

export interface FacilityVisual {
  kind: FacilityKind;
  shieldMaterial: 'regolith' | 'water' | undefined;
  root: TransformNode;
  parts: Part[];
  /** 太陽を向いて回る部分（太陽電池の板） */
  sunTracker: TransformNode | null;
  /** レゴリスを盛った居住モジュールの盛り土 */
  regolithMound: Mesh | null;
  /** 動いているかを示す小さな灯り */
  indicator: Mesh;
  meshes(): Mesh[];
  dispose(): void;
}

const WHITE: Rgb = [0.92, 0.92, 0.95];
const REGOLITH: Rgb = [0.45, 0.41, 0.35];
const WATER: Rgb = [0.25, 0.5, 0.95];
const METAL: Rgb = [0.62, 0.63, 0.66];
const GOLD: Rgb = [0.86, 0.66, 0.26];
const GLASS: Rgb = [0.12, 0.18, 0.3];
const CELL: Rgb = [0.08, 0.14, 0.38];
const ORANGE: Rgb = [0.95, 0.55, 0.1];

function material(scene: Scene, name: string, rgb: Rgb, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = new Color3(...rgb);
  m.specularColor = new Color3(0.1, 0.1, 0.1);
  m.alpha = alpha;
  return m;
}

/** 施設の種類ごとの形を作る。ghost のときは色を付けず、灯りも付けない */
export function createFacilityVisual(
  scene: Scene,
  kind: FacilityKind,
  shieldMaterial: 'regolith' | 'water' | undefined,
): FacilityVisual {
  const root = new TransformNode(`facility-${kind}`, scene);
  const parts: Part[] = [];
  let sunTracker: TransformNode | null = null;
  let regolithMound: Mesh | null = null;
  let indicatorHeight = 3;

  const add = (mesh: Mesh, rgb: Rgb, alpha = 1, parent: TransformNode = root): Mesh => {
    mesh.parent = parent;
    mesh.material = material(scene, `${mesh.name}-mat`, rgb, alpha);
    mesh.isPickable = false;
    parts.push({ mesh, base: rgb });
    return mesh;
  };

  // 横に寝かせた円柱（長さ length、太さ diameter、軸は x）
  const hCylinder = (name: string, length: number, diameter: number, rgb: Rgb, alpha = 1) => {
    const mesh = add(
      CreateCylinder(name, { height: length, diameter, tessellation: 24 }, scene),
      rgb,
      alpha,
    );
    mesh.rotation.z = Math.PI / 2;
    return mesh;
  };

  switch (kind) {
    case 'habitat': {
      // 寝かせた膨らむ居住モジュール（ISS の BEAM や月面の居住施設の案のような形）。脚と、帯と、前のエアロック
      const body = hCylinder('habitat-body', 5.2, 3.2, WHITE);
      body.position.y = 2;
      for (const x of [-2.6, 2.6]) {
        const cap = add(CreateSphere('habitat-cap', { diameter: 3.2, segments: 16 }, scene), WHITE);
        cap.scaling.x = 0.45;
        cap.position.set(x, 2, 0);
      }
      for (const x of [-1.7, 0, 1.7]) {
        const band = hCylinder('habitat-band', 0.18, 3.28, METAL);
        band.position.set(x, 2, 0);
      }
      for (const [x, z] of [
        [-1.8, -1.1],
        [1.8, -1.1],
        [-1.8, 1.1],
        [1.8, 1.1],
      ] as const) {
        const leg = add(
          CreateCylinder('habitat-leg', { height: 0.9, diameter: 0.14 }, scene),
          METAL,
        );
        leg.position.set(x, 0.45, z);
        const foot = add(
          CreateCylinder('habitat-foot', { height: 0.06, diameter: 0.5 }, scene),
          METAL,
        );
        foot.position.set(x, 0.03, z);
      }
      // 前（+z）のエアロック：短い筒と扉
      const airlock = add(
        CreateCylinder('habitat-airlock', { height: 1.4, diameter: 1.4, tessellation: 20 }, scene),
        WHITE,
      );
      airlock.rotation.x = Math.PI / 2;
      airlock.position.set(0, 1.7, 2.0);
      const hatch = add(
        CreateCylinder('habitat-hatch', { height: 0.08, diameter: 1.0, tessellation: 20 }, scene),
        METAL,
      );
      hatch.rotation.x = Math.PI / 2;
      hatch.position.set(0, 1.7, 2.72);
      // 窓
      for (const x of [-1.2, 1.2]) {
        const window = add(
          CreateCylinder('habitat-window', { height: 0.06, diameter: 0.45 }, scene),
          GLASS,
        );
        window.rotation.x = Math.PI / 2;
        window.position.set(x, 2.5, 1.55);
      }
      // 金色の断熱材の上の面
      const foil = hCylinder('habitat-foil', 1.4, 3.24, GOLD);
      foil.position.set(0, 2, 0);
      foil.scaling.set(1, 1, 1);
      regolithMound = add(
        CreateSphere('habitat-regolith', { diameter: 7.6, segments: 16 }, scene),
        REGOLITH,
      );
      regolithMound.scaling.set(1.15, 0.62, 0.8);
      regolithMound.position.y = 0.6;
      regolithMound.setEnabled(false);
      indicatorHeight = 4;
      break;
    }
    case 'solar': {
      // NASA の VSAT（月の南極のための、高い柱に立てて太陽の方へ回す太陽電池）のような形
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const strut = add(
          CreateCylinder('solar-strut', { height: 1.6, diameter: 0.08 }, scene),
          METAL,
        );
        strut.position.set(Math.sin(a) * 0.55, 0.7, Math.cos(a) * 0.55);
        strut.rotation.set(Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45);
      }
      const mast = add(CreateCylinder('solar-mast', { height: 4.2, diameter: 0.16 }, scene), METAL);
      mast.position.y = 2.1;
      sunTracker = new TransformNode('solar-tracker', scene);
      sunTracker.parent = root;
      sunTracker.position.y = 3.2;
      // 板（上下2枚）と枠と、セルの境目
      for (const y of [-0.55, 0.55]) {
        const panel = add(
          CreateBox('solar-panel', { width: 3.2, height: 1.0, depth: 0.05 }, scene),
          CELL,
          1,
          sunTracker,
        );
        panel.position.y = y;
        const frame = add(
          CreateBox('solar-frame', { width: 3.3, height: 1.08, depth: 0.03 }, scene),
          METAL,
          1,
          sunTracker,
        );
        frame.position.set(0, y, -0.03);
        for (const x of [-1.07, 0, 1.07]) {
          const line = add(
            CreateBox('solar-line', { width: 0.03, height: 1.0, depth: 0.06 }, scene),
            METAL,
            1,
            sunTracker,
          );
          line.position.set(x, y, 0);
        }
      }
      const hinge = add(
        CreateBox('solar-hinge', { width: 0.3, height: 2.3, depth: 0.12 }, scene),
        METAL,
        1,
        sunTracker,
      );
      hinge.position.z = -0.08;
      indicatorHeight = 4.6;
      break;
    }
    case 'battery': {
      // 電池の箱（ISS の電池のような箱）と、熱を逃がすひれと、上の断熱材
      const box = add(
        CreateBox('battery-box', { width: 1.8, height: 1.1, depth: 1.2 }, scene),
        [0.72, 0.73, 0.76],
      );
      box.position.y = 0.75;
      const base = add(
        CreateBox('battery-base', { width: 2.0, height: 0.2, depth: 1.4 }, scene),
        METAL,
      );
      base.position.y = 0.1;
      for (let i = 0; i < 6; i++) {
        const fin = add(
          CreateBox('battery-fin', { width: 0.04, height: 0.9, depth: 1.0 }, scene),
          [0.85, 0.86, 0.9],
        );
        fin.position.set(-0.95 - 0.04, 0.75, 0);
        fin.position.x = i < 3 ? -0.95 - 0.06 * (i + 1) : 0.95 + 0.06 * (i - 2);
      }
      const top = add(
        CreateBox('battery-top', { width: 1.8, height: 0.06, depth: 1.2 }, scene),
        GOLD,
      );
      top.position.y = 1.33;
      const stripe = add(
        CreateBox('battery-stripe', { width: 1.82, height: 0.1, depth: 1.22 }, scene),
        [0.2, 0.8, 0.3],
      );
      stripe.position.y = 1.1;
      indicatorHeight = 1.8;
      break;
    }
    case 'antenna': {
      // 三脚と柱と、地球（+z）へ向けたパラボラアンテナ。真ん中に電波を受ける棒
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = add(
          CreateCylinder('antenna-leg', { height: 1.8, diameter: 0.08 }, scene),
          METAL,
        );
        leg.position.set(Math.sin(a) * 0.6, 0.8, Math.cos(a) * 0.6);
        leg.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
      }
      const mast = add(
        CreateCylinder('antenna-mast', { height: 3.4, diameter: 0.16 }, scene),
        METAL,
      );
      mast.position.y = 1.7;
      const head = add(
        CreateBox('antenna-head', { width: 0.5, height: 0.4, depth: 0.5 }, scene),
        [0.7, 0.72, 0.76],
      );
      head.position.y = 3.5;
      // 皿：開いた円すい（中は浅い）を +z へ向ける
      const dish = add(
        CreateCylinder(
          'antenna-dish',
          { height: 0.5, diameterTop: 2.6, diameterBottom: 0.3, tessellation: 28 },
          scene,
        ),
        WHITE,
      );
      dish.rotation.x = Math.PI / 2;
      dish.position.set(0, 3.6, 0.45);
      const rim = add(
        CreateCylinder('antenna-rim', { height: 0.06, diameter: 2.66, tessellation: 28 }, scene),
        METAL,
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, 3.6, 0.7);
      const feed = add(
        CreateCylinder('antenna-feed', { height: 1.2, diameter: 0.06 }, scene),
        METAL,
      );
      feed.rotation.x = Math.PI / 2;
      feed.position.set(0, 3.6, 1.2);
      const horn = add(
        CreateBox('antenna-horn', { width: 0.18, height: 0.18, depth: 0.2 }, scene),
        GOLD,
      );
      horn.position.set(0, 3.6, 1.8);
      indicatorHeight = 5.1;
      break;
    }
    case 'greenhouse': {
      // 半透明の筒の温室（アリゾナ大学と NASA の月の温室の試作のような形）。骨と、植物の列と、ピンクの育てる光
      const shell = hCylinder('greenhouse-shell', 4.4, 2.8, [0.7, 0.95, 0.8], 0.3);
      shell.position.y = 1.4;
      for (const x of [-2.2, -1.1, 0, 1.1, 2.2]) {
        const rib = hCylinder('greenhouse-rib', 0.08, 2.86, METAL);
        rib.position.set(x, 1.4, 0);
      }
      const floor = add(
        CreateBox('greenhouse-floor', { width: 4.4, height: 0.15, depth: 2.4 }, scene),
        METAL,
      );
      floor.position.y = 0.3;
      for (const z of [-0.7, 0, 0.7]) {
        const bed = add(
          CreateBox('greenhouse-plants', { width: 4.0, height: 0.35, depth: 0.45 }, scene),
          [0.2, 0.7, 0.25],
        );
        bed.position.set(0, 0.55, z);
        const lamp = add(
          CreateBox('greenhouse-lamp', { width: 4.0, height: 0.05, depth: 0.2 }, scene),
          [1, 0.35, 0.85],
        );
        lamp.position.set(0, 2.2, z);
        (lamp.material as StandardMaterial).emissiveColor = new Color3(0.9, 0.25, 0.75);
      }
      indicatorHeight = 3.2;
      break;
    }
    case 'lifeSupport': {
      // 生命維持の装置（ISS の酸素を作る装置の棚のような箱）と、タンク、管、熱を逃がす板
      const rack = add(
        CreateBox('lifeSupport-rack', { width: 2.2, height: 1.9, depth: 1.3 }, scene),
        WHITE,
      );
      rack.position.y = 0.95;
      const panel = add(
        CreateBox('lifeSupport-panel', { width: 1.6, height: 0.9, depth: 0.04 }, scene),
        [0.25, 0.3, 0.38],
      );
      panel.position.set(0, 1.2, 0.67);
      const band = add(
        CreateBox('lifeSupport-band', { width: 2.22, height: 0.18, depth: 1.32 }, scene),
        [0.2, 0.45, 0.9],
      );
      band.position.y = 1.75;
      for (const [x, rgb] of [
        [-1.55, [0.85, 0.88, 0.95]],
        [1.55, [0.6, 0.75, 0.95]],
      ] as const) {
        const tank = add(
          CreateCylinder('lifeSupport-tank', { height: 1.4, diameter: 0.7 }, scene),
          [...rgb] as Rgb,
        );
        tank.position.set(x, 0.7, 0);
        const cap = add(
          CreateSphere('lifeSupport-tankcap', { diameter: 0.7, segments: 10 }, scene),
          [...rgb] as Rgb,
        );
        cap.position.set(x, 1.4, 0);
      }
      const pipe = hCylinder('lifeSupport-pipe', 3.1, 0.1, METAL);
      pipe.position.set(0, 1.55, -0.5);
      const radiator = add(
        CreateBox('lifeSupport-radiator', { width: 2.0, height: 1.2, depth: 0.05 }, scene),
        [0.92, 0.93, 0.96],
      );
      radiator.position.set(0, 2.6, -0.4);
      radiator.rotation.x = -0.2;
      indicatorHeight = 3.5;
      break;
    }
    case 'iceDrill': {
      // 氷を掘る機械：三角のやぐら、ドリルの棒、上のモーター、掘った氷を入れる箱
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const leg = add(
          CreateCylinder('iceDrill-leg', { height: 5.2, diameter: 0.14 }, scene),
          ORANGE,
        );
        leg.position.set(Math.sin(a) * 0.75, 2.5, Math.cos(a) * 0.75);
        leg.rotation.set(Math.cos(a) * 0.28, 0, -Math.sin(a) * 0.28);
        for (const h of [1.2, 2.6]) {
          const brace = add(
            CreateCylinder('iceDrill-brace', { height: 1.3 - h * 0.18, diameter: 0.06 }, scene),
            ORANGE,
          );
          const b = a + Math.PI / 3;
          brace.position.set(
            Math.sin(b) * (0.75 - h * 0.14) * 0.5,
            h,
            Math.cos(b) * (0.75 - h * 0.14) * 0.5,
          );
          brace.rotation.set(0, b, Math.PI / 2);
        }
      }
      const motor = add(
        CreateBox('iceDrill-motor', { width: 0.8, height: 0.7, depth: 0.8 }, scene),
        [0.55, 0.56, 0.6],
      );
      motor.position.y = 5.0;
      const bit = add(
        CreateCylinder('iceDrill-bit', { height: 5.0, diameter: 0.18 }, scene),
        [0.5, 0.5, 0.52],
      );
      bit.position.y = 2.5;
      const hopper = add(
        CreateCylinder(
          'iceDrill-hopper',
          { height: 0.8, diameterTop: 1.2, diameterBottom: 0.6, tessellation: 4 },
          scene,
        ),
        [0.75, 0.77, 0.8],
      );
      hopper.position.set(1.5, 0.5, 0);
      indicatorHeight = 5.8;
      break;
    }
    case 'shield': {
      const water = shieldMaterial === 'water';
      if (water) {
        // 水を入れた袋を積んだ壁
        for (let row = 0; row < 3; row++) {
          for (let i = 0; i < 6 - (row % 2); i++) {
            const bag = hCylinder('shield-bag', 0.95, 0.9, WATER, 0.8);
            bag.position.set(-2.5 + i + (row % 2) * 0.5, 0.45 + row * 0.85, 0);
          }
        }
      } else {
        // レゴリスを詰めた袋を積んだ、下が広い土手
        for (let row = 0; row < 4; row++) {
          const count = 6 - row;
          for (let i = 0; i < count; i++) {
            const bag = add(
              CreateBox('shield-bag', { width: 0.95, height: 0.7, depth: 1.1 - row * 0.15 }, scene),
              REGOLITH,
            );
            bag.position.set(-((count - 1) / 2) + i, 0.35 + row * 0.7, 0);
            bag.rotation.y = (i % 2 === 0 ? 1 : -1) * 0.04;
          }
        }
      }
      indicatorHeight = 3.4;
      break;
    }
  }

  const indicator = CreateSphere('facility-indicator', { diameter: 0.35, segments: 8 }, scene);
  indicator.parent = root;
  indicator.position.y = indicatorHeight;
  indicator.isPickable = false;
  const indicatorMaterial = new StandardMaterial('facility-indicator-mat', scene);
  indicatorMaterial.disableLighting = true;
  indicator.material = indicatorMaterial;

  return {
    kind,
    shieldMaterial,
    root,
    parts,
    sunTracker,
    regolithMound,
    indicator,
    meshes: () => [...parts.map((p) => p.mesh), indicator],
    dispose: () => {
      // プレビューでは部品が1つのマテリアルを共有するので、同じものを二度捨てない
      const materials = new Set([...parts.map((p) => p.mesh.material), indicator.material]);
      for (const m of materials) {
        m?.dispose();
      }
      root.dispose();
    },
  };
}

/** 状態に合わせて色を変える。止まっていると暗く、傷むほど暗い。灯りは動いていれば緑、止まっていれば赤 */
export function applyFacilityState(
  visual: FacilityVisual,
  condition: number,
  working: boolean,
  regolithCover: boolean,
): void {
  const tint =
    (working ? 1 : STOPPED_TINT) * (MIN_CONDITION_TINT + (1 - MIN_CONDITION_TINT) * condition);
  for (const part of visual.parts) {
    const m = part.mesh.material as StandardMaterial;
    m.diffuseColor.set(part.base[0] * tint, part.base[1] * tint, part.base[2] * tint);
  }
  visual.regolithMound?.setEnabled(regolithCover);
  const light = visual.indicator.material as StandardMaterial;
  light.emissiveColor = working ? new Color3(0.2, 1, 0.3) : new Color3(1, 0.2, 0.15);
}

/** プレビュー用：すべての部分を同じ半透明の色にし、灯りを隠す */
export function applyGhostLook(visual: FacilityVisual, ghost: StandardMaterial): void {
  for (const part of visual.parts) {
    part.mesh.material?.dispose();
    part.mesh.material = ghost;
  }
  visual.regolithMound?.setEnabled(false);
  visual.indicator.setEnabled(false);
}
