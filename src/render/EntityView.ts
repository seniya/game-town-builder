// 엔티티 표시 (ARCHITECTURE 12.2). Entity 를 읽어서 그리고 고치지 않는다.
// 플레이어 모형(둥근 SD 캐릭터 STYLE-002, 동작 TASK-ANIM-001). 주민은 NpcView, 몬스터는 MonsterView 다.
import * as THREE from 'three';
import type { Player } from '../game/entities/Player';
import { MOVING_SPEED, playerPose, PoseBlender, SWING_SECONDS } from './characterPose';
import { CuteCharacter } from './cuteCharacter';

/** 플레이어 동작 입력. main 이 BlockEditSystem 과 이벤트에서 읽어 넘긴다. */
export interface PlayerActionInput {
  /** 블록을 부수는 중인가 */
  readonly breaking: boolean;
}

/** 팔 동작이 끝난 뒤 제자리로 돌아오는 동안 동작 자세를 붙잡는 실초. */
const ACTION_FADE = 0.3;

/** 한 프레임에 이만큼 넘게 움직이면 순간 이동(부활·물 복귀)으로 보고 보간하지 않는다. */
const TELEPORT_DISTANCE = 3;

/**
 * 플레이어 모형: 둥근 SD 캐릭터(키 1.55, 몸체 AABB 1.8 안).
 * 걷기·달리기·점프·낙하와 파괴(반복 휘두르기)·설치·공격(한 번 휘두르기)을 그린다.
 */
export class PlayerView {
  readonly object3d = new THREE.Group();
  private readonly character = new CuteCharacter('player');
  private readonly blender = new PoseBlender();
  private last: THREE.Vector3 | null = null;
  private speed = 0;
  private walk = 0;
  private time = 0;
  private swing: { kind: 'place' | 'attack'; elapsed: number } | null = null;
  private actionWeight = 0;
  /** 파괴를 멈춘 뒤 팔이 돌아올 때까지 남은 실초 */
  private breakHold = 0;

  /** 모형을 만든다. */
  constructor() {
    this.object3d.add(this.character.object3d);
  }

  /** 설치·공격 때 한 번 휘두른다(main 이 이벤트에서 부른다). 진행 중이면 처음부터 다시 한다. */
  playSwing(kind: 'place' | 'attack'): void {
    this.swing = { kind, elapsed: 0 };
  }

  /**
   * 위치·방향·자세를 엔티티에서 읽는다. visible 이 false 면 숨긴다(카메라가 너무 가까울 때).
   * dt 는 렌더 프레임 실초다.
   */
  syncFrom(
    player: Player,
    visible: boolean,
    dt = 0,
    action: PlayerActionInput = { breaking: false },
  ): void {
    this.time += dt;
    const p = player.body.pos;
    const now = new THREE.Vector3(p.x, p.y, p.z);
    let snap = this.last === null;
    if (this.last && dt > 0) {
      const moved = Math.hypot(now.x - this.last.x, now.z - this.last.z);
      if (moved > TELEPORT_DISTANCE) {
        snap = true;
        this.speed = 0;
      } else {
        this.speed += (moved / dt - this.speed) * Math.min(1, dt * 12);
      }
    }
    this.last = now;
    this.walk += dt * (this.speed > MOVING_SPEED ? this.speed * 2.6 : 0);
    // 휘두르기가 끝나도 팔이 제자리로 돌아올 동안(ACTION_FADE) 마지막 자세를 붙잡아 튀지 않게 한다
    let swinging = false;
    if (this.swing) {
      this.swing.elapsed += dt;
      const dur = SWING_SECONDS[this.swing.kind];
      swinging = this.swing.elapsed < dur;
      if (this.swing.elapsed >= dur + (action.breaking ? 0 : ACTION_FADE)) this.swing = null;
    }
    this.breakHold = action.breaking ? ACTION_FADE : Math.max(0, this.breakHold - dt);
    const acting = swinging || action.breaking;
    this.actionWeight += ((acting ? 1 : 0) - this.actionWeight) * Math.min(1, dt * 18);
    const target = playerPose({
      speed: this.speed,
      phase: this.walk,
      time: this.time,
      onGround: player.body.onGround,
      verticalSpeed: player.body.velocity.y,
      breaking: this.breakHold > 0,
      swing: this.swing,
      actionWeight: this.actionWeight,
    });
    const d = this.blender.apply(target, dt, snap);
    this.object3d.position.set(p.x, p.y, p.z);
    this.object3d.rotation.set(0, player.yaw, 0);
    // 고개는 시선 피치를 조금 따라간다
    this.character.applyPose(d, player.pitch * 0.45);
    this.object3d.visible = visible;
  }
}
