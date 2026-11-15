// 施設の見た目。参考の絵に合わせた、角を落としたローポリの部品の組み合わせ（形は本物の機械に似せる）。原点は地面の中心、+z が正面（地球の向き）
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { FacilityKind } from '../contracts/index.ts';
import {
  type BlockOptions,
  createBlock,
  createFacetSphere,
  createPrism,
  createStrut,
  type PrismOptions,
} from './lowpoly.ts';
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

const SHELL: Rgb = [0.9, 0.88, 0.83];
const TRIM: Rgb = [0.55, 0.55, 0.57];
const DARK: Rgb = [0.3, 0.3, 0.32];
const HOLE: Rgb = [0.08, 0.08, 0.09];
const ORANGE: Rgb = [0.93, 0.5, 0.15];
const RED: Rgb = [0.85, 0.3, 0.25];
const YELLOW: Rgb = [0.93, 0.68, 0.15];
const BLUE: Rgb = [0.25, 0.5, 0.82];
const TEAL: Rgb = [0.55, 0.8, 0.74];
const GLASS: Rgb = [0.15, 0.2, 0.3];
const CELL: Rgb = [0.13, 0.2, 0.4];
const CELL_LINE: Rgb = [0.55, 0.6, 0.75];
const SOIL: Rgb = [0.42, 0.28, 0.18];
const LEAF: Rgb = [0.45, 0.72, 0.28];
const REGOLITH: Rgb = [0.45, 0.41, 0.35];
const REGOLITH_BAG: Rgb = [0.62, 0.58, 0.52];
const WATER: Rgb = [0.3, 0.55, 0.95];

