import { describe, expect, it } from 'vitest';
import { BlockId } from '../src/game/data/blocks';
import { ROOM_RECIPES } from '../src/game/data/roomRecipes';
import { detectRoom } from '../src/game/room/detectRoom';
import {
  analyzeRoom,
  describeFacilityIssues,
  matchAnalysis,
  matchRecipe,
} from '../src/game/room/matchRecipe';
import type { RecipeMatch, RoomShape } from '../src/game/types';
import { buildTestWorld, type BedSpec, type TestWorld } from './helpers/buildTestWorld';
import { LIMITS } from './helpers/roomFixtures';

/**
 * 내부 5 × 3 방(x 1~5, z 1~3). 문은 앞벽 (3, 1, 4). interior 는 가구 배치 문자열 3 행이다.
 * 둘째 층 내부는 모두 비어 있다(head 가 주어지면 그 문자열을 쓴다).
 */
function room(interior: string[], opts: { beds?: BedSpec[]; head?: string[] } = {}): TestWorld {
  const row = (s: string) => `# ${s} #`;
  const head = opts.head ?? ['. . . . .', '. . . . .', '. . . . .'];
  const src = `
    y=0: # # # # # # #
         # # # # # # #
         # # # # # # #
         # # # # # # #
         # # # # # # #
    y=1: # # # # # # #
         ${row(interior[0] as string)}
         ${row(interior[1] as string)}
         ${row(interior[2] as string)}
         # # # D # # #
    y=2: # # # # # # #
         ${row(head[0] as string)}
         ${row(head[1] as string)}
         ${row(head[2] as string)}
         # # # D # # #
    y=3: . . . . . . .
         . . . . . . .
         . . . . . . .
         . . . . . . .
         . . . . . . .
  `;
  return buildTestWorld(src, opts.beds ? { beds: opts.beds } : {});
}

/** 방 형태를 판정한다. 실패하면 테스트를 멈춘다. */
function shapeOf(t: TestWorld): RoomShape {
  const d = detectRoom(t, { x: 3, y: 1, z: 3 }, LIMITS);
  if (!d.ok) throw new Error(`방이 아니다: ${d.failure.reason}`);
  return d.shape;
}

/** 방 타입을 판정한다. */
function match(t: TestWorld): RecipeMatch {
  return matchRecipe(t, shapeOf(t), ROOM_RECIPES);
}

describe('matchRecipe 레시피 (TASK-019, MVP_SPEC 12.1)', () => {
  it('침대 1 개 → Bedroom', () => {
    const t = room(['B B . . .', '. . . . .', '. . . . .'], {
      beds: [{ anchor: { x: 1, y: 1, z: 1 }, facing: 'east' }],
    });
    const m = match(t);
    expect(m.type).toBe('Bedroom');
    expect(m.facilities.beds).toHaveLength(1);
  });

  it('화덕 + 물통 → Kitchen', () => {
    expect(match(room(['K P . . .', '. . . . .', '. . . . .'])).type).toBe('Kitchen');
  });

  it('화덕만 있으면 Kitchen 이 아니다', () => {
    expect(match(room(['K . . . .', '. . . . .', '. . . . .'])).type).toBe('EmptyRoom');
  });

  it('식탁 + 인접 의자 2 개 → DiningRoom', () => {
    const m = match(room(['C T C . .', '. . . . .', '. . . . .']));
    expect(m.type).toBe('DiningRoom');
    expect(m.facilities.diningSeats).toHaveLength(2);
  });

  it('상자 → Storeroom', () => {
    const m = match(room(['H . . . .', '. . . . .', '. . . . .']));
    expect(m.type).toBe('Storeroom');
    expect(m.facilities.chests).toHaveLength(1);
  });

  it('아무것도 없으면 EmptyRoom', () => {
    const m = match(room(['. . . . .', '. . . . .', '. . . . .']));
    expect(m.type).toBe('EmptyRoom');
    expect(m.facilities).toEqual({ beds: [], cookingSpots: [], diningSeats: [], chests: [] });
  });

  it('침대와 화덕+물통이 같이 있으면 Kitchen 이다 (30 > 20). 침대는 비활성', () => {
    const t = room(['B B . K P', '. . . . .', '. . . . .'], {
      beds: [{ anchor: { x: 1, y: 1, z: 1 }, facing: 'east' }],
    });
    const m = match(t);
    expect(m.type).toBe('Kitchen');
    expect(m.facilities.beds).toEqual([]);
    expect(m.facilities.cookingSpots).toHaveLength(1);
    const issues = describeFacilityIssues(analyzeRoom(t, shapeOf(t)), m, ROOM_RECIPES);
    expect(issues.map((i) => i.message)).toContain(
      '주방이 침실보다 우선이라 침대는 쓰이지 않습니다',
    );
  });

  it('식당은 주방보다 우선이다 (40 > 30)', () => {
    expect(match(room(['C T C K P', '. . . . .', '. . . . .'])).type).toBe('DiningRoom');
  });
});

