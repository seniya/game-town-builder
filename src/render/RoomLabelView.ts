// 방 이름 월드 공간 라벨 (TASK-021, MVP_SPEC 29.2 / 31). 게임 상태는 읽기만 한다.
// 글자를 선명하게 보이려고 DOM 요소를 카메라 투영 위치에 둔다. 투영 계산 때문에 render 에 있다.
//   평소: 반투명, 거리에 따라 페이드 / 진단 모드: 불투명 + 테두리
//   인식·타입 변경: 이름이 떠오른다 / 해제: 붉게 바뀌며 사라진다
//   여러 방: 가까운 라벨부터 놓고, 겹치면 위로 비키고, 그래도 겹치면 숨긴다
import * as THREE from 'three';
import { roomDisplayName } from '../game/data/roomRecipes';
import type { EventBus } from '../game/EventBus';
import type { RoomRegistry } from '../game/room/RoomRegistry';
import type { Room } from '../game/types';

/** 라벨이 완전히 보이는 거리와 사라지는 거리(블록). */
const FADE_NEAR = 14;
const FADE_FAR = 48;
/** 평소 최대 불투명도. */
const IDLE_OPACITY = 0.78;
/** 떠오름·사라짐 시간(초). */
const POP_SECONDS = 0.9;
const LEAVE_SECONDS = 1.1;
/** 방 바닥에서 라벨까지의 높이. 벽 두 칸 위다 */
const LABEL_HEIGHT = 2.7;

/** 라벨 하나의 상태. */
interface Label {
  readonly el: HTMLDivElement;
  readonly world: THREE.Vector3;
  text: string;
  /** 떠오름 경과(초). null 이면 정지 */
  pop: number | null;
  /** 사라짐 경과(초). null 이면 살아 있다 */
  leave: number | null;
}

/** 화면 사각형. */
interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 두 사각형이 겹치는가. */
function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** 방 라벨 뷰. */
export class RoomLabelView {
  private readonly root: HTMLDivElement;
  private readonly labels = new Map<string, Label>();
  private readonly v = new THREE.Vector3();
  /** 다음 update 에 떠오르게 할 방 */
  private readonly pops: string[] = [];

