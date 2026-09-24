// 방 타입과 시설 결정 (MVP_SPEC 12, ARCHITECTURE 10.2). 순수 모듈이다.
// 가구 접근성은 문 아래 셀에서 방 내부로 이어진 보행 셀(isStandableCell)로 판정한다.
// 외부 경로·NPC 고립은 보장하지 않는다(문까지의 국소 접근성, MVP_SPEC 12.2).
import { CHAIR_SEAT_HEIGHT } from '../data/blockShapes';
import { BlockId, getBlockDef, isFurniture } from '../data/blocks';
import { FURNITURE_NAMES, roomDisplayName } from '../data/roomRecipes';
import {
  posKey,
  type BlockPos,
  type Facility,
  type RecipeMatch,
  type RoomBlockReader,
  type RoomFacilities,
  type RoomRecipe,
  type RoomShape,
  type RoomType,
  type Vec3,
} from '../types';
import { objectCells } from '../voxel/PlacementIndex';
import { isStandableCell } from '../voxel/occupancy';
import { standCellToWorldFeet } from '../voxel/coords';
import { HORIZONTAL_DIRS } from './detectRoom';

/** 방 안의 가구 하나와 접근성. */
export interface FurnitureInfo {
  readonly blockId: number;
  readonly objectId: string;
  readonly anchor: BlockPos;
  readonly cells: readonly BlockPos[];
  /** 모든 점유 칸이 방 내부인가 */
  readonly inside: boolean;
  readonly approachCells: readonly BlockPos[];
  /** inside 이고 접근 셀이 하나 이상 */
  readonly accessible: boolean;
}

/** matchRecipe 와 진단이 공유하는 방 분석 결과. */
export interface RoomAnalysis {
  readonly walkable: ReadonlySet<string>;
  readonly furniture: readonly FurnitureInfo[];
}

/** 빈 시설. */
export const NO_FACILITIES: RoomFacilities = {
  beds: [],
  cookingSpots: [],
  diningSeats: [],
  chests: [],
};

/** 수평 이웃 4 칸. */
function neighbors(p: BlockPos): BlockPos[] {
  return HORIZONTAL_DIRS.map((d) => ({ x: p.x + d.dx, y: p.y, z: p.z + d.dz }));
}

/**
 * 문 아래 셀에서 방 내부로 이어진 NPC 보행 셀 집합. 경계 벽이나 가구를 관통하지 않는다.
 * 문 칸 자체는 시작점이며 집합에 넣지 않는다(내부 칸만 접근 셀이 된다).
 */
function walkableCells(
  read: RoomBlockReader,
  shape: RoomShape,
  interior: Set<string>,
): Set<string> {
  const out = new Set<string>();
  const queue: BlockPos[] = [];
  for (const door of shape.doors) {
    if (!isStandableCell(read, door, 'npc')) continue;
    for (const n of neighbors(door)) {
      const k = posKey(n);
      if (interior.has(k) && !out.has(k) && isStandableCell(read, n, 'npc')) {
        out.add(k);
        queue.push(n);
      }
    }
  }
  for (let i = 0; i < queue.length; i++) {
    for (const n of neighbors(queue[i] as BlockPos)) {
      const k = posKey(n);
      if (interior.has(k) && !out.has(k) && isStandableCell(read, n, 'npc')) {
        out.add(k);
        queue.push(n);
      }
    }
  }
  return out;
}

/** 방 내부의 가구를 객체 단위로 모으고 접근성을 계산한다. */
export function analyzeRoom(read: RoomBlockReader, shape: RoomShape): RoomAnalysis {
  const interior = new Set(shape.interior.map(posKey));
  const walkable = walkableCells(read, shape, interior);
  const seen = new Set<string>();
  const furniture: FurnitureInfo[] = [];
  for (const p of shape.interior) {
    const id = read.get(p.x, p.y, p.z);
    if (!isFurniture(id)) continue;
    const object = id === BlockId.bed ? read.objectAt(p) : undefined;
    const objectId = object ? object.id : posKey(p);
    if (seen.has(objectId)) continue;
    seen.add(objectId);
    const cells = object ? objectCells(object) : [p];
    const approach = new Map<string, BlockPos>();
    for (const c of cells) {
      for (const n of neighbors(c)) {
        const k = posKey(n);
        if (walkable.has(k)) approach.set(k, n);
      }
    }
    const inside = cells.every((c) => interior.has(posKey(c)));
    const approachCells = [...approach.values()];
    furniture.push({
      blockId: id,
      objectId,
      anchor: object ? object.anchor : p,
      cells,
      inside,
      approachCells,
      accessible: inside && approachCells.length > 0,
    });
  }
  return { walkable, furniture };
}

