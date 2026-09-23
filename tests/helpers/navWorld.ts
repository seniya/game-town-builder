// 통행·경로 시험용 평지 월드 (TASK-024~026). y=0 은 기반암, y=1 은 풀, 발은 y=2 에 놓인다.
import { BlockId } from '../../src/game/data/blocks';
import { EventBus } from '../../src/game/EventBus';
import { NavigationGraph } from '../../src/game/nav/NavigationGraph';
import type { BlockPos } from '../../src/game/types';
import { objectCells } from '../../src/game/voxel/PlacementIndex';
import { VoxelWorld } from '../../src/game/voxel/VoxelWorld';

/** 평지의 발 높이. */
export const FEET_Y = 2;

/** 평지 월드와 그래프. 블록 변경은 즉시 그래프를 무효화한다(GameWorld 와 같다). */
export interface NavFixture {
  readonly events: EventBus;
  readonly world: VoxelWorld;
  readonly graph: NavigationGraph;
  /** 발 높이 칸 */
  cell(x: number, z: number, y?: number): BlockPos;
  /** 블록 한 칸을 놓는다(편집 API) */
  put(x: number, y: number, z: number, id: number): void;
  /** 문을 놓는다 */
  door(x: number, z: number, y?: number): string;
}

/** size × size 평지를 만든다. */
export function navFixture(size = 32, height = 12): NavFixture {
  const events = new EventBus();
  const world = new VoxelWorld({ sizeX: size, sizeY: height, sizeZ: size }, events);
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) {
      world.writeInitial(x, 0, z, BlockId.bedrock);
      world.writeInitial(x, 1, z, BlockId.grass);
    }
  }
  const graph = new NavigationGraph(world);
  events.on('BLOCK_CHANGED', (c) => graph.invalidate(c.pos));
  return {
    events,
    world,
    graph,
    cell: (x, z, y = FEET_Y) => ({ x, y, z }),
    put: (x, y, z, id) => {
      if (!world.setBlock(x, y, z, id, 'player')) throw new Error(`설치 실패 ${x},${y},${z}`);
    },
    door: (x, z, y = FEET_Y) => {
      const id = world.placements.allocateId();
      const object = { id, blockId: BlockId.door, anchor: { x, y, z }, facing: 'south' as const };
      objectCells(object);
      if (!world.editObject({ kind: 'place', object }, 'player')) throw new Error('문 설치 실패');
      return id;
    },
  };
}

/** x 가 x0 인 z 범위의 벽(두 층)을 세운다. */
export function wallAlongZ(
  f: NavFixture,
  x: number,
  z0: number,
  z1: number,
  id: number = BlockId.plank,
): void {
  for (let z = z0; z <= z1; z++) {
    f.put(x, FEET_Y, z, id);
    f.put(x, FEET_Y + 1, z, id);
  }
}
