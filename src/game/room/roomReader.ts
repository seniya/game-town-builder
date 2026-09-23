// VoxelWorld → RoomBlockReader 어댑터 (ARCHITECTURE 10.1). 방 판정은 이 읽기 포트만 본다.
import type { BlockPos, RoomBlockReader } from '../types';
import type { VoxelWorld } from '../voxel/VoxelWorld';

/** VoxelWorld 를 읽기 전용 RoomBlockReader 로 감싼다. 쓰기 경로는 노출하지 않는다. */
export function createRoomReader(world: VoxelWorld): RoomBlockReader {
  return {
    get: (x, y, z) => world.getBlock(x, y, z),
    contains: (p: BlockPos) => world.inBounds(p.x, p.y, p.z),
    objectAt: (p: BlockPos) => world.placements.objectAt(p),
  };
}
