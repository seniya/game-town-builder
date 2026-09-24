// 감사 포인트 HUD (MVP_SPEC 22.2 / 29, TASK-035). 시계 아래에 합계를 보이고 얻을 때 잠깐 부푼다. 게임 상태를 소유하지 않는다.
import type { EventBus } from '../game/EventBus';

/** 부풂 시간(초). */
const BUMP_SECONDS = 0.6;

/** 우측 상단 시계 아래의 감사 포인트 합계. */
export class GratitudeHud {
  private readonly root: HTMLDivElement;
  private shown = -1;
  private bump = BUMP_SECONDS;

  /** parent 에 HUD 를 붙이고 포인트 획득을 구독한다. total 은 현재 합계 조회다. */
  constructor(
    parent: HTMLElement,
    private readonly total: () => number,
    events: EventBus,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      right: '12px',
      top: '42px',
      padding: '3px 10px',
      borderRadius: '6px',
      background: 'rgba(20, 22, 26, 0.55)',
      color: '#ffe3a3',
      font: '600 14px system-ui, sans-serif',
      pointerEvents: 'none',
      transformOrigin: 'right center',
      zIndex: '20',
    });
    parent.append(this.root);
    events.on('GRATITUDE_GAINED', () => void (this.bump = 0));
  }

  /** 매 프레임 부른다. 합계가 바뀌면 글자를 고치고 부풂을 진행한다. */
  update(dt: number): void {
    const t = this.total();
    if (t !== this.shown) {
      this.shown = t;
      this.root.textContent = `감사 ${t}`;
    }
    if (this.bump < BUMP_SECONDS) {
      this.bump += dt;
      const k = Math.max(0, 1 - this.bump / BUMP_SECONDS);
      this.root.style.transform = `scale(${1 + 0.25 * Math.sin(k * Math.PI)})`;
    } else if (this.root.style.transform !== '') {
      this.root.style.transform = '';
    }
  }
}
