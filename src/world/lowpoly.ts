// ローポリ（面の少ない、角を落とした形）の部品を作る道具。どの面も平らな影になる
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';

/** 凸の多面体。faces は面ごとの点の番号（並びと向きはここで直す） */
export function convexMesh(name: string, scene: Scene, points: Vector3[], faces: number[][]): Mesh {
  const center = points
    .reduce((sum, p) => sum.addInPlace(p), Vector3.Zero())
    .scaleInPlace(1 / points.length);
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (const face of faces) {
    const pts = face.map((i) => points[i] as Vector3);
    const c = pts
      .reduce((sum, p) => sum.addInPlace(p), Vector3.Zero())
      .scaleInPlace(1 / pts.length);
    const [p0, p1, p2] = pts as [Vector3, Vector3, Vector3];
    const n = Vector3.Cross(p1.subtract(p0), p2.subtract(p0)).normalize();
    if (Vector3.Dot(n, c.subtract(center)) < 0) n.scaleInPlace(-1);
    const u = p0.subtract(c).normalize();
    const v = Vector3.Cross(n, u);
    const angle = (p: Vector3) => {
      const d = p.subtract(c);
      return Math.atan2(Vector3.Dot(d, v), Vector3.Dot(d, u));
    };
    const sorted = [...pts].sort((a, b) => angle(a) - angle(b));
    const base = positions.length / 3;
    for (const p of sorted) {
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
    }
    // Babylon は左手系なので、外から見て時計回りを表にする
    for (let k = 1; k < sorted.length - 1; k++) indices.push(base, base + k + 1, base + k);
  }
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = positions;
  data.normals = normals;
  data.indices = indices;
  data.applyToMesh(mesh);
  return mesh;
}

export interface BlockOptions {
  width: number;
  height: number;
  depth: number;
  /** 角を落とす幅（m） */
  bevel?: number;
  /** 上の面を x・z の向きに何倍にするか（1 で四角い柱、1 より小さいと上がすぼまる） */
  taperX?: number;
  taperZ?: number;
}

/** 角を落とした箱。原点は箱の中心 */
export function createBlock(name: string, scene: Scene, options: BlockOptions): Mesh {
  const w = options.width / 2;
  const h = options.height / 2;
  const d = options.depth / 2;
  const c = Math.min(options.bevel ?? Math.min(w, h, d) * 0.25, w * 0.9, h * 0.9, d * 0.9);
  const tx = options.taperX ?? 1;
  const tz = options.taperZ ?? 1;
  const points: Vector3[] = [];
  const index = new Map<string, number>();
  const point = (axis: 'x' | 'y' | 'z', sx: number, sy: number, sz: number) => {
    const key = `${axis}${sx}${sy}${sz}`;
    const found = index.get(key);
    if (found !== undefined) return found;
    const x = sx * (axis === 'x' ? w : w - c) * (sy > 0 ? tx : 1);
    const y = sy * (axis === 'y' ? h : h - c);
    const z = sz * (axis === 'z' ? d : d - c) * (sy > 0 ? tz : 1);
    points.push(new Vector3(x, y, z));
    index.set(key, points.length - 1);
    return points.length - 1;
  };
  const signs = [-1, 1];
  const faces: number[][] = [];
  for (const s of signs) {
    faces.push(signs.flatMap((a) => signs.map((b) => point('x', s, a, b))));
    faces.push(signs.flatMap((a) => signs.map((b) => point('y', a, s, b))));
    faces.push(signs.flatMap((a) => signs.map((b) => point('z', a, b, s))));
    for (const t of signs) {
      faces.push(signs.flatMap((b) => [point('x', s, t, b), point('y', s, t, b)]));
      faces.push(signs.flatMap((b) => [point('x', s, b, t), point('z', s, b, t)]));
      faces.push(signs.flatMap((b) => [point('y', b, s, t), point('z', b, s, t)]));
      for (const u of signs)
        faces.push([point('x', s, t, u), point('y', s, t, u), point('z', s, t, u)]);
    }
  }
  return convexMesh(name, scene, points, faces);
}

export interface PrismOptions {
  height: number;
  diameter?: number;
  diameterTop?: number;
  diameterBottom?: number;
  /** 角の数 */
  sides?: number;
  /** 両面を見せる（ふたのない皿や箱の中が見えるように） */
  open?: boolean;
}

/** 角柱・角すい台（面の少ない円柱）。軸は y、原点は中心 */
export function createPrism(name: string, scene: Scene, options: PrismOptions): Mesh {
  const mesh = CreateCylinder(
    name,
    {
      height: options.height,
      diameter: options.diameter,
      diameterTop: options.diameterTop,
      diameterBottom: options.diameterBottom,
      tessellation: options.sides ?? 8,
      cap: options.open === true ? Mesh.CAP_START : Mesh.CAP_ALL,
      sideOrientation: options.open === true ? Mesh.DOUBLESIDE : Mesh.FRONTSIDE,
    },
    scene,
  );
  return mesh.convertToFlatShadedMesh();
}

/** 面の少ない球 */
export function createFacetSphere(name: string, scene: Scene, diameter: number): Mesh {
  return CreateIcoSphere(name, { radius: diameter / 2, subdivisions: 2, flat: true }, scene);
}

/** from から to へ伸びる棒（四角い棒か、角の数 sides の棒） */
export function createStrut(
  name: string,
  scene: Scene,
  from: Vector3,
  to: Vector3,
  thickness: number,
  sides?: number,
): Mesh {
  const length = Vector3.Distance(from, to);
  const mesh =
    sides === undefined
      ? createBlock(name, scene, {
          width: thickness,
          height: length,
          depth: thickness,
          bevel: thickness * 0.2,
        })
      : createPrism(name, scene, { height: length, diameter: thickness, sides });
  mesh.position = Vector3.Center(from, to);
  mesh.rotationQuaternion = Quaternion.Identity();
  Quaternion.FromUnitVectorsToRef(
    Vector3.Up(),
    to.subtract(from).normalize(),
    mesh.rotationQuaternion,
  );
  return mesh;
}
