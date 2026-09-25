// 침대·문 렌더 모형 (ADR 026, TASK-033 G2 개선). 게임 상태는 읽기만 한다.
// 두 블록은 청크 메시에서 빠지고(blocks.prop) 여기서 둥근 모형(furnitureModels, STYLE-003)으로 그린다: 매트리스·머리판의 침대,
// 창이 난 문. 캐릭터가 문 가까이 오면 문이 열려 보인다. 문 규칙(통행·충돌·방 판정)은 바꾸지 않는다.
import * as THREE from 'three';
import { BlockId } from '../game/data/blocks';
import type { AabbBody, PlacedObjectSnapshot } from '../game/types';
import type { PlacementQuery } from '../game/voxel/VoxelWorld';
import { facingOffset } from '../game/voxel/PlacementIndex';
import { modelGeometry } from './furnitureModels';
import { createModelToonMaterial, createOutlineMaterial, createToonGradient } from './materials';

/** 침대 매트리스 윗면 높이(블록 바닥 기준). 누운 주민이 이 높이에 눕는다 */
export const BED_SURFACE = 0.46;
/** 문이 열리기 시작하는 캐릭터와 문 사이 수평 거리. */
const DOOR_OPEN_DISTANCE = 1.4;
/** 초당 여닫는 비율. */
const DOOR_SPEED = 4;
/** 모형 목록을 다시 맞추는 간격(초). */
const SYNC_SECONDS = 0.25;

/** 침대·문 모형의 재질(공유). */
let shared: { toon: THREE.Material; outline: THREE.Material } | null = null;
function materials(): { toon: THREE.Material; outline: THREE.Material } {
  shared ??= {
    toon: createModelToonMaterial(createToonGradient(3)),
    outline: createOutlineMaterial(0x3b2b25, 0.012),
  };
  return shared;
}

/** 모형 이름의 본체·외곽선 메시를 한 그룹으로. */
function modelGroup(name: 'bed' | 'door'): THREE.Group {
  const g = modelGeometry(name);
  const m = materials();
  const body = new THREE.Mesh(g.body, m.toon);
  body.castShadow = true;
  body.receiveShadow = true;
  const group = new THREE.Group();
  group.add(body, new THREE.Mesh(g.outline, m.outline));
  return group;
}

/** 모형 하나. */
interface Prop {
  readonly object: PlacedObjectSnapshot;
  readonly root: THREE.Group;
  /** 문이면 여닫는 피벗 */
  readonly leaf: THREE.Group | null;
  open: number;
}

/** 배치된 침대·문을 그린다. */
export class PropView {
  readonly object3d = new THREE.Group();
  private readonly props = new Map<string, Prop>();
  private sinceSync = SYNC_SECONDS;

  /** 배치 조회와 문을 열 캐릭터 몸체 목록을 받는다. */
  constructor(
    private readonly placements: PlacementQuery,
    private readonly bodies: () => Iterable<AabbBody>,
  ) {}

  /** 매 프레임 부른다. 목록은 간격마다 맞추고 문은 매 프레임 여닫는다. */
  update(dt: number): void {
    this.sinceSync += dt;
    if (this.sinceSync >= SYNC_SECONDS) {
      this.sinceSync = 0;
      this.sync();
    }
    const bodies = [...this.bodies()];
    for (const p of this.props.values()) {
      if (!p.leaf) continue;
      const a = p.object.anchor;
      const near = bodies.some(
        (b) =>
          Math.hypot(b.pos.x - (a.x + 0.5), b.pos.z - (a.z + 0.5)) < DOOR_OPEN_DISTANCE &&
          Math.abs(b.pos.y - a.y) < 2,
      );
      const target = near ? 1 : 0;
      const step = DOOR_SPEED * dt;
      p.open = p.open < target ? Math.min(target, p.open + step) : Math.max(target, p.open - step);
      const eased = p.open * p.open * (3 - 2 * p.open);
      p.leaf.rotation.y = -eased * (Math.PI / 2) * 0.92;
    }
  }

  /** 배치 목록과 모형 목록을 맞춘다. */
  private sync(): void {
    const seen = new Set<string>();
    for (const o of this.placements.all()) {
      if (o.blockId !== BlockId.bed && o.blockId !== BlockId.door) continue;
      seen.add(o.id);
      if (!this.props.has(o.id)) this.add(o);
    }
    for (const [id, p] of this.props) {
      if (seen.has(id)) continue;
      this.object3d.remove(p.root);
      this.props.delete(id);
    }
  }

  /** 모형을 만든다. */
  private add(o: PlacedObjectSnapshot): void {
    const f = facingOffset(o.facing);
    const a = o.anchor;
    const root = new THREE.Group();
    let leaf: THREE.Group | null = null;
    if (o.blockId === BlockId.bed) {
      root.add(modelGroup('bed'));
      root.position.set(a.x + 0.5, a.y, a.z + 0.5);
      root.rotation.y = Math.atan2(f.dx, f.dz);
    } else {
      // 문 판은 칸 가운데 평면에 선다. facing 이 남북이면 판이 x 로, 동서면 z 로 뻗는다. 경첩은 칸의 한쪽 끝
      leaf = modelGroup('door');
      root.add(leaf);
      const alongX = f.dx === 0;
      root.position.set(alongX ? a.x : a.x + 0.5, a.y, alongX ? a.z + 0.5 : a.z + 1);
      root.rotation.y = alongX ? 0 : Math.PI / 2;
    }
    this.props.set(o.id, { object: o, root, leaf, open: 0 });
    this.object3d.add(root);
  }
}
