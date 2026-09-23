// 채석장 하루 재생 (MVP_SPEC 14.2 / 14.3, READY-04, ADR 024). update 4 번 슬롯의 BlockEditSystem 뒤에 둔다.
// 칸 선택은 순수 함수 selectQuarryRespawnCells 가 하고, 이 시스템은 "언제 한 번"과 처리 키만 소유한다.
import { balance } from '../data/balance';
import { BlockId } from '../data/blocks';
import type { SlotSystem } from '../GameWorld';
import type { AabbBody, BlockPos, GameClockReader } from '../types';
import { selectQuarryRespawnCells } from '../voxel/quarryRespawn';
import type { VoxelWorld } from '../voxel/VoxelWorld';
import { latestBoundaryDay } from './GameClockSystem';

/** 저장·복원 단위 (SaveData.quarry, ARCHITECTURE 23.1). */
export interface QuarryRespawnSnapshot {
  readonly respawnedThroughDay: number;
}

/** 시스템이 읽는 것. 후보는 섬 데이터, 몸체는 플레이어·NPC·몬스터의 현재 목록이다. */
export interface QuarryRespawnDeps {
  readonly voxels: Pick<VoxelWorld, 'getBlock' | 'setBlock'>;
  readonly clock: GameClockReader;
  readonly candidates: readonly BlockPos[];
  /** 경계 순간의 캐릭터 몸체. 점유 칸은 그날 건너뛴다 */
  readonly bodies: () => Iterable<AabbBody>;
}

/** AABB 가 블록 칸과 겹치는가. 면에 닿기만 한 경우는 겹침이 아니다. */
export function bodyOverlapsCell(body: AabbBody, c: BlockPos): boolean {
  const half = body.width / 2;
  const p = body.pos;
  return (
    p.x + half > c.x &&
    p.x - half < c.x + 1 &&
    p.z + half > c.z &&
    p.z - half < c.z + 1 &&
    p.y + body.height > c.y &&
    p.y < c.y + 1
  );
}

/** 매일 05:00 경계를 넘을 때 한 번 최대 stoneRespawnPerDay 칸을 돌로 되돌린다. */
export class QuarryRespawnSystem implements SlotSystem {
  private through: number;
  /** 마지막 처리에서 복구한 칸 수. 디버그·테스트용이다 */
  lastRestored = 0;

  /** 처리 키는 시작 시각의 최근 경계 day 로 시작한다(시작 시각에는 처리하지 않는다). */
  constructor(private readonly deps: QuarryRespawnDeps) {
    this.through = latestBoundaryDay(deps.clock.gameMinutes, balance.clock.quarryRespawnHour);
  }

  /** 마지막으로 처리한 05:00 경계의 day. */
  get respawnedThroughDay(): number {
    return this.through;
  }

  /** 남은 경계가 있으면 한 번만 처리한다. 여러 경계를 넘어도 한 번이며 보충하지 않는다. */
  update(): void {
    const day = latestBoundaryDay(this.deps.clock.gameMinutes, balance.clock.quarryRespawnHour);
    if (day <= this.through) return;
    this.through = day;
    const bodies = [...this.deps.bodies()];
    const cells = selectQuarryRespawnCells(
      this.deps.candidates,
      {
        getBlock: (x, y, z) => this.deps.voxels.getBlock(x, y, z),
        isOccupiedByCharacter: (c) => bodies.some((b) => bodyOverlapsCell(b, c)),
      },
      balance.resource.stoneRespawnPerDay,
    );
    let restored = 0;
    for (const c of cells) {
      if (this.deps.voxels.setBlock(c.x, c.y, c.z, BlockId.stone, 'world')) restored += 1;
    }
    this.lastRestored = restored;
  }

  /** 저장용 값. */
  snapshot(): QuarryRespawnSnapshot {
    return { respawnedThroughDay: this.through };
  }

  /**
   * 로드 복원. 로드 중에는 처리하지 않고 다음 update 에서 남은 경계를 한 번 처리한다.
   * 필드가 없는 저장(null)은 현재 시각의 최근 경계 day 로 둔다(그날을 다시 복구하지 않는다).
   */
  restore(data: QuarryRespawnSnapshot | null): void {
    this.through =
      data?.respawnedThroughDay ??
      latestBoundaryDay(this.deps.clock.gameMinutes, balance.clock.quarryRespawnHour);
  }
}
