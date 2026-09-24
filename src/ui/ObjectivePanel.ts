// 목표 한 줄 (MVP_SPEC 29 "좌측 상단. 한 줄", ARCHITECTURE 21.3, TASK-041). DOM 만 쓴다. 게임 상태를 소유하지 않는다.
// OBJECTIVE_CHANGED 를 받아 문구와 진행 수치를 보이고, 문구가 바뀔 때 잠깐 빛나게 강조한다.
import type { EventBus } from '../game/EventBus';

/** 강조 시간(ms). */
const HIGHLIGHT_MS = 1600;

/** 좌측 상단 목표. */
export class ObjectivePanel {
  private readonly root: HTMLDivElement;
  private text = '';

  /** parent 에 붙이고 목표 변경을 구독한다. 처음에는 숨겨져 있다. */
  constructor(parent: HTMLElement, events: EventBus) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '12px',
      top: '10px',
      maxWidth: 'calc(100vw - 260px)',
      padding: '5px 12px',
      borderRadius: '6px',
      background: 'rgba(20, 22, 26, 0.55)',
      color: '#f4efe2',
      font: '600 15px system-ui, sans-serif',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      pointerEvents: 'none',
      display: 'none',
      transition: 'box-shadow 0.4s, background 0.4s',
      zIndex: '20',
    });
    parent.append(this.root);
    events.on('OBJECTIVE_CHANGED', (o) => {
      const line = o.progress ? `${o.text} (${o.progress.current} / ${o.progress.total})` : o.text;
      this.root.textContent = `목표: ${line}`;
      this.root.style.display = 'block';
      if (o.text !== this.text) this.highlight();
      this.text = o.text;
    });
  }

  /** 새 목표를 잠깐 금빛으로 강조한다. */
  private highlight(): void {
    Object.assign(this.root.style, {
      background: 'rgba(120, 86, 20, 0.85)',
      boxShadow: '0 0 0 2px #ffd35a, 0 0 18px rgba(255, 211, 90, 0.7)',
    });
    setTimeout(() => {
      Object.assign(this.root.style, { background: 'rgba(20, 22, 26, 0.55)', boxShadow: 'none' });
    }, HIGHLIGHT_MS);
  }
}
