// 몬스터 모형 (MVP_SPEC 24, TASK-044). 게임 상태는 읽기만 한다. 어두운 보라 몸통에 빛나는 눈, 걸을 때 통통 튄다.
// 파괴 중에는 앞으로 몸을 부딪치고, 공격받아 체력이 줄면 잠깐 붉게 번쩍인다(TASK-045 / 046 에서 쓰는 표현).
import * as THREE from 'three';
import type { Monster } from '../game/entities/Monster';
import { createCharacterMaterial, createEmissiveMaterial } from './materials';

/** 색 → 재질(몬스터 모형끼리 공유). */
const cache = new Map<number, THREE.Material>();
function mat(color: number): THREE.Material {
  let m = cache.get(color);
  if (!m) {
    m = createCharacterMaterial(color);
    cache.set(color, m);
  }
  return m;
}

/** 빛나는 눈 재질(공유). */
let eyeMat: THREE.Material | null = null;

/** 상자 하나. (x, y, z) 는 아랫면 가운데다. */
function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

/** 몬스터 한 마리의 모형. */
class MonsterView {
  readonly object3d = new THREE.Group();
  private readonly body = new THREE.Group();
  private time = Math.random() * 10;
  private yaw = 0;
  private last: THREE.Vector3 | null = null;
  private lastHealth = -1;
  private flash = 0;
  private readonly hurt: THREE.Mesh;

  /** 모형을 만든다. */
  constructor() {
    const torso = box(0.9, 0.9, 0.8, 0x3b2a4d, 0, 0.05, 0);
    const belly = box(0.7, 0.5, 0.05, 0x52406a, 0, 0.2, -0.41);
    eyeMat ??= createEmissiveMaterial(0xffe05a);
    const eyeL = box(0.14, 0.14, 0.05, 0xffe05a, -0.2, 0.62, -0.41);
    const eyeR = box(0.14, 0.14, 0.05, 0xffe05a, 0.2, 0.62, -0.41);
    eyeL.material = eyeMat;
    eyeR.material = eyeMat;
    const hornL = box(0.12, 0.25, 0.12, 0x2a1d38, -0.3, 0.95, 0);
    const hornR = box(0.12, 0.25, 0.12, 0x2a1d38, 0.3, 0.95, 0);
    this.hurt = box(0.95, 0.95, 0.85, 0xff4a3a, 0, 0.03, 0);
    this.hurt.visible = false;
    this.body.add(torso, belly, eyeL, eyeR, hornL, hornR, this.hurt);
    this.object3d.add(this.body);
  }

  /** 엔티티를 읽어 위치·방향·동작을 맞춘다. */
  sync(m: Monster, dt: number): void {
    this.time += dt;
    const p = m.body.pos;
    const now = new THREE.Vector3(p.x, p.y, p.z);
    let moving = false;
    if (this.last && dt > 0) {
      const dx = now.x - this.last.x;
      const dz = now.z - this.last.z;
      moving = Math.hypot(dx, dz) / dt > 0.3;
      if (Math.hypot(dx, dz) > 1e-4) {
        const target = Math.atan2(-dx, -dz);
        this.yaw +=
          Math.atan2(Math.sin(target - this.yaw), Math.cos(target - this.yaw)) *
          Math.min(1, dt * 8);
      }
    }
    this.last = now;
    if (this.lastHealth >= 0 && m.health < this.lastHealth) this.flash = 0.25;
    this.lastHealth = m.health;
    this.flash = Math.max(0, this.flash - dt);
    this.hurt.visible = this.flash > 0;
    const hop = moving ? Math.abs(Math.sin(this.time * 9)) * 0.12 : Math.sin(this.time * 2) * 0.02;
    const bash = m.action.kind === 'break' ? Math.max(0, Math.sin(this.time * 6)) * 0.35 : 0;
    this.object3d.position.set(p.x, p.y, p.z);
    this.object3d.rotation.set(0, this.yaw, 0);
    this.body.position.set(0, hop, -bash);
    this.body.rotation.set(-bash * 0.6, 0, 0);
  }
}

/** 모든 몬스터 모형. 새로 나온 몬스터를 만들고 사라진 몬스터를 뺀다. */
export class MonsterViews {
  readonly object3d = new THREE.Group();
  private readonly views = new Map<string, MonsterView>();

  /** 몬스터 목록 조회를 받는다. */
  constructor(private readonly monsters: () => Iterable<Monster>) {}

  /** 매 프레임 부른다. */
  update(dt: number): void {
    const seen = new Set<string>();
    for (const m of this.monsters()) {
      seen.add(m.id);
      let v = this.views.get(m.id);
      if (!v) {
        v = new MonsterView();
        this.views.set(m.id, v);
        this.object3d.add(v.object3d);
      }
      v.sync(m, dt);
    }
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.object3d.remove(v.object3d);
      this.views.delete(id);
    }
  }
}
