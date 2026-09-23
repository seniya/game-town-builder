// "통행 가능 셀 표시" 디버그 오버레이 (ARCHITECTURE 26, TASK-024). 게임 상태는 읽기만 한다.
// 기준점 주변의 NPC 가 설 수 있는 칸을 얇은 판으로 그린다. 몬스터에게 막히는 칸(문)은 색을 달리한다.
// 그리고 NPC 경로를 점 줄로 보여 준다. 매 프레임이 아니라 일정 간격으로 다시 모은다.
import * as THREE from 'three';
import type { NavigationGraph } from '../game/nav/NavigationGraph';
import type { BlockPos, Vec3 } from '../game/types';
import { createRoomOverlayMaterial } from './materials';

/** 다시 모으는 간격(초). */
const REFRESH_SECONDS = 0.4;
/** 기준점에서 수평·수직으로 살피는 범위. */
const RADIUS = 18;
const HEIGHT = 6;
/** 인스턴스 상한. 범위 전체가 설 수 있는 칸이어도 넘지 않는다. */
const MAX_CELLS = (RADIUS * 2 + 1) ** 2 * 2;
const MAX_PATH_DOTS = 2048;

/** 기준점 주변 통행 셀과 NPC 경로를 표시한다. */
export class NavOverlayView {
  readonly object3d = new THREE.Group();
  private readonly cells: THREE.InstancedMesh;
  private readonly dots: THREE.InstancedMesh;
  private sinceRefresh = REFRESH_SECONDS;
  private readonly m = new THREE.Matrix4();
  private readonly npcOnly = new THREE.Color(0x6aa8ff);
  private readonly both = new THREE.Color(0x7ff0a0);
  private readonly pathColor = new THREE.Color(0xffd23a);

  /** 통행 그래프를 받는다. */
  constructor(private readonly nav: NavigationGraph) {
    this.cells = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      createRoomOverlayMaterial(false),
      MAX_CELLS,
    );
    this.dots = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      createRoomOverlayMaterial(true),
      MAX_PATH_DOTS,
    );
    for (const mesh of [this.cells, this.dots]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.object3d.add(mesh);
    }
    this.object3d.visible = false;
  }

  /**
   * 매 프레임 부른다. 꺼져 있으면 숨기기만 한다.
   * center 는 살필 기준점(플레이어 발 또는 카메라 목표), paths 는 표시할 NPC 경로들이다.
   */
  update(
    dt: number,
    enabled: boolean,
    center: Vec3,
    paths: readonly (readonly BlockPos[])[],
  ): void {
    this.object3d.visible = enabled;
    if (!enabled) {
      this.sinceRefresh = REFRESH_SECONDS;
      return;
    }
    this.sinceRefresh += dt;
    if (this.sinceRefresh < REFRESH_SECONDS) return;
    this.sinceRefresh = 0;
    this.collect(center);
    this.collectPaths(paths);
  }

  /** 기준점 주변의 설 수 있는 칸을 모은다. */
  private collect(center: Vec3): void {
    const cx = Math.floor(center.x);
    const cy = Math.floor(center.y);
    const cz = Math.floor(center.z);
    let n = 0;
    for (let x = cx - RADIUS; x <= cx + RADIUS && n < MAX_CELLS; x++) {
      for (let z = cz - RADIUS; z <= cz + RADIUS && n < MAX_CELLS; z++) {
        for (let y = cy - HEIGHT; y <= cy + HEIGHT && n < MAX_CELLS; y++) {
          const p = { x, y, z };
          if (!this.nav.isStandable(p, 'npc')) continue;
          this.m.makeScale(0.78, 0.03, 0.78).setPosition(x + 0.5, y + 0.03, z + 0.5);
          this.cells.setMatrixAt(n, this.m);
          this.cells.setColorAt(n, this.nav.isStandable(p, 'monster') ? this.both : this.npcOnly);
          n += 1;
        }
      }
    }
    this.cells.count = n;
    this.cells.instanceMatrix.needsUpdate = true;
    if (this.cells.instanceColor) this.cells.instanceColor.needsUpdate = true;
  }

  /** 경로 칸을 작은 점으로 놓는다. */
  private collectPaths(paths: readonly (readonly BlockPos[])[]): void {
    let n = 0;
    for (const path of paths) {
      for (const c of path) {
        if (n >= MAX_PATH_DOTS) break;
        this.m.makeScale(0.2, 0.2, 0.2).setPosition(c.x + 0.5, c.y + 0.15, c.z + 0.5);
        this.dots.setMatrixAt(n, this.m);
        this.dots.setColorAt(n, this.pathColor);
        n += 1;
      }
    }
    this.dots.count = n;
    this.dots.instanceMatrix.needsUpdate = true;
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true;
  }
}
