// 플레이어 체력 (MVP_SPEC 29 "좌측 하단", 26.1, TASK-046). DOM 만 쓴다. 맞으면 잠깐 붉게 번쩍인다.
import type { EventBus } from '../game/EventBus';

/** 좌측 하단 체력 막대. */
export class HealthHud {
  private readonly root: HTMLDivElement;
  private readonly bar: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private shown = -1;

  /** parent 에 붙이고 피격을 구독한다. health / max 는 현재 체력 조회다. */
  constructor(
    parent: HTMLElement,
    private readonly health: () => number,
    private readonly max: number,
    events: EventBus,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '12px',
      bottom: '44px',
      width: '180px',
      padding: '5px 8px',
      borderRadius: '6px',
      background: 'rgba(20, 22, 26, 0.55)',
      pointerEvents: 'none',
      transition: 'box-shadow 0.25s',
      zIndex: '20',
    });
    const track = document.createElement('div');
    Object.assign(track.style, {
      height: '8px',
      borderRadius: '4px',
      background: 'rgba(255,255,255,0.18)',
    });
    this.bar = document.createElement('div');
    Object.assign(this.bar.style, {
      height: '100%',
      borderRadius: '4px',
      background: '#e0584a',
      transition: 'width 0.2s',
    });
    track.append(this.bar);
    this.text = document.createElement('div');
    Object.assign(this.text.style, {
      color: '#f4efe2',
      font: '600 12px system-ui, sans-serif',
      marginBottom: '3px',
    });
    this.root.append(this.text, track);
    parent.append(this.root);
    events.on('COMBAT_HIT', (h) => {
      if (h.target !== 'player') return;
      this.root.style.boxShadow = '0 0 0 2px #ff5a4a, 0 0 16px rgba(255, 70, 50, 0.7)';
      setTimeout(() => (this.root.style.boxShadow = 'none'), 250);
    });
  }

  /** 매 프레임 부른다. 값이 바뀔 때만 고친다. */
  update(): void {
    const h = this.health();
    if (h === this.shown) return;
    this.shown = h;
    this.text.textContent = `체력 ${h} / ${this.max}`;
    this.bar.style.width = `${Math.max(0, (100 * h) / this.max)}%`;
  }
}
