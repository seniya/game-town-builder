// 블록 정의 22 종 + air (MVP_SPEC 8.1 이 정본). 새 블록을 임의로 추가하지 않는다 (MVP_SPEC 38).
import type { BlockDefinition, BlockDrop, BlockKind } from '../types';
import { balance } from './balance';

/** 블록 id 상수. 배열 인덱스와 id 가 같다. */
export const BlockId = {
  air: 0,
  bedrock: 1,
  dirt: 2,
  grass: 3,
  stone: 4,
  sand: 5,
  log: 6,
  leaves: 7,
  water: 8,
  plank: 9,
  stone_brick: 10,
  door: 11,
  window: 12,
  torch: 13,
  bed: 14,
  cooking_stove: 15,
  water_pot: 16,
  table: 17,
  chair: 18,
  chest: 19,
  farmland: 20,
  crop: 21,
  bell: 22,
} as const;

export type BlockName = keyof typeof BlockId;

/** 블록 한 개를 그대로 회수하는 드롭 (MVP_SPEC 14: 표에 없는 제작 블록). */
function self(blockId: number): readonly BlockDrop[] {
  return [{ item: { kind: 'block', blockId }, count: 1 }];
}

/** 표의 한 행을 BlockDefinition 으로 만든다. */
function def(
  name: BlockName,
  kind: BlockKind,
  solid: boolean,
  opaque: boolean,
  terrain: boolean,
  breakSeconds: number | null,
  drops: readonly BlockDrop[],
  cells = 1,
): BlockDefinition {
  return { id: BlockId[name], name, kind, solid, opaque, terrain, breakSeconds, drops, cells };
}

const B = BlockId;

/**
 * id 순서의 정의 배열. BLOCKS[id].id === id 이다.
 * drops 는 플레이어 파괴 기준 (MVP_SPEC 14). 파괴 불가 블록은 빈 배열이다.
 */
export const BLOCKS: readonly BlockDefinition[] = [
  def('air', 'air', false, false, false, null, []),
  def('bedrock', 'terrain', true, true, true, null, []),
  def('dirt', 'terrain', true, true, true, 0.6, self(B.dirt)),
  // grass 는 dirt 를 떨군다 (MVP_SPEC 14: dirt / grass → dirt × 1)
  def('grass', 'terrain', true, true, true, 0.6, self(B.dirt)),
  def('stone', 'terrain', true, true, true, 1.5, self(B.stone)),
  def('sand', 'terrain', true, true, true, 0.5, self(B.sand)),
  def('log', 'terrain', true, true, true, 1.0, self(B.log)),
  def('leaves', 'terrain', true, false, true, 0.2, [
    { item: { kind: 'block', blockId: B.leaves }, count: 1 },
    {
      item: { kind: 'material', material: 'seed' },
      count: 1,
      chance: balance.resource.seedDropChanceFromLeaves,
    },
  ]),
  def('water', 'fluid', false, false, true, null, []),
  def('plank', 'build', true, true, false, 0.8, self(B.plank)),
  def('stone_brick', 'build', true, true, false, 2.0, self(B.stone_brick)),
  // door: 통행·충돌에서 Player/NPC 에게 비고체 (MVP_SPEC 8.3). 몬스터 통행 판정은 nav 가 따로 본다.
  def('door', 'door', false, false, false, 0.8, self(B.door), 2),
  def('window', 'build', true, false, false, 0.8, self(B.window)),
  def('torch', 'light', false, false, false, 0.1, self(B.torch)),
  def('bed', 'furniture', true, true, false, 0.8, self(B.bed), 2),
  def('cooking_stove', 'furniture', true, true, false, 1.2, self(B.cooking_stove)),
  def('water_pot', 'furniture', true, true, false, 0.8, self(B.water_pot)),
  def('table', 'furniture', true, true, false, 0.8, self(B.table)),
  def('chair', 'furniture', true, true, false, 0.6, self(B.chair)),
  def('chest', 'furniture', true, true, false, 0.8, self(B.chest)),
  def('farmland', 'build', true, true, false, 0.5, self(B.farmland)),
  // crop 을 플레이어가 부수면 드롭 없이 제거한다 (MVP_SPEC 14)
  def('crop', 'crop', false, false, false, 0.2, []),
  def('bell', 'special', true, true, false, null, []),
];

/** 벽으로 인정되는 블록 (MVP_SPEC 8.4). 지형 블록은 포함하지 않는다. */
const WALL_BLOCKS: ReadonlySet<number> = new Set([B.plank, B.stone_brick, B.window, B.door]);

/** id 의 정의. 범위 밖 id 는 air 로 취급한다. */
export function getBlockDef(id: number): BlockDefinition {
  return BLOCKS[id] ?? (BLOCKS[0] as BlockDefinition);
}

/** 충돌·지지면 기준 고체인가. */
export function isSolid(id: number): boolean {
  return getBlockDef(id).solid;
}

/** 면 컬링·AO 기준 불투명인가. */
export function isOpaque(id: number): boolean {
  return getBlockDef(id).opaque;
}

/** 방 인식의 벽으로 인정되는가 (MVP_SPEC 8.4). */
export function isWallBlock(id: number): boolean {
  return WALL_BLOCKS.has(id);
}

/** 가구인가 (kind === 'furniture'). */
export function isFurniture(id: number): boolean {
  return getBlockDef(id).kind === 'furniture';
}

/** terrain 플래그. true 면 몬스터가 파괴하지 않는다 (MVP_SPEC 8.2). */
export function isTerrain(id: number): boolean {
  return getBlockDef(id).terrain;
}

/** 다중 칸 객체(bed / door)인가. 단일 setBlock 으로 쓰면 안 된다. */
export function isMultiCell(id: number): boolean {
  return getBlockDef(id).cells > 1;
}
