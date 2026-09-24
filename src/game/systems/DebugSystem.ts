// F3 패널의 게임 쪽 계측 수집과 디버그 명령 (ARCHITECTURE 26, TASK-016). 순수 TypeScript 다.
// 렌더 계측(FPS·드로우콜·청크)은 main 이 render 에서 읽어 패널에 따로 넘긴다.
import type { NPC } from '../entities/NPC';
import type { Player } from '../entities/Player';
import type { NavigationGraph, NavigationStats } from '../nav/NavigationGraph';
import type { PathScheduler, PathSchedulerStats } from '../nav/PathScheduler';
import type { RoomRegistry, RoomRegistryStats } from '../room/RoomRegistry';
import type { ActionView, BlockPos, DayPhase, Vec3, WorldStateData } from '../types';
import type { BlockEditSystem } from './BlockEditSystem';
import { formatClock, type GameClockSystem } from './GameClockSystem';
import type { SleepStats, SleepSystem } from './SleepSystem';
import type { CookingStats } from './CookingSystem';
import type { FarmStats } from './FarmSystem';
import type { MealStats } from './MealSystem';
import type { VillageStorage } from '../VillageStorage';

/** NPC 한 줄 (ARCHITECTURE 26: id / 현재 Action label / 목적지 / 경로 길이). */
export interface NPCDebugLine {
  readonly id: string;
  readonly label: string;
  readonly destination: BlockPos | null;
  readonly pathLength: number;
  readonly pos: Vec3;
  readonly bed: string | null;
}
import type { RoomSystem } from './RoomSystem';

/** 게임 쪽 디버그 표시값. */
export interface GameDebugSnapshot {
  readonly playerPos: Vec3 | null;
  readonly onGround: boolean | null;
  readonly lastSafeCell: BlockPos | null;
  readonly aimTarget: BlockPos | null;
  readonly aimFace: BlockPos | null;
  readonly breakProgress: number;
  readonly lastEditFailure: string | null;
  readonly unlimitedBlocks: boolean;
  /** 무제한 모드에서 빈 핫바 칸으로 놓을 블록 */
  readonly unlimitedBlockId: number | null;
  /** 시간 배속 명령을 쓸 수 있는가(시계가 있는가) */
  readonly timeScaleAvailable: boolean;
  /** 현재 배속 (1 / 4 / 16) */
  readonly timeScale: number;
  /** "Day N HH:MM" 와 시간대 (ARCHITECTURE 26) */
  readonly clockText: string | null;
  readonly phase: DayPhase | null;
  /** 누적 gameMinutes */
  readonly gameMinutes: number | null;
  /** "통행 가능 셀 표시" 디버그 명령 (ARCHITECTURE 26) */
  readonly showNavCells: boolean;
  /** 통행 캐시·경로 요청 계측 */
  readonly nav: NavigationStats | null;
  readonly paths: PathSchedulerStats | null;
  readonly npcs: readonly NPCDebugLine[];
  readonly sleep: SleepStats | null;
  /** 농사 계측 (TASK-030) */
  readonly farm: FarmStats | null;
  readonly seed: number | null;
  /** 요리 계측 (TASK-031) */
  readonly cooking: CookingStats | null;
  readonly crop: number | null;
  readonly food: number | null;
  /** 식사 계측 (TASK-032) */
  readonly meal: MealStats | null;
  /** 감사 포인트 합계 (TASK-035) */
  readonly gratitude: number | null;
  /** 파생 지표 네 개 (TASK-039) */
  readonly worldState: WorldStateData | null;
  /** 방: 인식 수 / 타입별 / 재판정 큐 길이 / 마지막 판정 소요 ms (ARCHITECTURE 26) */
  readonly rooms: RoomRegistryStats | null;
  /** "방 경계 상시 표시" 디버그 명령 */
  readonly showRoomBounds: boolean;
  readonly diagnosisActive: boolean;
}

/** 디버그 명령과 계측. */
export class DebugSystem {
  /** "방 경계 상시 표시" 명령 상태. 렌더가 읽는다 */
  showRoomBounds = false;
  /** "통행 가능 셀 표시" 명령 상태. 렌더가 읽는다 */
  showNavCells = false;
  /** 통행 계측 대상. GameWorld 가 연결한다 */
  navSources: { readonly nav: NavigationGraph; readonly paths: PathScheduler } | null = null;
  /** 농사 계측·씨앗 투입 대상. GameWorld 가 연결한다 */
  farmSources: { readonly farm: () => FarmStats; readonly storage: VillageStorage } | null = null;
  /** 요리 계측·작물 투입 대상. GameWorld 가 연결한다 */
  cookingSources: {
    readonly cooking: () => CookingStats;
    readonly storage: VillageStorage;
  } | null = null;
  /** 감사 포인트 조회. GameWorld 가 연결한다 */
  gratitudeSource: (() => number) | null = null;
  /** 파생 지표 조회. GameWorld 가 연결한다 */
  worldStateSource: (() => WorldStateData) | null = null;
  /** 식사 계측 대상. GameWorld 가 연결한다 */
  mealSources: { readonly meal: () => MealStats } | null = null;
  /** NPC 계측 대상. GameWorld 가 연결한다 */
  npcSources: {
    readonly npcs: () => Iterable<NPC<ActionView>>;
    readonly sleep: SleepSystem;
  } | null = null;

