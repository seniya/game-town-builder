// 채석장 돌 재생 후보 선택 — 순수 함수 (MVP_SPEC 14.2, READY-01).
// 언제·누가 호출하는지(하루 경계, 소유 시스템, 저장 키)는 READY-04 / TASK-023 에서 정한다.
import { BlockId, isTerrain } from '../data/blocks';
import type { BlockPos } from '../types';

/** 선택에 필요한 월드 조회. VoxelWorld 와 엔티티 점유 조회가 만족한다. */
export interface QuarryRespawnQuery {
  /** 현재 블록 id. 월드 밖은 air 다 */
  getBlock(x: number, y: number, z: number): number;
  /** 플레이어·NPC·몬스터의 AABB 가 이 칸과 겹치는가 */
  isOccupiedByCharacter(p: BlockPos): boolean;
}

/** 면으로 맞닿은 여섯 방향. */
const FACE_NEIGHBORS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * 후보 목록의 앞에서부터 복구할 칸을 최대 limit 개 고른다. 후보 순서는 island.ts 가 고정한다.
 * 복구 가능한 칸:
 * - 현재 air 다. 플레이어가 놓은 블록·가구·다중 칸 객체를 덮지 않는다.
 * - 캐릭터 AABB 와 겹치지 않는다.
 * - 면으로 맞닿은 칸에 terrain 이 아닌 블록(건축·가구·문·횃불·작물·종)이 없다.
 *   채석장 안에 지은 구조물의 내부나 바로 옆을 돌로 메우지 않기 위해서다.
 * 조건을 만족하는 칸이 limit 보다 적으면 있는 만큼만 반환한다. 부족분을 다음 날로 넘기지 않는다.
 */
export function selectQuarryRespawnCells(
  candidates: readonly BlockPos[],
  query: QuarryRespawnQuery,
  limit: number,
): BlockPos[] {
  const out: BlockPos[] = [];
  for (const c of candidates) {
    if (out.length >= limit) break;
    if (query.getBlock(c.x, c.y, c.z) !== BlockId.air) continue;
    if (query.isOccupiedByCharacter(c)) continue;
    const nearBuilt = FACE_NEIGHBORS.some(([dx, dy, dz]) => {
      const id = query.getBlock(c.x + dx, c.y + dy, c.z + dz);
      return id !== BlockId.air && !isTerrain(id);
    });
    if (nearBuilt) continue;
    out.push(c);
  }
  return out;
}
