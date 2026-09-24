// 주민 모형 (ARCHITECTURE 12.2 / 12.3, MVP_SPEC 31, TASK-028 / 033). 엔티티를 읽어서 그리고 고치지 않는다.
// 역할마다 옷과 모자가 달라 라벨 없이 같은 주민을 알아볼 수 있다. 정지·걷기·눕기·앉기 자세를 이 파일이 그린다.
// 몸체 위치(body.pos)는 게임 위치 그대로다. 눕는 자세의 위치는 침대 배치를 읽어 렌더에서만 계산한다.
import * as THREE from 'three';
import type { NPC } from '../game/entities/NPC';
import type { ActionView, BlockPos, NPCRole, PlacedObjectSnapshot } from '../game/types';
import { facingOffset } from '../game/voxel/PlacementIndex';
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

/** 각도 차이를 −π~π 로. */
function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** 렌더가 읽는 게임 조회. */
export interface NpcViewWorld {
  placement(objectId: string): PlacedObjectSnapshot | undefined;
  /** 광장 중심(앉을 때 바라볼 곳). 없으면 null */
  readonly plazaCenter: BlockPos | null;
}

/** 주민 한 명의 모형과 자세. */
export class NpcView {
  readonly object3d = new THREE.Group();
  private readonly figure = new THREE.Group();
  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private readonly armL: THREE.Group;
  private readonly armR: THREE.Group;
  private readonly head = new THREE.Group();
  /** 모자. 누울 때는 벗는다 */
  private readonly hat = new THREE.Group();
  private readonly bedding = new THREE.Group();
  private readonly zs: THREE.Sprite[] = [];
  private yaw = 0;
  private walk = 0;
  private time: number;
  private last: THREE.Vector3 | null = null;
  private speed = 0;

