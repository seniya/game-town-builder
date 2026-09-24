// 저장 형식과 캡처·복원 (ARCHITECTURE 23, TASK-051). 저장 대상은 Action 객체가 아니라 지속되어야 하는 게임 사실이다.
// 시각은 gameMinutes 하나이며 벽시계 시각(Date.now)을 쓰지 않는다. WorldState·방 결과·Nav 캐시·메시·NPC Action·임시 예약은 저장하지 않는다.
// 캡처는 structuredClone 으로 살아 있는 게임 데이터와 분리한다(비동기 쓰기 중 편집해도 스냅샷이 바뀌지 않는다).
import type { Monster } from '../entities/Monster';
import { createMonster } from '../entities/Monster';
import type { GameWorld } from '../GameWorld';
import type { BedAssignment } from '../systems/SleepSystem';
import type { CropRecord } from '../systems/FarmSystem';
import type { EndingSnapshot } from '../systems/EndingSystem';
import type { DialogueSnapshot } from '../systems/DialogueSystem';
import type { GratitudeSnapshot } from '../systems/GratitudeSystem';
import type { ItemStack } from '../systems/InventorySystem';
import type { RaidSnapshot } from '../systems/RaidSystem';
import type { RepairSnapshot } from '../systems/RepairSystem';
import type { ResidentArrival } from '../systems/ResidentArrivalSystem';
import { UNLOCKS_BY_LEVEL } from '../data/unlocks';
import type {
  ChunkCoord,
  GameEventId,
  NPCRole,
  ObjectiveDefinition,
  PlacedObjectSnapshot,
  Vec3,
  VillageStorageData,
} from '../types';

/** 저장 형식 버전. 구조가 바뀌면 올리고 migrate 에 변환을 더한다 (ARCHITECTURE 23.5). */
export const SAVE_VERSION = 1;

/** 저장 데이터 (ARCHITECTURE 23.1). */
export interface SaveData {
  readonly version: number;
  readonly gameMinutes: number;
  readonly chunks: readonly { readonly coord: ChunkCoord; readonly blocks: Uint16Array }[];
  readonly placedObjects: readonly PlacedObjectSnapshot[];
  readonly objectIdCounter: number;
  readonly editBatchCounter: number;
  readonly player: {
    readonly pos: Vec3;
    readonly health: number;
    readonly inventory: readonly (ItemStack | null)[];
    readonly hotbarIndex: number;
  } | null;
  readonly storage: VillageStorageData;
  readonly npcs: readonly {
    readonly id: string;
    readonly role: NPCRole;
    readonly pos: Vec3;
    readonly health: number;
    readonly stunUntilGameMinutes: number;
    readonly mealId: string | null;
    readonly hasEatenThisMeal: boolean;
  }[];
  readonly bedAssignments: readonly BedAssignment[];
  readonly gratitude: GratitudeSnapshot;
  readonly villageLevel: number;
  /** 표시·검증용. 로드는 레벨에서 다시 계산한다 */
  readonly unlocked: readonly number[];
  readonly residentArrivals: readonly ResidentArrival[];
  readonly completedEvents: readonly GameEventId[];
  readonly dialogue: DialogueSnapshot;
  readonly objective: ObjectiveDefinition | null;
  readonly raids: RaidSnapshot;
  readonly monsters: readonly {
    readonly id: string;
    readonly raidId: number;
    readonly pos: Vec3;
    readonly health: number;
  }[];
  readonly damage: RepairSnapshot;
  readonly crops: readonly CropRecord[];
  readonly quarry: { readonly respawnedThroughDay: number };
  readonly ending: EndingSnapshot;
}

/** 버전이 맞지 않거나 형식이 잘못된 저장. 조용히 깨지지 않고 거부한다. */
export class SaveRejectedError extends Error {}

