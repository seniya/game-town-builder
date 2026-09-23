// 주민 시험용 작은 마을 (TASK-028 / 029 / 033). 평지 + 판자 침실 하나 + 광장 중심.
// y=0 기반암, y=1 풀, 발은 y=2. 침실 내부 x 10~14, z 10~14, 문 (12, 2, 15) 남쪽, 벽 두 층.
import { balance } from '../../src/game/data/balance';
import { BlockId } from '../../src/game/data/blocks';
import { GameWorld } from '../../src/game/GameWorld';
import type { BlockPos, Facing } from '../../src/game/types';

export const Y = 2;
export const PLAZA: BlockPos = { x: 24, y: Y, z: 24 };
export const DOOR: BlockPos = { x: 12, y: Y, z: 15 };

/** 시각(시·분)을 시작 gameMinutes 로. 07:00 이후면 Day 1. */
export function at(hour: number, minute = 0): number {
  const m = hour * 60 + minute - balance.clock.startHour * 60;
  return m >= 0 ? m : m + 1440;
}

/** 평지와 침실 벽·문이 있는 월드. 침대는 bed() 로 놓는다. */
export function village(startGameMinutes = at(19, 50), withRoom = true): GameWorld {
  const world = new GameWorld({
    storage: balance.storage,
    worldSize: { sizeX: 40, sizeY: 12, sizeZ: 40 },
    startGameMinutes,
    plazaCenter: PLAZA,
  });
  for (let x = 0; x < 40; x++)
    for (let z = 0; z < 40; z++) {
      world.voxels.writeInitial(x, 0, z, BlockId.bedrock);
      world.voxels.writeInitial(x, 1, z, BlockId.grass);
    }
  world.voxels.writeInitial(PLAZA.x, Y, PLAZA.z, BlockId.bell);
  if (withRoom) {
    for (let x = 9; x <= 15; x++)
      for (let z = 9; z <= 15; z++) {
        const edge = x === 9 || x === 15 || z === 9 || z === 15;
        if (!edge || (x === DOOR.x && z === DOOR.z)) continue;
        world.voxels.writeInitial(x, Y, z, BlockId.plank);
        world.voxels.writeInitial(x, Y + 1, z, BlockId.plank);
      }
    placeObject(world, BlockId.door, DOOR, 'south');
  }
  world.rooms.rebuildAll();
  return world;
}

/** 다중 칸 객체를 놓는다. 성공하면 id. */
export function placeObject(
  world: GameWorld,
  blockId: number,
  anchor: BlockPos,
  facing: Facing,
): string {
  const id = world.voxels.placements.allocateId();
  const ok = world.voxels.editObject(
    { kind: 'place', object: { id, blockId, anchor, facing } },
    'player',
  );
  if (!ok) throw new Error(`객체 설치 실패 ${blockId} ${anchor.x},${anchor.y},${anchor.z}`);
  return id;
}

/** 침실 안에 침대를 놓는다(남쪽 방향, 두 칸). */
export function bed(world: GameWorld, x: number, z: number): string {
  return placeObject(world, BlockId.bed, { x, y: Y, z }, 'south');
}

/** dt 로 seconds 만큼 진행한다. until 이 true 가 되면 멈춘다. 걸린 초를 반환한다. */
export function run(world: GameWorld, seconds: number, until?: () => boolean, dt = 1 / 30): number {
  let t = 0;
  while (t < seconds) {
    world.update(dt);
    t += dt;
    if (until?.()) break;
  }
  return t;
}
