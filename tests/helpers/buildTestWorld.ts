// 문자열 레이어로 방 판정 fixture 를 만든다 (TASK-017, ARCHITECTURE 25.1).
// 기본 바닥을 자동으로 만들지 않는다. 성공 fixture 는 바닥 레이어(y=0)를 직접 그린다.
import { BlockId } from '../../src/game/data/blocks';
import { EventBus } from '../../src/game/EventBus';
import { createRoomReader } from '../../src/game/room/roomReader';
import type { BlockPos, Facing, PlacedObjectSnapshot, RoomBlockReader } from '../../src/game/types';
import { posKey } from '../../src/game/types';
import { objectCells } from '../../src/game/voxel/PlacementIndex';
import { VoxelWorld } from '../../src/game/voxel/VoxelWorld';

/**
 * 기호 → 블록. TASK-017 의 필수 6 종(# . D B T C) 외에 방 레시피·지형 시험용 기호를 더 둔다.
 * 게임 블록을 새로 만드는 것이 아니라 기존 블록의 표기일 뿐이다.
 */
export const SYMBOLS: Readonly<Record<string, number>> = {
  '#': BlockId.plank,
  '.': BlockId.air,
  D: BlockId.door,
  B: BlockId.bed,
  T: BlockId.table,
  C: BlockId.chair,
  S: BlockId.stone_brick,
  W: BlockId.window,
  K: BlockId.cooking_stove,
  P: BlockId.water_pot,
  H: BlockId.chest,
  L: BlockId.torch,
  d: BlockId.dirt,
  g: BlockId.grass,
  s: BlockId.stone,
  w: BlockId.water,
  l: BlockId.log,
};

/** 침대 객체 선언. B 칸은 이 선언의 점유 칸과 정확히 같아야 한다. */
export interface BedSpec {
  readonly anchor: BlockPos;
  readonly facing: Facing;
}

/** 선택 사항. 좌표는 모두 월드 좌표다. */
export interface BuildOptions {
  /** 침대 anchor / facing. B 가 있으면 필수 */
  readonly beds?: readonly BedSpec[];
  /** 문 방향. 방 판정에는 쓰지 않는다. 기본 south */
  readonly doorFacing?: Facing;
  /** 레이어 원점. 기본 (0, 0, 0) */
  readonly offset?: BlockPos;
  /** 월드 크기. 기본은 레이어 크기 + offset. 레이어보다 작으면 오류 */
  readonly size?: { readonly sizeX: number; readonly sizeY: number; readonly sizeZ: number };
}

/** buildTestWorld 결과. RoomBlockReader 이면서 편집용 VoxelWorld 를 함께 준다. */
export interface TestWorld extends RoomBlockReader {
  readonly world: VoxelWorld;
  readonly events: EventBus;
  /** 레이어 크기 (x 열 / y 레이어 수 / z 행) */
  readonly dims: { readonly x: number; readonly y: number; readonly z: number };
}

/** 한 레이어: 행(z) × 열(x) 의 기호. */
type Layer = string[][];

/** `y=N:` 머리말로 레이어를 나눈다. N 은 0 부터 연속이어야 한다. */
function parseLayers(src: string): Layer[] {
  const layers: Layer[] = [];
  let current: Layer | null = null;
  for (const raw of src.split('\n')) {
    let line = raw.trim();
    if (line === '') continue;
    const header = /^y\s*=\s*(\d+)\s*:(.*)$/.exec(line);
    if (header) {
      const n = Number(header[1]);
      if (n !== layers.length) throw new Error(`레이어 y=${n} 는 y=${layers.length} 이어야 한다`);
      current = [];
      layers.push(current);
      line = (header[2] ?? '').trim();
      if (line === '') continue;
    }
    if (!current) throw new Error(`레이어 머리말(y=0:) 앞에 행이 있다: "${raw}"`);
    current.push(line.split(/\s+/));
  }
  if (layers.length === 0) throw new Error('레이어가 없다');
  return layers;
}

/** 모든 레이어의 행 수·열 수가 같은지 확인하고 크기를 반환한다. */
function checkShape(layers: Layer[]): { x: number; y: number; z: number } {
  const first = layers[0] as Layer;
  const z = first.length;
  const x = first[0]?.length ?? 0;
  layers.forEach((layer, y) => {
    if (layer.length !== z) throw new Error(`y=${y} 의 행 수 ${layer.length} ≠ ${z}`);
    layer.forEach((row, r) => {
      if (row.length !== x) throw new Error(`y=${y} 행 ${r} 의 열 수 ${row.length} ≠ ${x}`);
    });
  });
  return { x, y: layers.length, z };
}

