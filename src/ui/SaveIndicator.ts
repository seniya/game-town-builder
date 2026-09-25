// 저장 표시 (ARCHITECTURE 23.3, TASK-051). 우측 하단에 "저장됨" / "저장 실패" 를 잠깐 보인다. 성공 전에는 저장됨을 보이지 않는다.
import type { EventBus } from '../game/EventBus';

/** 저장 결과 표시. */
export class SaveIndicator {
  private readonly root: HTMLDivElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** parent 에 붙이고 저장 결과를 구독한다. */
  constructor(parent: HTMLElement, events: EventBus) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      right: '12px',
      bottom: '12px',
      padding: '4px 10px',
      borderRadius: '12px',
      background: 'rgba(62, 42, 30, 0.62)',
      color: '#f4efe2',
      font: '600 12px system-ui, sans-serif',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.3s',
      zIndex: '20',
    });
    parent.append(this.root);
    events.on('SAVE_COMPLETED', () => this.show('저장됨', '#f4efe2'));
    events.on('SAVE_FAILED', () => this.show('저장 실패 — 이전 저장이 남아 있습니다', '#ffb3a6'));
  }

  /** 문구를 보였다가 숨긴다. */
  show(text: string, color: string): void {
    this.root.textContent = text;
    this.root.style.color = color;
    this.root.style.opacity = '1';
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.root.style.opacity = '0'), 2500);
  }
}
