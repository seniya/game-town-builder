// 플레이어 엔티티 (ARCHITECTURE 12.1, 27). 순수 데이터이며 three 를 import 하지 않는다.
// 위치·시선·안전 지면은 여기서 소유하고, 이동 규칙은 PlayerMovementSystem 이 적용한다.
// entities 는 types / data 만 의존한다 (ARCHITECTURE 2.1). 생성은 PlayerMovementSystem.createPlayer 다.
import { balance } from '../data/balance';
import type { AabbBody, BlockPos, Vec3 } from '../types';

/** 플레이어 한 명의 상태. */
export interface Player {
  readonly id: 'player';
  body: AabbBody;
  /** 라디안. 0 이면 -z 쪽을 본다. 카메라 기준 방향이다 */
  yaw: number;
  /** 라디안. 음수가 내려다보기. balance.player.pitchMinDeg ~ pitchMaxDeg (MVP_SPEC 9.3) */
  pitch: number;
  health: number;
  /** 시작 위치 칸. 안전 지면이 무효일 때의 기준이다 (MVP_SPEC 9.5) */
  readonly spawnCell: BlockPos;
  /** 마지막 안전 지면 칸 (MVP_SPEC 9.5). 물 진입 시 여기로 복귀한다 */
  lastSafeCell: BlockPos;
}

/** 시선 방향 단위 벡터. yaw 0 · pitch 0 이면 (0, 0, -1) 이다. */
export function lookDirection(player: Pick<Player, 'yaw' | 'pitch'>): Vec3 {
  const c = Math.cos(player.pitch);
  return {
    x: -Math.sin(player.yaw) * c,
    y: Math.sin(player.pitch),
    z: -Math.cos(player.yaw) * c,
  };
}

/** 카메라 기준 수평 앞쪽 단위 벡터. */
export function forwardDirection(player: Pick<Player, 'yaw'>): Vec3 {
  return { x: -Math.sin(player.yaw), y: 0, z: -Math.cos(player.yaw) };
}

/** 카메라 기준 수평 오른쪽 단위 벡터. */
export function rightDirection(player: Pick<Player, 'yaw'>): Vec3 {
  return { x: Math.cos(player.yaw), y: 0, z: -Math.sin(player.yaw) };
}

/** 시선 원점: 발밑 중심 + eyeHeight (MVP_SPEC 9.3). */
export function eyePosition(player: Pick<Player, 'body'>): Vec3 {
  const f = player.body.pos;
  return { x: f.x, y: f.y + balance.player.eyeHeight, z: f.z };
}
