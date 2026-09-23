// TASK-PERF-001 구조 점검 장면 (TASKS PERF-001, ADR 018). 게임 콘텐츠가 아니다.
// MVP 인원·월드·balance 를 바꾸지 않는 별도 fixture 다. 기존 블록·방 레시피만 쓴다.
// 256 × 64 × 256 평지, 가운데 광장(종), 방 100 개(침실 70·주방 15·식당 15), 가구 객체 약 2000 개, 주민 최대 100 명.
import type { BlockPos, NPCRole, WriteBlock } from '../types';
import { BlockId } from './blocks';
import type { VisualFixture } from './visualFixtures';

const SIZE = 256;
const G = 10;
/** 발이 놓이는 높이. */
const Y = G + 1;
/** 방 격자: 10 × 10, 칸 간격 14. 외곽 7 × 7(내부 5 × 5) */
const GRID = 10;
const PITCH = 14;
const ORIGIN = Math.floor((SIZE - GRID * PITCH) / 2);

/** 직육면체 채우기. */
function fill(
  w: WriteBlock,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  id: number,
): void {
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) w(x, y, z, id);
}

/** 방 i 의 외곽 최소 좌표. 가운데 두 줄(광장 자리)은 비운다. */
function roomOrigin(i: number): { x: number; z: number } {
  const gx = i % GRID;
  const gz = Math.floor(i / GRID);
  return { x: ORIGIN + gx * PITCH, z: ORIGIN + gz * PITCH };
}

/** 방 i 의 종류. 0~69 침실, 70~84 주방, 85~99 식당. */
function roomKind(i: number): 'bedroom' | 'kitchen' | 'dining' {
  if (i < 70) return 'bedroom';
  return i < 85 ? 'kitchen' : 'dining';
}

/** 다중 칸 객체 목록(문·침대). build 와 같은 규칙으로 만든다. */
function perfObjects(): VisualFixture['objects'] {
  const out: VisualFixture['objects'][number][] = [];
  for (let i = 0; i < GRID * GRID; i++) {
    const o = roomOrigin(i);
    out.push({ blockId: BlockId.door, anchor: { x: o.x + 3, y: Y, z: o.z + 6 }, facing: 'south' });
    if (roomKind(i) === 'bedroom') {
      out.push({ blockId: BlockId.bed, anchor: { x: o.x + 1, y: Y, z: o.z + 1 }, facing: 'south' });
      out.push({ blockId: BlockId.bed, anchor: { x: o.x + 5, y: Y, z: o.z + 1 }, facing: 'south' });
    }
  }
  return out;
}

/** 방 사이 길의 가운데 좌표(방 외곽 7 칸 뒤 빈 7 칸의 가운데). */
const ROAD = (g: number): number => ORIGIN + g * PITCH + 10;

/** 광장 중심: 가운데 두 방 줄 사이 길의 교차점. */
export const PERF_PLAZA: BlockPos = { x: ROAD(4), y: Y, z: ROAD(4) };

/** 주민 시작 칸: 광장 둘레의 격자. role 은 돌려 쓴다. */
function perfResidents(): { role: NPCRole; cell: BlockPos }[] {
  const roles: NPCRole[] = ['farmer', 'cook', 'carpenter', 'villager'];
  const out: { role: NPCRole; cell: BlockPos }[] = [];
  // 광장을 지나는 가로 길 두 줄(z = 길 가운데 ±1)에 두 칸 간격으로 선다
  for (let i = 0; i < 100; i++) {
    const row = i % 2;
    const col = Math.floor(i / 2);
    out.push({
      role: roles[i % roles.length] ?? 'villager',
      cell: { x: ORIGIN + 2 + col * 2, y: Y, z: PERF_PLAZA.z - 1 + row * 2 },
    });
  }
  return out;
}

/**
 * 가구 객체 수(방 안 + 바깥 가구 마당). 다중 칸 침대는 객체 1 개로 센다. PERF-001 기록용.
 */
export const PERF_FURNITURE_TARGET = 2000;

