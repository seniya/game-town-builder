// 레이캐스트 / 파괴 진행도 / 설치 규칙 (ARCHITECTURE 15, update 4 번).
// TASK-012: 매 프레임 조준 대상을 확정한다. 파괴·설치는 TASK-013 에서 더한다.
import type { Player } from '../entities/Player';
import type { SlotSystem } from '../GameWorld';
import type { CollisionWorld } from '../voxel/collision';
import type { RaycastHit } from '../voxel/raycast';
import { findAimTarget } from './aim';

/** 블록 편집. 조준 대상은 렌더(Highlight)와 UI(조준점)가 읽는다. */
export class BlockEditSystem implements SlotSystem {
  /** 이번 프레임의 조준 대상. reachDistance 안에 블록이 없으면 null */
  target: RaycastHit | null = null;

  /** 월드와 플레이어를 주입받는다. */
  constructor(
    private readonly world: CollisionWorld,
    private readonly player: Player,
  ) {}

  /** 이동이 끝난 위치에서 조준 대상을 다시 찾는다 (update 3 번 뒤). */
  update(): void {
    this.target = findAimTarget(this.world, this.player);
  }
}
