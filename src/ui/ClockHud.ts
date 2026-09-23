// 게임 시간 HUD (MVP_SPEC 29: 우측 상단 "Day N / HH:MM"). DOM 만 쓴다. 게임 상태를 소유하지 않는다 (29.1).
import type { GameClockReader } from '../game/types';

/** 시간대의 한글 표시. */
const PHASE_LABEL: Record<GameClockReader['phase'], string> = {
  dawn: '새벽',
  morning: '아침',
  noon: '점심',
  afternoon: '오후',
  evening: '저녁',
  night: '밤',
};

/** 시계를 읽어 우측 상단에 날·시각을 보여 준다. 분이 바뀔 때만 DOM 을 고친다. */
export class ClockHud {
  private readonly root: HTMLDivElement;
  private shown = '';

  /** parent 에 HUD 를 붙인다. format 은 "Day N HH:MM" 문자열을 만든다. */
  constructor(
    parent: HTMLElement,
    private readonly clock: GameClockReader,
    private readonly format: (gameMinutes: number) => string,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      right: '12px',
      top: '10px',
      padding: '4px 10px',
      borderRadius: '6px',
      background: 'rgba(20, 22, 26, 0.55)',
      color: '#f4efe2',
      font: '600 15px system-ui, sans-serif',
      letterSpacing: '0.02em',
      pointerEvents: 'none',
      zIndex: '20',
    });
    parent.append(this.root);
  }

  /** 매 프레임 부른다. 표시 문자열이 바뀔 때만 고친다. */
  update(): void {
    const text = `${this.format(this.clock.gameMinutes)} · ${PHASE_LABEL[this.clock.phase]}`;
    if (text === this.shown) return;
    this.shown = text;
    this.root.textContent = text;
  }
}
