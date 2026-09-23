// 레이캐스트 / 파괴 진행도 / 설치 규칙 (MVP_SPEC 10, ARCHITECTURE 15 / 28.1, update 4 번).
// 인벤토리와 월드를 함께 바꾸는 편집은 모두 사전 검증한 뒤 EventBus.transaction 안에서 한 번에 커밋한다.
// 실패하면 블록·아이템·PlacementIndex 가 하나도 바뀌지 않는다 (MVP_SPEC 10.3 / 10.4).
import { BlockId, getBlockDef, isMultiCell, isSolid } from '../data/blocks';
import type { Player } from '../entities/Player';
import { lookDirection } from '../entities/Player';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { AabbBody, BlockPos, Facing, PlacedObjectSnapshot } from '../types';
import { objectCells } from '../voxel/PlacementIndex';
import type { RaycastHit } from '../voxel/raycast';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import { findAimTarget } from './aim';
import type { InputFrameSource } from './PlayerMovementSystem';
import { blockItem, type InventorySystem, type ItemAmount } from './InventorySystem';

/** 설치 실패 사유. 디버그·표시용이며 게임 규칙은 아니다. */
export type PlaceFailure =
  | 'no-target'
  | 'no-item'
  | 'not-placeable'
  | 'out-of-world'
  | 'occupied'
  | 'character'
  | 'no-support';

/** 파괴 실패 사유. */
export type BreakFailure = 'unbreakable' | 'inventory-full';

/** 편집 결과. ok 가 false 면 아무것도 바뀌지 않았다. */
export type EditResult<F> = { readonly ok: true } | { readonly ok: false; readonly reason: F };

/** BlockEditSystem 이 쓰는 월드. 편집 진입점은 setBlock / editObject 뿐이다. */
export type EditWorld = Pick<
  VoxelWorld,
  'getBlock' | 'setBlock' | 'editObject' | 'placements' | 'inBounds' | 'sizeX' | 'sizeY' | 'sizeZ'
>;

/** 생성 옵션. */
export interface BlockEditOptions {
  /** 설치 칸과 겹치면 안 되는 캐릭터 몸체들. 플레이어·NPC·몬스터 (MVP_SPEC 10.3) */
  readonly occupants: () => Iterable<AabbBody>;
  /** 0 이상 1 미만 난수. leaves 의 seed 25% 에만 쓴다 (MVP_SPEC 14.1). 테스트는 고정값을 넣는다 */
  readonly random?: () => number;
}

/** 파괴 진행 중인 대상. 다중 칸 객체는 객체 id 로 같은 대상인지 판단한다. */
interface BreakTarget {
  readonly key: string;
  readonly pos: BlockPos;
  readonly blockId: number;
}

/** 플레이어가 설치할 수 없는 블록: air / bedrock / water / bell, 그리고 농부만 심는 crop (MVP_SPEC 10.4). */
const NOT_PLAYER_PLACEABLE: ReadonlySet<number> = new Set([
  BlockId.air,
  BlockId.bedrock,
  BlockId.water,
  BlockId.bell,
  BlockId.crop,
]);

/** 부동소수 오차로 면이 맞닿은 것을 겹침으로 세지 않기 위한 여유. */
const TOUCH_EPS = 1e-6;

/** 몸체 AABB 가 칸 c 와 겹치는가. 면이 맞닿기만 한 것은 겹침이 아니다. */
export function bodyOverlapsCell(body: AabbBody, c: BlockPos): boolean {
  const h = body.width / 2;
  const p = body.pos;
  return (
    p.x - h < c.x + 1 - TOUCH_EPS &&
    p.x + h > c.x + TOUCH_EPS &&
    p.y < c.y + 1 - TOUCH_EPS &&
    p.y + body.height > c.y + TOUCH_EPS &&
    p.z - h < c.z + 1 - TOUCH_EPS &&
    p.z + h > c.z + TOUCH_EPS
  );
}

/** 시선의 수평 방향을 가장 가까운 동서남북으로 양자화한다 (MVP_SPEC 10.4). north = -z. */
export function facingFromLook(player: Pick<Player, 'yaw' | 'pitch'>): Facing {
  const d = lookDirection({ yaw: player.yaw, pitch: 0 });
  if (Math.abs(d.x) > Math.abs(d.z)) return d.x > 0 ? 'east' : 'west';
  return d.z > 0 ? 'south' : 'north';
}

