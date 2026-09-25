// 스타일 시안 장면 `?scene=style-lab` (STYLE-001, MVP_SPEC 45.1, ADR 044 / 045).
// 게임 월드(시계·주민 판단·저장)를 돌리지 않는 관찰 전용 장면이다. 같은 조명 아래 지금 모습과 시안을 나란히 둔다.
// 지금 모습은 실제 게임 렌더(청크 메시·NpcView)를 그대로 쓰고, 시안은 style/ 의 모형·타일이다.
import * as THREE from 'three';
import { BlockId } from '../../game/data/blocks';
import { createNPC, type NPC } from '../../game/entities/NPC';
import { EventBus } from '../../game/EventBus';
import type { ActionKind, ActionView, UsePose } from '../../game/types';
import { VoxelWorld } from '../../game/voxel/VoxelWorld';
import { MOVING_SPEED, npcPose, PoseBlender } from '../characterPose';
import {
  createCharacterSpriteMaterial,
  createEmissiveMaterial,
  createFlatVertexColorMaterial,
  createOutlineMaterial,
  createStyleBlockMaterial,
  createToonGradient,
  createToonMaterial,
} from '../materials';
import { CuteCharacter, type CharacterKind } from '../cuteCharacter';
import { NpcView, type NpcViewWorld } from '../NpcView';
import { Renderer, type OrbitView } from '../Renderer';
import {
  COOK_OUTFIT,
  CuteFigure,
  FIGURE_VARIANTS,
  type CuteMaterials,
  type FigureVariant,
} from './cuteFigure';
import {
  buildStoveModel,
  buildWaterPotModel,
  type StoveModel,
  type WaterPotModel,
} from './styleProps';
import { createStyleTileTexture, type StyleTileKind } from './styleTiles';

/** 시안 장면에서 고를 수 있는 자세. ADR 041 자세 표의 일부다. */
export type LabPose = 'idle' | 'walk' | 'cook' | 'sit' | 'work';

/** 자세 → 주민 Action 모양(렌더가 읽는 값만). */
const POSE_ACTIONS: Record<LabPose, { kind: ActionKind; pose?: UsePose }> = {
  idle: { kind: 'idle' },
  walk: { kind: 'move' },
  cook: { kind: 'cook', pose: 'cook' },
  sit: { kind: 'rest', pose: 'sit' },
  work: { kind: 'plant', pose: 'work' },
};

/** 발이 놓이는 높이(풀밭 윗면). */
const GROUND = 3;
/**
 * 견본 줄의 z 칸. 주민 · 가구 · 블록 묶음을 한 줄로 옆에 나란히 둔다(앞줄이 뒷줄을 가리지 않게).
 * 카메라는 +z 쪽에서 −z 를 본다. 묶음마다 왼쪽이 지금, 오른쪽이 시안이다.
 */
const ROW = 18;
const ROW_FIGURES = ROW;
/** 가구 묶음: 지금 화덕·물 항아리 칸 x, 시안 모형 중심 x. */
const PROPS_CURRENT_X = 27;
const PROPS_STYLE_X = 32.5;
/** 블록 묶음: 지금 블록 첫 칸 x, 시안 상자 첫 중심 x. 두 칸 간격이다. */
const BLOCKS_CURRENT_X = 39;
const BLOCKS_STYLE_X = 48.5;
/** 장면 월드 크기. */
const LAB_SIZE_X = 60;
/** 지금 요리사와 시안 A/B/C 의 x. */
const CURRENT_X = 13.5;
const VARIANT_X: Record<FigureVariant, number> = { A: 17, B: 19.5, C: 22 };
/** 게임 캐릭터 다섯의 첫 x(1.6 칸 간격, STYLE-002). */
const VILLAGER_X0 = 4.5;
const CHARACTER_KINDS: readonly CharacterKind[] = [
  'farmer',
  'cook',
  'carpenter',
  'villager',
  'player',
];
const CHARACTER_NAMES: Record<CharacterKind, string> = {
  farmer: '농부',
  cook: '요리사',
  carpenter: '목수',
  villager: '주민',
  player: '플레이어',
};
/** 걷기 원의 반지름·각속도. 속도 1.4 칸/초 로 걷기 걸음이 된다. */
const WALK_RADIUS = 0.7;
const WALK_OMEGA = 2;

