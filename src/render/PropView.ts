// 침대·문 렌더 모형 (ADR 026, TASK-033 G2 개선). 게임 상태는 읽기만 한다.
// 두 블록은 청크 메시에서 빠지고(blocks.prop) 여기서 실제 모양으로 그린다: 낮은 매트리스·헤드보드의 침대,
// 얇은 판의 문. 캐릭터가 문 가까이 오면 문이 열려 보인다. 문 규칙(통행·충돌·방 판정)은 바꾸지 않는다.
import * as THREE from 'three';
import { BlockId } from '../game/data/blocks';
import type { AabbBody, PlacedObjectSnapshot } from '../game/types';
import type { PlacementQuery } from '../game/voxel/VoxelWorld';
import { facingOffset } from '../game/voxel/PlacementIndex';
import { createPropMaterial } from './materials';

/** 침대 매트리스 윗면 높이(블록 바닥 기준). 누운 주민이 이 높이에 눕는다 */
export const BED_SURFACE = 0.46;
/** 문이 열리기 시작하는 캐릭터와 문 사이 수평 거리. */
const DOOR_OPEN_DISTANCE = 1.4;
/** 초당 여닫는 비율. */
const DOOR_SPEED = 4;
/** 모형 목록을 다시 맞추는 간격(초). */
const SYNC_SECONDS = 0.25;

const WOOD_DARK = 0x6e4a2c;
const WOOD = 0x9a6a3c;
const LINEN = 0xefe7d6;
const BLANKET = 0xc8574d;
const METAL = 0x2c2a28;

/** 색 → 재질(같은 색은 공유). */
const cache = new Map<number, THREE.Material>();
function mat(color: number): THREE.Material {
  let m = cache.get(color);
  if (!m) {
    m = createPropMaterial(color);
    cache.set(color, m);
  }
  return m;
}

/** 상자. (x, y, z) 는 아랫면 가운데. */
function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y + h / 2, z);
  return m;
}

/** 침대 모형. 로컬 −z 끝이 머리(anchor 칸), +z 가 발(facing 칸)이다. anchor 칸 가운데가 원점이다. */
function bedModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    box(0.96, 0.26, 1.96, WOOD_DARK, 0, 0.02, 0.5),
    box(0.9, 0.18, 1.88, LINEN, 0, 0.28, 0.52),
    box(0.94, 0.08, 1.24, BLANKET, 0, 0.4, 0.86),
    box(0.94, 0.09, 0.12, LINEN, 0, 0.4, 0.2),
    box(0.62, 0.12, 0.34, 0xfaf6ee, 0, 0.44, -0.2),
    box(1.0, 0.82, 0.1, WOOD_DARK, 0, 0, -0.45),
    box(0.84, 0.1, 0.12, WOOD, 0, 0.72, -0.45),
    box(1.0, 0.46, 0.08, WOOD_DARK, 0, 0, 1.46),
  );
  return g;
}

/** 문 한 짝 모형(두 칸 높이). 경첩 피벗 그룹 안에서 +x 로 1 칸 뻗는다. */
function doorLeaf(): THREE.Group {
  const pivot = new THREE.Group();
  pivot.add(
    box(0.96, 1.96, 0.12, WOOD, 0.5, 0.02, 0),
    box(0.96, 0.08, 0.14, WOOD_DARK, 0.5, 0.5, 0),
    box(0.96, 0.08, 0.14, WOOD_DARK, 0.5, 1.4, 0),
    box(0.08, 1.96, 0.14, WOOD_DARK, 0.06, 0.02, 0),
    box(0.08, 1.96, 0.14, WOOD_DARK, 0.94, 0.02, 0),
    box(0.07, 0.07, 0.2, METAL, 0.82, 0.98, 0),
  );
  return pivot;
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
      root.add(bedModel());
      root.position.set(a.x + 0.5, a.y, a.z + 0.5);
      root.rotation.y = Math.atan2(f.dx, f.dz);
    } else {
      // 문 판은 칸 가운데 평면에 선다. facing 이 남북이면 판이 x 로, 동서면 z 로 뻗는다. 경첩은 칸의 한쪽 끝
      leaf = doorLeaf();
      root.add(leaf);
      const alongX = f.dx === 0;
      root.position.set(alongX ? a.x : a.x + 0.5, a.y, alongX ? a.z + 0.5 : a.z + 1);
      root.rotation.y = alongX ? 0 : Math.PI / 2;
    }
    this.props.set(o.id, { object: o, root, leaf, open: 0 });
    this.object3d.add(root);
  }
}
