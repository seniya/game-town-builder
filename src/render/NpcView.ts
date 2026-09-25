// 주민 모형 (ARCHITECTURE 12.2 / 12.3, MVP_SPEC 31, TASK-028 / 033). 엔티티를 읽어서 그리고 고치지 않는다.
// 역할마다 옷과 모자가 달라 라벨 없이 같은 주민을 알아볼 수 있다. 자세 계산·전환 보간은 characterPose.ts(TASK-ANIM-001)이고
// 이 파일은 모형을 만들고 계산한 자세를 입힌다.
// 몸체 위치(body.pos)는 게임 위치 그대로다. 눕는 자세의 위치는 침대 배치를 읽어 렌더에서만 계산한다.
import * as THREE from 'three';
import type { NPC } from '../game/entities/NPC';
import type { ActionView, BlockPos, NPCRole, PlacedObjectSnapshot } from '../game/types';
import { facingOffset } from '../game/voxel/PlacementIndex';
import {
  armJointRotationX,
  MOVING_SPEED,
  npcPose,
  PoseBlender,
  type CharacterPose,
} from './characterPose';
import { createCharacterMaterial, createCharacterSpriteMaterial } from './materials';
import { BED_SURFACE } from './PropView';

/** 역할별 옷차림. */
interface Outfit {
  readonly shirt: number;
  readonly trousers: number;
  readonly hair: number;
  readonly accent: number;
  readonly hat: 'straw' | 'toque' | 'band' | 'none';
}

const OUTFITS: Record<NPCRole, Outfit> = {
  farmer: { shirt: 0x6f9d4a, trousers: 0x4f6f96, hair: 0x7a4a26, accent: 0xe8c35a, hat: 'straw' },
  cook: { shirt: 0xf3efe6, trousers: 0x5c5a66, hair: 0x2f2522, accent: 0xd9644f, hat: 'toque' },
  carpenter: { shirt: 0xb86b35, trousers: 0x6b5a45, hair: 0x3b2a1e, accent: 0xc8453d, hat: 'band' },
  villager: { shirt: 0x8f7ab8, trousers: 0x5a5470, hair: 0x9a6a3a, accent: 0xf2d06b, hat: 'none' },
};

const SKIN = 0xf2c9a0;
const EYE = 0x2a2226;
const CHEEK = 0xf0a0a0;
const BLANKET = 0xe0705f;
const LINEN = 0xf2ece0;

/** 색 → 재질. 같은 색은 한 재질을 함께 쓴다(생성은 materials.ts). */
const materialCache = new Map<number, THREE.Material>();
function mat(color: number): THREE.Material {
  let m = materialCache.get(color);
  if (!m) {
    m = createCharacterMaterial(color);
    materialCache.set(color, m);
  }
  return m;
}

/** 상자 하나. (x, y, z) 는 상자 아랫면 가운데다. */
function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  return mesh;
}

/** 관절: 피벗 그룹에 매달린 상자. 피벗에서 아래로 늘어진다. */
function limb(w: number, h: number, d: number, color: number, px: number, py: number, pz = 0) {
  const pivot = new THREE.Group();
  pivot.position.set(px, py, pz);
  const mesh = box(w, h, d, color, 0, -h, 0);
  pivot.add(mesh);
  return pivot;
}

/** 잠든 주민 머리 위의 z 텍스처(한 번만 만든다). */
let zTexture: THREE.Texture | null = null;
function sleepTexture(): THREE.Texture {
  if (zTexture) return zTexture;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.font = 'bold 52px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(40, 50, 80, 0.8)';
    g.strokeText('z', 32, 34);
    g.fillStyle = '#f4f1ff';
    g.fillText('z', 32, 34);
  }
  zTexture = new THREE.CanvasTexture(c);
  zTexture.colorSpace = THREE.SRGBColorSpace;
  return zTexture;
}