/** 고정 시점: 0 주민 · 1 가구 · 2 블록 · 3 전경 · 4 얼굴(시안 셋 가까이) · 5 마을 사람(게임 캐릭터 다섯). */
export const LAB_VIEWS: readonly OrbitView[] = [
  {
    target: { x: 17.8, y: GROUND + 0.75, z: ROW_FIGURES + 0.5 },
    distance: 6.8,
    yaw: 0,
    pitch: 0.1,
  },
  {
    target: { x: 30.8, y: GROUND + 0.45, z: ROW + 0.5 },
    distance: 5.6,
    yaw: 0.2,
    pitch: 0.32,
  },
  {
    target: { x: 46.8, y: GROUND + 0.5, z: ROW + 0.5 },
    distance: 10,
    yaw: 0.3,
    pitch: 0.42,
  },
  { target: { x: 34, y: GROUND + 0.5, z: ROW + 0.5 }, distance: 30, yaw: 0.35, pitch: 0.5 },
  {
    target: { x: 19.5, y: GROUND + 1.05, z: ROW_FIGURES + 0.5 },
    distance: 3.6,
    yaw: 0,
    pitch: 0.06,
  },
  {
    target: { x: 7.7, y: GROUND + 0.8, z: ROW_FIGURES + 0.5 },
    distance: 5.6,
    yaw: 0,
    pitch: 0.12,
  },
];

/** 화면에 띄울 이름표 하나(화면 픽셀 좌표). */
export interface LabLabel {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}

/** 장면 계측(MVP_SPEC 45.1). */
export interface LabStats {
  readonly drawCalls: number;
  readonly triangles: number;
  /** 지금 요리사 한 명의 보이는 메시 수(= 드로우콜) */
  readonly currentFigureDrawCalls: number;
  /** 시안별 한 명의 드로우콜(외곽선 켠 상태 포함)과 삼각형 수 */
  readonly variants: Record<FigureVariant, { drawCalls: number; triangles: number }>;
}

/** 시안 한 명의 걸음 상태(NpcView 와 같은 방식으로 속도·위상·방향을 렌더에서 계산한다). */
interface Walker {
  readonly figure: Pick<CuteFigure, 'object3d' | 'applyPose'>;
  readonly blender: PoseBlender;
  readonly home: THREE.Vector3;
  readonly seed: number;
  last: THREE.Vector3 | null;
  speed: number;
  phase: number;
  yaw: number;
}

/** 각도 차이를 −π~π 로. */
function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** 김 텍스처(부드러운 흰 원). */
function puffTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 시안 장면 월드: 풀밭과 지금 블록·가구 견본. 게임 규칙 없이 청크 메시만 쓴다. */
function buildLabVoxels(): VoxelWorld {
  const world = new VoxelWorld({ sizeX: LAB_SIZE_X, sizeY: 16, sizeZ: 32 }, new EventBus());
  for (let z = 0; z < 32; z++) {
    for (let x = 0; x < LAB_SIZE_X; x++) {
      world.writeInitial(x, 0, z, BlockId.bedrock);
      world.writeInitial(x, 1, z, BlockId.dirt);
      world.writeInitial(x, 2, z, BlockId.grass);
    }
  }
  // 지금 가구(블록 모양): 화덕·물 항아리
  world.writeInitial(PROPS_CURRENT_X, GROUND, ROW, BlockId.cooking_stove);
  world.writeInitial(PROPS_CURRENT_X + 2, GROUND, ROW, BlockId.water_pot);
  // 지금 블록 네 종: 풀·판자·돌벽돌·잎
  const current = [BlockId.grass, BlockId.plank, BlockId.stone_brick, BlockId.leaves];
  current.forEach((id, i) => world.writeInitial(BLOCKS_CURRENT_X + i * 2, GROUND, ROW, id));
  world.markAllDirty();
  return world;
}

