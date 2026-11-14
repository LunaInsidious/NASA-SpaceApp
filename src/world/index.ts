// 3D の世界。座標は x が東、z が北（地球の向き）、y が上。単位は m
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { CreatePickingRay } from '@babylonjs/core/Culling/ray.pure';
// 地面を指す（scene.pick）のに要る副作用を読み込む（ないと Babylon が起動時に警告を出す）
import '@babylonjs/core/Culling/ray';
import type { IPointerEvent } from '@babylonjs/core/Events/deviceInputEvents';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { Facility, FacilityKind, Values } from '../contracts/index.ts';
import type { TerrainEnv } from '../env/api.ts';
import type { PadInput, PlayerPose, World } from './api.ts';
import {
  applyFacilityState,
  applyGhostLook,
  createFacilityVisual,
  type FacilityVisual,
} from './facilities.ts';
import {
  AMBIENT_LIGHT_INTENSITY,
  BAKE_ROWS_PER_FRAME,
  CAMERA_BETA_RAD,
  CAMERA_FOLLOW_RATE,
  CAMERA_GROUND_MARGIN_M,
  CAMERA_MAX_BETA_RAD,
  CAMERA_MAX_RADIUS_M,
  CAMERA_MAX_Z_M,
  CAMERA_MIN_BETA_RAD,
  CAMERA_MIN_RADIUS_M,
  CAMERA_RADIUS_M,
  CAMERA_TARGET_HEIGHT_M,
  CELESTIAL_DISTANCE_M,
  CLICK_SLOP_PX,
  EARTH_DIAMETER_M,
  GUIDE_ALPHA,
  GUIDE_COLOR,
  GUIDE_DIAMETER_M,
  GUIDE_HEIGHT_M,
  HOP_SPEED_MPS,
  ICE_BRIGHTNESS,
  ICE_COLOR,
  PICK_MAX_DISTANCE_M,
  PICK_REFINE_STEPS,
  PICK_STEP_M,
  PLAYER_BOUNDS_MARGIN_M,
  POP_OVERSHOOT,
  POP_SECONDS,
  PREVIEW_ALPHA,
  PREVIEW_BAD,
  PREVIEW_GOOD,
  PREVIEW_WARN,
  SHADE_LIT_BASE,
  SHADE_LIT_SLOPE_GAIN,
  SHADE_SHADOW,
  SHADOW_CHECK_INTERVAL_SEC,
  SKY_DIAMETER_M,
  STAR_COUNT,
  STAR_TEXTURE_SIZE,
  SUN_DIAMETER_M,
  SUN_LIGHT_INTENSITY,
  SUN_REBAKE_STEP_RAD,
  SUNLIT_SAMPLE_OFFSET_M,
  TURN_RATE,
} from './tuning.ts';

type Vec3 = { x: number; y: number; z: number };

/** 角度の差を -π〜π にそろえる */
function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function toVector(v: Vec3, scale = 1): Vector3 {
  return new Vector3(v.x * scale, v.y * scale, v.z * scale);
}