/** 현재 게임 사실을 저장 데이터로 캡처한다. 살아 있는 데이터와 분리된 복사본이다. */
export function captureSave(w: GameWorld): SaveData {
  const p = w.player;
  const data: SaveData = {
    version: SAVE_VERSION,
    gameMinutes: w.clock.gameMinutes,
    chunks: w.voxels.modifiedChunks(),
    placedObjects: w.voxels.placements.all(),
    objectIdCounter: w.voxels.placements.objectIdCounter,
    editBatchCounter: w.voxels.editBatchCounter,
    player: p
      ? {
          pos: { ...p.body.pos },
          health: p.health,
          inventory: w.inventory.snapshot(),
          hotbarIndex: w.inventory.selected,
        }
      : null,
    storage: w.storage.snapshot(),
    npcs: [...w.registry.npcs.values()].map((n) => ({
      id: n.id,
      role: n.role,
      pos: { ...n.body.pos },
      health: n.health,
      stunUntilGameMinutes: n.stunUntilGameMinutes,
      mealId: n.mealId,
      hasEatenThisMeal: n.hasEatenThisMeal,
    })),
    bedAssignments: w.sleep.snapshot(),
    gratitude: w.gratitude.snapshot(),
    villageLevel: w.village.level,
    unlocked: unlockedUpTo(w.village.level),
    residentArrivals: w.arrivals.snapshot(),
    completedEvents: [...w.gameEvents.completed],
    dialogue: w.dialogue.snapshot(),
    objective: w.objectives.snapshot(),
    raids: w.raids.snapshot(),
    monsters: [...w.registry.monsters.values()].map((m) => ({
      id: m.id,
      raidId: m.raidId,
      pos: { ...m.body.pos },
      health: m.health,
    })),
    damage: w.repair.snapshot(),
    crops: w.farm.snapshot(),
    quarry: w.quarry.snapshot(),
    ending: w.ending.snapshot(),
  };
  return structuredClone(data);
}

/**
 * 저장 데이터를 검증·변환한다 (ARCHITECTURE 23.5). 다른 버전은 안전한 변환이 없으면 이유와 함께 거부한다.
 */
export function migrate(raw: unknown): SaveData {
  if (typeof raw !== 'object' || raw === null) throw new SaveRejectedError('저장 데이터가 아니다');
  const version = (raw as { version?: unknown }).version;
  if (version !== SAVE_VERSION) {
    throw new SaveRejectedError(
      `저장 버전 ${String(version)} 은 이 게임(버전 ${SAVE_VERSION})과 맞지 않는다`,
    );
  }
  const d = raw as SaveData;
  if (!Array.isArray(d.chunks) || !Array.isArray(d.npcs) || typeof d.gameMinutes !== 'number') {
    throw new SaveRejectedError('저장 데이터의 형식이 잘못되었다');
  }
  return d;
}

/**
 * 새로 만든 월드(같은 섬·장면) 위에 저장을 되돌린다 (ARCHITECTURE 23.4).
 * 1 검증 → 2 변경 청크·배치 → 3 Nav 비우기·방 재판정(보상 이벤트 없음) → 4 소유자 복원 → 5 사라진 침대 배정 해제·Action 재판단
 * → 6 WorldState·메시 준비. 로드 중 완료 이벤트를 다시 실행하지 않는다.
 */
export function applySave(w: GameWorld, raw: unknown): void {
  const d = migrate(raw);
  // 2
  for (const c of d.chunks) w.voxels.restoreChunk(c.coord, c.blocks);
  w.voxels.restorePlacements(d.placedObjects, d.objectIdCounter, d.editBatchCounter);
  // 3
  w.nav.clear();
  w.voxels.markAllDirty();
  w.rooms.rebuildAll();
  // 4
  w.clock.restore(d.gameMinutes);
  w.storage.restore(d.storage);
  if (w.player && d.player) {
    w.player.body.pos = { ...d.player.pos };
    w.player.body.velocity = { x: 0, y: 0, z: 0 };
    w.player.health = d.player.health;
    w.inventory.restore(d.player.inventory, d.player.hotbarIndex);
  }
  w.restoreResidents(d.npcs);
  w.sleep.restore(d.bedAssignments);
  w.gratitude.restore(d.gratitude);
  w.village.restore(d.villageLevel);
  w.arrivals.restore(d.residentArrivals);
  w.gameEvents.restore(d.completedEvents);
  w.dialogue.restore(d.dialogue);
  w.objectives.restore(d.objective);
  w.raids.restore(d.raids);
  restoreMonsters(w, d.monsters);
  w.repair.restore(d.damage);
  w.farm.restore(d.crops);
  w.quarry.restore(d.quarry);
  w.ending.restore(d.ending);
  w.cooking.resetForLoad();
}

/** 몬스터를 다시 세운다(행동은 처음부터 다시 판단한다). */
function restoreMonsters(w: GameWorld, list: SaveData['monsters']): void {
  for (const m of [...w.registry.monsters.values()]) w.registry.monsters.remove(m.id);
  for (const s of list) {
    const m: Monster = createMonster(s.id, s.raidId, { x: 0, y: 0, z: 0 });
    m.body.pos = { ...s.pos };
    m.health = s.health;
    w.registry.monsters.add(m);
  }
}

/** 레벨까지 해금된 블록. */
function unlockedUpTo(level: number): number[] {
  const out: number[] = [];
  for (let l = 1; l <= level; l++) out.push(...(UNLOCKS_BY_LEVEL[l] ?? []));
  return out;
}