  /** parent 에 라벨 층을 붙이고 방 이벤트를 구독한다. */
  constructor(
    parent: HTMLElement,
    private readonly rooms: RoomRegistry,
    events: EventBus,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
      zIndex: '5',
    });
    parent.append(this.root);
    // 이벤트 안에서는 기록만 하고 DOM 은 update 에서 만든다(방 판정 예산에 섞이지 않게)
    events.on('ROOM_REGISTERED', (p) => this.pops.push(p.roomId));
    events.on('ROOM_TYPE_CHANGED', (p) => this.pops.push(p.roomId));
    events.on('ROOM_UNREGISTERED', (p) => {
      const l = this.labels.get(p.roomId);
      if (l) l.leave = 0;
    });
  }

  /** 라벨 위치·투명도를 갱신한다. diagnosis 면 불투명 + 테두리다. */
  update(dt: number, diagnosis: boolean): void {
    for (const id of this.pops.splice(0)) this.popIn(id);
    for (const room of this.rooms.getAll()) this.ensure(room);
    const width = window.innerWidth;
    const height = window.innerHeight;
    const camPos = this.camera.position;
    const visible: { label: Label; dist: number; sx: number; sy: number }[] = [];
    for (const [id, label] of this.labels) {
      if (label.leave !== null) {
        label.leave += dt;
        if (label.leave >= LEAVE_SECONDS) {
          label.el.remove();
          this.labels.delete(id);
          continue;
        }
      } else if (!this.rooms.getById(id)) {
        label.leave = 0;
      }
      if (label.pop !== null) {
        label.pop += dt;
        if (label.pop >= POP_SECONDS) label.pop = null;
      }
      this.v.copy(label.world).project(this.camera);
      const dist = camPos.distanceTo(label.world);
      if (this.v.z > 1 || this.v.z < -1 || dist > FADE_FAR) {
        label.el.style.display = 'none';
        continue;
      }
      visible.push({
        label,
        dist,
        sx: (this.v.x * 0.5 + 0.5) * width,
        sy: (-this.v.y * 0.5 + 0.5) * height,
      });
    }
    // 가까운 라벨이 먼저 자리를 차지한다
    visible.sort((a, b) => a.dist - b.dist);
    const placed: Rect[] = [];
    for (const item of visible) {
      const el = item.label.el;
      el.style.display = 'block';
      const w = el.offsetWidth || 60;
      const h = el.offsetHeight || 24;
      let y = item.sy;
      let rect: Rect | null = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = { x0: item.sx - w / 2, y0: y - h, x1: item.sx + w / 2, y1: y };
        if (!placed.some((p) => overlaps(p, r))) {
          rect = r;
          break;
        }
        y -= h + 2;
      }
      if (!rect) {
        el.style.display = 'none';
        continue;
      }
      placed.push(rect);
      this.style(item.label, item.dist, diagnosis, rect);
    }
  }

  /** 라벨의 위치·투명도·연출을 적용한다. */
  private style(label: Label, dist: number, diagnosis: boolean, rect: Rect): void {
    const fade = 1 - Math.min(1, Math.max(0, (dist - FADE_NEAR) / (FADE_FAR - FADE_NEAR)));
    let opacity = diagnosis ? 1 : IDLE_OPACITY * fade;
    let scale = 1;
    let lift = 0;
    if (label.pop !== null) {
      const t = label.pop / POP_SECONDS;
      // 아래에서 떠오르며 살짝 커졌다가 제자리
      scale = 1 + 0.35 * Math.sin(Math.min(1, t) * Math.PI);
      lift = (1 - Math.min(1, t * 2)) * 14;
      opacity = Math.max(opacity, 1 - t * (1 - opacity));
    }
    const leaving = label.leave !== null;
    if (leaving) {
      const t = (label.leave as number) / LEAVE_SECONDS;
      opacity = (1 - t) * Math.max(opacity, 0.9);
      lift = -t * 10;
    }
    const el = label.el;
    el.style.opacity = opacity.toFixed(3);
    el.style.transform = `translate(${rect.x0.toFixed(1)}px, ${(rect.y0 + lift).toFixed(1)}px) scale(${scale.toFixed(3)})`;
    el.style.background = leaving ? 'rgba(120, 20, 16, 0.78)' : 'rgba(28, 24, 18, 0.62)';
    el.style.color = leaving ? '#ffd6cf' : '#fff4d6';
    el.style.outline = diagnosis ? '2px solid #5fe08a' : 'none';
  }

  /** 방의 라벨을 만들거나 글자·위치를 맞춘다. */
  private ensure(room: Room): Label {
    let label = this.labels.get(room.id);
    const text = roomDisplayName(room.type);
    if (!label) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        padding: '3px 10px',
        borderRadius: '10px',
        font: '600 15px system-ui, sans-serif',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
        transformOrigin: '50% 100%',
        textShadow: '0 1px 2px rgba(0,0,0,0.6)',
        display: 'none',
      });
      this.root.append(el);
      label = { el, world: new THREE.Vector3(), text: '', pop: null, leave: null };
      this.labels.set(room.id, label);
    }
    if (label.text !== text) {
      label.text = text;
      label.el.textContent = text;
    }
    label.world.set(room.center.x + 0.5, room.shape.floorY + LABEL_HEIGHT, room.center.z + 0.5);
    return label;
  }

  /** 라벨을 떠오르게 한다. */
  private popIn(roomId: string): void {
    const room = this.rooms.getById(roomId);
    if (!room) return;
    const label = this.ensure(room);
    label.pop = 0;
    label.leave = null;
  }
}