/** 地形のメッシュと、頂点の明るさへの影の焼き込み */
function createTerrain(scene: Scene, env: TerrainEnv) {
  const n = env.resolution;
  const half = env.sizeMeters / 2;
  const cell = env.sizeMeters / (n - 1);
  const positions = new Float32Array(n * n * 3);
  const slopeNormals = new Float32Array(n * n * 3);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      positions[i * 3] = -half + ix * cell;
      positions[i * 3 + 1] = env.heights[i];
      positions[i * 3 + 2] = -half + iz * cell;
      // 斜面の向き（陰影用）。端は片側の差で求める
      const hx0 = env.heights[iz * n + Math.max(0, ix - 1)];
      const hx1 = env.heights[iz * n + Math.min(n - 1, ix + 1)];
      const hz0 = env.heights[Math.max(0, iz - 1) * n + ix];
      const hz1 = env.heights[Math.min(n - 1, iz + 1) * n + ix];
      const dx = (hx1 - hx0) / (2 * cell);
      const dz = (hz1 - hz0) / (2 * cell);
      const len = Math.hypot(dx, 1, dz);
      slopeNormals[i * 3] = -dx / len;
      slopeNormals[i * 3 + 1] = 1 / len;
      slopeNormals[i * 3 + 2] = -dz / len;
    }
  }
  const indices = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < n - 1; iz++) {
    for (let ix = 0; ix < n - 1; ix++) {
      const a = iz * n + ix;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }

  const bakeRows = (sunAzimuthRad: number, fromRow: number, toRow: number, out: Float32Array) => {
    const sun = env.sunDirection(sunAzimuthRad);
    for (let iz = fromRow; iz < toRow; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const i = iz * n + ix;
        const x = positions[i * 3];
        const z = positions[i * 3 + 2];
        const lit = env.isSunlit(
          x,
          z,
          positions[i * 3 + 1] + SUNLIT_SAMPLE_OFFSET_M,
          sunAzimuthRad,
        );
        const facing =
          slopeNormals[i * 3] * sun.x +
          slopeNormals[i * 3 + 1] * sun.y +
          slopeNormals[i * 3 + 2] * sun.z;
        const b = lit
          ? SHADE_LIT_BASE + SHADE_LIT_SLOPE_GAIN * Math.min(1, Math.max(0, facing / 0.5))
          : SHADE_SHADOW;
        if (env.isIceAt(x, z)) {
          const ib = Math.max(b, ICE_BRIGHTNESS);
          out.set([ICE_COLOR[0] * ib, ICE_COLOR[1] * ib, ICE_COLOR[2] * ib, 1], i * 4);
        } else {
          // 少し暖かい灰色（レゴリス）
          out.set([b, b * 0.98, b * 0.95, 1], i * 4);
        }
      }
    }
  };

  const colors = new Float32Array(n * n * 4);
  bakeRows(0, 0, n, colors);

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  const normals = new Float32Array(n * n * 3);
  VertexData.ComputeNormals(positions, indices, normals);
  vertexData.normals = normals;
  vertexData.colors = colors;
  const mesh = new Mesh('terrain', scene);
  vertexData.applyToMesh(mesh, true);
  mesh.isPickable = false;
  const mat = new StandardMaterial('terrain-mat', scene);
  // 明るさは焼き込んだ頂点の色だけで決める（太陽が低いので光源の陰影では暗すぎる）
  mat.disableLighting = true;
  mat.emissiveColor = Color3.White();
  mat.backFaceCulling = false;
  mesh.material = mat;

  // 焼き直しは数フレームに分けて進める
  let job: { az: number; row: number; buffer: Float32Array } | null = null;
  let bakedAz = 0;
  return {
    requestBake(sunAzimuthRad: number) {
      const target = job?.az ?? bakedAz;
      if (Math.abs(angleDelta(sunAzimuthRad, target)) < SUN_REBAKE_STEP_RAD) return;
      job = { az: sunAzimuthRad, row: 0, buffer: new Float32Array(n * n * 4) };
    },
    progress() {
      if (job === null) return;
      const to = Math.min(n, job.row + BAKE_ROWS_PER_FRAME);
      bakeRows(job.az, job.row, to, job.buffer);
      job.row = to;
      if (job.row >= n) {
        mesh.updateVerticesData(VertexBuffer.ColorKind, job.buffer);
        bakedAz = job.az;
        job = null;
      }
    },
  };
}

function createStarTexture(scene: Scene): DynamicTexture {
  const texture = new DynamicTexture(
    'stars',
    { width: STAR_TEXTURE_SIZE, height: STAR_TEXTURE_SIZE / 2 },
    scene,
    false,
  );
  const ctx = texture.getContext();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, STAR_TEXTURE_SIZE, STAR_TEXTURE_SIZE / 2);
  // 毎回同じ星空にする（表示だけなので sim の rng は使わない）
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < STAR_COUNT; i++) {
    const v = Math.floor(120 + random() * 135);
    ctx.fillStyle = `rgb(${v},${v},${Math.min(255, v + 20)})`;
    const size = random() < 0.08 ? 2 : 1;
    ctx.fillRect(random() * STAR_TEXTURE_SIZE, random() * (STAR_TEXTURE_SIZE / 2), size, size);
  }
  texture.update();
  return texture;
}