/**
 * 문자열 레이어로 VoxelWorld 를 만들고 RoomBlockReader 로 감싸 반환한다.
 * 레이어 개수가 y 높이, 행이 z, 열이 x 다. 기호는 공백으로 구분한다.
 * D 는 두 레이어 연속 수직 쌍으로 문 객체가 된다(아래가 anchor). B 는 options.beds 의 침대 객체다.
 * 잘못된 점유·메타데이터(짝 없는 D, 선언과 다른 B, 모르는 기호)는 오류를 던진다.
 */
export function buildTestWorld(src: string, options: BuildOptions = {}): TestWorld {
  const layers = parseLayers(src);
  const dims = checkShape(layers);
  const o = options.offset ?? { x: 0, y: 0, z: 0 };
  const size = options.size ?? {
    sizeX: dims.x + o.x,
    sizeY: dims.y + o.y,
    sizeZ: dims.z + o.z,
  };
  if (size.sizeX < dims.x + o.x || size.sizeY < dims.y + o.y || size.sizeZ < dims.z + o.z) {
    throw new Error('월드 크기가 레이어보다 작다');
  }
  const events = new EventBus();
  const world = new VoxelWorld(size, events);
  const doorCells = new Set<string>();
  const bedCells = new Set<string>();

  for (let y = 0; y < dims.y; y++) {
    for (let z = 0; z < dims.z; z++) {
      for (let x = 0; x < dims.x; x++) {
        const sym = (layers[y] as Layer)[z]?.[x] ?? '.';
        const id = SYMBOLS[sym];
        if (id === undefined) throw new Error(`모르는 기호 "${sym}" (y=${y}, z=${z}, x=${x})`);
        const p = { x: x + o.x, y: y + o.y, z: z + o.z };
        if (id === BlockId.door) doorCells.add(posKey(p));
        else if (id === BlockId.bed) bedCells.add(posKey(p));
        else if (id !== BlockId.air) world.writeInitial(p.x, p.y, p.z, id);
      }
    }
  }

  const objects: PlacedObjectSnapshot[] = [];
  // 문: 아래에서 위로 짝을 짓는다. 위 칸이 D 가 아니면 짝 없는 문이다
  const doorKeys = [...doorCells].map((k) => k.split(',').map(Number) as [number, number, number]);
  doorKeys.sort((a, b) => a[1] - b[1]);
  const paired = new Set<string>();
  for (const [x, y, z] of doorKeys) {
    const lower = posKey({ x, y, z });
    if (paired.has(lower)) continue;
    const upper = posKey({ x, y: y + 1, z });
    if (!doorCells.has(upper)) throw new Error(`짝 없는 문 칸 (${lower}). D 는 수직 두 칸이다`);
    paired.add(lower);
    paired.add(upper);
    objects.push({
      id: world.placements.allocateId(),
      blockId: BlockId.door,
      anchor: { x, y, z },
      facing: options.doorFacing ?? 'south',
    });
  }
  // 침대: 선언한 anchor / facing 의 두 칸이 B 와 정확히 일치해야 한다
  const claimed = new Set<string>();
  for (const bed of options.beds ?? []) {
    const cells = objectCells({ blockId: BlockId.bed, anchor: bed.anchor, facing: bed.facing });
    for (const c of cells) {
      const k = posKey(c);
      if (!bedCells.has(k)) throw new Error(`침대 선언 칸 ${k} 에 B 가 없다`);
      if (claimed.has(k)) throw new Error(`침대 칸 ${k} 가 두 번 선언되었다`);
      claimed.add(k);
    }
    objects.push({ id: world.placements.allocateId(), blockId: BlockId.bed, ...bed });
  }
  for (const k of bedCells) {
    if (!claimed.has(k)) throw new Error(`B 칸 ${k} 에 침대 선언(options.beds)이 없다`);
  }
  for (const object of objects) {
    if (!world.editObject({ kind: 'place', object }, 'player')) {
      throw new Error(`객체를 놓을 수 없다: ${object.id} @ ${posKey(object.anchor)}`);
    }
  }
  const reader = createRoomReader(world);
  return { ...reader, world, events, dims };
}
