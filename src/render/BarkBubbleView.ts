// 주민의 한마디 말풍선 (MVP_SPEC 19.7, ARCHITECTURE 21.4, TASK-BARK-001, ADR 042). 게임 상태는 읽기만 한다.
// NPC_BARK 를 받아 그 주민의 머리 위에 짧은 말풍선을 띄운다. 모달이 아니다.
// 한글을 선명하게 보이려고 DOM 요소를 카메라 투영 위치에 둔다(GratitudePopupView·RoomLabelView 와 같은 방식).
import * as THREE from 'three';
import type { EventBus } from '../game/EventBus';
import type { Vec3 } from '../game/types';

/** 보이는 시간(초)과 끝에서 흐려지는 시간(초). */
const LIFE_SECONDS = 3.5;
const FADE_SECONDS = 0.5;
/** 카메라에서 이보다 먼 주민의 말풍선은 숨긴다(칸) */
const SHOW_DISTANCE = 22;
/** 동시에 보이는 최대 개수(가까운 순) */
const MAX_VISIBLE = 4;
/** 발에서 말풍선 꼬리까지 높이(칸). 머리 위 "!" 표시(2.35)보다 위다 */
const ANCHOR_HEIGHT = 2.65;
/** 겹친 말풍선을 위로 올릴 때 사이 간격(px) */
const STACK_GAP = 4;

/** 말풍선 하나. 주민마다 하나이며 새 말이 오면 글자를 바꾼다. */
interface Bubble {
  readonly el: HTMLDivElement;
  readonly text: HTMLSpanElement;
  age: number;
}

/** 말풍선 층. */
export class BarkBubbleView {
  private readonly root: HTMLDivElement;
  private readonly bubbles = new Map<string, Bubble>();
  private readonly v = new THREE.Vector3();

  /** parent 에 층을 붙이고 NPC_BARK 를 구독한다. npcPos 는 주민 발 위치 조회다. */
  constructor(
    parent: HTMLElement,
    events: EventBus,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly npcPos: (npcId: string) => Vec3 | undefined,
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
    events.on('NPC_BARK', (b) => this.show(b.npcId, b.text));
  }

  /** 이 주민의 말풍선을 띄운다. 이미 있으면 글자를 바꾸고 처음부터 보인다. */
  private show(npcId: string, text: string): void {
    let b = this.bubbles.get(npcId);
    if (!b) {
      b = this.create();
      this.bubbles.set(npcId, b);
    }
    b.text.textContent = text;
    b.age = 0;
  }

  /** 말풍선 요소(둥근 상자 + 아래 꼬리)를 만든다. */
  private create(): Bubble {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      display: 'none',
      willChange: 'transform, opacity',
    });
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'relative',
      maxWidth: '220px',
      padding: '5px 10px',
      borderRadius: '12px',
      background: 'rgba(255, 251, 240, 0.95)',
      color: '#3a2a18',
      font: '600 14px/1.35 system-ui, sans-serif',
      whiteSpace: 'nowrap',
      boxShadow: '0 2px 6px rgba(40, 24, 0, 0.35)',
    });
    const text = document.createElement('span');
    const tail = document.createElement('div');
    Object.assign(tail.style, {
      position: 'absolute',
      left: '50%',
      bottom: '-6px',
      width: '0',
      height: '0',
      marginLeft: '-6px',
      borderLeft: '6px solid transparent',
      borderRight: '6px solid transparent',
      borderTop: '7px solid rgba(255, 251, 240, 0.95)',
    });
    box.append(text, tail);
    el.append(box);
    this.root.append(el);
    return { el, text, age: 0 };
  }

  /**
   * 매 프레임 부른다. 수명이 끝난 말풍선을 지우고, 남은 것은 머리 위로 옮긴다.
   * 카메라에서 먼 것·화면 밖·카메라 뒤는 숨기고, 가까운 순으로 MAX_VISIBLE 개만 보인다.
   */
  update(dt: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cam = this.camera.position;
    const shown: { b: Bubble; d: number; x: number; y: number }[] = [];
    for (const [id, b] of this.bubbles) {
      b.age += dt;
      const p = this.npcPos(id);
      if (b.age >= LIFE_SECONDS || !p) {
        b.el.remove();
        this.bubbles.delete(id);
        continue;
      }
      b.el.style.display = 'none';
      const d = Math.hypot(p.x - cam.x, p.y - cam.y, p.z - cam.z);
      if (d > SHOW_DISTANCE) continue;
      this.v.set(p.x, p.y + ANCHOR_HEIGHT, p.z).project(this.camera);
      if (this.v.z >= 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) continue;
      shown.push({ b, d, x: (this.v.x * 0.5 + 0.5) * w, y: (-this.v.y * 0.5 + 0.5) * h });
    }
    shown.sort((a, b) => a.d - b.d);
    // 가까운 것부터 자리를 잡고, 이미 놓인 말풍선과 겹치면 위로 올린다(아래 끝 = 꼬리 위치)
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    for (const s of shown.slice(0, MAX_VISIBLE)) {
      const t = s.b.age;
      const pop = t < 0.12 ? 0.75 + (t / 0.12) * 0.25 : 1;
      const left = LIFE_SECONDS - t;
      s.b.el.style.display = 'block';
      const bw = s.b.el.offsetWidth;
      const bh = s.b.el.offsetHeight;
      let y = s.y;
      // 올린 자리가 다른 말풍선과 다시 겹칠 수 있어 겹침이 없을 때까지(최대 놓인 수만큼) 되풀이한다
      for (let pass = 0; pass <= placed.length; pass++) {
        const hit = placed.find(
          (o) => s.x - bw / 2 < o.r && s.x + bw / 2 > o.l && y - bh < o.b && y > o.t,
        );
        if (!hit) break;
        y = hit.t - STACK_GAP;
      }
      placed.push({ l: s.x - bw / 2, r: s.x + bw / 2, t: y - bh, b: y });
      s.b.el.style.opacity = String(left < FADE_SECONDS ? left / FADE_SECONDS : 1);
      s.b.el.style.transform = `translate(${s.x}px, ${y}px) translate(-50%, -100%) scale(${pop})`;
    }
  }
}
