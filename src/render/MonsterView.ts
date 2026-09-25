// 몬스터 모형 (MVP_SPEC 24·45.7, TASK-044, STYLE-007). 게임 상태는 읽기만 한다. 둥근 보라 꼬마 악당에 빛나는 눈, 걸을 때 통통 튄다.
// 파괴 중에는 앞으로 몸을 부딪치고, 공격받아 체력이 줄면 잠깐 붉게 번쩍인다(TASK-045 / 046 에서 쓰는 표현).
import * as THREE from 'three';
import { balance } from '../game/data/balance';
import type { Monster } from '../game/entities/Monster';
import { CRACK_STAGES, createCrackTexture } from './crackTexture';
import { monsterGeometry } from './furnitureModels';
import {
  createCrackMaterial,
  createEmissiveMaterial,
  createModelToonMaterial,
  createOutlineMaterial,
  createToonGradient,
} from './materials';

/** 몬스터 재질(공유): 툰 3 단·외곽선·맞았을 때의 붉은 번쩍임. */
let shared: { toon: THREE.Material; outline: THREE.Material; hurt: THREE.Material } | null = null;
function monsterMaterials(): {
  toon: THREE.Material;
  outline: THREE.Material;
  hurt: THREE.Material;
} {
  shared ??= {
    toon: createModelToonMaterial(createToonGradient(3)),
    outline: createOutlineMaterial(0x2a1d38, 0.014),
    hurt: createEmissiveMaterial(0xff4a3a),
  };
  return shared;
}

/**
 * 공격 동작: 공격 간격(1.5 초)마다 뒤로 움츠렸다가(−) 앞으로 달려든다(+). 1 이 가장 앞이다.
 * 실제 타격 시각은 CombatSystem 이 정하며 이 박자는 표현이다.
 */
function attackLunge(time: number): number {
  const t = (time % balance.monster.attackIntervalSeconds) / balance.monster.attackIntervalSeconds;
  if (t < 0.55) return -Math.sin((t / 0.55) * Math.PI) * 0.3;
  if (t < 0.7) return Math.sin(((t - 0.55) / 0.15) * (Math.PI / 2));
  return 1 - (t - 0.7) / 0.3;
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
  /** 부수기·공격 동작의 비중(0~1) */
  private breakWeight = 0;
  private attackWeight = 0;

  /** 모형을 만든다. 둥근 꼬마 악당 모형(STYLE-007)과 맞았을 때 번쩍이는 붉은 껍질. */
  constructor() {
    const g = monsterGeometry();
    const m = monsterMaterials();
    const body = new THREE.Mesh(g.body, m.toon);
    body.castShadow = true;
    body.receiveShadow = true;
    this.hurt = new THREE.Mesh(g.outline, m.hurt);
    this.hurt.scale.setScalar(1.06);
    this.hurt.visible = false;
    this.body.add(body, new THREE.Mesh(g.outline, m.outline), this.hurt);
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
    // 부수기·공격 동작의 비중을 부드럽게 옮겨 동작이 시작·끝날 때 몸이 튀지 않게 한다 (TASK-ANIM-001)
    const k = Math.min(1, dt * 10);
    this.breakWeight += ((m.action.kind === 'break' ? 1 : 0) - this.breakWeight) * k;
    this.attackWeight += ((m.action.kind === 'attack' ? 1 : 0) - this.attackWeight) * k;
    const bash = Math.max(0, Math.sin(this.time * 6)) * 0.35 * this.breakWeight;
    const lunge = attackLunge(this.time) * this.attackWeight;
    this.object3d.position.set(p.x, p.y, p.z);
    this.object3d.rotation.set(0, this.yaw, 0);
    this.body.position.set(0, hop + Math.max(0, lunge) * 0.08, -bash - lunge * 0.45);
    this.body.rotation.set(-bash * 0.6 - lunge * 0.5, 0, 0);
  }
}

/** 몬스터가 부수는 칸의 균열 상자 하나(단계는 파괴 진행도, 칸이 조금 흔들린다). */
class BreakMark {
  readonly mesh: THREE.Mesh;
  private readonly texture: THREE.Texture;

  /** 자기 균열 텍스처를 가진 상자를 만든다(단계 오프셋이 몬스터마다 다르다). */
  constructor() {
    this.texture = createCrackTexture();
    this.texture.repeat.set(1 / CRACK_STAGES, 1);
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.01, 1.01, 1.01),
      createCrackMaterial(this.texture),
    );
    this.mesh.visible = false;
  }

  /** 칸과 진행도(0~1)를 보인다. time 은 흔들림 위상이다. */
  show(cell: { x: number; y: number; z: number }, progress: number, time: number): void {
    const stage = Math.min(CRACK_STAGES, Math.floor(progress * CRACK_STAGES) + 1);
    this.texture.offset.set((stage - 1) / CRACK_STAGES, 0);
    const j = 0.025 + progress * 0.04;
    this.mesh.position.set(
      cell.x + 0.5 + Math.sin(time * 41) * j,
      cell.y + 0.5,
      cell.z + 0.5 + Math.cos(time * 37) * j,
    );
    this.mesh.visible = true;
  }
}

/** 모든 몬스터 모형. 새로 나온 몬스터를 만들고 사라진 몬스터를 뺀다. 부수는 칸에는 균열이 흔들린다. */
export class MonsterViews {
  readonly object3d = new THREE.Group();
  private readonly views = new Map<string, MonsterView>();
  private readonly marks: BreakMark[] = [];
  private time = 0;

  /** 몬스터 목록 조회를 받는다. */
  constructor(private readonly monsters: () => Iterable<Monster>) {}

  /** 매 프레임 부른다. */
  update(dt: number): void {
    this.time += dt;
    const seen = new Set<string>();
    let marks = 0;
    for (const m of this.monsters()) {
      seen.add(m.id);
      if (m.action.kind === 'break') {
        let mark = this.marks[marks];
        if (!mark) {
          mark = new BreakMark();
          this.marks.push(mark);
          this.object3d.add(mark.mesh);
        }
        mark.show(m.action.target, m.action.progress, this.time + marks);
        marks += 1;
      }
      let v = this.views.get(m.id);
      if (!v) {
        v = new MonsterView();
        this.views.set(m.id, v);
        this.object3d.add(v.object3d);
      }
      v.sync(m, dt);
    }
    for (let i = marks; i < this.marks.length; i++)
      (this.marks[i] as BreakMark).mesh.visible = false;
    for (const [id, v] of this.views) {
      if (seen.has(id)) continue;
      this.object3d.remove(v.object3d);
      this.views.delete(id);
    }
  }
}