/**
 * 렌더의 사용 자세 위치. 침대는 점유 칸 윗면 가운데(눕기), 의자는 앉는 판 높이(ADR 028 보완 7)의 가운데,
 * 화덕·상자는 첫 접근 셀의 발밑(서서 사용)이다. 충돌·저장 위치로 쓰지 않는다 (MVP_SPEC 12.2).
 */
function usePosition(f: FurnitureInfo): Vec3 {
  if (f.blockId === BlockId.bed || f.blockId === BlockId.chair) {
    const n = f.cells.length;
    const sx = f.cells.reduce((s, c) => s + c.x + 0.5, 0) / n;
    const sz = f.cells.reduce((s, c) => s + c.z + 0.5, 0) / n;
    const top = f.blockId === BlockId.chair ? CHAIR_SEAT_HEIGHT : 1;
    return { x: sx, y: f.anchor.y + top, z: sz };
  }
  return standCellToWorldFeet(f.approachCells[0] ?? f.anchor);
}

/** 시설 레코드. */
function toFacility(f: FurnitureInfo): Facility {
  return {
    objectId: f.objectId,
    anchor: f.anchor,
    approachCells: f.approachCells,
    usePosition: usePosition(f),
  };
}

/** 두 가구가 수평으로 맞닿아 있는가. */
function adjacent(a: FurnitureInfo, b: FurnitureInfo): boolean {
  return a.cells.some((c) =>
    b.cells.some((d) => c.y === d.y && Math.abs(c.x - d.x) + Math.abs(c.z - d.z) === 1),
  );
}

/** 레시피 한 행의 평가 결과. satisfied 가 아니어도 facilities 는 참고로 계산한다. */
interface RuleResult {
  readonly satisfied: boolean;
  readonly facilities: RoomFacilities;
}

/** 레시피 한 행을 평가한다 (MVP_SPEC 12.1). */
function evaluate(recipe: RoomRecipe, a: RoomAnalysis): RuleResult {
  const of = (blockId: number): FurnitureInfo[] =>
    a.furniture.filter((f) => f.blockId === blockId && f.inside);
  const rule = recipe.rule;
  switch (rule.kind) {
    case 'dining': {
      const chairs = of(BlockId.chair).filter((c) => c.accessible);
      const seats = new Map<string, FurnitureInfo>();
      let tables = 0;
      for (const t of of(BlockId.table)) {
        const around = chairs.filter((c) => adjacent(t, c));
        if (around.length < rule.minChairsPerTable) continue;
        tables += 1;
        for (const c of around) seats.set(c.objectId, c);
      }
      return {
        satisfied: tables >= rule.minTables,
        facilities: { ...NO_FACILITIES, diningSeats: [...seats.values()].map(toFacility) },
      };
    }
    case 'kitchen': {
      const stoves = of(BlockId.cooking_stove).filter((s) => s.accessible);
      return {
        satisfied:
          stoves.length >= rule.minStoves && of(BlockId.water_pot).length >= rule.minWaterPots,
        facilities: { ...NO_FACILITIES, cookingSpots: stoves.map(toFacility) },
      };
    }
    case 'bedroom': {
      const beds = of(BlockId.bed).filter((b) => b.accessible);
      return {
        satisfied: beds.length >= rule.minBeds,
        facilities: { ...NO_FACILITIES, beds: beds.map(toFacility) },
      };
    }
    case 'storeroom': {
      const chests = of(BlockId.chest).filter((c) => c.accessible);
      return {
        satisfied: chests.length >= rule.minChests,
        facilities: { ...NO_FACILITIES, chests: chests.map(toFacility) },
      };
    }
    case 'none':
      return { satisfied: true, facilities: NO_FACILITIES };
  }
}

/** priority 내림차순 복사본. */
function byPriority(recipes: readonly RoomRecipe[]): RoomRecipe[] {
  return [...recipes].sort((a, b) => b.priority - a.priority);
}

/** 분석 결과에 레시피를 적용한다. 최종 타입의 시설만 활성화한다. */
export function matchAnalysis(a: RoomAnalysis, recipes: readonly RoomRecipe[]): RecipeMatch {
  for (const recipe of byPriority(recipes)) {
    const r = evaluate(recipe, a);
    if (r.satisfied) return { type: recipe.type, facilities: r.facilities };
  }
  return { type: 'EmptyRoom', facilities: NO_FACILITIES };
}