/** 머리 위 대화 표시 텍스처(말풍선 속 느낌표, 한 번만 만든다). */
let bubbleTexture: THREE.Texture | null = null;
function talkTexture(): THREE.Texture {
  if (bubbleTexture) return bubbleTexture;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#fff8e6';
    g.strokeStyle = 'rgba(70, 50, 30, 0.9)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(32, 28, 22, 0, Math.PI * 2);
    g.moveTo(26, 47);
    g.lineTo(32, 60);
    g.lineTo(38, 47);
    g.fill();
    g.stroke();
    g.fillStyle = '#d9822b';
    g.font = 'bold 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('!', 32, 30);
  }
  bubbleTexture = new THREE.CanvasTexture(c);
  bubbleTexture.colorSpace = THREE.SRGBColorSpace;
  return bubbleTexture;
}

/** 조리 중 화덕 위로 오르는 김 텍스처(한 번만 만든다). 부드러운 흰 원이다. */
let puffTexture: THREE.Texture | null = null;
function steamTexture(): THREE.Texture {
  if (puffTexture) return puffTexture;
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
  puffTexture = new THREE.CanvasTexture(c);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
}

/** 각도 차이를 −π~π 로. */
function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** 렌더가 읽는 게임 조회. */
export interface NpcViewWorld {
  placement(objectId: string): PlacedObjectSnapshot | undefined;
  /** 광장 중심(앉을 때 바라볼 곳). 없으면 null */
  readonly plazaCenter: BlockPos | null;
  /** 이 주민에게 들을 대사가 있는가(머리 위 대화 표시). 없으면 표시하지 않는다 */
  readonly talkable?: (npc: NPC<ActionView>) => boolean;
}

/** 한 프레임에 이만큼 넘게 움직이면 순간 이동(로드·도착)으로 보고 보간하지 않는다. */
const TELEPORT_DISTANCE = 3;

/** 주민 한 명의 모형과 자세. 자세 계산은 characterPose.ts 이고 여기서는 모형에 입힌다. */
export class NpcView {
  readonly object3d = new THREE.Group();
  private readonly figure = new THREE.Group();
  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private readonly armL: THREE.Group;
  private readonly armR: THREE.Group;
  private readonly head = new THREE.Group();
  /** 두 눈(깜빡임·잠든 눈은 높이를 줄인다) */
  private readonly eyes: THREE.Mesh[] = [];
  /** 모자. 누울 때는 벗는다 */
  private readonly hat = new THREE.Group();
  private readonly bedding = new THREE.Group();
  private readonly zs: THREE.Sprite[] = [];
  /** 조리 중 화덕 위의 김 */
  private readonly steam: THREE.Sprite[] = [];
  /** 머리 위 대화 표시 */
  private readonly bubble: THREE.Sprite;
  private readonly blender = new PoseBlender();
  private readonly seed: number;
  private yaw = 0;
  private walk = 0;
  private time: number;
  private last: THREE.Vector3 | null = null;
  private speed = 0;

