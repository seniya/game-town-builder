// 상호작용 프롬프트 (MVP_SPEC 29 / 13.2.1, TASK-036). 화면 중앙 하단에 "[F] 종" 같은 안내를 보인다. DOM 만 쓴다.

/** F 대상이 있을 때만 보이는 한 줄. */
export class InteractPrompt {
  private readonly root: HTMLDivElement;
  private shown: string | null = null;

  /** parent 에 붙인다. 처음에는 숨겨져 있다. */
  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '50%',
      bottom: '96px',
      transform: 'translateX(-50%)',
      padding: '4px 12px',
      borderRadius: '6px',
      background: 'rgba(20, 22, 26, 0.6)',
      color: '#f4efe2',
      font: '600 14px system-ui, sans-serif',
      pointerEvents: 'none',
      display: 'none',
      zIndex: '20',
    });
    parent.append(this.root);
  }

  /** 보일 문구. null 이면 숨긴다. 바뀔 때만 DOM 을 고친다. */
  update(text: string | null): void {
    if (text === this.shown) return;
    this.shown = text;
    this.root.style.display = text ? 'block' : 'none';
    if (text) this.root.textContent = text;
  }
}
