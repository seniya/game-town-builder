// 새 주민 도착·진행 연출 알림 (MVP_SPEC 19.6 / 27.1, ADR 034, TASK-038 / 043). 화면 상단 가운데에 잠깐 보인다. DOM 만 쓴다.
// 도착 확인·엔딩 연출의 완성(카메라·음악)은 TASK-052 에서 한다. 지금은 문구로만 알린다.
import type { EventBus } from '../game/EventBus';

/** 연출 id 의 알림 문구. */
const CUTSCENE_TEXT: Record<string, string> = {
  new_resident: '식구가 다섯이 됐어요',
  slice_end: '작은 마을이 다시 살아났어요',
};

/** 보이는 시간(ms). */
const SHOW_MS = 4000;

/** NPC_ARRIVED 를 받아 알림을 띄운다. */
export class ArrivalToast {
  private readonly root: HTMLDivElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** parent 에 붙이고 도착을 구독한다. */
  constructor(parent: HTMLElement, events: EventBus) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '50%',
      top: '56px',
      transform: 'translateX(-50%)',
      padding: '8px 16px',
      borderRadius: '8px',
      background: 'rgba(250, 244, 232, 0.94)',
      color: '#3a2f25',
      font: '600 15px system-ui, sans-serif',
      boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.4s',
      zIndex: '21',
    });
    parent.append(this.root);
    events.on('NPC_ARRIVED', () => this.show('새 주민이 마을에 왔어요'));
    events.on('CUTSCENE_REQUESTED', (c) => {
      const text = CUTSCENE_TEXT[c.id];
      if (text) this.show(text);
    });
  }

  /** 문구를 보였다가 사라지게 한다. */
  private show(text: string): void {
    this.root.textContent = text;
    this.root.style.opacity = '1';
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.root.style.opacity = '0'), SHOW_MS);
  }
}
