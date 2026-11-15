// 施設の見た目（簡単な形と色）。原点は地面の中心、+z が正面
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

  switch (kind) {
    case 'habitat': {
      const dome = add(CreateSphere('habitat-dome', { diameter: 6, segments: 16 }, scene), WHITE);
      dome.scaling.y = 0.75;
      const door = add(
        CreateBox('habitat-door', { width: 1.2, height: 1.8, depth: 0.8 }, scene),
        [0.7, 0.72, 0.78],
      );
      door.position.set(0, 0.9, 2.7);
      regolithMound = add(
        CreateSphere('habitat-regolith', { diameter: 7.4, segments: 16 }, scene),
        REGOLITH,
      );
      regolithMound.scaling.y = 0.8;
      regolithMound.setEnabled(false);
      indicatorHeight = 2.9;
      break;
    }
    case 'solar': {
      const post = add(
        CreateCylinder('solar-post', { height: 2.2, diameter: 0.15 }, scene),
        [0.6, 0.6, 0.62],
      );
      post.position.y = 1.1;
      // 極の太陽は地平線すれすれなので、板は立てて太陽の方位へ回す
      sunTracker = new TransformNode('solar-tracker', scene);
      sunTracker.parent = root;
      sunTracker.position.y = 2.3;
      add(
        CreateBox('solar-panel', { width: 2.6, height: 1.8, depth: 0.08 }, scene),
        [0.1, 0.18, 0.45],
        1,
        sunTracker,
      );
      indicatorHeight = 3.4;
      break;
    }
    case 'battery': {
      const box = add(
        CreateBox('battery-box', { width: 1.6, height: 1.2, depth: 1.6 }, scene),
        [0.55, 0.57, 0.6],
      );
      box.position.y = 0.6;
      const stripe = add(
        CreateBox('battery-stripe', { width: 1.62, height: 0.15, depth: 1.62 }, scene),
        [0.2, 0.8, 0.3],
      );
      stripe.position.y = 0.95;
      indicatorHeight = 1.5;
      break;
    }
    case 'antenna': {
      const mast = add(
        CreateCylinder('antenna-mast', { height: 4, diameter: 0.18 }, scene),
        [0.75, 0.75, 0.78],
      );
      mast.position.y = 2;
      // 皿は地球（+z）に向ける
      const dish = add(CreateSphere('antenna-dish', { diameter: 1.8, segments: 12 }, scene), WHITE);
      dish.scaling.z = 0.35;
      dish.position.set(0, 4.1, 0.2);
      indicatorHeight = 5.2;
      break;
    }
    case 'greenhouse': {
      const shell = add(
        CreateBox('greenhouse-shell', { width: 4, height: 2.4, depth: 3 }, scene),
        [0.6, 0.95, 0.7],
        0.35,
      );
      shell.position.y = 1.2;
      for (const x of [-1.2, 0, 1.2]) {
        const bed = add(
          CreateBox('greenhouse-plants', { width: 0.8, height: 0.6, depth: 2.2 }, scene),
          [0.2, 0.7, 0.25],
        );
        bed.position.set(x, 0.3, 0);
      }
      indicatorHeight = 2.8;
      break;
    }
    case 'lifeSupport': {
      const tank = add(
        CreateCylinder('lifeSupport-tank', { height: 2.2, diameter: 2.2 }, scene),
        WHITE,
      );
      tank.position.y = 1.1;
      const band = add(
        CreateCylinder('lifeSupport-band', { height: 0.4, diameter: 2.25 }, scene),
        [0.2, 0.45, 0.9],
      );
      band.position.y = 1.4;
      indicatorHeight = 2.6;
      break;
    }
    case 'iceDrill': {
      for (const [x, z] of [
        [-0.9, -0.9],
        [0.9, -0.9],
        [-0.9, 0.9],
        [0.9, 0.9],
      ] as const) {
        const leg = add(
          CreateCylinder('iceDrill-leg', { height: 5, diameter: 0.15 }, scene),
          [0.95, 0.55, 0.1],
        );
        leg.position.set(x, 2.5, z);
      }
      const top = add(
        CreateBox('iceDrill-top', { width: 2.2, height: 0.6, depth: 2.2 }, scene),
        [0.95, 0.55, 0.1],
      );
      top.position.y = 5;
      const bit = add(
        CreateCylinder('iceDrill-bit', { height: 3, diameter: 0.3 }, scene),
        [0.5, 0.5, 0.52],
      );
      bit.position.y = 1.5;
      indicatorHeight = 5.6;
      break;
    }
    case 'shield': {
      const water = shieldMaterial === 'water';
      const wall = add(
        CreateBox('shield-wall', { width: 6, height: 3, depth: 1 }, scene),
        water ? WATER : REGOLITH,
        water ? 0.75 : 1,
      );
      wall.position.y = 1.5;
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
