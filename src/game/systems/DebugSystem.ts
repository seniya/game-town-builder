// F3 패널의 게임 쪽 계측 수집과 디버그 명령 (ARCHITECTURE 26, TASK-016). 순수 TypeScript 다.
// 렌더 계측(FPS·드로우콜·청크)은 main 이 render 에서 읽어 패널에 따로 넘긴다.
import type { Player } from '../entities/Player';
import type { RoomRegistry, RoomRegistryStats } from '../room/RoomRegistry';
import type { BlockPos, DayPhase, Vec3 } from '../types';
import type { BlockEditSystem } from './BlockEditSystem';
import { formatClock, type GameClockSystem } from './GameClockSystem';
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
      rooms: this.rooms ? this.rooms.stats : null,
      showRoomBounds: this.showRoomBounds,
      diagnosisActive: this.roomSystem?.diagnosisActive ?? false,
    };
  }
}
