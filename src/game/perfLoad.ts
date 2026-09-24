// TASK-PERF-002 역할 후보 부하 주입. 시험 장면(perf) 전용이며 게임 콘텐츠·규칙이 아니다.
// 서쪽 빈 땅에 성숙 작물 n 칸, 동쪽 빈 땅에 몬스터 피해 n 건, 저장소 crop 400 을 넣어 역할 후보를 동시에 많이 만든다.
// 피해 주입은 기술 시험이며 실제 습격의 16 칸 상한·목수의 하루 8 칸 예산을 바꾸지 않는다.
import { BlockId } from './data/blocks';
import type { GameWorld } from './GameWorld';
import type { BlockPos, WriteBlock } from './types';

/** 주입한 칸들. */
export interface RoleLoad {
  readonly plots: readonly BlockPos[];
  readonly walls: readonly BlockPos[];
}

/** perf 장면의 지면 높이. */
const G = 10;

/** 초기 쓰기 단계: 밭·작물과 부서질 판자를 쓴다(객체 배치·방 인식 전). */
export function writeRoleLoad(write: WriteBlock, n: number): RoleLoad {
  const plots: BlockPos[] = [];
  for (let z = 4; z < 252 && plots.length < n; z += 2)
    for (let x = 2; x < 56 && plots.length < n; x += 2) plots.push({ x, y: G, z });
  for (const p of plots) {
    write(p.x, p.y, p.z, BlockId.farmland);
    write(p.x, p.y + 1, p.z, BlockId.crop);
  }
  const walls: BlockPos[] = [];
  for (let z = 4; z < 252 && walls.length < n; z += 2)
    for (let x = 200; x < 252 && walls.length < n; x += 2) walls.push({ x, y: G + 1, z });
  for (const p of walls) write(p.x, p.y, p.z, BlockId.plank);
  return { plots, walls };
}

/** 월드 구성 뒤 단계: 작물을 성숙 상태로 복원하고, 판자를 몬스터 편집으로 없애며, crop 을 채운다. */
export function applyRoleLoad(w: GameWorld, load: RoleLoad): void {
  w.farm.restore(
    load.plots.map((pos) => ({ pos, plantedAtGameMinutes: w.clock.gameMinutes - 2000 })),
  );
  for (const p of load.walls) w.voxels.setBlock(p.x, p.y, p.z, BlockId.air, 'monster');
  w.storage.add('crop', 400);
}