/** 시안 블록 네 종의 면 타일(+x, −x, +y, −y, +z, −z 순서). */
const STYLE_CUBES: readonly { name: string; faces: readonly StyleTileKind[] }[] = [
  { name: '풀', faces: ['grassSide', 'grassSide', 'grassTop', 'dirt', 'grassSide', 'grassSide'] },
  { name: '판자', faces: ['plank', 'plank', 'plank', 'plank', 'plank', 'plank'] },
  {
    name: '돌벽돌',
    faces: ['stoneBrick', 'stoneBrick', 'stoneBrick', 'stoneBrick', 'stoneBrick', 'stoneBrick'],
  },
  { name: '잎', faces: ['leaves', 'leaves', 'leaves', 'leaves', 'leaves', 'leaves'] },
];

/** 스타일 시안 장면. 매 프레임 update 후 render 한다. */
export class StyleLab {
  readonly renderer: Renderer;
  private readonly root = new THREE.Group();
  private readonly gradients = { 2: createToonGradient(2), 3: createToonGradient(3) } as const;
  private readonly toon: THREE.MeshToonMaterial;
  private readonly outline: THREE.Material;
  private readonly walkers = new Map<FigureVariant, Walker>();
  /** 게임에 쓰는 둥근 캐릭터 다섯(STYLE-002): 농부·요리사·목수·주민·플레이어 */
  private readonly villagers: Walker[] = [];
  private readonly figures = new Map<FigureVariant, CuteFigure>();
  private readonly currentNpc: NPC<ActionView>;
  private readonly currentView: NpcView;
  private readonly npcWorld: NpcViewWorld;
  private readonly stove: StoveModel;
  private readonly waterPot: WaterPotModel;
  private readonly steam: THREE.Sprite[] = [];
  private readonly anchors: { text: string; pos: THREE.Vector3 }[] = [];
  private pose: LabPose = 'idle';
  private time = 0;
  private orbit: { target: THREE.Vector3; distance: number; yaw: number; pitch: number };

