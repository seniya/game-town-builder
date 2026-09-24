// 종 연출의 빛 (MVP_SPEC 23.3, ADR 033, TASK-036). 레벨이 오르면 종 둘레로 금빛 고리가 퍼지고 기둥 빛이 잠깐 선다.
// 복셀 셰이더는 자체 점광원만 받으므로 가산 합성 모형으로 그린다. 게임 상태는 읽기만 한다.
import * as THREE from 'three';
import type { EventBus } from '../game/EventBus';
import type { BlockPos } from '../game/types';
import { createGlowMaterial } from './materials';

/** 연출 길이(초)와 고리가 퍼지는 반지름. */
const SECONDS = 2.4;
const RADIUS = 7;

/** 종 빛 연출. */
export class BellRingView {
  readonly object3d = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly pillar: THREE.Mesh;
  private readonly ringMat = createGlowMaterial(0xffd35a);
  private readonly pillarMat = createGlowMaterial(0xfff0b0);
  private age = SECONDS;

  /** 종 칸(없으면 연출 없음)과 이벤트를 받는다. */
  constructor(
    private readonly bell: BlockPos | null,
    events: EventBus,
  ) {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.9, 8, 16, 1, true),
      this.pillarMat,
    );
    this.object3d.add(this.ring, this.pillar);
    this.object3d.visible = false;
    if (bell) this.object3d.position.set(bell.x + 0.5, bell.y + 0.05, bell.z + 0.5);
    events.on('VILLAGE_LEVEL_UP', () => {
      if (this.bell) this.age = 0;
    });
  }

  /** 매 프레임 부른다. */
  update(dt: number): void {
    if (this.age >= SECONDS) {
      this.object3d.visible = false;
      return;
    }
    this.age += dt;
    const t = Math.min(1, this.age / SECONDS);
    this.object3d.visible = true;
    const r = 0.5 + RADIUS * (1 - (1 - t) * (1 - t));
    this.ring.scale.set(r, r, 1);
    this.ringMat.opacity = 0.75 * (1 - t);
    this.pillar.position.y = 4;
    this.pillar.scale.set(1 + t * 0.5, 1, 1 + t * 0.5);
    this.pillarMat.opacity = 0.35 * Math.sin(Math.min(1, t * 1.6) * Math.PI);
  }
}
