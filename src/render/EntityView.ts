// 엔티티 표시 (ARCHITECTURE 12.2). Entity 를 읽어서 그리고 고치지 않는다.
// 플레이어 모형(관절 모형과 동작, TASK-ANIM-001). 주민은 NpcView, 몬스터는 MonsterView 다.
import * as THREE from 'three';
import type { Player } from '../game/entities/Player';
import { MOVING_SPEED, playerPose, PoseBlender, SWING_SECONDS } from './characterPose';
import { createCharacterMaterial } from './materials';

/** 상자 하나. (x, y, z) 는 상자 아랫면 가운데다. */
function box(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

/** 관절: 피벗 그룹에 매달린 상자. 피벗에서 아래로 늘어진다. */
function limb(
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
  px: number,
  py: number,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(px, py, 0);
  pivot.add(box(w, h, d, material, 0, -h, 0));
  return pivot;
}

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
 * 플레이어 모형: 다리·몸통·팔·머리 관절. 높이 1.8, 폭 0.6 안에 들어간다.
 * 걷기·달리기·점프·낙하와 파괴(반복 휘두르기)·설치·공격(한 번 휘두르기)을 그린다.
 */
export class PlayerView {
  readonly object3d = new THREE.Group();
  private readonly figure = new THREE.Group();
  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private readonly armL: THREE.Group;
  private readonly armR: THREE.Group;
  private readonly head = new THREE.Group();
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
    const cloth = createCharacterMaterial(0x4f7cac);
    const trousers = createCharacterMaterial(0x6b5a45);
    const skin = createCharacterMaterial(0xf0c8a0);
    const hair = createCharacterMaterial(0x5a3b24);
    const boots = createCharacterMaterial(0x4a3a2c);
    // 다리(엉덩이 피벗 y 0.72)
    this.legL = limb(0.21, 0.72, 0.24, trousers, -0.12, 0.72);
    this.legR = limb(0.21, 0.72, 0.24, trousers, 0.12, 0.72);
    for (const leg of [this.legL, this.legR])
      leg.add(box(0.23, 0.12, 0.27, boots, 0, -0.72, -0.01));
    const torso = box(0.52, 0.6, 0.3, cloth, 0, 0.7, 0);
    const belt = box(0.54, 0.07, 0.32, boots, 0, 0.72, 0);
    // 팔(어깨 피벗 y 1.28)
    this.armL = limb(0.14, 0.56, 0.16, cloth, -0.34, 1.28);
    this.armR = limb(0.14, 0.56, 0.16, cloth, 0.34, 1.28);
    for (const arm of [this.armL, this.armR]) arm.add(box(0.13, 0.1, 0.15, skin, 0, -0.64, 0));
    // 머리(목 피벗 y 1.3). 앞은 −z 다
    this.head.position.set(0, 1.3, 0);
    this.head.add(
      box(0.42, 0.42, 0.42, skin, 0, 0.02, 0),
      box(0.45, 0.1, 0.45, hair, 0, 0.4, 0),
      box(0.45, 0.24, 0.1, hair, 0, 0.2, 0.18),
    );
    this.figure.add(this.legL, this.legR, torso, belt, this.armL, this.armR, this.head);
    this.object3d.add(this.figure);
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
    this.figure.position.set(d.figurePos.x, d.figurePos.y, d.figurePos.z);
    this.figure.rotation.set(d.figureRot.x, d.figureRot.y, d.figureRot.z);
    this.legL.rotation.set(d.legL.x, d.legL.y, d.legL.z);
    this.legR.rotation.set(d.legR.x, d.legR.y, d.legR.z);
    this.armL.rotation.set(d.armL.x, d.armL.y, d.armL.z);
    this.armR.rotation.set(d.armR.x, d.armR.y, d.armR.z);
    // 고개는 시선 피치를 조금 따라간다
    this.head.rotation.set(d.head.x + player.pitch * 0.45, d.head.y, d.head.z);
    this.object3d.visible = visible;
  }
}