/** 블록 편집. 조준 대상·파괴 진행도는 렌더(Highlight / 균열)와 UI 가 읽는다. */
export class BlockEditSystem implements SlotSystem {
  /** 이번 프레임의 조준 대상. reachDistance 안에 블록이 없으면 null */
  target: RaycastHit | null = null;
  /** 파괴 진행도 0 ~ 1. 파괴 중이 아니면 0 */
  breakProgress = 0;
  /** 블록 무제한 모드 (TASK-016 디버그). 설치해도 아이템을 쓰지 않는다 */
  unlimited = false;
  /** 무제한 모드에서 핫바 칸이 비었을 때 놓을 블록 (디버그 패널이 고른다) */
  unlimitedBlockId: number = BlockId.plank;
  /** 마지막 파괴·설치 실패 사유. 디버그 표시용 */
  lastFailure: PlaceFailure | BreakFailure | null = null;

  private breaking: BreakTarget | null = null;
  private readonly random: () => number;

  /** 월드·플레이어·인벤토리·입력·이벤트를 주입받는다. */
  constructor(
    private readonly world: EditWorld,
    private readonly player: Player,
    private readonly inventory: InventorySystem,
    private readonly input: InputFrameSource,
    private readonly events: EventBus,
    private readonly options: BlockEditOptions,
  ) {
    this.random = options.random ?? Math.random;
  }

  /** 파괴 진행 중인 칸. 없으면 null. */
  get breakingPos(): BlockPos | null {
    return this.breaking?.pos ?? null;
  }

  /** 이동이 끝난 위치에서 조준을 다시 찾고, 좌클릭 파괴와 우클릭 설치를 처리한다. */
  update(dt: number): void {
    this.target = findAimTarget(this.world, this.player);
    const frame = this.input.frame;
    this.updateBreaking(frame.primaryHeld, dt);
    if (frame.secondaryPressed) {
      const r = this.placeAtTarget();
      this.lastFailure = r.ok ? null : r.reason;
    }
  }

  /** 좌클릭 유지 중 진행도를 올린다. 대상이 바뀌거나 손을 떼면 0 으로 돌아간다 (MVP_SPEC 10.2). */
  private updateBreaking(held: boolean, dt: number): void {
    const current = this.target ? this.breakTargetAt(this.target.pos) : null;
    if (!held || !current) {
      this.resetBreaking();
      return;
    }
    if (!this.breaking || this.breaking.key !== current.key) {
      this.breaking = current;
      this.breakProgress = 0;
    }
    const seconds = getBlockDef(current.blockId).breakSeconds;
    if (seconds === null) {
      this.breakProgress = 0;
      this.lastFailure = 'unbreakable';
      return;
    }
    this.breakProgress = Math.min(1, this.breakProgress + dt / seconds);
    if (this.breakProgress < 1) return;
    const r = this.breakAt(current.pos);
    this.lastFailure = r.ok ? null : r.reason;
    // 인벤토리가 가득 차 실패하면 진행도를 1 에 둔다. 공간이 생기면 바로 부서진다
    if (r.ok) this.resetBreaking();
  }

  /** 진행도를 버린다. */
  private resetBreaking(): void {
    this.breaking = null;
    this.breakProgress = 0;
  }

  /** 칸의 파괴 대상 식별. 다중 칸 객체는 객체 id, 나머지는 좌표 + 블록 id 다. */
  private breakTargetAt(pos: BlockPos): BreakTarget {
    const blockId = this.world.getBlock(pos.x, pos.y, pos.z);
    const object = this.world.placements.objectAt(pos);
    const key = object ? `o:${object.id}` : `b:${pos.x},${pos.y},${pos.z}:${blockId}`;
    return { key, pos, blockId };
  }

  /**
   * 칸 pos 를 부수고 드롭을 인벤토리에 넣는다 (MVP_SPEC 10.2 / 14).
   * 다중 칸 객체는 전체를 제거하고 아이템 하나를 돌려준다. 드롭을 모두 넣을 공간이 없으면 부수지 않는다.
   */
  breakAt(pos: BlockPos): EditResult<BreakFailure> {
    const blockId = this.world.getBlock(pos.x, pos.y, pos.z);
    const def = getBlockDef(blockId);
    if (blockId === BlockId.air || def.breakSeconds === null) {
      return { ok: false, reason: 'unbreakable' };
    }
    const object = this.world.placements.objectAt(pos);
    const drops = object
      ? [{ item: blockItem(object.blockId), count: 1 }]
      : this.rollDrops(blockId);
    if (!this.inventory.canAdd(drops)) return { ok: false, reason: 'inventory-full' };
    this.events.transaction(() => {
      const removed = object
        ? this.world.editObject({ kind: 'remove', objectId: object.id }, 'player')
        : this.world.setBlock(pos.x, pos.y, pos.z, BlockId.air, 'player');
      if (!removed) throw new Error('검증을 통과한 파괴가 실패했다');
      if (drops.length > 0 && !this.inventory.add(drops)) {
        throw new Error('검증을 통과한 드롭 추가가 실패했다');
      }
    });
    return { ok: true };
  }

