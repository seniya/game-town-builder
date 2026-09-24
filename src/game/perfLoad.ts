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

// ── MVP 성능 측정 장면 (MVP_SPEC 36, TASK-053) ──────────────────────────────────
// 초기 섬 위에 네 방(침실·주방·식당·창고)·광원 16 개를 두고 주민 다섯·2 차 습격의 몬스터 다섯을 부른다.
// 측정 장면 전용이며 게임 콘텐츠·진행이 아니다. 기존 블록·가구만 쓴다.

/** 방 하나의 배치(내부 5 × 5 의 북서 모서리)와 가구 종류. */
/** 측정 장면 방의 종류. */
export type MvpRoomKind = 'bedroom' | 'kitchen' | 'dining' | 'storeroom';

interface MvpRoom {
  readonly dx: number;
  readonly dz: number;
  readonly kind: MvpRoomKind;
  readonly doorFacing: 'north' | 'south';
}

/** 종 기준 네 방. 북쪽 두 방은 남쪽 문, 남쪽 두 방은 북쪽 문(종을 향한다). 침실은 perf 구동기의 국소 편집 칸(종 +7, -7)을 품는다 */
const MVP_ROOMS: readonly MvpRoom[] = [
  { dx: 5, dz: -9, kind: 'bedroom', doorFacing: 'south' },
  { dx: -10, dz: -9, kind: 'kitchen', doorFacing: 'south' },
  { dx: 5, dz: 5, kind: 'dining', doorFacing: 'north' },
  { dx: -10, dz: 5, kind: 'storeroom', doorFacing: 'north' },
];

/** 다중 칸 객체 배치. */
export interface MvpObject {
  readonly blockId: number;
  readonly anchor: BlockPos;
  readonly facing: 'north' | 'east' | 'south' | 'west';
}

/**
 * 종(bell, 지면 위 첫 칸) 둘레에 네 방과 광장 torch 를 쓴다. 자리의 나무·지형은 비운다.
 * 판자 바닥·벽 세 층·지붕, 방마다 torch 둘, 광장 torch 여덟(합 16). 문·침대는 반환하는 객체로 놓는다.
 * only 를 주면 그 방들만 쓰고 광장 torch 는 쓰지 않는다(진행 경로 시험이 방을 하나씩 지을 때).
 */
export function writeMvpPerfRooms(
  write: WriteBlock,
  bell: BlockPos,
  only?: readonly MvpRoomKind[],
): MvpObject[] {
  const g = bell.y - 1;
  const y = bell.y;
  const objects: MvpObject[] = [];
  for (const r of MVP_ROOMS) {
    if (only && !only.includes(r.kind)) continue;
    const x0 = bell.x + r.dx;
    const z0 = bell.z + r.dz;
    for (let x = x0 - 2; x <= x0 + 6; x++)
      for (let z = z0 - 2; z <= z0 + 6; z++) {
        for (let k = g - 3; k < g; k++) write(x, k, z, BlockId.dirt);
        write(
          x,
          g,
          z,
          x >= x0 - 1 && x <= x0 + 5 && z >= z0 - 1 && z <= z0 + 5 ? BlockId.plank : BlockId.grass,
        );
        for (let k = y; k <= y + 10; k++) write(x, k, z, BlockId.air);
      }
    const doorX = x0 + 2;
    const doorZ = r.doorFacing === 'south' ? z0 + 5 : z0 - 1;
    for (let x = x0 - 1; x <= x0 + 5; x++)
      for (let z = z0 - 1; z <= z0 + 5; z++) {
        const edge = x === x0 - 1 || x === x0 + 5 || z === z0 - 1 || z === z0 + 5;
        if (edge) {
          for (let k = 0; k < 3; k++) {
            if (x === doorX && z === doorZ && k < 2) continue;
            write(x, y + k, z, BlockId.plank);
          }
        }
        write(x, y + 3, z, BlockId.plank);
      }
    objects.push({
      blockId: BlockId.door,
      anchor: { x: doorX, y, z: doorZ },
      facing: r.doorFacing,
    });
    // 가구는 문 반대쪽 벽에 붙인다
    const back = r.doorFacing === 'south' ? z0 : z0 + 4;
    switch (r.kind) {
      case 'bedroom':
        for (const bx of [x0, x0 + 2, x0 + 4])
          objects.push({ blockId: BlockId.bed, anchor: { x: bx, y, z: z0 }, facing: 'south' });
        break;
      case 'kitchen':
        write(x0 + 1, y, back, BlockId.cooking_stove);
        write(x0 + 3, y, back, BlockId.water_pot);
        break;
      case 'dining':
        write(x0 + 2, y, z0 + 2, BlockId.table);
        write(x0 + 1, y, z0 + 2, BlockId.chair);
        write(x0 + 3, y, z0 + 2, BlockId.chair);
        write(x0 + 2, y, z0 + 3, BlockId.chair);
        break;
      case 'storeroom':
        write(x0 + 1, y, back, BlockId.chest);
        write(x0 + 3, y, back, BlockId.chest);
        break;
    }
    write(x0 + 4, y, r.doorFacing === 'south' ? z0 + 4 : z0, BlockId.torch);
    write(x0, y, r.doorFacing === 'south' ? z0 + 4 : z0, BlockId.torch);
  }
  if (only) return objects;
  for (const [dx, dz] of [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
    [0, -5],
    [0, 5],
    [-5, 0],
    [5, 0],
  ] as const) {
    write(bell.x + dx, y, bell.z + dz, BlockId.torch);
  }
  return objects;
}

/**
 * 월드 구성 뒤: 레벨 3·1 차 습격 종료 상태로 두어 다음 21:00 에 2 차 습격(몬스터 다섯)이 오게 한다.
 * 진행 이벤트는 완료로 두어 측정 중 대사·목표 연출이 끼지 않게 한다.
 */
export function prepareMvpPerf(w: GameWorld): void {
  w.village.restore(3);
  w.gameEvents.restore([
    'EVENT_ARRIVAL',
    'EVENT_FARM_REQUEST',
    'EVENT_KITCHEN_REQUEST',
    'EVENT_BEDROOM_REQUEST',
    'EVENT_BELL_REQUEST',
    'EVENT_WALL_REQUEST',
    'EVENT_NEW_RESIDENT',
  ]);
  w.raids.restore({
    results: [
      { raidId: 1, total: 3, reached: 0, endedAtGameMinutes: w.clock.gameMinutes - 24 * 60 },
    ],
    active: null,
    scheduledAtGameMinutes: null,
  });
  w.storage.add('food', 10);
  w.storage.add('crop', 6);
}