/** 가구 배치와 문까지의 국소 접근성으로 방 타입과 시설을 정한다 (ARCHITECTURE 10.2). */
export function matchRecipe(
  read: RoomBlockReader,
  shape: RoomShape,
  recipes: readonly RoomRecipe[],
): RecipeMatch {
  return matchAnalysis(analyzeRoom(read, shape), recipes);
}

/** 가구 이름. */
function nameOf(blockId: number): string {
  return FURNITURE_NAMES[blockId] ?? getBlockDef(blockId).name;
}

/** 한글 마지막 글자에 받침이 있으면 withBatchim, 없으면 without 조사를 붙인다. */
function josa(word: string, withBatchim: string, without: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const batchim = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (batchim ? withBatchim : without);
}

/** 이 가구가 기여하는 레시피 타입. */
const FURNITURE_TYPE: Readonly<Record<number, RoomType>> = {
  [BlockId.bed]: 'Bedroom',
  [BlockId.cooking_stove]: 'Kitchen',
  [BlockId.water_pot]: 'Kitchen',
  [BlockId.table]: 'DiningRoom',
  [BlockId.chair]: 'DiningRoom',
  [BlockId.chest]: 'Storeroom',
};

/**
 * 진단 문구 (MVP_SPEC 11.5): 가구 접근 실패, 미충족 레시피, 우선순위 때문에 쓰이지 않는 가구.
 * 확인한 가구 좌표만 가리킨다. 막힌 원인 칸을 추측해 정답처럼 표시하지 않는다.
 */
export function describeFacilityIssues(
  a: RoomAnalysis,
  match: RecipeMatch,
  recipes: readonly RoomRecipe[],
): { at: BlockPos; message: string }[] {
  const issues: { at: BlockPos; message: string }[] = [];
  for (const f of a.furniture) {
    if (!f.inside) {
      issues.push({
        at: f.anchor,
        message: `${josa(nameOf(f.blockId), '이', '가')} 방 밖으로 걸쳐 있습니다`,
      });
    } else if (!f.accessible && f.blockId !== BlockId.table && f.blockId !== BlockId.water_pot) {
      issues.push({
        at: f.anchor,
        message: `${nameOf(f.blockId)}에 다가갈 칸이 없습니다 (옆 칸이 막혔거나 문과 이어지지 않음)`,
      });
    }
  }
  const has = (id: number): FurnitureInfo[] =>
    a.furniture.filter((f) => f.blockId === id && f.inside);
  const stoves = has(BlockId.cooking_stove);
  const pots = has(BlockId.water_pot);
  if (stoves.length > 0 && pots.length === 0) {
    issues.push({
      at: (stoves[0] as FurnitureInfo).anchor,
      message: '주방이 되려면 물통이 필요합니다',
    });
  }
  if (pots.length > 0 && stoves.length === 0) {
    issues.push({
      at: (pots[0] as FurnitureInfo).anchor,
      message: '주방이 되려면 화덕이 필요합니다',
    });
  }
  const chairs = has(BlockId.chair);
  const dining = recipes.find((r) => r.rule.kind === 'dining');
  const need = dining?.rule.kind === 'dining' ? dining.rule.minChairsPerTable : 2;
  for (const t of has(BlockId.table)) {
    const around = chairs.filter((c) => c.accessible && adjacent(t, c)).length;
    if (around < need) {
      issues.push({
        at: t.anchor,
        message: `식탁 옆에 다가갈 수 있는 의자가 ${need}개 필요합니다 (지금 ${around}개)`,
      });
    }
  }
  const tables = has(BlockId.table);
  for (const c of chairs) {
    if (!tables.some((t) => adjacent(t, c))) {
      issues.push({ at: c.anchor, message: '의자가 식탁 옆에 붙어 있지 않습니다' });
    }
  }
  // 더 높은 priority 타입이 선택되어 쓰이지 않는 가구
  const finalPriority = recipes.find((r) => r.type === match.type)?.priority ?? 0;
  const noted = new Set<RoomType>();
  for (const recipe of byPriority(recipes)) {
    if (recipe.priority >= finalPriority || recipe.rule.kind === 'none') continue;
    if (!evaluate(recipe, a).satisfied || noted.has(recipe.type)) continue;
    noted.add(recipe.type);
    const f = a.furniture.find((x) => FURNITURE_TYPE[x.blockId] === recipe.type && x.inside);
    if (f) {
      issues.push({
        at: f.anchor,
        message: `${josa(roomDisplayName(match.type), '이', '가')} ${recipe.displayName}보다 우선이라 ${josa(nameOf(f.blockId), '은', '는')} 쓰이지 않습니다`,
      });
    }
  }
  return issues;
}