function material(scene: Scene, name: string, rgb: Rgb, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = new Color3(...rgb);
  m.specularColor = new Color3(0.05, 0.05, 0.05);
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
  const block = (
    name: string,
    options: BlockOptions,
    rgb: Rgb,
    [x, y, z]: [number, number, number],
    parent: TransformNode = root,
    alpha = 1,
  ) => {
    const mesh = add(createBlock(name, scene, options), rgb, alpha, parent);
    mesh.position.set(x, y, z);
    return mesh;
  };
  const prism = (
    name: string,
    options: PrismOptions,
    rgb: Rgb,
    [x, y, z]: [number, number, number],
    parent: TransformNode = root,
  ) => {
    const mesh = add(createPrism(name, scene, options), rgb, 1, parent);
    mesh.position.set(x, y, z);
    return mesh;
  };
  const strut = (
    name: string,
    from: [number, number, number],
    to: [number, number, number],
    thickness: number,
    rgb: Rgb,
    sides?: number,
  ) =>
    add(createStrut(name, scene, new Vector3(...from), new Vector3(...to), thickness, sides), rgb);
  // 台形の足（下が広い）
  const foot = (name: string, size: number, height: number, x: number, z: number) =>
    block(name, { width: size, height, depth: size, taperX: 0.7, taperZ: 0.7 }, DARK, [
      x,
      height / 2,
      z,
    ]);

  switch (kind) {
    case 'habitat': {
      // 寝かせた膨らむ居住モジュール（ISS の BEAM や月面の居住施設の案のような形）。脚と、帯と、前のエアロック
      const body = prism(
        'habitat-body',
        { height: 5.2, diameter: 3.2, sides: 10 },
        SHELL,
        [0, 2, 0],
      );
      body.rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) {
        const cap = prism(
          'habitat-cap',
          { height: 0.7, diameterBottom: 3.2, diameterTop: 2.0, sides: 10 },
          SHELL,
          [side * 2.95, 2, 0],
        );
        cap.rotation.z = -side * (Math.PI / 2);
        const plate = prism('habitat-plate', { height: 0.1, diameter: 1.6, sides: 10 }, TRIM, [
          side * 3.32,
          2,
          0,
        ]);
        plate.rotation.z = Math.PI / 2;
        const band = prism('habitat-band', { height: 0.22, diameter: 3.34, sides: 10 }, TRIM, [
          side * 2.1,
          2,
          0,
        ]);
        band.rotation.z = Math.PI / 2;
        const stripe = prism('habitat-stripe', { height: 0.12, diameter: 3.3, sides: 10 }, ORANGE, [
          side * 1.5,
          2,
          0,
        ]);
        stripe.rotation.z = Math.PI / 2;
        for (const z of [-1, 1]) {
          strut('habitat-leg', [side * 1.8, 1.0, z * 0.9], [side * 2.0, 0.2, z * 1.15], 0.16, TRIM);
          foot('habitat-foot', 0.5, 0.2, side * 2.0, z * 1.15);
        }
      }
      // 前（+z）のエアロック：短い筒と扉と小さな窓
      const airlock = prism(
        'habitat-airlock',
        { height: 1.2, diameter: 1.5, sides: 8 },
        SHELL,
        [0, 1.8, 2.0],
      );
      airlock.rotation.x = Math.PI / 2;
      const collar = prism(
        'habitat-collar',
        { height: 0.15, diameter: 1.65, sides: 8 },
        TRIM,
        [0, 1.8, 2.5],
      );
      collar.rotation.x = Math.PI / 2;
      block(
        'habitat-hatch',
        { width: 0.8, height: 1.0, depth: 0.1, bevel: 0.15 },
        DARK,
        [0, 1.8, 2.62],
      );
      const porthole = prism(
        'habitat-porthole',
        { height: 0.06, diameter: 0.3, sides: 8 },
        GLASS,
        [0, 2.0, 2.68],
      );
      porthole.rotation.x = Math.PI / 2;
      // 窓（胴の丸みに合わせて少し上を向く）
      for (const x of [-1.2, 1.2]) {
        for (const [d, h, rgb] of [
          [0.66, 0.06, TRIM],
          [0.5, 0.08, GLASS],
        ] as const) {
          const window = prism('habitat-window', { height: h, diameter: d, sides: 8 }, rgb, [
            x,
            2.5,
            1.52,
          ]);
          window.rotation.x = Math.acos(0.5 / 1.6);
        }
      }
      // 屋根の換気口
      block(
        'habitat-vent',
        { width: 1.2, height: 0.3, depth: 0.9, taperX: 0.8, taperZ: 0.8 },
        SHELL,
        [0, 3.65, 0],
      );
      for (const y of [3.6, 3.7]) {
        block('habitat-slat', { width: 0.7, height: 0.04, depth: 0.03, bevel: 0.01 }, DARK, [
          0,
          y,
          0.39,
        ]);
      }
      regolithMound = add(createFacetSphere('habitat-regolith', scene, 7.6), REGOLITH);
      regolithMound.scaling.set(1.15, 0.62, 0.8);
      regolithMound.position.y = 0.6;
      regolithMound.setEnabled(false);
      indicatorHeight = 4.3;
      break;
    }
    case 'solar': {
      // NASA の VSAT（月の南極のための、高い柱に立てて太陽の方へ回す太陽電池）のような形：三脚、柱、2枚の板
      prism(
        'solar-hub',
        { height: 0.5, diameterTop: 0.6, diameterBottom: 0.8, sides: 8 },
        TRIM,
        [0, 0.75, 0],
      );
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const [s, c] = [Math.sin(a), Math.cos(a)];
        strut('solar-leg', [s * 0.3, 0.7, c * 0.3], [s * 1.2, 0.14, c * 1.2], 0.2, SHELL);
        foot('solar-foot', 0.4, 0.16, s * 1.25, c * 1.25).rotation.y = a;
      }
      block(
        'solar-mast',
        { width: 0.24, height: 2.4, depth: 0.24, bevel: 0.04 },
        SHELL,
        [0, 2.1, 0],
      );
      prism('solar-collar', { height: 0.18, diameter: 0.42, sides: 8 }, TRIM, [0, 2.0, 0]);
      block(
        'solar-band',
        { width: 0.27, height: 0.14, depth: 0.27, bevel: 0.03 },
        ORANGE,
        [0, 1.5, 0],
      );
      sunTracker = new TransformNode('solar-tracker', scene);
      sunTracker.parent = root;
      sunTracker.position.y = 3.2;
      // 板（上下2枚）：白い枠、セル、セルの境目
      for (const y of [-0.6, 0.6]) {
        block(
          'solar-frame',
          { width: 3.2, height: 1.1, depth: 0.1, bevel: 0.12 },
          SHELL,
          [0, y, 0],
          sunTracker,
        );
        block(
          'solar-cells',
          { width: 2.95, height: 0.88, depth: 0.04, bevel: 0.01 },
          CELL,
          [0, y, 0.05],
          sunTracker,
        );
        for (let k = 1; k < 6; k++) {
          const x = -1.475 + (k * 2.95) / 6;
          block(
            'solar-line',
            { width: 0.025, height: 0.88, depth: 0.02, bevel: 0.005 },
            CELL_LINE,
            [x, y, 0.075],
            sunTracker,
          );
        }
        for (const dy of [-0.147, 0.147]) {
          block(
            'solar-line',
            { width: 2.95, height: 0.025, depth: 0.02, bevel: 0.005 },
            CELL_LINE,
            [0, y + dy, 0.075],
            sunTracker,
          );
        }
      }
      for (const x of [-1.1, 1.1]) {
        const hinge = prism(
          'solar-hinge',
          { height: 0.3, diameter: 0.18, sides: 8 },
          TRIM,
          [x, 0, 0],
          sunTracker,
        );
        hinge.rotation.z = Math.PI / 2;
      }
      block(
        'solar-mount',
        { width: 0.32, height: 0.32, depth: 0.2 },
        TRIM,
        [0, 0, -0.12],
        sunTracker,
      );
      indicatorHeight = 4.8;
      break;
    }
    case 'battery': {
      // 電池の箱：黄色い入れ物、前に3つの電池（ISS の電池の箱のように差しかえられる形）、残りを示す目盛り
      block(
        'battery-base',
        { width: 2.0, height: 0.2, depth: 1.35, bevel: 0.05 },
        DARK,
        [0, 0.2, 0],
      );
      for (const x of [-0.8, 0.8]) {
        for (const z of [-0.5, 0.5]) foot('battery-foot', 0.3, 0.12, x, z);
      }
      block(
        'battery-case',
        { width: 1.9, height: 1.15, depth: 1.25, bevel: 0.12 },
        YELLOW,
        [0, 0.875, 0],
      );
      block(
        'battery-lid',
        { width: 1.4, height: 0.06, depth: 0.9, bevel: 0.03 },
        [0.85, 0.6, 0.12],
        [0, 1.47, 0],
      );
      for (const x of [-0.97, 0.97]) {
        block('battery-side', { width: 0.04, height: 0.75, depth: 0.85, bevel: 0.01 }, SHELL, [
          x,
          0.85,
          0,
        ]);
      }
      block(
        'battery-gauge',
        { width: 1.5, height: 0.18, depth: 0.06, bevel: 0.04 },
        DARK,
        [0, 1.25, 0.64],
      );
      for (const [x, rgb] of [
        [-0.54, [0.3, 0.72, 0.3]],
        [-0.18, [0.55, 0.85, 0.35]],
        [0.18, [0.9, 0.9, 0.3]],
        [0.54, [0.45, 0.45, 0.45]],
      ] as const) {
        block(
          'battery-level',
          { width: 0.33, height: 0.11, depth: 0.04, bevel: 0.01 },
          [...rgb],
          [x, 1.25, 0.67],
        );
      }
      for (const x of [-0.55, 0, 0.55]) {
        block('battery-cell', { width: 0.48, height: 0.62, depth: 0.12, bevel: 0.04 }, SHELL, [
          x,
          0.75,
          0.66,
        ]);
        for (const y of [0.47, 1.03]) {
          block('battery-cap', { width: 0.48, height: 0.1, depth: 0.14, bevel: 0.03 }, DARK, [
            x,
            y,
            0.66,
          ]);
        }
        block('battery-handle', { width: 0.22, height: 0.05, depth: 0.06, bevel: 0.01 }, YELLOW, [
          x,
          1.12,
          0.74,
        ]);
      }
      for (const x of [-0.275, 0.275]) {
        block('battery-divider', { width: 0.06, height: 0.72, depth: 0.1, bevel: 0.01 }, YELLOW, [
          x,
          0.75,
          0.64,
        ]);
      }
      indicatorHeight = 1.9;
      break;
    }
    case 'antenna': {
      // 台と、首振りの腕と、地球（+z）へ向けたパラボラアンテナ。真ん中に電波を受ける部品
      prism(
        'antenna-base',
        { height: 0.8, diameterBottom: 1.6, diameterTop: 1.2, sides: 8 },
        TRIM,
        [0, 0.4, 0],
      );
      prism('antenna-ring', { height: 0.14, diameter: 1.26, sides: 8 }, RED, [0, 0.85, 0]);
      prism('antenna-turntable', { height: 0.25, diameter: 1.1, sides: 8 }, TRIM, [0, 1.0, 0]);
      block('antenna-yoke', { width: 0.7, height: 0.3, depth: 0.6 }, TRIM, [0, 1.25, 0]);
      for (const side of [-1, 1]) {
        strut('antenna-arm', [side * 0.3, 1.3, 0], [side * 0.85, 2.7, -0.2], 0.22, TRIM);
        const knob = prism('antenna-knob', { height: 0.12, diameter: 0.32, sides: 8 }, TRIM, [
          side * 0.95,
          2.7,
          -0.2,
        ]);
        knob.rotation.z = Math.PI / 2;
      }
      const dish = prism(
        'antenna-dish',
        { height: 0.6, diameterTop: 2.8, diameterBottom: 0.5, sides: 10, open: true },
        SHELL,
        [0, 2.7, 0.1],
      );
      dish.rotation.x = Math.PI / 2;
      const rim = add(
        CreateTorus(
          'antenna-rim',
          { diameter: 2.8, thickness: 0.12, tessellation: 10 },
          scene,
        ).convertToFlatShadedMesh(),
        SHELL,
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.set(0, 2.7, 0.4);
      strut('antenna-post', [0, 2.7, -0.1], [0, 2.7, 1.0], 0.1, TRIM);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
        const end: [number, number, number] = [Math.cos(a) * 1.3, 2.7 + Math.sin(a) * 1.3, 0.42];
        strut('antenna-spar', end, [0, 2.7, 1.05], 0.07, TRIM);
        block('antenna-spar-end', { width: 0.14, height: 0.14, depth: 0.14 }, TRIM, end);
      }
      const feed = prism(
        'antenna-feed',
        { height: 0.35, diameter: 0.4, sides: 8 },
        SHELL,
        [0, 2.7, 1.15],
      );
      feed.rotation.x = Math.PI / 2;
      const feedBand = prism(
        'antenna-feed-band',
        { height: 0.1, diameter: 0.42, sides: 8 },
        RED,
        [0, 2.7, 1.12],
      );
      feedBand.rotation.x = Math.PI / 2;
      indicatorHeight = 4.4;
      break;
    }
    case 'greenhouse': {
      // 植物を育てる部屋（アリゾナ大学と NASA の月の温室の試作のように、ピンクの光で育てる）。前の大きな窓から中が見える
      for (const x of [-1.7, 1.7]) {
        for (const z of [-0.9, 0.9]) foot('greenhouse-foot', 0.55, 0.35, x, z);
      }
      block(
        'greenhouse-floor',
        { width: 4.4, height: 0.5, depth: 2.6, bevel: 0.15 },
        SHELL,
        [0, 0.6, 0],
      );
      block(
        'greenhouse-roof',
        { width: 4.4, height: 0.6, depth: 2.6, bevel: 0.3 },
        SHELL,
        [0, 2.25, 0],
      );
      for (const side of [-1, 1]) {
        block('greenhouse-side', { width: 0.55, height: 2.2, depth: 2.6, bevel: 0.25 }, SHELL, [
          side * 1.925,
          1.45,
          0,
        ]);
        block('greenhouse-stripe', { width: 0.56, height: 0.1, depth: 0.05, bevel: 0.01 }, ORANGE, [
          side * 1.925,
          1.0,
          1.3,
        ]);
        block('greenhouse-stripe', { width: 0.05, height: 0.1, depth: 2.0, bevel: 0.01 }, ORANGE, [
          side * 2.2,
          1.0,
          0,
        ]);
        block(
          'greenhouse-window-side',
          { width: 0.1, height: 1.1, depth: 0.08, bevel: 0.02 },
          TRIM,
          [side * 1.65, 1.4, 1.25],
        );
      }
      block(
        'greenhouse-back',
        { width: 3.4, height: 1.2, depth: 0.1 },
        [0.75, 0.6, 0.7],
        [0, 1.4, -1.15],
      );
      for (const y of [0.9, 1.9]) {
        block(
          'greenhouse-window-edge',
          { width: 3.4, height: 0.1, depth: 0.08, bevel: 0.02 },
          TRIM,
          [0, y, 1.25],
        );
      }
      block(
        'greenhouse-glass',
        { width: 3.3, height: 1.05, depth: 0.04, bevel: 0.01 },
        [0.85, 0.7, 0.85],
        [0, 1.4, 1.28],
        root,
        0.25,
      );
      for (const x of [-0.85, 0.85]) {
        block('greenhouse-planter', { width: 1.4, height: 0.35, depth: 1.4, bevel: 0.06 }, SHELL, [
          x,
          1.025,
          0,
        ]);
        block('greenhouse-soil', { width: 1.25, height: 0.05, depth: 1.25, bevel: 0.01 }, SOIL, [
          x,
          1.2,
          0,
        ]);
        for (const dx of [-0.42, 0, 0.42]) {
          for (const z of [-0.35, 0.35]) {
            strut('greenhouse-stem', [x + dx, 1.2, z], [x + dx, 1.48, z], 0.05, LEAF);
            for (const side of [-1, 1]) {
              const leaf = block(
                'greenhouse-leaf',
                { width: 0.22, height: 0.03, depth: 0.12, bevel: 0.01 },
                LEAF,
                [x + dx + side * 0.1, 1.5, z],
              );
              leaf.rotation.z = side * 0.4;
            }
          }
        }
      }
      block(
        'greenhouse-lamp-holder',
        { width: 2.8, height: 0.08, depth: 0.15, bevel: 0.02 },
        TRIM,
        [0, 1.88, 0.2],
      );
      const lamp = prism(
        'greenhouse-lamp',
        { height: 2.6, diameter: 0.07, sides: 6 },
        [1, 0.45, 0.8],
        [0, 1.82, 0.2],
      );
      lamp.rotation.z = Math.PI / 2;
      (lamp.material as StandardMaterial).emissiveColor = new Color3(0.9, 0.3, 0.65);
      block(
        'greenhouse-vent',
        { width: 1.4, height: 0.35, depth: 1.1, taperX: 0.75, taperZ: 0.75 },
        SHELL,
        [0, 2.72, 0],
      );
      for (const y of [2.66, 2.76]) {
        block('greenhouse-slat', { width: 0.8, height: 0.04, depth: 0.03, bevel: 0.01 }, DARK, [
          0,
          y,
          0.48,
        ]);
      }
      block(
        'greenhouse-side-vent',
        { width: 0.04, height: 0.5, depth: 0.6, bevel: 0.01 },
        DARK,
        [2.22, 1.6, 0],
      );
      indicatorHeight = 3.3;
      break;
    }
    case 'lifeSupport': {
      // 生命維持の装置（ISS の酸素と水を作る装置の棚のような箱）。前が開いていて、タンクと管が見える
      for (const x of [-0.85, 0.85]) {
        for (const z of [-0.45, 0.45]) foot('lifeSupport-foot', 0.35, 0.25, x, z);
      }
      block(
        'lifeSupport-bottom',
        { width: 2.2, height: 0.45, depth: 1.3, bevel: 0.1 },
        SHELL,
        [0, 0.475, 0],
      );
      block(
        'lifeSupport-top',
        { width: 2.2, height: 0.55, depth: 1.3, bevel: 0.12 },
        SHELL,
        [0, 2.225, 0],
      );
      for (const side of [-1, 1]) {
        block('lifeSupport-pillar', { width: 0.3, height: 2.25, depth: 1.3, bevel: 0.08 }, SHELL, [
          side * 0.95,
          1.375,
          0,
        ]);
      }
      block('lifeSupport-back', { width: 1.7, height: 1.25, depth: 0.08 }, DARK, [0, 1.32, -0.6]);
      for (const y of [2.12, 2.24, 2.36]) {
        block('lifeSupport-vent', { width: 0.5, height: 0.05, depth: 0.03, bevel: 0.01 }, DARK, [
          -0.4,
          y,
          0.66,
        ]);
      }
      block(
        'lifeSupport-plate',
        { width: 0.6, height: 0.25, depth: 0.03, bevel: 0.01 },
        TRIM,
        [0.55, 2.2, 0.66],
      );
      block(
        'lifeSupport-plate',
        { width: 0.8, height: 0.12, depth: 0.03, bevel: 0.01 },
        TRIM,
        [-0.3, 0.42, 0.66],
      );
      for (const x of [0.55, 0.65, 0.75]) {
        block('lifeSupport-vent', { width: 0.05, height: 0.2, depth: 0.03, bevel: 0.01 }, DARK, [
          x,
          0.47,
          0.66,
        ]);
      }
      block(
        'lifeSupport-stripe',
        { width: 0.04, height: 0.08, depth: 1.0, bevel: 0.01 },
        BLUE,
        [1.11, 1.3, 0],
      );
      block(
        'lifeSupport-inset',
        { width: 0.03, height: 0.6, depth: 0.6, bevel: 0.01 },
        TRIM,
        [1.11, 0.85, 0.15],
      );
      // タンク（大きい青いものと小さい緑のもの）と、上でつなぐ管
      for (const [x, d, bottom, height, rgb] of [
        [-0.35, 0.65, 0.8, 0.6, BLUE],
        [0.45, 0.42, 0.8, 0.45, TEAL],
      ] as const) {
        block(
          'lifeSupport-cradle',
          { width: d + 0.1, height: 0.12, depth: 0.5, bevel: 0.03 },
          TRIM,
          [x, 0.76, 0.05],
        );
        const cap = height * 0.18;
        prism('lifeSupport-tank', { height: cap, diameterBottom: d * 0.7, diameterTop: d }, rgb, [
          x,
          bottom + cap / 2,
          0.05,
        ]);
        prism('lifeSupport-tank', { height, diameter: d }, rgb, [
          x,
          bottom + cap + height / 2,
          0.05,
        ]);
        const top = bottom + cap + height;
        prism('lifeSupport-tank', { height: cap, diameterBottom: d, diameterTop: d * 0.7 }, rgb, [
          x,
          top + cap / 2,
          0.05,
        ]);
        prism('lifeSupport-strap', { height: 0.1, diameter: d + 0.05 }, TRIM, [
          x,
          bottom + cap + height * 0.4,
          0.05,
        ]);
        prism('lifeSupport-nut', { height: 0.08, diameter: 0.2, sides: 6 }, TRIM, [
          x,
          top + cap + 0.04,
          0.05,
        ]);
      }
      const pipe: [number, number, number][] = [
        [-0.35, 1.6, 0.05],
        [-0.35, 1.82, 0.05],
        [0.45, 1.82, 0.05],
        [0.45, 1.45, 0.05],
      ];
      for (let i = 0; i < pipe.length - 1; i++) {
        strut(
          'lifeSupport-pipe',
          pipe[i] as [number, number, number],
          pipe[i + 1] as [number, number, number],
          0.1,
          TRIM,
          8,
        );
      }
      for (const corner of [pipe[1], pipe[2]] as [number, number, number][]) {
        block('lifeSupport-elbow', { width: 0.13, height: 0.13, depth: 0.13 }, TRIM, corner);
      }
      indicatorHeight = 2.9;
      break;
    }
    case 'iceDrill': {
      // 氷を掘る機械（NASA の TRIDENT ドリルのように、らせんの刃で掘る）：台、門の形のやぐら、上のモーター、掘ったものを入れる箱
      for (const x of [-1.15, 1.15]) {
        for (const z of [-0.95, 0.95]) foot('iceDrill-foot', 0.45, 0.2, x, z);
      }
      block(
        'iceDrill-deck',
        { width: 2.6, height: 0.5, depth: 2.2, bevel: 0.08 },
        TRIM,
        [0, 0.45, 0],
      );
      block(
        'iceDrill-panel',
        { width: 1.0, height: 0.25, depth: 0.03, bevel: 0.01 },
        SHELL,
        [-0.3, 0.45, 1.11],
      );
      for (const x of [-1.1, 1.1]) {
        for (const z of [-0.9, 0.9]) {
          block('iceDrill-corner', { width: 0.55, height: 0.6, depth: 0.55, bevel: 0.1 }, SHELL, [
            x,
            0.5,
            z,
          ]);
        }
      }
      prism('iceDrill-hole-rim', { height: 0.04, diameter: 0.75, sides: 10 }, SHELL, [0, 0.71, 0]);
      prism('iceDrill-hole', { height: 0.05, diameter: 0.5, sides: 10 }, HOLE, [0, 0.72, 0]);
      for (const side of [-1, 1]) {
        block(
          'iceDrill-pillar',
          { width: 0.5, height: 2.3, depth: 0.6, taperX: 0.7, taperZ: 0.8 },
          YELLOW,
          [side * 0.95, 1.85, 0],
        );
        block('iceDrill-plate', { width: 0.3, height: 0.6, depth: 0.04, bevel: 0.01 }, SHELL, [
          side * 0.95,
          1.2,
          0.3,
        ]);
        block('iceDrill-cap', { width: 0.6, height: 0.55, depth: 0.65, bevel: 0.1 }, SHELL, [
          side * 1.15,
          3.1,
          0,
        ]);
      }
      block(
        'iceDrill-beam',
        { width: 2.6, height: 0.4, depth: 0.5, bevel: 0.06 },
        YELLOW,
        [0, 3.1, 0],
      );
      block(
        'iceDrill-motor',
        { width: 0.8, height: 0.7, depth: 0.7, bevel: 0.1 },
        SHELL,
        [0, 3.1, 0.1],
      );
      block(
        'iceDrill-motor-top',
        { width: 0.6, height: 0.25, depth: 0.5, bevel: 0.06 },
        TRIM,
        [0, 3.55, 0.05],
      );
      for (const y of [3.0, 3.1, 3.2]) {
        block('iceDrill-vent', { width: 0.4, height: 0.05, depth: 0.03, bevel: 0.01 }, DARK, [
          0,
          y,
          0.46,
        ]);
      }
      prism(
        'iceDrill-chuck',
        { height: 0.3, diameterTop: 0.4, diameterBottom: 0.25, sides: 8 },
        DARK,
        [0, 2.6, 0],
      );
      prism('iceDrill-shaft', { height: 1.8, diameter: 0.12, sides: 6 }, DARK, [0, 1.6, 0]);
      // らせんの刃：少しずつ回した平たい板を重ねる
      for (let k = 0; k < 16; k++) {
        const flight = block(
          'iceDrill-flight',
          { width: 0.55, height: 0.04, depth: 0.14, bevel: 0.01 },
          DARK,
          [0, 0.85 + k * 0.1, 0],
        );
        flight.rotation.set(0, k * 0.6, 0.25);
      }
      prism(
        'iceDrill-tip',
        { height: 0.25, diameterTop: 0.2, diameterBottom: 0.02, sides: 6 },
        DARK,
        [0, 0.72, 0],
      );
      // 横の箱：掘った氷を入れる青い入れ物と、ホースでつないだ小さなモーター
      block(
        'iceDrill-stand',
        { width: 0.9, height: 0.6, depth: 1.6, bevel: 0.08 },
        SHELL,
        [1.75, 0.5, 0],
      );
      for (const z of [-0.6, 0.6]) foot('iceDrill-foot', 0.35, 0.2, 1.95, z);
      const hopper = prism(
        'iceDrill-hopper',
        { height: 0.5, diameterTop: 1.0, diameterBottom: 0.6, sides: 4, open: true },
        BLUE,
        [1.75, 1.05, 0.35],
      );
      hopper.rotation.y = Math.PI / 4;
      block(
        'iceDrill-pump',
        { width: 0.6, height: 0.55, depth: 0.5, bevel: 0.08 },
        SHELL,
        [1.75, 1.08, -0.4],
      );
      strut('iceDrill-hose', [1.75, 1.3, -0.4], [1.75, 2.4, -0.3], 0.12, DARK, 6);
      strut('iceDrill-hose', [1.75, 2.4, -0.3], [0.4, 3.3, -0.1], 0.12, DARK, 6);
      indicatorHeight = 4.1;
      break;
    }
    case 'shield': {
      // 袋を3段に積んだ、少し曲がった壁。両はしに柱。袋の中身はレゴリスか水
      const water = shieldMaterial === 'water';
      const bagRgb = water ? WATER : REGOLITH_BAG;
      const bagAlpha = water ? 0.85 : 1;
      // 壁の曲がり：まん中が前（+z）に出る
      const along = (s: number): { z: number; turn: number } => ({
        z: -0.04 * s * s,
        turn: Math.atan(0.08 * s),
      });
      const rows: { y: number; bags: [number, number][] }[] = [
        {
          y: 0.31,
          bags: [
            [-1.65, 1.6],
            [0, 1.6],
            [1.65, 1.6],
          ],
        },
        {
          y: 0.93,
          bags: [
            [-1.24, 2.42],
            [1.24, 2.42],
          ],
        },
        {
          y: 1.55,
          bags: [
            [-1.65, 1.6],
            [0, 1.6],
            [1.65, 1.6],
          ],
        },
      ];
      for (const [r, row] of rows.entries()) {
        for (const [s, length] of row.bags) {
          const { z, turn } = along(s);
          const depth = 0.85 - r * 0.05;
          const bag = block(
            'shield-bag',
            { width: length, height: 0.62, depth, bevel: 0.1 },
            bagRgb,
            [s, row.y, z],
            root,
            bagAlpha,
          );
          bag.rotation.y = turn;
          for (const dx of [-length * 0.28, length * 0.28]) {
            block(
              'shield-strap',
              { width: 0.1, height: 0.64, depth: depth + 0.02, bevel: 0.1 },
              TRIM,
              [dx, 0, 0],
              bag,
            );
          }
        }
      }
      for (const side of [-1, 1]) {
        const { z, turn } = along(side * 2.75);
        const post = block(
          'shield-post',
          { width: 0.45, height: 2.0, depth: 1.2, taperX: 0.9, taperZ: 0.45 },
          DARK,
          [side * 2.75, 1.0, z],
        );
        post.rotation.y = turn;
        block(
          'shield-post-stripe',
          { width: 0.47, height: 0.12, depth: 0.72, bevel: 0.02 },
          RED,
          [0, 0.55, 0],
          post,
        );
        block(
          'shield-post-panel',
          { width: 0.03, height: 0.6, depth: 0.5, bevel: 0.01 },
          TRIM,
          [side * 0.235, -0.4, 0],
          post,
        );
      }
      indicatorHeight = 2.6;
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
