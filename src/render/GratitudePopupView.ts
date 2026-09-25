// 감사 포인트 +N 월드 공간 연출 (MVP_SPEC 22.2, ARCHITECTURE 16.2, TASK-035). 게임 상태는 읽기만 한다.
// 포인트가 생긴 좌표(침대 위·요리사 머리 위·식탁 위·방 위)에 +N 이 떠올라 사라진다. 어디서 나왔는지 보이게 하는 필수 연출이다.
// 글자를 선명하게 보이려고 DOM 요소를 카메라 투영 위치에 둔다(RoomLabelView 와 같은 방식).
import * as THREE from 'three';
import type { EventBus } from '../game/EventBus';
import type { GratitudeSource, Vec3 } from '../game/types';

/** 떠오르는 시간(초)과 높이(블록). */
const LIFE_SECONDS = 1.8;
const RISE = 1.1;
/** 동시에 보이는 최대 개수. 넘으면 오래된 것부터 지운다 */
const MAX_POPUPS = 24;

/** 떠오르는 글자 하나. */
interface Popup {
  readonly el: HTMLDivElement;
  readonly at: Vec3;
  age: number;
}

/** 출처별 짧은 설명. 숫자만으로 이유를 모를 때 돕는다. */
function reason(s: GratitudeSource): string {
  switch (s.kind) {
    case 'sleep':
      return '잘 잤어요';
    case 'cook':
      return '요리 완성';
    case 'eat':
      return '맛있게 먹었어요';
    case 'firstRoom':
      return '새 방';
    case 'gameEvent':
      return '';
    case 'debug':
      return '디버그';
  }
}

/** +N 연출 층. */
export class GratitudePopupView {
  private readonly root: HTMLDivElement;
  private readonly popups: Popup[] = [];
  private readonly v = new THREE.Vector3();

  /** parent 에 층을 붙이고 GRATITUDE_GAINED 를 구독한다. */
  constructor(
    parent: HTMLElement,
    events: EventBus,
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
      zIndex: '6',
    });
    parent.append(this.root);
    events.on('GRATITUDE_GAINED', (g) => this.add(g.amount, g.source, g.at));
  }

  /** 떠오르는 글자 하나를 만든다. */
  private add(amount: number, source: GratitudeSource, at: Vec3): void {
    const el = document.createElement('div');
    const why = reason(source);
    el.innerHTML = `<b>+${amount}</b>${why ? `<span style="font-size:11px;opacity:.85;margin-left:4px">${why}</span>` : ''}`;
    Object.assign(el.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      whiteSpace: 'nowrap',
      color: '#ffe08a',
      font: '700 18px system-ui, sans-serif',
      textShadow: '0 1px 2px rgba(40, 24, 0, 0.9), 0 0 6px rgba(255, 190, 80, 0.45)',
      willChange: 'transform, opacity',
    });
    this.root.append(el);
    this.popups.push({ el, at, age: 0 });
    while (this.popups.length > MAX_POPUPS) this.popups.shift()?.el.remove();
  }

  /** 매 프레임 부른다. 글자를 올리고 흐리게 하며 수명이 끝나면 지운다. 화면 밖·카메라 뒤면 숨긴다. */
  update(dt: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i] as Popup;
      p.age += dt;
      if (p.age >= LIFE_SECONDS) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      const t = p.age / LIFE_SECONDS;
      this.v.set(p.at.x, p.at.y + RISE * (1 - (1 - t) * (1 - t)), p.at.z).project(this.camera);
      const visible = this.v.z < 1 && Math.abs(this.v.x) <= 1.1 && Math.abs(this.v.y) <= 1.1;
      p.el.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      const x = (this.v.x * 0.5 + 0.5) * w;
      const y = (-this.v.y * 0.5 + 0.5) * h;
      const pop = t < 0.15 ? 0.7 + (t / 0.15) * 0.3 : 1;
      p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${pop})`;
      p.el.style.opacity = String(t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    }
  }
}