  /** 역할에 맞춰 모형을 만든다. seed 는 걸음·숨쉬기 박자를 주민마다 조금씩 어긋나게 한다. */
  constructor(role: NPCRole, seed: number) {
    const o = OUTFITS[role];
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
    // 머리(목 피벗 y 0.92). 앞은 −z 다
    this.head.position.set(0, 0.92, 0);
    this.head.add(
      box(0.5, 0.46, 0.46, SKIN, 0, 0, 0),
      box(0.54, 0.14, 0.5, o.hair, 0, 0.36, 0.01),
      box(0.54, 0.3, 0.12, o.hair, 0, 0.14, 0.2),
      box(0.07, 0.09, 0.02, EYE, -0.11, 0.2, -0.235),
      box(0.07, 0.09, 0.02, EYE, 0.11, 0.2, -0.235),
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
    this.object3d.add(this.bedding);
  }

  /** 엔티티를 읽어 위치·방향·자세를 맞춘다. dt 는 렌더 프레임 초다. */
  syncFrom(npc: NPC<ActionView>, dt: number, world: NpcViewWorld): void {
    this.time += dt;
    const p = npc.body.pos;
    const now = new THREE.Vector3(p.x, p.y, p.z);
    if (this.last && dt > 0) {
      const dx = now.x - this.last.x;
      const dz = now.z - this.last.z;
      const s = Math.hypot(dx, dz) / dt;
      this.speed += (s - this.speed) * Math.min(1, dt * 12);
      if (Math.hypot(dx, dz) > 1e-4) this.turnToward(Math.atan2(-dx, -dz), dt);
    }
    this.last = now;
    const a = npc.action;
    const use = a.facilityUse;
    const placed = use ? world.placement(use.objectId) : undefined;
    if (use?.pose === 'lie' && placed) this.poseLying(placed);
    else if (a.pose === 'sit' || use?.pose === 'sit') this.poseSitting(p, world.plazaCenter, dt);
    else if (a.pose === 'work') this.poseWorking(p, a.lookAt ?? null, dt);
    else this.poseStanding(p, dt);
  }

  /**
   * 밭일(심기·수확): 밭 칸을 바라보고 허리를 굽혀 두 팔로 땅을 고른다. 걷기·정지와 구별된다 (TASK-030).
   */
  private poseWorking(
    p: { x: number; y: number; z: number },
    lookAt: { x: number; z: number } | null,
    dt: number,
  ): void {
    this.resetSpecial();
    if (lookAt) this.turnToward(Math.atan2(-(lookAt.x - p.x), -(lookAt.z - p.z)), dt * 2);
    const dig = Math.sin(this.time * 9);
    this.legL.rotation.x = 0.25;
    this.legR.rotation.x = -0.15;
    this.armL.rotation.set(-1.1 + dig * 0.35, 0, 0.1);
    this.armR.rotation.set(-1.1 + dig * 0.35, 0, -0.1);
    this.object3d.position.set(p.x, p.y, p.z);
    this.object3d.rotation.set(0, this.yaw, 0);
    this.figure.position.set(0, -0.04, 0);
    this.figure.rotation.set(-0.42, 0, 0);
    this.head.rotation.set(-0.35, 0, 0);
  }

  /** 걸음 방향으로 부드럽게 돈다. */
  private turnToward(target: number, dt: number): void {
    this.yaw += wrapAngle(target - this.yaw) * Math.min(1, dt * 10);
  }

  /** 서 있기·걷기. 속도가 있으면 팔다리를 흔들고 살짝 튄다. 멈춰 있으면 숨을 쉰다. */
  private poseStanding(p: { x: number; y: number; z: number }, dt: number): void {
    this.resetSpecial();
    const moving = this.speed > 0.4;
    this.walk += dt * (moving ? this.speed * 3.2 : 0);
    const swing = moving ? Math.sin(this.walk) * 0.65 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.armL.rotation.z = 0;
    this.armR.rotation.z = 0;
    const bob = moving ? Math.abs(Math.sin(this.walk)) * 0.05 : Math.sin(this.time * 2.1) * 0.008;
    this.object3d.position.set(p.x, p.y, p.z);
    this.object3d.rotation.set(0, this.yaw, 0);
    this.figure.position.set(0, bob, 0);
    this.figure.rotation.set(0, 0, 0);
    // 멈춰 있을 때 가끔 고개를 돌려 둘러본다
    const look = moving
      ? 0
      : Math.sin(this.time * 0.45) * Math.max(0, Math.sin(this.time * 0.17)) * 0.5;
    this.head.rotation.set(0, look, 0);
  }

  /** 광장에 앉기: 다리를 앞으로 뻗고 광장 중심을 바라본다. */
  private poseSitting(
    p: { x: number; y: number; z: number },
    center: BlockPos | null,
    dt: number,
  ): void {
    this.resetSpecial();
    if (center) this.turnToward(Math.atan2(-(center.x + 0.5 - p.x), -(center.z + 0.5 - p.z)), dt);
    this.legL.rotation.x = Math.PI / 2;
    this.legR.rotation.x = Math.PI / 2;
    this.armL.rotation.x = -0.5;
    this.armR.rotation.x = -0.5;
    this.object3d.position.set(p.x, p.y, p.z);
    this.object3d.rotation.set(0, this.yaw, 0);
    this.figure.position.set(0, -0.36 + Math.sin(this.time * 1.6) * 0.006, 0);
    this.figure.rotation.set(0, 0, 0);
    this.head.rotation.set(Math.sin(this.time * 0.5) * 0.08, 0, 0);
  }

  /**
   * 침대에 눕기. 머리는 anchor 칸 쪽(베개), 발은 facing 쪽이다. 매트리스 윗면(BED_SURFACE)에 등을 대고 눕는다.
   * 게임 위치는 접근 셀에 있고, 이 자세는 렌더에서만 침대 위로 옮긴다 (ARCHITECTURE 12.3).
   */
  private poseLying(bed: PlacedObjectSnapshot): void {
    const o = facingOffset(bed.facing);
    const a = bed.anchor;
    // 침대 두 칸의 가운데, 윗면 높이
    const cx = a.x + 0.5 + o.dx * 0.5;
    const cz = a.z + 0.5 + o.dz * 0.5;
    const top = a.y + BED_SURFACE;
    // 머리 방향 h = 발 칸 → anchor 칸 = −facing
    const headYaw = Math.atan2(-o.dx, -o.dz);
    this.object3d.position.set(cx, top, cz);
    this.object3d.rotation.set(0, headYaw, 0);
    // 서 있는 모형(+y 가 머리, −z 가 앞)을 등으로 눕힌다: +y → +z(머리 쪽), 앞 → 위
    this.figure.rotation.set(Math.PI / 2, 0, 0);
    this.figure.position.set(0, 0.17, -0.62);
    this.legL.rotation.x = 0;
    this.legR.rotation.x = 0;
    this.armL.rotation.set(0, 0, 0.12);
    this.armR.rotation.set(0, 0, -0.12);
    this.head.rotation.set(-0.25, 0, 0);
    this.bedding.visible = true;
    this.hat.visible = false;
    this.bedding.position.set(0, 0.1 + Math.sin(this.time * 1.2) * 0.008, 0);
    // z 가 머리 위로 천천히 떠오르며 사라진다
    this.zs.forEach((s, i) => {
      const t = (this.time * 0.45 + i / 3) % 1;
      s.visible = true;
      s.position.set(0.18 + t * 0.2, 0.55 + t * 0.7, 0.8);
      s.scale.setScalar(0.16 + t * 0.18);
      (s.material as THREE.SpriteMaterial).opacity = Math.sin(t * Math.PI) * 0.9;
    });
  }

  /** 눕기 전용 소품을 숨긴다. */
  private resetSpecial(): void {
    this.bedding.visible = false;
    this.hat.visible = true;
    for (const s of this.zs) s.visible = false;
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
