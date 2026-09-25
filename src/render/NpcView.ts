// 주민 모형 (ARCHITECTURE 12.2 / 12.3, MVP_SPEC 31, TASK-028 / 033). 엔티티를 읽어서 그리고 고치지 않는다.
// 역할마다 옷과 모자가 달라 라벨 없이 같은 주민을 알아볼 수 있다. 모형은 둥근 SD 캐릭터(cuteCharacter.ts, STYLE-002)이고
// 자세 계산·전환 보간은 characterPose.ts(TASK-ANIM-001)다. 이 파일은 자세를 고르고 모형·소품에 입힌다.
// 몸체 위치(body.pos)는 게임 위치 그대로다. 눕는 자세의 위치는 침대 배치를 읽어 렌더에서만 계산한다.
import * as THREE from 'three';
import type { NPC } from '../game/entities/NPC';
import type { ActionView, BlockPos, NPCRole, PlacedObjectSnapshot } from '../game/types';
import { facingOffset } from '../game/voxel/PlacementIndex';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MOVING_SPEED, npcPose, PoseBlender, type CharacterPose } from './characterPose';
import { CuteCharacter } from './cuteCharacter';
import {
  createCharacterSpriteMaterial,
  createModelToonMaterial,
  createToonGradient,
} from './materials';
import { BED_SURFACE } from './PropView';
import { merge, paint, place } from './style/cuteFigure';

const BLANKET = 0xe0705f;
const LINEN = 0xf6f0e4;

/** 잘 때 덮는 이불(둥근 상자 두 겹, 한 번만 만든다). 톤 재질을 사람과 함께 쓴다. */
let beddingGeometry: THREE.BufferGeometry | null = null;
function bedding(): THREE.BufferGeometry {
  beddingGeometry ??= merge([
    place(paint(new RoundedBoxGeometry(0.74, 0.3, 1.12, 3, 0.1), BLANKET), [0, 0.05, -0.24]),
    place(paint(new RoundedBoxGeometry(0.76, 0.31, 0.16, 3, 0.07), LINEN), [0, 0.055, 0.3]),
  ]);
  return beddingGeometry;
}

/** 이불 재질(공유). */
let beddingMaterial: THREE.Material | null = null;

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

/** 누운 주민의 뿌리를 침대 가운데에서 발 쪽으로 옮기는 거리(칸). */
export const LIE_SHIFT = 0.12;

/** 한 프레임에 이만큼 넘게 움직이면 순간 이동(로드·도착)으로 보고 보간하지 않는다. */
const TELEPORT_DISTANCE = 3;

/** 주민 한 명의 모형과 자세. 자세 계산은 characterPose.ts 이고 여기서는 모형에 입힌다. */
export class NpcView {
  readonly object3d = new THREE.Group();
  /** 둥근 SD 모형(스키닝 메시 하나 + 외곽선) */
  readonly character: CuteCharacter;
  private readonly bedding: THREE.Mesh;
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
    this.seed = seed;
    this.time = seed * 1.7;
    this.character = new CuteCharacter(role);
    this.object3d.add(this.character.object3d);
    // 잘 때만 보이는 이불(렌더 표현. 침대·베개는 PropView 가 그린다)
    beddingMaterial ??= createModelToonMaterial(createToonGradient(3));
    this.bedding = new THREE.Mesh(bedding(), beddingMaterial);
    this.bedding.castShadow = true;
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
    if (talk) this.bubble.position.set(0, 2.05 + Math.sin(this.time * 2.4) * 0.05, 0);

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
      // 둥근 모형은 머리가 커서 발 쪽으로 LIE_SHIFT 옮겨야 머리가 베개 위에 얹힌다 (MVP_SPEC 45.8)
      root.x = an.x + 0.5 + o.dx * (0.5 + LIE_SHIFT) - p.x;
      root.y = an.y + BED_SURFACE - p.y;
      root.z = an.z + 0.5 + o.dz * (0.5 + LIE_SHIFT) - p.z;
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
    this.character.setHatVisible(!lying);
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

  /** 계산한 자세를 모형에 입힌다. 뿌리는 게임 위치 + rootOffset 이다. */
  private applyPose(d: CharacterPose, p: { x: number; y: number; z: number }): void {
    this.object3d.position.set(p.x + d.rootOffset.x, p.y + d.rootOffset.y, p.z + d.rootOffset.z);
    this.object3d.rotation.set(0, this.yaw, 0);
    this.character.applyPose(d);
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
