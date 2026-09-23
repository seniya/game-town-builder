// 방 재판정 슬롯 (ARCHITECTURE 4.1 의 5 번, 15). BLOCK_CHANGED 를 구독해 markDirty 하고,
// update 에서 RoomRegistry.processQueue 를 프레임 예산 안에서 부른다.
// 진단 모드(Tab)는 모달이 아니다. 켜져 있는 동안 플레이어가 다른 칸으로 가면 그 칸에서 다시 진단한다 (MVP_SPEC 11.5).
import { BlockId, isWallBlock } from '../data/blocks';
import type { Player } from '../entities/Player';
import { forwardDirection } from '../entities/Player';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { RoomRegistry } from '../room/RoomRegistry';
import { posKey, type BlockPos, type RoomBlockReader } from '../types';
import type { InputFrame } from './InputSystem';

/** 진단을 켜고 끄는 키 (MVP_SPEC 29). */
export const DIAGNOSIS_KEY = 'Tab';

/** RoomSystem 이 읽는 입력·플레이어. 플레이어 없는 관찰 장면이면 생략한다. */
export interface RoomDiagnosisPort {
  readonly input: { readonly frame: InputFrame };
  readonly player: Player;
}

/** 방 재판정·진단 구동. */
export class RoomSystem implements SlotSystem {
  private active = false;
  private lastStartKey: string | null = null;

  /** BLOCK_CHANGED 를 구독한다. 구독은 월드 수명 동안 유지한다. */
  constructor(
    private readonly registry: RoomRegistry,
    events: EventBus,
    private readonly read: RoomBlockReader,
    private readonly budgetMs: number,
    private readonly diagnosis: RoomDiagnosisPort | null,
  ) {
    // 진단 중 읽은 칸의 변경은 RoomRegistry.markDirty 가 진단을 다시 시작시킨다
    events.on('BLOCK_CHANGED', (change) => this.registry.handleBlockChanged(change));
  }

  /** 진단 모드가 켜져 있는가. */
  get diagnosisActive(): boolean {
    return this.active;
  }

  /** 진단 모드를 켜고 끈다. 끄면 결과를 버린다. */
  setDiagnosisActive(on: boolean): void {
    this.active = on;
    this.lastStartKey = null;
    if (!on) this.registry.cancelDiagnosis();
  }

  /** Tab 을 반영하고, 진단을 먼저 시작한 뒤 공통 예산으로 큐를 처리한다. */
  update(): void {
    const port = this.diagnosis;
    if (port && port.input.frame.pressed.has(DIAGNOSIS_KEY)) {
      this.setDiagnosisActive(!this.active);
    }
    if (port && this.active) {
      const start = diagnosisStart(this.read, port.player);
      const key = posKey(start);
      if (key !== this.lastStartKey) {
        this.registry.beginDiagnosis(start);
        this.lastStartKey = key;
      }
    }
    this.registry.processQueue(this.budgetMs);
  }
}

/**
 * 진단 시작 칸: 플레이어 발 칸. 문 칸에 서 있으면 문 아래 anchor 의 수평 이웃 중
 * 벽이 아닌 칸을 고르며, 시선 앞쪽을 먼저 본다 (MVP_SPEC 11.3 의 1).
 */
export function diagnosisStart(read: RoomBlockReader, player: Player): BlockPos {
  const p = player.body.pos;
  const feet = { x: Math.floor(p.x), y: Math.floor(p.y + 1e-3), z: Math.floor(p.z) };
  if (read.get(feet.x, feet.y, feet.z) !== BlockId.door) return feet;
  const anchor = read.objectAt(feet)?.anchor ?? feet;
  const f = forwardDirection(player);
  const ahead =
    Math.abs(f.x) >= Math.abs(f.z)
      ? { dx: Math.sign(f.x) || 1, dz: 0 }
      : { dx: 0, dz: Math.sign(f.z) || 1 };
  const candidates = [
    ahead,
    { dx: -ahead.dx, dz: -ahead.dz },
    { dx: ahead.dz, dz: ahead.dx },
    { dx: -ahead.dz, dz: -ahead.dx },
  ];
  for (const d of candidates) {
    const c = { x: anchor.x + d.dx, y: anchor.y, z: anchor.z + d.dz };
    if (read.contains(c) && !isWallBlock(read.get(c.x, c.y, c.z))) return c;
  }
  return anchor;
}