  /** 역할에 맞춰 모형을 만든다. seed 는 걸음·숨쉬기·깜빡임 박자를 주민마다 조금씩 어긋나게 한다. */
  constructor(role: NPCRole, seed: number) {
    const o = OUTFITS[role];
    this.seed = seed;
    this.time = seed * 1.7;
    // 다리(엉덩이 피벗 y 0.42)
    this.legL = limb(0.17, 0.42, 0.19, o.trousers, -0.11, 0.42);
    this.legR = limb(0.17, 0.42, 0.19, o.trousers, 0.11, 0.42);
    // 몸통과 역할 표시(앞치마·멜빵·조끼)
    const torso = box(0.48, 0.5, 0.3, o.shirt, 0, 0.42, 0);
    const front: THREE.Object3D[] = [];
    if (role === 'cook') front.push(box(0.4, 0.44, 0.02, 0xffffff, 0, 0.44, -0.16));
    if (role === 'farmer') {
      front.push(box(0.36, 0.22, 0.02, o.trousers, 0, 0.42, -0.16));
      front.push(box(0.06, 0.3, 0.02, o.trousers, -0.13, 0.62, -0.16));
      front.push(box(0.06, 0.3, 0.02, o.trousers, 0.13, 0.62, -0.16));
    }
    if (role === 'carpenter') {
      front.push(box(0.5, 0.07, 0.32, 0x5a3f28, 0, 0.47, 0));
      front.push(box(0.1, 0.12, 0.04, 0x9aa0a8, 0.16, 0.4, -0.16));
    }
    if (role === 'villager') front.push(box(0.5, 0.06, 0.32, o.accent, 0, 0.86, 0));
    // 팔(어깨 피벗 y 0.9)
    this.armL = limb(0.13, 0.44, 0.15, o.shirt, -0.31, 0.9);
    this.armR = limb(0.13, 0.44, 0.15, o.shirt, 0.31, 0.9);
    for (const arm of [this.armL, this.armR]) arm.add(box(0.12, 0.1, 0.14, SKIN, 0, -0.52, 0));
    // 목수는 오른손에 망치를 든다(수리 동작이 읽히게)
    if (role === 'carpenter') {
      this.armR.add(box(0.05, 0.05, 0.3, 0x8a6a45, 0, -0.52, -0.1));
      this.armR.add(box(0.12, 0.09, 0.09, 0x9aa0a8, 0, -0.54, -0.26));
    }
    // 머리(목 피벗 y 0.92). 앞은 −z 다. 눈은 가운데를 기준으로 줄어들도록 따로 둔다
    this.head.position.set(0, 0.92, 0);
    for (const x of [-0.11, 0.11]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.02), mat(EYE));
      eye.position.set(x, 0.245, -0.235);
      this.eyes.push(eye);
    }
    this.head.add(
      box(0.5, 0.46, 0.46, SKIN, 0, 0, 0),
      box(0.54, 0.14, 0.5, o.hair, 0, 0.36, 0.01),
      box(0.54, 0.3, 0.12, o.hair, 0, 0.14, 0.2),
      ...this.eyes,
      box(0.08, 0.04, 0.02, CHEEK, -0.17, 0.12, -0.235),
      box(0.08, 0.04, 0.02, CHEEK, 0.17, 0.12, -0.235),
    );
    if (o.hat === 'straw') {
      this.hat.add(
        box(0.8, 0.05, 0.8, o.accent, 0, 0.46, 0),
        box(0.5, 0.16, 0.5, o.accent, 0, 0.5, 0),
      );
      this.hat.add(box(0.52, 0.04, 0.52, 0xb5543a, 0, 0.5, 0));
    } else if (o.hat === 'toque') {
      this.hat.add(
        box(0.44, 0.1, 0.44, 0xffffff, 0, 0.46, 0),
        box(0.5, 0.22, 0.5, 0xffffff, 0, 0.56, 0),
      );
    } else if (o.hat === 'band') {
      this.hat.add(box(0.55, 0.07, 0.51, o.accent, 0, 0.28, 0));
    }
    this.head.add(this.hat);
    this.figure.add(this.legL, this.legR, torso, ...front, this.armL, this.armR, this.head);
    this.object3d.add(this.figure);
    // 잘 때만 보이는 이불(렌더 표현. 침대·베개는 PropView 가 그린다)
    const blanket = box(0.7, 0.36, 1.12, BLANKET, 0, -0.1, -0.24);
    const fold = box(0.71, 0.37, 0.12, LINEN, 0, -0.1, 0.3);
    this.bedding.add(blanket, fold);
    this.bedding.visible = false;
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(createCharacterSpriteMaterial(sleepTexture()));
      s.scale.setScalar(0.28);
      s.visible = false;
      this.zs.push(s);
      this.object3d.add(s);
    }
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(createCharacterSpriteMaterial(steamTexture()));
      s.visible = false;
      this.steam.push(s);
      this.object3d.add(s);
    }
    this.bubble = new THREE.Sprite(createCharacterSpriteMaterial(talkTexture()));
    this.bubble.scale.setScalar(0.5);
    this.bubble.visible = false;
    this.object3d.add(this.bubble);
    this.object3d.add(this.bedding);
  }

  /**
   * 엔티티를 읽어 위치·방향·자세를 맞춘다. dt 는 렌더 프레임 초다.
   * 목표 자세를 계산하고(characterPose), 자세 종류가 바뀌면 직전 자세에서 보간한다. 게임 상태는 고치지 않는다.
   */
  syncFrom(npc: NPC<ActionView>, dt: number, world: NpcViewWorld): void {
    this.time += dt;
    const p = npc.body.pos;
    const now = new THREE.Vector3(p.x, p.y, p.z);
    let snap = this.last === null;
    if (this.last && dt > 0) {
      const dx = now.x - this.last.x;
      const dz = now.z - this.last.z;
      const moved = Math.hypot(dx, dz);
      if (moved > TELEPORT_DISTANCE) {
        snap = true;
        this.speed = 0;
      } else {
        this.speed += (moved / dt - this.speed) * Math.min(1, dt * 12);
        if (moved > 1e-4) this.turnToward(Math.atan2(-dx, -dz), dt);
      }
    }
    this.last = now;
    this.walk += dt * (this.speed > MOVING_SPEED ? this.speed * 3.2 : 0);
    const a = npc.action;
    const use = a.facilityUse;
    const placed = use ? world.placement(use.objectId) : undefined;
    // 대화 표시: 들을 대사가 있고 자는 중이 아닐 때 머리 위에서 살짝 떠 있다
    const talk = (world.talkable?.(npc) ?? false) && a.kind !== 'sleep';
    this.bubble.visible = talk;
    if (talk) this.bubble.position.set(0, 2.35 + Math.sin(this.time * 2.4) * 0.05, 0);

    // 자세 종류·뿌리 위치·바라볼 방향을 게임 상태에서 읽는다
    // 침대 배치를 못 읽으면(부서진 직후 등) 눕지 않고 선다
    const pose = use?.pose === 'lie' ? (placed ? 'lie' : a.pose) : (use?.pose ?? a.pose);
    const onChair = use?.pose === 'sit' && a.lookAt !== undefined;
    const root = { x: 0, y: 0, z: 0 };
    let faceYaw: number | null = null;
    let turnRate = 2;
    const look = a.lookAt ?? null;
    if (pose === 'lie' && placed) {
      const o = facingOffset(placed.facing);
      const an = placed.anchor;
      // 침대 두 칸의 가운데, 매트리스 윗면 높이. 머리는 anchor 칸(베개) 쪽이다
      root.x = an.x + 0.5 + o.dx * 0.5 - p.x;
      root.y = an.y + BED_SURFACE - p.y;
      root.z = an.z + 0.5 + o.dz * 0.5 - p.z;
      faceYaw = Math.atan2(-o.dx, -o.dz);
      turnRate = 1.2;
    } else if (onChair && use && look) {
      const seat = use.usePosition;
      root.x = seat.x - p.x;
      root.y = seat.y - p.y;
      root.z = seat.z - p.z;
      faceYaw = Math.atan2(-(look.x - seat.x), -(look.z - seat.z));
      turnRate = 1.5;
    } else if (pose === 'sit' && a.kind !== 'talk' && npc.action.key !== 'stunned') {
      const c = world.plazaCenter;
      if (c) faceYaw = Math.atan2(-(c.x + 0.5 - p.x), -(c.z + 0.5 - p.z));
      turnRate = 1;
    } else if (look) {
      faceYaw = Math.atan2(-(look.x - p.x), -(look.z - p.z));
    }
    if (faceYaw !== null) this.turnToward(faceYaw, dt * turnRate);
    if (snap && faceYaw !== null) this.yaw = faceYaw;

    const target = npcPose({
      kind: a.kind,
      key: a.key,
      ...(pose ? { pose } : {}),
      onChair,
      rootOffset: root,
      lookHeight: look ? look.y - p.y : null,
      lookDistance: look ? Math.hypot(look.x - p.x, look.z - p.z) : 0,
      speed: this.speed,
      phase: this.walk,
      time: this.time,
      seed: this.seed,
    });
    const drawn = this.blender.apply(target, dt, snap);
    this.applyPose(drawn, p);

    // 자세에 딸린 소품: 이불·z·모자는 눕기가 거의 끝났을 때, 김은 조리 중에만
    const lying = target.key === 'lie' && this.blender.weight > 0.6;
    this.bedding.visible = lying;
    this.hat.visible = !lying;
    this.bedding.position.set(0, 0.1 + Math.sin(this.time * 1.2) * 0.008, 0);
    this.zs.forEach((s, i) => {
      s.visible = lying;
      if (!lying) return;
      // z 가 머리 위로 천천히 떠오르며 사라진다
      const t = (this.time * 0.45 + i / 3) % 1;
      s.position.set(0.18 + t * 0.2, 0.55 + t * 0.7, 0.8);
      s.scale.setScalar(0.16 + t * 0.18);
      (s.material as THREE.SpriteMaterial).opacity = Math.sin(t * Math.PI) * 0.9;
    });
    this.updateSteam(target.key === 'cook' ? look : null, p);
  }

  /** 계산한 자세를 관절에 입힌다. 뿌리는 게임 위치 + rootOffset 이다. */
  private applyPose(d: CharacterPose, p: { x: number; y: number; z: number }): void {
    this.object3d.position.set(p.x + d.rootOffset.x, p.y + d.rootOffset.y, p.z + d.rootOffset.z);
    this.object3d.rotation.set(0, this.yaw, 0);
    this.figure.position.set(d.figurePos.x, d.figurePos.y, d.figurePos.z);
    this.figure.rotation.set(d.figureRot.x, d.figureRot.y, d.figureRot.z);
    this.legL.rotation.set(d.legL.x, d.legL.y, d.legL.z);
    this.legR.rotation.set(d.legR.x, d.legR.y, d.legR.z);
    this.armL.rotation.set(armJointRotationX(d.armL.x), d.armL.y, d.armL.z);
    this.armR.rotation.set(armJointRotationX(d.armR.x), d.armR.y, d.armR.z);
    this.head.rotation.set(d.head.x, d.head.y, d.head.z);
    for (const eye of this.eyes) eye.scale.y = Math.max(0.1, d.eyes);
  }

  /** 조리 중 화덕 위의 김: 화덕 윗면에서 천천히 오르며 퍼지고 사라진다. lookAt 이 없으면 숨긴다. */
  private updateSteam(
    lookAt: { x: number; y: number; z: number } | null,
    p: { x: number; y: number; z: number },
  ): void {
    if (!lookAt) {
      for (const s of this.steam) s.visible = false;
      return;
    }
    // 모형 기준 좌표로 옮긴다(모형은 yaw 로 돌아 있다)
    const dx = lookAt.x - p.x;
    const dz = lookAt.z - p.z;
    const c = Math.cos(-this.yaw);
    const s = Math.sin(-this.yaw);
    const lx = dx * c + dz * s;
    const lz = -dx * s + dz * c;
    this.steam.forEach((puff, i) => {
      const t = (this.time * 0.35 + i / 3) % 1;
      puff.visible = true;
      puff.position.set(lx + Math.sin(t * 5 + i) * 0.08, lookAt.y - p.y + 0.1 + t * 0.9, lz);
      puff.scale.setScalar(0.18 + t * 0.35);
      (puff.material as THREE.SpriteMaterial).opacity = Math.sin(t * Math.PI) * 0.55;
    });
  }

  /** 목표 방향으로 부드럽게 돈다. */
  private turnToward(target: number, dt: number): void {
    this.yaw += wrapAngle(target - this.yaw) * Math.min(1, dt * 10);
  }
}

/** 레지스트리의 주민 목록과 모형 목록을 맞춘다. */
export class NpcViews {
  readonly object3d = new THREE.Group();
  private readonly views = new Map<string, NpcView>();

  /** 주민 목록 조회와 게임 조회를 받는다. */
  constructor(
    private readonly npcs: () => Iterable<NPC<ActionView>>,
    private readonly world: NpcViewWorld,
  ) {}

  /** 매 프레임 부른다. 새 주민의 모형을 만들고 떠난 주민의 모형을 뺀다. */
  update(dt: number): void {
    const seen = new Set<string>();
    for (const npc of this.npcs()) {
      seen.add(npc.id);
      let view = this.views.get(npc.id);
      if (!view) {
        view = new NpcView(npc.role, this.views.size + 1);
        this.views.set(npc.id, view);
        this.object3d.add(view.object3d);
      }
      view.syncFrom(npc, dt, this.world);
    }
    for (const [id, view] of this.views) {
      if (seen.has(id)) continue;
      this.object3d.remove(view.object3d);
      this.views.delete(id);
    }
  }
}