  /** 캔버스에 장면을 만든다. */
  constructor(canvas: HTMLCanvasElement, options: { maxPixelRatio: number }) {
    this.renderer = new Renderer(canvas, buildLabVoxels(), {
      workerCount: 1,
      chunkUploadsPerFrame: 8,
      maxPixelRatio: options.maxPixelRatio,
    });
    this.renderer.scene.add(this.root);
    this.toon = createToonMaterial(this.gradients[3]);
    this.outline = createOutlineMaterial();
    const materials: CuteMaterials = {
      toon: this.toon,
      flat: createFlatVertexColorMaterial(),
      outline: this.outline,
    };
    const first = LAB_VIEWS[0] ?? { target: { x: 0, y: 0, z: 0 }, distance: 8, yaw: 0, pitch: 0.2 };
    this.orbit = {
      ...first,
      target: new THREE.Vector3(first.target.x, first.target.y, first.target.z),
    };

    // 지금 요리사: 실제 게임의 NpcView 를 빈 조회로 쓴다. 광장 중심을 카메라 쪽 멀리 두어 앉을 때 앞을 본다
    this.npcWorld = { placement: () => undefined, plazaCenter: { x: 13, y: GROUND, z: 400 } };
    this.currentNpc = createNPC<ActionView>(
      'lab-cook',
      'cook',
      { x: 13, y: GROUND, z: ROW_FIGURES },
      {
        kind: 'idle',
        label: '',
        key: 'idle',
      },
    );
    this.currentNpc.body.pos = { x: CURRENT_X, y: GROUND, z: ROW_FIGURES + 0.5 };
    this.currentView = new NpcView('cook', 1);
    this.root.add(this.currentView.object3d);
    this.label('지금', new THREE.Vector3(CURRENT_X, GROUND + 2.05, ROW_FIGURES + 0.5));

    // 시안 A/B/C
    let seed = 2;
    for (const key of Object.keys(FIGURE_VARIANTS) as FigureVariant[]) {
      const figure = new CuteFigure(FIGURE_VARIANTS[key], COOK_OUTFIT, materials);
      const home = new THREE.Vector3(VARIANT_X[key], GROUND, ROW_FIGURES + 0.5);
      figure.object3d.position.copy(home);
      figure.object3d.rotation.y = Math.PI;
      this.root.add(figure.object3d);
      this.figures.set(key, figure);
      this.walkers.set(key, {
        figure,
        blender: new PoseBlender(),
        home,
        seed: seed++,
        last: null,
        speed: 0,
        phase: 0,
        yaw: Math.PI,
      });
      const s = FIGURE_VARIANTS[key];
      this.label(
        `시안 ${key} · ${s.heads} 등신 · ${s.eyes === 'large' ? '큰 눈' : '점 눈'}`,
        new THREE.Vector3(home.x, GROUND + 2.05, home.z),
      );
    }

    // 게임 캐릭터 다섯(STYLE-002): 지금 요리사 왼쪽에 나란히
    CHARACTER_KINDS.forEach((kind, i) => {
      const character = new CuteCharacter(kind);
      const home = new THREE.Vector3(VILLAGER_X0 + i * 1.6, GROUND, ROW_FIGURES + 0.5);
      character.object3d.position.copy(home);
      character.object3d.rotation.y = Math.PI;
      this.root.add(character.object3d);
      this.villagers.push({
        figure: character,
        blender: new PoseBlender(),
        home,
        seed: 10 + i,
        last: null,
        speed: 0,
        phase: 0,
        yaw: Math.PI,
      });
      this.label(CHARACTER_NAMES[kind], new THREE.Vector3(home.x, GROUND + 2.0, home.z));
    });

    // 가구: 지금(블록) ↔ 시안(모형)
    this.label(
      '지금 화덕 · 물 항아리',
      new THREE.Vector3(PROPS_CURRENT_X + 1.5, GROUND + 1.4, ROW + 0.5),
    );
    this.stove = buildStoveModel(
      materials,
      createEmissiveMaterial(0xff9a2e),
      createEmissiveMaterial(0xffe07a),
    );
    this.stove.object3d.position.set(PROPS_STYLE_X, GROUND, ROW + 0.5);
    this.stove.object3d.rotation.y = Math.PI;
    this.waterPot = buildWaterPotModel(materials, createFlatVertexColorMaterial());
    this.waterPot.object3d.position.set(PROPS_STYLE_X + 2, GROUND, ROW + 0.5);
    this.root.add(this.stove.object3d, this.waterPot.object3d);
    this.label(
      '시안 화덕 · 물 항아리',
      new THREE.Vector3(PROPS_STYLE_X + 1, GROUND + 1.4, ROW + 0.5),
    );
    const puff = puffTexture();
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(createCharacterSpriteMaterial(puff));
      this.steam.push(s);
      this.root.add(s);
    }