/** PERF-001 시험 장면. ?scene=perf&residents=5|50|100 */
export const perfFixture: VisualFixture = {
  size: { sizeX: SIZE, sizeY: 64, sizeZ: SIZE },
  plazaCenter: PERF_PLAZA,
  residents: perfResidents(),
  defaultStartHour: 19.9,
  build(write) {
    fill(write, 0, 0, 0, SIZE - 1, 0, SIZE - 1, BlockId.bedrock);
    fill(write, 0, 1, 0, SIZE - 1, G - 2, SIZE - 1, BlockId.dirt);
    fill(write, 0, G - 1, 0, SIZE - 1, G - 1, SIZE - 1, BlockId.dirt);
    fill(write, 0, G, 0, SIZE - 1, G, SIZE - 1, BlockId.grass);
    let furniture = 0;
    for (let i = 0; i < GRID * GRID; i++) {
      const o = roomOrigin(i);
      // 광장 자리(가운데)와 겹치는 방은 광장 쪽으로 밀지 않고 그대로 둔다: 광장은 격자 사이 길에 있다
      fill(write, o.x + 1, G, o.z + 1, o.x + 5, G, o.z + 5, BlockId.plank);
      for (let x = o.x; x <= o.x + 6; x++) {
        for (let z = o.z; z <= o.z + 6; z++) {
          const edge = x === o.x || z === o.z || x === o.x + 6 || z === o.z + 6;
          if (!edge || (x === o.x + 3 && z === o.z + 6)) continue;
          const wall = (x + z) % 5 === 0 ? BlockId.window : BlockId.plank;
          write(x, Y, z, BlockId.plank);
          write(x, Y + 1, z, wall);
        }
      }
      write(o.x + 5, Y, o.z + 5, BlockId.torch);
      const kind = roomKind(i);
      if (kind === 'bedroom') {
        write(o.x + 3, Y, o.z + 1, BlockId.chest);
        write(o.x + 1, Y, o.z + 5, BlockId.table);
        write(o.x + 2, Y, o.z + 5, BlockId.chair);
        furniture += 5; // 침대 2(객체) + 상자·식탁·의자
      } else if (kind === 'kitchen') {
        write(o.x + 1, Y, o.z + 1, BlockId.cooking_stove);
        write(o.x + 2, Y, o.z + 1, BlockId.water_pot);
        write(o.x + 5, Y, o.z + 1, BlockId.chest);
        furniture += 3;
      } else {
        write(o.x + 3, Y, o.z + 3, BlockId.table);
        write(o.x + 2, Y, o.z + 3, BlockId.chair);
        write(o.x + 4, Y, o.z + 3, BlockId.chair);
        write(o.x + 3, Y, o.z + 2, BlockId.chair);
        furniture += 4;
      }
    }
    // 광장: 종과 네 torch
    write(PERF_PLAZA.x, Y, PERF_PLAZA.z, BlockId.bell);
    for (const [dx, dz] of [
      [-4, -4],
      [4, -4],
      [-4, 4],
      [4, 4],
    ] as const) {
      write(PERF_PLAZA.x + dx, Y, PERF_PLAZA.z + dz, BlockId.torch);
    }
    // 바깥 가구 마당: 월드 가장자리 띠에 목표 수까지 가구를 한 칸 걸러 놓는다(통행을 막지 않게)
    const kinds = [
      BlockId.table,
      BlockId.chair,
      BlockId.chest,
      BlockId.water_pot,
      BlockId.cooking_stove,
    ];
    let k = 0;
    for (let z = 4; z < SIZE - 4 && furniture < PERF_FURNITURE_TARGET; z += 2) {
      for (const x of [4, 6, 8, 10, SIZE - 11, SIZE - 9, SIZE - 7, SIZE - 5]) {
        if (furniture >= PERF_FURNITURE_TARGET) break;
        write(x, Y, z, kinds[k % kinds.length] ?? BlockId.chest);
        k += 1;
        furniture += 1;
      }
    }
    for (let x = 14; x < SIZE - 14 && furniture < PERF_FURNITURE_TARGET; x += 2) {
      for (const z of [4, 6, 8, SIZE - 9, SIZE - 7, SIZE - 5]) {
        if (furniture >= PERF_FURNITURE_TARGET) break;
        write(x, Y, z, kinds[k % kinds.length] ?? BlockId.chest);
        k += 1;
        furniture += 1;
      }
    }
  },
  objects: perfObjects(),
  views: [
    // 근경: 광장과 주민
    { target: { x: ROAD(4), y: Y + 1, z: ROAD(4) + 4 }, distance: 34, yaw: 0.3, pitch: 0.55 },
    // 원경: 시험 월드 전체를 내려다보는 최악 조건
    { target: { x: SIZE / 2, y: Y, z: SIZE / 2 }, distance: 300, yaw: 0.5, pitch: 1.05 },
  ],
};