function emissiveSphere(scene: Scene, name: string, diameter: number, rgb: Color3): Mesh {
  const mesh = CreateSphere(name, { diameter, segments: 16 }, scene);
  const mat = new StandardMaterial(`${name}-mat`, scene);
  mat.disableLighting = true;
  mat.emissiveColor = rgb;
  mesh.material = mat;
  mesh.infiniteDistance = true;
  mesh.isPickable = false;
  return mesh;
}

function createLander(scene: Scene, env: TerrainEnv): TransformNode {
  const [x, z] = env.landerPosition;
  const root = new TransformNode('lander', scene);
  root.position.set(x, env.heightAt(x, z), z);
  const gold = new StandardMaterial('lander-gold', scene);
  gold.diffuseColor = new Color3(0.85, 0.65, 0.2);
  const silver = new StandardMaterial('lander-silver', scene);
  silver.diffuseColor = new Color3(0.78, 0.8, 0.85);
  const descent = CreateBox('lander-descent', { width: 3, height: 1.4, depth: 3 }, scene);
  descent.material = gold;
  descent.position.y = 1.6;
  const ascent = CreateBox('lander-ascent', { width: 2.2, height: 1.6, depth: 2.2 }, scene);
  ascent.material = silver;
  ascent.position.y = 3.1;
  const parts: Mesh[] = [descent, ascent];
  for (const [lx, lz] of [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6],
  ] as const) {
    const leg = CreateCylinder('lander-leg', { height: 1.9, diameter: 0.12 }, scene);
    leg.material = silver;
    leg.position.set(lx, 0.95, lz);
    const pad = CreateCylinder('lander-pad', { height: 0.08, diameter: 0.6 }, scene);
    pad.material = silver;
    pad.position.set(lx, 0.04, lz);
    parts.push(leg, pad);
  }
  for (const part of parts) {
    part.parent = root;
    part.isPickable = false;
  }
  return root;
}

function createAstronaut(scene: Scene): { root: TransformNode; meshes: Mesh[] } {
  const root = new TransformNode('astronaut', scene);
  const suit = new StandardMaterial('astronaut-suit', scene);
  suit.diffuseColor = new Color3(0.95, 0.95, 0.97);
  const visorMat = new StandardMaterial('astronaut-visor', scene);
  visorMat.diffuseColor = new Color3(0.75, 0.55, 0.15);
  visorMat.specularColor = new Color3(1, 0.9, 0.6);
  const packMat = new StandardMaterial('astronaut-pack', scene);
  packMat.diffuseColor = new Color3(0.7, 0.72, 0.76);

  const body = CreateCapsule('astronaut-body', { radius: 0.32, height: 1.3 }, scene);
  body.material = suit;
  body.position.y = 0.75;
  const helmet = CreateSphere('astronaut-helmet', { diameter: 0.5, segments: 12 }, scene);
  helmet.material = suit;
  helmet.position.y = 1.55;
  // バイザーは正面（+z）
  const visor = CreateSphere('astronaut-visor', { diameter: 0.42, segments: 12 }, scene);
  visor.material = visorMat;
  visor.scaling.z = 0.6;
  visor.position.set(0, 1.57, 0.14);
  const pack = CreateBox('astronaut-pack', { width: 0.5, height: 0.6, depth: 0.25 }, scene);
  pack.material = packMat;
  pack.position.set(0, 1, -0.32);
  const meshes = [body, helmet, visor, pack];
  for (const mesh of meshes) {
    mesh.parent = root;
    mesh.isPickable = false;
  }
  return { root, meshes };
}