  /** 플레이어와 블록 편집 시스템을 받는다(없으면 관찰용 장면). 방 계측은 선택이다. */
  constructor(
    private readonly player: Player | null,
    private readonly blockEdit: BlockEditSystem | null,
    private readonly rooms: RoomRegistry | null = null,
    private readonly roomSystem: RoomSystem | null = null,
    private readonly clock: GameClockSystem | null = null,
  ) {}

  /** 디버그 시간 배속 1× / 4× / 16× (MVP_SPEC 20.2). 허용 밖이면 false. */
  setTimeScale(scale: number): boolean {
    return this.clock?.setTimeScale(scale) ?? false;
  }

  /** 디버그 씨앗 투입 (TASK-030 AC). 기부 경로(TASK-036) 전의 시험용이다. */
  addSeeds(count: number): void {
    if (count > 0) this.farmSources?.storage.add('seed', count);
  }

  /** 디버그 작물 투입 (TASK-031 검증). 수확(12 게임시간)을 기다리지 않고 조리를 확인하는 시험용이다. */
  addCrops(count: number): void {
    if (count > 0) this.cookingSources?.storage.add('crop', count);
  }

  /** 디버그 시각 강제 설정. 다음 도래하는 hour:minute 로 앞당긴다 (MVP_SPEC 20.3). */
  advanceClockTo(hour: number, minute = 0): void {
    this.clock?.advanceTo(hour, minute);
  }

  /** 블록 무제한 모드: 설치해도 아이템을 쓰지 않고, 빈 칸이면 선택한 블록을 놓는다. */
  get unlimitedBlocks(): boolean {
    return this.blockEdit?.unlimited ?? false;
  }

  /** 블록 무제한 모드를 켜고 끈다. */
  setUnlimitedBlocks(on: boolean): void {
    if (this.blockEdit) this.blockEdit.unlimited = on;
  }

  /** 무제한 모드에서 빈 핫바 칸으로 놓을 블록. */
  setUnlimitedBlockId(blockId: number): void {
    if (this.blockEdit) this.blockEdit.unlimitedBlockId = blockId;
  }

  /** 무제한 모드에서 놓을 블록 id. */
  get unlimitedBlockId(): number | null {
    return this.blockEdit?.unlimitedBlockId ?? null;
  }

  /** 현재 게임 쪽 표시값. */
  snapshot(): GameDebugSnapshot {
    const p = this.player;
    const e = this.blockEdit;
    return {
      playerPos: p ? p.body.pos : null,
      onGround: p ? p.body.onGround : null,
      lastSafeCell: p ? p.lastSafeCell : null,
      aimTarget: e?.target?.pos ?? null,
      aimFace: e?.target?.face ?? null,
      breakProgress: e?.breakProgress ?? 0,
      lastEditFailure: e?.lastFailure ?? null,
      unlimitedBlocks: this.unlimitedBlocks,
      unlimitedBlockId: this.unlimitedBlockId,
      timeScaleAvailable: this.clock !== null,
      timeScale: this.clock?.timeScale ?? 1,
      clockText: this.clock ? formatClock(this.clock.gameMinutes) : null,
      phase: this.clock?.phase ?? null,
      gameMinutes: this.clock?.gameMinutes ?? null,
      showNavCells: this.showNavCells,
      nav: this.navSources ? this.navSources.nav.stats : null,
      paths: this.navSources ? this.navSources.paths.stats : null,
      npcs: this.npcLines(),
      sleep: this.npcSources ? this.npcSources.sleep.stats : null,
      farm: this.farmSources ? this.farmSources.farm() : null,
      seed: this.farmSources ? this.farmSources.storage.get('seed') : null,
      cooking: this.cookingSources ? this.cookingSources.cooking() : null,
      crop: this.cookingSources ? this.cookingSources.storage.get('crop') : null,
      food: this.cookingSources ? this.cookingSources.storage.get('food') : null,
      meal: this.mealSources ? this.mealSources.meal() : null,
      worldState: this.worldStateSource ? this.worldStateSource() : null,
      gratitude: this.gratitudeSource ? this.gratitudeSource() : null,
      rooms: this.rooms ? this.rooms.stats : null,
      showRoomBounds: this.showRoomBounds,
      diagnosisActive: this.roomSystem?.diagnosisActive ?? false,
    };
  }

  /** NPC 줄 목록. */
  private npcLines(): NPCDebugLine[] {
    const src = this.npcSources;
    if (!src) return [];
    const out: NPCDebugLine[] = [];
    for (const npc of src.npcs()) {
      const a = npc.action;
      out.push({
        id: npc.id,
        label: a.label,
        destination: a.destination ?? null,
        pathLength: a.remainingPath?.length ?? 0,
        pos: npc.body.pos,
        bed: src.sleep.assignedBed(npc.id)?.objectId ?? null,
      });
    }
    return out;
  }
}
