// 방 경계 연출과 진단 표시 (TASK-021 / 022, MVP_SPEC 11.5 / 31). 게임 상태는 읽기만 한다.
//   인식 순간: 경계 두 층이 따뜻한 빛으로 한 번 빛나고 사라진다
//   해제 순간: 이전 경계가 붉게 세 번 깜빡이고 사라진다
//   진단 모드(Tab) 또는 "방 경계 상시 표시": 인식된 방의 경계를 초록으로 표시한다
//   진단 결과: 실패 좌표(붉은 큐브), 탐색 영역(바닥 타일), 탐색 경로(작은 큐브 줄), 가구 문제(주황)
import * as THREE from 'three';
import type { EventBus } from '../game/EventBus';
import type { RoomRegistry } from '../game/room/RoomRegistry';
import type { BlockPos, RoomDiagnostic, RoomShape } from '../game/types';
import { createRoomOverlayMaterial } from './materials';

/** 인식 빛남 시간(초). */
const GLOW_SECONDS = 1.3;
/** 해제 깜빡임 시간(초)과 횟수. */
const WARN_SECONDS = 1.2;
const WARN_BLINKS = 3;

/** 색. */
const COLOR = {
  glow: new THREE.Color(0xffe39a),
  warn: new THREE.Color(0xff4a3a),
  room: new THREE.Color(0x5fe08a),
  fail: new THREE.Color(0xff3b30),
  explored: new THREE.Color(0xff8a70),
  exploredOk: new THREE.Color(0x7ff0a0),
  trace: new THREE.Color(0xffd23a),
  issue: new THREE.Color(0xffa028),
} as const;

/** 한 번 재생하는 연출. */
interface Flash {
  readonly mesh: THREE.InstancedMesh;
  readonly kind: 'glow' | 'warn';
  age: number;
}

/** 칸 목록과 크기·높이로 인스턴스 메시를 만든다. */
function cellsMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  cells: readonly BlockPos[],
  color: THREE.Color,
  place: (c: BlockPos, m: THREE.Matrix4) => void,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, cells.length));
  const m = new THREE.Matrix4();
  cells.forEach((c, i) => {
    place(c, m);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color);
  });
  mesh.count = cells.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** 경계 두 층의 칸. */
function wallCells(shape: RoomShape): BlockPos[] {
  const out: BlockPos[] = [];
  for (const b of shape.boundary) {
    out.push(b, { x: b.x, y: b.y + 1, z: b.z });
  }
  return out;
}

/** 벽 칸을 살짝 키운 상자로 놓는다. */
function placeWall(c: BlockPos, m: THREE.Matrix4): void {
  m.makeScale(1.04, 1.04, 1.04).setPosition(c.x + 0.5, c.y + 0.5, c.z + 0.5);
}

/** 바닥 타일: 칸 바닥면 바로 위의 얇은 판. */
function placeTile(c: BlockPos, m: THREE.Matrix4): void {
  m.makeScale(0.92, 0.04, 0.92).setPosition(c.x + 0.5, c.y + 0.03, c.z + 0.5);
}

/** 경로 점: 칸 가운데 낮은 작은 큐브. */
function placeDot(c: BlockPos, m: THREE.Matrix4): void {
  m.makeScale(0.22, 0.22, 0.22).setPosition(c.x + 0.5, c.y + 0.25, c.z + 0.5);
}

/** 원인 칸: 살짝 키운 상자. */
function placeMarker(c: BlockPos, m: THREE.Matrix4): void {
  m.makeScale(1.08, 1.08, 1.08).setPosition(c.x + 0.5, c.y + 0.5, c.z + 0.5);
}

/** 진단 표시가 바뀌었는지 비교하는 서명. */
function diagnosticSignature(d: RoomDiagnostic | null): string {
  if (!d) return '';
  const f = d.detection.ok ? 'ok' : JSON.stringify(d.detection.failure);
  return `${d.start.x},${d.start.y},${d.start.z}|${f}|${d.explored.length}|${d.escapeTrace.length}|${d.facilityIssues.length}`;
}

/** 방 오버레이 뷰. */
export class RoomOverlayView {
  readonly object3d = new THREE.Group();
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly roomMaterial = createRoomOverlayMaterial(false);
  private readonly tileMaterial = createRoomOverlayMaterial(false);
  private readonly xrayMaterial = createRoomOverlayMaterial(true);
  private readonly flashes: Flash[] = [];
  /** 해제 연출을 위해 기억하는 마지막 형태 */
  private readonly shapes = new Map<string, RoomShape>();
  private readonly roomGroup = new THREE.Group();
  private readonly diagGroup = new THREE.Group();
  /** 이벤트에서 받아 다음 update 에 시작할 연출 */
  private readonly pending: (
    | { readonly kind: 'glow'; readonly roomId: string }
    | { readonly kind: 'warn'; readonly shape: RoomShape }
  )[] = [];
  private roomSignature = '';
  private diagSignature = '';
  private time = 0;

  /** 방 이벤트를 구독한다. 등록·타입 변경은 빛나고, 해제는 경고 깜빡임이다. */
  constructor(
    private readonly rooms: RoomRegistry,
    events: EventBus,
  ) {
    this.object3d.add(this.roomGroup, this.diagGroup);
    this.object3d.renderOrder = 5;
    // 이벤트 안에서는 기록만 한다. 메시 생성은 update(렌더 단계)에서 해 방 판정 예산에 섞이지 않게 한다
    const glow = (roomId: string): void => {
      this.pending.push({ kind: 'glow', roomId });
    };
    events.on('ROOM_REGISTERED', (p) => glow(p.roomId));
    events.on('ROOM_TYPE_CHANGED', (p) => glow(p.roomId));
    events.on('ROOM_UNREGISTERED', (p) => {
      const shape = this.shapes.get(p.roomId);
      this.shapes.delete(p.roomId);
      // 합병은 곧 새 방이 빛나므로 경고 깜빡임을 내지 않는다
      if (shape && p.reason.reason !== 'MERGED') this.pending.push({ kind: 'warn', shape });
    });
  }