  /** 블록 정의의 드롭을 굴린다. chance 가 있는 항목만 난수를 쓴다 (MVP_SPEC 14.1). */
  private rollDrops(blockId: number): ItemAmount[] {
    const out: ItemAmount[] = [];
    for (const d of getBlockDef(blockId).drops) {
      if (d.chance === undefined || this.random() < d.chance) {
        out.push({ item: d.item, count: d.count });
      }
    }
    return out;
  }

  /** 조준 대상의 면 앞 칸에 선택한 아이템을 놓는다 (MVP_SPEC 10.3). */
  placeAtTarget(): EditResult<PlaceFailure> {
    const t = this.target;
    if (!t || (t.face.x === 0 && t.face.y === 0 && t.face.z === 0)) {
      return { ok: false, reason: 'no-target' };
    }
    const pos = { x: t.pos.x + t.face.x, y: t.pos.y + t.face.y, z: t.pos.z + t.face.z };
    return this.placeAt(pos, facingFromLook(this.player));
  }

  /**
   * pos 에 선택한 핫바 아이템을 facing 방향으로 놓는다. 모든 검사를 통과하면
   * 월드 편집과 아이템 1 소비를 함께 확정한다. 실패하면 둘 다 바뀌지 않는다.
   */
  placeAt(pos: BlockPos, facing: Facing): EditResult<PlaceFailure> {
    const stack = this.inventory.selectedStack();
    let blockId: number;
    if (stack) {
      if (stack.item.kind !== 'block') return { ok: false, reason: 'not-placeable' };
      blockId = stack.item.blockId;
    } else if (this.unlimited) {
      blockId = this.unlimitedBlockId;
    } else {
      return { ok: false, reason: 'no-item' };
    }
    if (NOT_PLAYER_PLACEABLE.has(blockId)) return { ok: false, reason: 'not-placeable' };

    const multi = isMultiCell(blockId);
    const cells = multi ? objectCells({ blockId, anchor: pos, facing }) : [pos];
    const blocked = this.checkCells(cells);
    if (blocked) return { ok: false, reason: blocked };
    if (!this.hasSupport(blockId, cells)) return { ok: false, reason: 'no-support' };
    const consume = !this.unlimited;
    if (consume && !this.inventory.canConsumeSelected()) return { ok: false, reason: 'no-item' };

    this.events.transaction(() => {
      let placed: boolean;
      if (multi) {
        const object: PlacedObjectSnapshot = {
          id: this.world.placements.allocateId(),
          blockId,
          anchor: pos,
          facing,
        };
        placed = this.world.editObject({ kind: 'place', object }, 'player');
      } else {
        placed = this.world.setBlock(pos.x, pos.y, pos.z, blockId, 'player');
      }
      if (!placed) throw new Error('검증을 통과한 설치가 실패했다');
      if (consume && !this.inventory.consumeSelected()) {
        throw new Error('검증을 통과한 아이템 소비가 실패했다');
      }
    });
    return { ok: true };
  }

  /** 점유할 칸이 모두 월드 안의 빈 칸이고 캐릭터와 겹치지 않는가. 문제가 있으면 사유를 반환한다. */
  private checkCells(cells: readonly BlockPos[]): PlaceFailure | null {
    for (const c of cells) {
      if (!this.world.inBounds(c.x, c.y, c.z)) return 'out-of-world';
      if (this.world.getBlock(c.x, c.y, c.z) !== BlockId.air) return 'occupied';
      if (this.world.placements.isOccupied(c)) return 'occupied';
    }
    for (const body of this.options.occupants()) {
      for (const c of cells) if (bodyOverlapsCell(body, c)) return 'character';
    }
    return null;
  }

  /** MVP_SPEC 10.4 의 지지 조건. 설치할 때만 검사한다 (10.4.1). */
  private hasSupport(blockId: number, cells: readonly BlockPos[]): boolean {
    const solidAt = (x: number, y: number, z: number): boolean =>
      this.world.inBounds(x, y, z) && isSolid(this.world.getBlock(x, y, z));
    const below = (c: BlockPos): boolean => solidAt(c.x, c.y - 1, c.z);
    const kind = getBlockDef(blockId).kind;
    if (blockId === BlockId.torch) {
      const c = cells[0] as BlockPos;
      return (
        below(c) ||
        solidAt(c.x + 1, c.y, c.z) ||
        solidAt(c.x - 1, c.y, c.z) ||
        solidAt(c.x, c.y, c.z + 1) ||
        solidAt(c.x, c.y, c.z - 1)
      );
    }
    if (blockId === BlockId.bed) return cells.every(below);
    if (blockId === BlockId.door) return below(cells[0] as BlockPos);
    if (blockId === BlockId.farmland || kind === 'furniture') return below(cells[0] as BlockPos);
    return true;
  }
}
