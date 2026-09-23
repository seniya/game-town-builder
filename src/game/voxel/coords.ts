// 좌표 변환 (MVP_SPEC 7.3, ARCHITECTURE 7.1). 함수 이름에 기준점을 명시한다.
import type { BlockPos, Vec3 } from '../types';

/** 블록의 최소 모서리 월드 좌표. */
export function blockToWorldMin(p: BlockPos): Vec3 {
  return { x: p.x, y: p.y, z: p.z };
}

/** 블록의 중심 월드 좌표. */
export function blockToWorldCenter(p: BlockPos): Vec3 {
  return { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 };
}

/** 캐릭터가 설 칸의 발밑 중심 월드 좌표. y 는 칸의 바닥면이다. */
export function standCellToWorldFeet(p: BlockPos): Vec3 {
  return { x: p.x + 0.5, y: p.y, z: p.z + 0.5 };
}

/** 월드 좌표가 속한 블록. 각 축을 내림한다. */
export function worldToBlock(v: Vec3): BlockPos {
  return { x: Math.floor(v.x), y: Math.floor(v.y), z: Math.floor(v.z) };
}