  /**
   * 한 프레임을 갱신한다. showRooms 면 인식된 방 경계를 초록으로, diagnostic 이 있으면 진단 표시를 그린다.
   */
  update(dt: number, showRooms: boolean, diagnostic: RoomDiagnostic | null): void {
    this.time += dt;
    // 해제 이벤트 시점에는 방이 이미 없으므로 매 프레임 마지막 형태를 기억해 둔다(로드로 조용히 인식된 방 포함)
    for (const r of this.rooms.getAll()) this.shapes.set(r.id, r.shape);
    for (const p of this.pending.splice(0)) {
      if (p.kind === 'warn') {
        this.play('warn', p.shape);
        continue;
      }
      const room = this.rooms.getById(p.roomId);
      if (room) this.play('glow', room.shape);
    }
    this.updateFlashes(dt);
    this.updateRooms(showRooms);
    this.updateDiagnostic(diagnostic);
    const pulse = 0.55 + 0.25 * Math.sin(this.time * 6);
    this.xrayMaterial.opacity = pulse;
    this.roomMaterial.opacity = 0.22;
    this.tileMaterial.opacity = 0.35;
  }

  /** 연출 하나를 시작한다. */
  private play(kind: 'glow' | 'warn', shape: RoomShape): void {
    const cells = wallCells(shape);
    // 연출마다 투명도가 다르므로 재질을 따로 만든다(생성은 materials.ts). 끝나면 dispose 한다
    const material = createRoomOverlayMaterial(false);
    const mesh = cellsMesh(
      this.box,
      material,
      cells,
      kind === 'glow' ? COLOR.glow : COLOR.warn,
      placeWall,
    );
    mesh.renderOrder = 6;
    this.object3d.add(mesh);
    this.flashes.push({ mesh, kind, age: 0 });
  }

  /** 진행 중 연출의 투명도를 바꾸고 끝난 것을 지운다. */
  private updateFlashes(dt: number): void {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i] as Flash;
      f.age += dt;
      const material = f.mesh.material as THREE.MeshBasicMaterial;
      if (f.kind === 'glow') {
        const t = f.age / GLOW_SECONDS;
        // 빠르게 밝아졌다가 천천히 사라진다
        material.opacity = t < 0.15 ? (t / 0.15) * 0.75 : 0.75 * Math.max(0, 1 - (t - 0.15) / 0.85);
        if (t >= 1) this.dispose(i);
      } else {
        const t = f.age / WARN_SECONDS;
        const blink = Math.sin(t * WARN_BLINKS * Math.PI) ** 2;
        material.opacity = 0.7 * blink * (1 - t * 0.4);
        if (t >= 1) this.dispose(i);
      }
    }
  }

  /** 연출을 지운다. */
  private dispose(index: number): void {
    const f = this.flashes[index] as Flash;
    this.object3d.remove(f.mesh);
    (f.mesh.material as THREE.Material).dispose();
    f.mesh.dispose();
    this.flashes.splice(index, 1);
  }

  /** 인식된 방 경계. 방 목록이 바뀌었을 때만 다시 만든다. */
  private updateRooms(show: boolean): void {
    const rooms = show ? this.rooms.getAll() : [];
    const sig = rooms
      .map((r) => `${r.id}:${r.shape.interior.length}:${r.shape.boundary.length}:${r.dirty}`)
      .join(';');
    if (sig === this.roomSignature) return;
    this.roomSignature = sig;
    this.clear(this.roomGroup);
    for (const r of rooms) {
      this.roomGroup.add(
        cellsMesh(this.box, this.roomMaterial, wallCells(r.shape), COLOR.room, placeWall),
      );
    }
  }

  /** 진단 결과 표시. 결과가 바뀌었을 때만 다시 만든다. */
  private updateDiagnostic(d: RoomDiagnostic | null): void {
    const sig = diagnosticSignature(d);
    if (sig === this.diagSignature) return;
    this.diagSignature = sig;
    this.clear(this.diagGroup);
    if (!d) return;
    const ok = d.detection.ok;
    this.diagGroup.add(
      cellsMesh(
        this.box,
        this.tileMaterial,
        d.explored,
        ok ? COLOR.exploredOk : COLOR.explored,
        placeTile,
      ),
    );
    if (d.escapeTrace.length > 0) {
      this.diagGroup.add(
        cellsMesh(this.box, this.xrayMaterial, d.escapeTrace, COLOR.trace, placeDot),
      );
    }
    if (!d.detection.ok && 'at' in d.detection.failure) {
      this.diagGroup.add(
        cellsMesh(this.box, this.xrayMaterial, [d.detection.failure.at], COLOR.fail, placeMarker),
      );
    }
    if (d.facilityIssues.length > 0) {
      this.diagGroup.add(
        cellsMesh(
          this.box,
          this.xrayMaterial,
          d.facilityIssues.map((i) => i.at),
          COLOR.issue,
          placeMarker,
        ),
      );
    }
  }

  /** 그룹의 인스턴스 메시를 지운다. 공유 재질·형상은 남긴다. */
  private clear(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child);
      if (child instanceof THREE.InstancedMesh) child.dispose();
    }
  }
}