    // 블록: 지금(청크 메시) ↔ 시안(64 px 타일 상자)
    this.label(
      '지금 블록 (풀 · 판자 · 돌벽돌 · 잎)',
      new THREE.Vector3(BLOCKS_CURRENT_X + 3.5, GROUND + 1.5, ROW + 0.5),
    );
    const cube = new THREE.BoxGeometry(1, 1, 1);
    const tileMaterials = new Map<StyleTileKind, THREE.Material>();
    const tileMaterial = (kind: StyleTileKind): THREE.Material => {
      let m = tileMaterials.get(kind);
      if (!m) {
        m = createStyleBlockMaterial(createStyleTileTexture(kind));
        tileMaterials.set(kind, m);
      }
      return m;
    };
    STYLE_CUBES.forEach((c, i) => {
      const mesh = new THREE.Mesh(cube, c.faces.map(tileMaterial));
      mesh.position.set(BLOCKS_STYLE_X + i * 2, GROUND + 0.5, ROW + 0.5);
      this.root.add(mesh);
    });
    // 시안 풀 윗면을 넓게 깔아 이어 붙인 모습도 본다(3 × 2 칸)
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), tileMaterial('grassTop'));
    const top = tileMaterial('grassTop');
    if (top instanceof THREE.MeshLambertMaterial && top.map) {
      const t = top.map.clone();
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 2);
      t.needsUpdate = true;
      patch.material = createStyleBlockMaterial(t);
    }
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(BLOCKS_STYLE_X + 3, GROUND + 0.002, ROW - 1.5);
    this.root.add(patch);
    this.label(
      '시안 블록 (64 px 손그림풍)',
      new THREE.Vector3(BLOCKS_STYLE_X + 3, GROUND + 1.5, ROW + 0.5),
    );
    this.applyOrbit();
  }

  /** 자세를 바꾼다. 모든 주민(지금·시안)에 같은 자세를 입힌다. */
  setPose(pose: LabPose): void {
    this.pose = pose;
  }

  /** 현재 자세. */
  get currentPose(): LabPose {
    return this.pose;
  }

  /** 툰 명암 단계를 바꾼다(시안 모형 전체). */
  setToonSteps(steps: 2 | 3): void {
    this.toon.gradientMap = this.gradients[steps];
    this.toon.needsUpdate = true;
  }

  /** 외곽선을 켜고 끈다(시안 모형 전체). */
  setOutline(on: boolean): void {
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material === this.outline) o.visible = on;
    });
  }

  /** 고정 시점으로 옮긴다. */
  setView(index: number): void {
    const v = LAB_VIEWS[index] ?? LAB_VIEWS[0];
    if (!v) return;
    this.orbit = { ...v, target: new THREE.Vector3(v.target.x, v.target.y, v.target.z) };
    this.applyOrbit();
  }

  /** 끌어서 돌리기(픽셀 이동량). */
  rotateBy(dx: number, dy: number): void {
    this.orbit.yaw -= dx * 0.006;
    this.orbit.pitch = Math.min(1.4, Math.max(-0.1, this.orbit.pitch + dy * 0.006));
    this.applyOrbit();
  }

  /** 휠 확대·축소(1 보다 크면 멀어진다). */
  zoomBy(factor: number): void {
    this.orbit.distance = Math.min(40, Math.max(2, this.orbit.distance * factor));
    this.applyOrbit();
  }

  /** 한 프레임 진행: 걷기 원·자세·불·김·물결. */
  update(dt: number): void {
    this.time += dt;
    const action = POSE_ACTIONS[this.pose];
    const walking = this.pose === 'walk';
    // 지금 요리사: 게임과 같은 NpcView.syncFrom 경로
    const npc = this.currentNpc;
    const a = this.time * WALK_OMEGA;
    const cur = walking
      ? {
          x: CURRENT_X + Math.cos(a) * WALK_RADIUS,
          z: ROW_FIGURES + 0.5 + Math.sin(a) * WALK_RADIUS,
        }
      : { x: CURRENT_X, z: ROW_FIGURES + 0.5 };
    npc.body.pos = { x: cur.x, y: GROUND, z: cur.z };
    const lookAt = walking
      ? undefined
      : { x: cur.x, y: GROUND + (this.pose === 'work' ? 0 : 0.9), z: cur.z + 0.9 };
    npc.action = {
      kind: action.kind,
      label: '',
      key: `${this.pose}`,
      ...(action.pose ? { pose: action.pose } : {}),
      ...(lookAt && this.pose !== 'sit' ? { lookAt } : {}),
    };
    this.currentView.syncFrom(npc, dt, this.npcWorld);

    // 시안: 같은 자세 계산(npcPose)·보간(PoseBlender)을 입힌다
    for (const w of this.walkers.values()) this.updateWalker(w, dt, action, walking);
    for (const w of this.villagers) this.updateWalker(w, dt, action, walking);

    // 불 흔들림·김·물결
    this.stove.flames.forEach((f, i) => {
      f.scale.y = 1 + Math.sin(this.time * (11 + i * 4)) * 0.12 + Math.sin(this.time * 17) * 0.05;
    });
    const base = this.stove.object3d.position;
    this.steam.forEach((s, i) => {
      const t = (this.time * 0.3 + i / this.steam.length) % 1;
      s.position.set(
        base.x + Math.sin(t * 5 + i) * 0.07,
        base.y + this.stove.steamFrom + t * 0.9,
        base.z,
      );
      s.scale.setScalar(0.16 + t * 0.34);
      if (s.material instanceof THREE.SpriteMaterial)
        s.material.opacity = Math.sin(t * Math.PI) * 0.5;
    });
    this.waterPot.water.position.y = 0.675 + Math.sin(this.time * 1.6) * 0.004;
    this.waterPot.water.rotation.y = this.time * 0.25;
  }

  /** 한 프레임을 그린다. */
  render(): void {
    this.renderer.render();
  }

  /** 이름표의 화면 위치. */
  labels(): LabLabel[] {
    const canvas = this.renderer.webgl.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cam = this.renderer.camera;
    return this.anchors.map(({ text, pos }) => {
      const p = pos.clone().project(cam);
      // 보고 있는 줄의 이름표만 띄운다(뒷줄 이름표가 앞줄과 겹치지 않게)
      const near = cam.position.distanceTo(pos) < this.orbit.distance + 2.5;
      return {
        text,
        x: ((p.x + 1) / 2) * w,
        y: ((1 - p.y) / 2) * h,
        visible: near && p.z < 1 && p.z > -1,
      };
    });
  }

  /** 계측(드로우콜·삼각형·모형별 드로우콜). */
  stats(): LabStats {
    const info = this.renderer.webgl.info.render;
    const variants = {} as Record<FigureVariant, { drawCalls: number; triangles: number }>;
    for (const [key, figure] of this.figures) {
      const s = figure.stats();
      const outlineOn = this.outlineVisible();
      variants[key] = {
        drawCalls: s.meshes + (outlineOn ? s.outlineMeshes : 0),
        triangles: s.triangles,
      };
    }
    let current = 0;
    this.currentView.object3d.traverseVisible((o) => {
      if (o instanceof THREE.Mesh) current++;
    });
    return {
      drawCalls: info.calls,
      triangles: info.triangles,
      currentFigureDrawCalls: current,
      variants,
    };
  }

  /** 외곽선이 켜져 있는가. */
  private outlineVisible(): boolean {
    let on = false;
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material === this.outline && o.visible) on = true;
    });
    return on;
  }

  /** 시안 한 명의 위치·방향·자세. NpcView.syncFrom 과 같은 규칙으로 속도·위상을 렌더에서 계산한다. */
  private updateWalker(
    w: Walker,
    dt: number,
    action: { kind: ActionKind; pose?: UsePose },
    walking: boolean,
  ): void {
    const a = this.time * WALK_OMEGA + w.seed;
    const now = walking
      ? new THREE.Vector3(
          w.home.x + Math.cos(a) * WALK_RADIUS,
          GROUND,
          w.home.z + Math.sin(a) * WALK_RADIUS,
        )
      : w.home.clone();
    let facing = Math.PI;
    if (w.last && dt > 0) {
      const dx = now.x - w.last.x;
      const dz = now.z - w.last.z;
      const moved = Math.hypot(dx, dz);
      w.speed += (moved / dt - w.speed) * Math.min(1, dt * 12);
      if (walking && moved > 1e-4) facing = Math.atan2(-dx, -dz);
    }
    w.last = now;
    w.phase += dt * (w.speed > MOVING_SPEED ? w.speed * 3.2 : 0);
    w.yaw += wrapAngle(facing - w.yaw) * Math.min(1, dt * 10);
    const target = npcPose({
      kind: action.kind,
      key: this.pose,
      ...(action.pose ? { pose: action.pose } : {}),
      onChair: false,
      rootOffset: { x: 0, y: 0, z: 0 },
      lookHeight: this.pose === 'cook' ? 0.9 : null,
      lookDistance: 0.9,
      speed: w.speed,
      phase: w.phase,
      time: this.time + w.seed * 1.7,
      seed: w.seed,
    });
    const drawn = w.blender.apply(target, dt);
    w.figure.object3d.position.copy(now);
    w.figure.object3d.rotation.y = w.yaw;
    w.figure.applyPose(drawn);
  }

  /** 이름표 기준점을 더한다. */
  private label(text: string, pos: THREE.Vector3): void {
    this.anchors.push({ text, pos });
  }

  /** 궤도 시점을 카메라에 입힌다. */
  private applyOrbit(): void {
    this.renderer.setOrbitView(this.orbit);
  }
}