export function createWorld(scene: Scene, env: TerrainEnv, values: Values): World {
  const gravity = values.moon.gravity.value;
  const walkSpeed = values.player.walkSpeedMps.value;
  const jumpSpeed = values.player.jumpSpeedMps.value;
  const buildDistance = values.player.buildDistanceMeters.value;
  const limit = env.sizeMeters / 2 - PLAYER_BOUNDS_MARGIN_M;
  const clampToMap = (v: number) => Math.min(limit, Math.max(-limit, v));

  scene.clearColor = new Color4(0, 0, 0, 1);

  // 光：低い太陽の平行光と、地球の照り返しのような弱い環境光
  const sunLight = new DirectionalLight('sun-light', new Vector3(0, -1, 0), scene);
  sunLight.intensity = SUN_LIGHT_INTENSITY;
  const ambient = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  ambient.intensity = AMBIENT_LIGHT_INTENSITY;
  ambient.diffuse = new Color3(0.55, 0.6, 0.7);
  ambient.groundColor = new Color3(0.12, 0.12, 0.14);

  // 空：星、地球、太陽
  const sky = CreateSphere(
    'sky',
    { diameter: SKY_DIAMETER_M, segments: 16, sideOrientation: Mesh.BACKSIDE },
    scene,
  );
  const skyMat = new StandardMaterial('sky-mat', scene);
  skyMat.disableLighting = true;
  skyMat.emissiveTexture = createStarTexture(scene);
  skyMat.backFaceCulling = false;
  sky.material = skyMat;
  sky.infiniteDistance = true;
  sky.isPickable = false;

  const earth = emissiveSphere(scene, 'earth', EARTH_DIAMETER_M, new Color3(0.35, 0.55, 1));
  earth.position = toVector(env.earthDirection(), CELESTIAL_DISTANCE_M);
  const sunDisc = emissiveSphere(scene, 'sun', SUN_DIAMETER_M, new Color3(1, 0.96, 0.85));

  const terrain = createTerrain(scene, env);
  createLander(scene, env);
  const astronaut = createAstronaut(scene);

  // カメラ：宇宙飛行士を後ろ（-z 側）から追う
  const camera = new ArcRotateCamera(
    'camera',
    -Math.PI / 2,
    CAMERA_BETA_RAD,
    CAMERA_RADIUS_M,
    Vector3.Zero(),
    scene,
  );
  camera.lowerRadiusLimit = CAMERA_MIN_RADIUS_M;
  camera.upperRadiusLimit = CAMERA_MAX_RADIUS_M;
  camera.lowerBetaLimit = CAMERA_MIN_BETA_RAD;
  camera.upperBetaLimit = CAMERA_MAX_BETA_RAD;
  camera.panningSensibility = 0;
  camera.wheelDeltaPercentage = 0.01;
  camera.minZ = 0.1;
  camera.maxZ = CAMERA_MAX_Z_M;
  // 矢印キーは移動に使うので、カメラのキー操作は外す
  camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
  camera.attachControl(true);
  scene.activeCamera = camera;

  // 宇宙飛行士の状態
  const [startX, startZ] = env.landerPosition;
  const player = { x: startX, y: env.heightAt(startX, startZ), z: startZ, vy: 0, heading: 0 };
  let grounded = true;
  let movementEnabled = true;
  let jumpRequested = false;
  let pad: PadInput = { x: 0, y: 0, jump: false };
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space' && !e.repeat) jumpRequested = true;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  const pressed = (...codes: string[]) => codes.some((c) => keys.has(c));

  let sunAzimuth = 0;
  const applySun = () => {
    const dir = env.sunDirection(sunAzimuth);
    sunLight.direction = toVector(dir, -1);
    sunDisc.position = toVector(dir, CELESTIAL_DISTANCE_M);
    for (const v of facilityVisuals.values()) {
      if (v.sunTracker !== null) v.sunTracker.rotation.y = sunAzimuth;
    }
  };

  // 施設
  const facilityVisuals = new Map<string, FacilityVisual>();
  const facilityPositions = new Map<string, { x: number; z: number }>();
  let ghost: { visual: FacilityVisual; material: StandardMaterial } | null = null;

  const placeOnGround = (node: TransformNode, x: number, z: number) => {
    node.position.set(x, env.heightAt(x, z), z);
  };

  // 影に入っているものは太陽の光を受けない（地形の焼き込みと見た目をそろえる）
  let shadowCheckTimer = 0;
  let excludedKey = '';
  const updateShadowExclusion = () => {
    const excluded: AbstractMesh[] = [];
    if (!env.isSunlit(player.x, player.z, player.y + 1, sunAzimuth)) {
      excluded.push(...astronaut.meshes);
    }
    for (const [id, visual] of facilityVisuals) {
      const p = facilityPositions.get(id);
      if (p !== undefined && !env.isSunlit(p.x, p.z, env.heightAt(p.x, p.z) + 1, sunAzimuth)) {
        excluded.push(...visual.meshes());
      }
    }
    // 付け替えるとシェーダーの組み直しが起きるので、変わったときだけにする
    const key = excluded.map((m) => m.uniqueId).join(',');
    if (key !== excludedKey) {
      excludedKey = key;
      sunLight.excludedMeshes = excluded;
    }
  };

  applySun();

  const updateCamera = (dt: number) => {
    const target = new Vector3(player.x, player.y + CAMERA_TARGET_HEIGHT_M, player.z);
    const follow = 1 - Math.exp(-CAMERA_FOLLOW_RATE * dt);
    camera.target.copyFrom(Vector3.Lerp(camera.target, target, follow));
    // カメラが地形にめり込みそうなら、上から見下ろす角度に上げる
    const t = camera.target;
    const sinB = Math.sin(camera.beta);
    const cx = t.x + camera.radius * Math.cos(camera.alpha) * sinB;
    const cz = t.z + camera.radius * Math.sin(camera.alpha) * sinB;
    const ground = env.heightAt(clampToMap(cx), clampToMap(cz)) + CAMERA_GROUND_MARGIN_M;
    const cy = t.y + camera.radius * Math.cos(camera.beta);
    if (cy < ground) {
      const needed = Math.min(1, Math.max(-1, (ground - t.y) / camera.radius));
      camera.beta = Math.max(CAMERA_MIN_BETA_RAD, Math.min(camera.beta, Math.acos(needed)));
    }
  };

  const updatePlayer = (dt: number) => {
    let forward = 0;
    let right = 0;
    if (movementEnabled) {
      forward =
        (pressed('KeyW', 'ArrowUp') ? 1 : 0) - (pressed('KeyS', 'ArrowDown') ? 1 : 0) + pad.y;
      right =
        (pressed('KeyD', 'ArrowRight') ? 1 : 0) - (pressed('KeyA', 'ArrowLeft') ? 1 : 0) + pad.x;
    } else {
      jumpRequested = false;
    }
    // カメラから宇宙飛行士へ向かう水平の向きが「前」
    const fx = -Math.cos(camera.alpha);
    const fz = -Math.sin(camera.alpha);
    let mx = fx * forward + fz * right;
    let mz = fz * forward - fx * right;
    const magnitude = Math.hypot(mx, mz);
    if (magnitude > 1) {
      mx /= magnitude;
      mz /= magnitude;
    }
    const moving = magnitude > 0.05;
    player.x = clampToMap(player.x + mx * walkSpeed * dt);
    player.z = clampToMap(player.z + mz * walkSpeed * dt);
    if (moving) {
      const targetHeading = Math.atan2(mx, mz);
      player.heading += angleDelta(targetHeading, player.heading) * (1 - Math.exp(-TURN_RATE * dt));
    }
    const ground = env.heightAt(player.x, player.z);
    if (grounded) {
      if (jumpRequested) player.vy = jumpSpeed;
      else if (moving) player.vy = HOP_SPEED_MPS; // 歩くと小さく跳ねる
    }
    jumpRequested = false;
    player.vy -= gravity * dt;
    player.y += player.vy * dt;
    if (player.y <= ground) {
      player.y = ground;
      player.vy = 0;
      grounded = true;
    } else {
      grounded = false;
    }
    astronaut.root.position.set(player.x, player.y, player.z);
    astronaut.root.rotation.y = player.heading;
  };

  let syncedOnce = false;
  const popping = new Map<TransformNode, number>();

  // チュートリアルで行く場所を示す光の柱
  const guide = CreateCylinder(
    'guide',
    { height: GUIDE_HEIGHT_M, diameter: GUIDE_DIAMETER_M },
    scene,
  );
  const guideMat = new StandardMaterial('guide-mat', scene);
  guideMat.emissiveColor = new Color3(GUIDE_COLOR[0], GUIDE_COLOR[1], GUIDE_COLOR[2]);
  guideMat.disableLighting = true;
  guideMat.alpha = GUIDE_ALPHA;
  guide.material = guideMat;
  guide.isPickable = false;
  guide.setEnabled(false);

  // 置く場所：建設モードの間、マウス（PC）やタップ（スマホ）が指す地面を、格子にそろえて使う
  const grid = values.build.gridMeters.value;
  const snap = (v: number) => clampToMap(Math.round(v / grid) * grid);
  let buildCursor = false;
  let cursorSpot: { x: number; z: number } | null = null;
  const groundClickListeners: (() => void)[] = [];
  let pointerPress: { x: number; y: number } | null = null;

  /** 画面の点 (x, y) が指す地面。地面に当たらなければ null（空を指している） */
  const groundAt = (screenX: number, screenY: number): { x: number; z: number } | null => {
    const ray = CreatePickingRay(scene, screenX, screenY, null, camera);
    const at = (d: number) => ({
      x: ray.origin.x + ray.direction.x * d,
      y: ray.origin.y + ray.direction.y * d,
      z: ray.origin.z + ray.direction.z * d,
    });
    for (let d = PICK_STEP_M; d <= PICK_MAX_DISTANCE_M; d += PICK_STEP_M) {
      const p = at(d);
      if (p.y <= env.heightAt(p.x, p.z)) {
        // 1歩前と今のあいだを細かくして、地面との交わりを求める
        let lo = d - PICK_STEP_M;
        let hi = d;
        for (let i = 0; i < PICK_REFINE_STEPS; i++) {
          const mid = (lo + hi) / 2;
          const q = at(mid);
          if (q.y <= env.heightAt(q.x, q.z)) hi = mid;
          else lo = mid;
        }
        const hit = at(hi);
        return { x: snap(hit.x), z: snap(hit.z) };
      }
    }
    return null;
  };

  scene.onPointerObservable.add((info) => {
    if (!buildCursor) return;
    const event = info.event;
    const pointerType = 'pointerType' in event ? (event as IPointerEvent).pointerType : null;
    if (info.type === PointerEventTypes.POINTERMOVE && pointerType === 'mouse') {
      cursorSpot = groundAt(scene.pointerX, scene.pointerY) ?? cursorSpot;
    } else if (info.type === PointerEventTypes.POINTERDOWN) {
      pointerPress = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    } else if (info.type === PointerEventTypes.POINTERUP && pointerPress !== null) {
      const moved = Math.hypot(event.clientX - pointerPress.x, event.clientY - pointerPress.y);
      pointerPress = null;
      // ドラッグ（カメラを回した）ならそのまま。クリックやタップなら、そこを置く場所にする
      if (moved > CLICK_SLOP_PX) return;
      const spot = groundAt(scene.pointerX, scene.pointerY);
      if (spot === null) return;
      cursorSpot = spot;
      // PC はクリックで置く。スマホのタップは場所を選ぶだけで、「ここに置く」で置く
      if (pointerType === 'mouse') {
        for (const listener of groundClickListeners) listener();
      }
    }
  });

  return {
    frame(dtSec) {
      const dt = Math.min(dtSec, 0.1);
      for (const [node, elapsed] of popping) {
        const t = Math.min(1, (elapsed + dt) / POP_SECONDS);
        // 少し大きくなりすぎてから戻る（ease-out-back）
        const back = POP_OVERSHOOT;
        const scale = 1 + (back + 1) * (t - 1) ** 3 + back * (t - 1) ** 2;
        node.scaling.setAll(scale);
        if (t >= 1) popping.delete(node);
        else popping.set(node, elapsed + dt);
      }
      updatePlayer(dt);
      updateCamera(dt);
      terrain.progress();
      shadowCheckTimer -= dt;
      if (shadowCheckTimer <= 0) {
        shadowCheckTimer = SHADOW_CHECK_INTERVAL_SEC;
        updateShadowExclusion();
      }
    },
    setPadInput(input) {
      if (input.jump && !pad.jump) jumpRequested = true;
      pad = input;
    },
    setMovementEnabled(enabled) {
      movementEnabled = enabled;
    },
    setSunAzimuth(sunAzimuthRad) {
      sunAzimuth = sunAzimuthRad;
      applySun();
      terrain.requestBake(sunAzimuthRad);
    },
    syncFacilities(facilities: Facility[], working: Record<string, boolean>) {
      const seen = new Set<string>();
      const isFirstSync = !syncedOnce;
      syncedOnce = true;
      for (const f of facilities) {
        seen.add(f.id);
        const isWorking = working[f.id];
        if (isWorking === undefined) {
          throw new Error(`syncFacilities: ${f.id} の working がない`);
        }
        let visual = facilityVisuals.get(f.id);
        if (visual === undefined || visual.shieldMaterial !== f.shieldMaterial) {
          visual?.dispose();
          visual = createFacilityVisual(scene, f.kind, f.shieldMaterial);
          if (visual.sunTracker !== null) visual.sunTracker.rotation.y = sunAzimuth;
          facilityVisuals.set(f.id, visual);
          // 新しく建った施設は、ポンと弾んで出てくる（読み込んだ直後のものは弾ませない）
          if (!isFirstSync) {
            visual.root.scaling.setAll(0);
            popping.set(visual.root, 0);
          }
        }
        placeOnGround(visual.root, f.x, f.z);
        facilityPositions.set(f.id, { x: f.x, z: f.z });
        applyFacilityState(visual, f.condition, isWorking, f.regolithCover === true);
      }
      for (const [id, visual] of facilityVisuals) {
        if (!seen.has(id)) {
          visual.dispose();
          facilityVisuals.delete(id);
          facilityPositions.delete(id);
        }
      }
    },
    setBuildPreview(preview) {
      if (preview === null) {
        ghost?.visual.dispose();
        ghost = null;
        return;
      }
      const kind: FacilityKind = preview.kind;
      if (ghost === null || ghost.visual.kind !== kind) {
        ghost?.visual.dispose();
        const material = new StandardMaterial('preview-mat', scene);
        material.disableLighting = true;
        material.alpha = PREVIEW_ALPHA;
        const visual = createFacilityVisual(scene, kind, undefined);
        applyGhostLook(visual, material);
        ghost = { visual, material };
      }
      const { allowed, works } = preview.placement;
      const rgb = !allowed ? PREVIEW_BAD : works ? PREVIEW_GOOD : PREVIEW_WARN;
      ghost.material.emissiveColor = new Color3(...rgb);
      if (ghost.visual.sunTracker !== null) ghost.visual.sunTracker.rotation.y = sunAzimuth;
      placeOnGround(ghost.visual.root, preview.x, preview.z);
    },
    getBuildSpot() {
      if (cursorSpot !== null) {
        return cursorSpot;
      }
      // 建設モードに入った直後で、まだマウスやタップで選んでいないときは宇宙飛行士の前
      return {
        x: snap(player.x + Math.sin(player.heading) * buildDistance),
        z: snap(player.z + Math.cos(player.heading) * buildDistance),
      };
    },
    setBuildCursor(enabled) {
      buildCursor = enabled;
      cursorSpot = null;
      pointerPress = null;
    },
    onGroundClick(listener) {
      groundClickListeners.push(listener);
    },
    getPlayer(): PlayerPose {
      return { x: player.x, y: player.y, z: player.z, headingRad: player.heading };
    },
    teleportPlayer(x, z) {
      player.x = clampToMap(x);
      player.z = clampToMap(z);
      player.y = env.heightAt(player.x, player.z);
      player.vy = 0;
      grounded = true;
      astronaut.root.position.set(player.x, player.y, player.z);
      camera.target.copyFrom(new Vector3(player.x, player.y + CAMERA_TARGET_HEIGHT_M, player.z));
    },
    pointCameraAwayFrom(x, z) {
      // ArcRotateCamera は target から (cos α, sin α) の向きにいる。宇宙飛行士から見て (x, z) の反対側に置く
      camera.alpha = Math.atan2(player.z - z, player.x - x);
    },
    setPlayerVisible(visible) {
      astronaut.root.setEnabled(visible);
    },
    getViewYawRad() {
      const d = camera.target.subtract(camera.position);
      return Math.atan2(d.x, d.z);
    },
    setGuideMarker(target) {
      guide.setEnabled(target !== null);
      if (target !== null) {
        guide.position.set(
          target.x,
          env.heightAt(target.x, target.z) + GUIDE_HEIGHT_M / 2,
          target.z,
        );
      }
    },
  };
}
