// 宇宙飛行士の見た目。施設と同じ、角を落としたローポリの部品の組み合わせ。原点は足もと、+z が正面
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { type BlockOptions, createBlock, createFacetSphere, createPrism } from './lowpoly.ts';

/** 部品は 2 m ほどの高さで作り、この倍率で縮める */
const BODY_SCALE = 0.85;

export function createAstronaut(scene: Scene): { root: TransformNode; meshes: Mesh[] } {
  const root = new TransformNode('astronaut', scene);
  const body = new TransformNode('astronaut-body', scene);
  body.parent = root;
  body.scaling.setAll(BODY_SCALE);
  const paint = (name: string, rgb: [number, number, number], specular = 0.05) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = new Color3(...rgb);
    m.specularColor = new Color3(specular, specular, specular);
    return m;
  };
  const suit = paint('astronaut-suit', [0.92, 0.9, 0.86]);
  const trim = paint('astronaut-trim', [0.55, 0.55, 0.57]);
  const visor = paint('astronaut-visor', [0.2, 0.23, 0.28], 0.6);
  const tag = paint('astronaut-tag', [0.93, 0.5, 0.15]);
  const meshes: Mesh[] = [];
  const place = (mesh: Mesh, mat: StandardMaterial, [x, y, z]: [number, number, number]) => {
    mesh.material = mat;
    mesh.parent = body;
    mesh.position.set(x, y, z);
    mesh.isPickable = false;
    meshes.push(mesh);
    return mesh;
  };
  const block = (
    name: string,
    options: BlockOptions,
    mat: StandardMaterial,
    at: [number, number, number],
  ) => place(createBlock(name, scene, options), mat, at);

  for (const x of [-0.15, 0.15]) {
    block('astronaut-sole', { width: 0.26, height: 0.07, depth: 0.38, bevel: 0.02 }, trim, [
      x,
      0.035,
      0.03,
    ]);
    block('astronaut-boot', { width: 0.24, height: 0.18, depth: 0.34, bevel: 0.05 }, suit, [
      x,
      0.16,
      0.02,
    ]);
    block('astronaut-ankle', { width: 0.24, height: 0.06, depth: 0.26, bevel: 0.02 }, trim, [
      x,
      0.27,
      0,
    ]);
    block('astronaut-shin', { width: 0.22, height: 0.3, depth: 0.24, bevel: 0.05 }, suit, [
      x,
      0.43,
      0,
    ]);
    const knee = place(
      createPrism('astronaut-knee', scene, { height: 0.06, diameter: 0.2 }),
      trim,
      [x, 0.6, 0.12],
    );
    knee.rotation.x = Math.PI / 2;
    block('astronaut-thigh', { width: 0.24, height: 0.3, depth: 0.26, bevel: 0.05 }, suit, [
      x,
      0.75,
      0,
    ]);
  }
  block(
    'astronaut-hips',
    { width: 0.52, height: 0.2, depth: 0.32, bevel: 0.05 },
    suit,
    [0, 0.95, 0],
  );
  block(
    'astronaut-belt',
    { width: 0.56, height: 0.07, depth: 0.36, bevel: 0.02 },
    trim,
    [0, 1.06, 0],
  );
  block(
    'astronaut-torso',
    { width: 0.6, height: 0.5, depth: 0.38, bevel: 0.08 },
    suit,
    [0, 1.33, 0],
  );
  for (const x of [-0.2, 0.2]) {
    block('astronaut-strap', { width: 0.08, height: 0.5, depth: 0.42, bevel: 0.02 }, trim, [
      x,
      1.33,
      0,
    ]);
  }
  block(
    'astronaut-tag',
    { width: 0.14, height: 0.03, depth: 0.02, bevel: 0.005 },
    tag,
    [0.06, 1.45, 0.2],
  );
  for (const side of [-1, 1]) {
    const x = side * 0.38;
    block('astronaut-shoulder', { width: 0.2, height: 0.2, depth: 0.28, bevel: 0.05 }, trim, [
      x,
      1.5,
      0,
    ]);
    block('astronaut-arm', { width: 0.17, height: 0.3, depth: 0.19, bevel: 0.04 }, suit, [
      x,
      1.3,
      0,
    ]);
    block('astronaut-forearm', { width: 0.17, height: 0.2, depth: 0.19, bevel: 0.04 }, suit, [
      x,
      1.06,
      0,
    ]);
    block('astronaut-cuff', { width: 0.19, height: 0.05, depth: 0.21, bevel: 0.015 }, trim, [
      x,
      0.94,
      0,
    ]);
    block('astronaut-glove', { width: 0.17, height: 0.17, depth: 0.2, bevel: 0.05 }, trim, [
      x,
      0.83,
      0.01,
    ]);
  }
  place(
    createPrism('astronaut-neck', scene, { height: 0.08, diameter: 0.36, sides: 10 }),
    trim,
    [0, 1.61, 0],
  );
  place(createFacetSphere('astronaut-helmet', scene, 0.62), suit, [0, 1.88, 0]);
  const glass = place(createFacetSphere('astronaut-visor', scene, 0.5), visor, [0, 1.88, 0.17]);
  glass.scaling.set(1, 0.85, 0.6);
  for (const side of [-1, 1]) {
    const ear = place(createPrism('astronaut-ear', scene, { height: 0.08, diameter: 0.2 }), trim, [
      side * 0.31,
      1.88,
      0,
    ]);
    ear.rotation.z = Math.PI / 2;
  }
  block(
    'astronaut-pack',
    { width: 0.48, height: 0.55, depth: 0.22, bevel: 0.06 },
    suit,
    [0, 1.32, -0.3],
  );
  return { root, meshes };
}
