// 대사 상자 (MVP_SPEC 27.4 / 29, TASK-040). 모달이다: 대화 중 이동·블록 편집이 막힌다(READY-03). DOM 만 쓴다.
// F / Space / Enter / 클릭으로 다음 줄, 마지막 줄 뒤에 닫는다. Esc 로 닫으면 대화는 완료되지 않는다.
import type { ActiveDialogue } from '../game/systems/DialogueSystem';
import type { ModalView } from './ModalController';

/** 대사 상자가 부르는 명령과 조회. */
export interface DialogueBoxPort {
  /** 조준한 주민과 대화를 시작한다. 대사가 없으면 null */
  begin(): ActiveDialogue | null;
  /** 다음 줄. 끝났으면 null(완료 기록·DIALOGUE_ENDED 는 DialogueSystem 이 한다) */
  advance(): ActiveDialogue | null;
  /** 끝까지 읽지 않고 닫았다 */
  abort(): void;
  /** 화자의 표시 이름 */
  speakerName(npcId: string): string;
  /** 대화가 끝나 닫는다(포인터 락을 다시 거는 닫기) */
  requestClose(): void;
}

/** 넘기기 키. */
const NEXT_KEYS: ReadonlySet<string> = new Set(['KeyF', 'Space', 'Enter']);

/** 화면 하단의 대사 상자. */
export class DialogueBox implements ModalView {
  private readonly root: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private active: ActiveDialogue | null = null;

  /** parent 에 붙인다. 처음에는 숨겨져 있다. */
  constructor(
    parent: HTMLElement,
    private readonly port: DialogueBoxPort,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '50%',
      bottom: '104px',
      transform: 'translateX(-50%)',
      width: 'min(640px, calc(100vw - 32px))',
      padding: '14px 18px 12px',
      borderRadius: '12px',
      background: 'rgba(250, 244, 232, 0.97)',
      color: '#3a2f25',
      font: '16px system-ui, sans-serif',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      display: 'none',
      cursor: 'pointer',
      userSelect: 'none',
      zIndex: '10',
    });
    this.name = document.createElement('div');
    Object.assign(this.name.style, {
      font: '700 14px system-ui, sans-serif',
      color: '#8a5a2b',
      marginBottom: '6px',
    });
    this.text = document.createElement('div');
    this.text.style.lineHeight = '1.55';
    this.hint = document.createElement('div');
    Object.assign(this.hint.style, {
      marginTop: '8px',
      fontSize: '12px',
      opacity: '0.6',
      textAlign: 'right',
    });
    this.root.append(this.name, this.text, this.hint);
    this.root.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.next();
    });
    parent.append(this.root);
  }

  /** 연다: 대화를 시작한다. 대사가 없으면 곧바로 닫는다. */
  open(): void {
    this.active = this.port.begin();
    if (!this.active) {
      this.port.requestClose();
      return;
    }
    this.root.style.display = 'block';
    this.render();
  }

  /** 닫는다. 끝까지 읽지 않았으면 완료하지 않는다. */
  close(): void {
    if (this.active) this.port.abort();
    this.active = null;
    this.root.style.display = 'none';
  }

  /** F / Space / Enter 는 다음 줄이다. */
  key(code: string): boolean {
    if (!NEXT_KEYS.has(code)) return false;
    this.next();
    return true;
  }

  /** 다음 줄로. 끝났으면 닫는다. */
  private next(): void {
    if (!this.active) return;
    this.active = this.port.advance();
    if (!this.active) {
      this.port.requestClose();
      return;
    }
    this.render();
  }

  /** 현재 줄을 그린다. */
  private render(): void {
    const a = this.active;
    if (!a) return;
    this.name.textContent = this.port.speakerName(a.npcId);
    this.text.textContent = a.dialogue.lines[a.line] ?? '';
    const last = a.line + 1 >= a.dialogue.lines.length;
    this.hint.textContent = last
      ? '[F] 닫기'
      : `[F] 다음 (${a.line + 1} / ${a.dialogue.lines.length})`;
  }
}