describe('가구 접근성 (TASK-019, MVP_SPEC 12.2)', () => {
  it('벽 틈에 낀 침대는 facilities.beds 에 들어가지 않고 Bedroom 도 아니다', () => {
    // 침대가 벽과 칸막이(판자 2 층) 사이 1 칸 틈에 있고, 틈 입구를 상자가 막는다.
    // 방 형태는 성립하지만(가구도 내부) 침대 옆에 문과 이어진 보행 셀이 없다.
    const t = room(['B # . . .', 'B # . . .', 'H . . . .'], {
      beds: [{ anchor: { x: 1, y: 1, z: 1 }, facing: 'south' }],
      head: ['. # . . .', '. # . . .', '. . . . .'],
    });
    const shape = shapeOf(t);
    const m = matchRecipe(t, shape, ROOM_RECIPES);
    expect(m.facilities.beds).toEqual([]);
    expect(m.type).toBe('Storeroom');
    const issues = describeFacilityIssues(analyzeRoom(t, shape), m, ROOM_RECIPES);
    expect(issues).toContainEqual({
      at: { x: 1, y: 1, z: 1 },
      message: '침대에 다가갈 칸이 없습니다 (옆 칸이 막혔거나 문과 이어지지 않음)',
    });
  });

  it('침대 옆 머리 공간이 막히면 접근 가능한 시설이 아니다', () => {
    // 침대(1,1)~(2,1) 둘레의 보행 셀 머리 칸(y=2)을 판자로 막는다. 방 형태는 그대로다
    const t = room(['B B . . .', '. . . . .', '. . . . .'], {
      beds: [{ anchor: { x: 1, y: 1, z: 1 }, facing: 'east' }],
      head: ['. . # . .', '# # . . .', '. . . . .'],
    });
    const m = match(t);
    expect(m.type).toBe('EmptyRoom');
    // 머리 칸 하나를 치우면 다시 침실이다
    t.world.setBlock(3, 2, 1, BlockId.air, 'player');
    expect(match(t).type).toBe('Bedroom');
  });

  it('가구로 문과 단절된 영역의 가구는 접근 불가다', () => {
    // 상자 H 가 x=3 줄을 막아 왼쪽 영역이 문(3,1,4)과 끊긴다... 문 앞 (3,3) 은 열려 있어야 한다
    const t = room(['K P H . .', '. . H . .', 'T H . . .']);
    const a = analyzeRoom(t, shapeOf(t));
    const stove = a.furniture.find((f) => f.blockId === BlockId.cooking_stove);
    expect(stove?.inside).toBe(true);
    expect(stove?.accessible).toBe(false);
    expect(matchAnalysis(a, ROOM_RECIPES).type).toBe('Storeroom');
  });

  it('식탁에서 떨어진 의자는 diningSeats 가 아니다', () => {
    const m = match(room(['C T . . C', '. . . . .', '. . . . .']));
    expect(m.type).toBe('EmptyRoom');
    expect(m.facilities.diningSeats).toEqual([]);
  });

  it('식탁 옆 의자라도 접근할 수 없으면 세지 않는다', () => {
    // 의자 (1,1) 은 벽·식탁·칸막이 판자에 둘러싸인다
    const t = room(['C T C . .', '# . . . .', '. . . . .'], {
      head: ['. . . . .', '# . . . .', '. . . . .'],
    });
    expect(match(t).type).toBe('EmptyRoom');
  });

  it('facilities 는 좌표 목록을 들고 있다. 접근 셀과 사용 위치가 구분된다', () => {
    const t = room(['B B . . .', '. . . . .', '. . . . .'], {
      beds: [{ anchor: { x: 1, y: 1, z: 1 }, facing: 'east' }],
    });
    const bed = match(t).facilities.beds[0];
    expect(bed?.anchor).toEqual({ x: 1, y: 1, z: 1 });
    expect(bed?.objectId).toMatch(/^obj-/);
    // 접근 셀은 침대 옆 바닥 보행 셀이며 침대 점유 칸이 아니다(고체 가구를 A* 목적지로 쓰지 않는다)
    expect(bed?.approachCells).toEqual(
      expect.arrayContaining([
        { x: 3, y: 1, z: 1 },
        { x: 1, y: 1, z: 2 },
        { x: 2, y: 1, z: 2 },
      ]),
    );
    for (const c of bed?.approachCells ?? []) expect(t.get(c.x, c.y, c.z)).toBe(BlockId.air);
    expect(bed?.usePosition).toEqual({ x: 2, y: 2, z: 1.5 });
  });

  it('단일 칸 가구의 objectId 는 posKey 다', () => {
    const m = match(room(['H . . . .', '. . . . .', '. . . . .']));
    expect(m.facilities.chests[0]?.objectId).toBe('1,1,1');
  });

  it('높은 priority 로 타입이 바뀌면 이전 타입 시설은 비활성화된다', () => {
    const t = room(['B B . . .', '. . . . .', '. . . . .'], {
      beds: [{ anchor: { x: 1, y: 1, z: 1 }, facing: 'east' }],
    });
    expect(match(t).facilities.beds).toHaveLength(1);
    t.world.setBlock(4, 1, 3, BlockId.cooking_stove, 'player');
    t.world.setBlock(5, 1, 3, BlockId.water_pot, 'player');
    const m = match(t);
    expect(m.type).toBe('Kitchen');
    expect(m.facilities.beds).toEqual([]);
  });

  it('미충족 레시피를 진단한다', () => {
    const t = room(['K T C . .', '. . . . .', '. . . . .']);
    const shape = shapeOf(t);
    const a = analyzeRoom(t, shape);
    const messages = describeFacilityIssues(a, matchAnalysis(a, ROOM_RECIPES), ROOM_RECIPES).map(
      (i) => i.message,
    );
    expect(messages).toContain('주방이 되려면 물통이 필요합니다');
    expect(messages).toContain('식탁 옆에 다가갈 수 있는 의자가 2개 필요합니다 (지금 1개)');
  });
});
