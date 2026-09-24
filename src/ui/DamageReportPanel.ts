// 아침 피해 보고 (MVP_SPEC 25.4 / 29, TASK-049). 모달이며 아무 키(또는 클릭)로 닫는다. DOM 만 쓴다.
// DAMAGE_REPORT 를 받아 둔 뒤, 조작 중일 때 연다(메뉴·다른 모달 중이면 기다린다).
import type { EventBus } from '../game/EventBus';
import type { ModalView } from './ModalController';

/** 피해 보고 창. */
export class DamageReportPanel implements ModalView {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private waiting: number | null = null;

  /** parent 에 붙이고 보고를 구독한다. requestClose 는 닫기(락 재요청)다. */
  constructor(
    parent: HTMLElement,
    events: EventBus,
    private readonly requestClose: () => void,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '50%',
      top: '38%',
      transform: 'translate(-50%, -50%)',
      minWidth: '320px',
      padding: '18px 22px 14px',
      borderRadius: '12px',
      background: 'rgba(250, 244, 232, 0.97)',
      color: '#3a2f25',
      font: '15px system-ui, sans-serif',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      display: 'none',
      textAlign: 'center',
      zIndex: '10',
    });
    const title = document.createElement('div');
    title.textContent = '아침 피해 보고';
    Object.assign(title.style, {
      font: '700 16px system-ui, sans-serif',
      marginBottom: '8px',
      color: '#9a3b2b',
    });
    this.text = document.createElement('div');
    const hint = document.createElement('div');
    hint.textContent =
      '붉게 표시된 곳은 목수가 낮에 고친다(하루 8 칸). 직접 놓아 고칠 수도 있다. 아무 키나 누르면 닫힌다';
    Object.assign(hint.style, { marginTop: '10px', fontSize: '12px', opacity: '0.7' });
    this.root.append(title, this.text, hint);
    this.root.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.requestClose();
    });
    parent.append(this.root);
    events.on('DAMAGE_REPORT', (r) => void (this.waiting = r.cells));
  }

  /** 열 보고가 기다리고 있는가(main 이 조작 중일 때 연다). */
  get pending(): boolean {
    return this.waiting !== null;
  }

  /** 연다. */
  open(): void {
    this.text.textContent = `지난밤 블록 ${this.waiting ?? 0} 개가 파괴되었습니다`;
    this.waiting = null;
    this.root.style.display = 'block';
  }

  /** 닫는다. */
  close(): void {
    this.root.style.display = 'none';
  }

  /** 아무 키나 닫는다(Esc 는 화면 상태 기계가 처리한다). */
  key(): boolean {
    this.requestClose();
    return true;
  }
}
