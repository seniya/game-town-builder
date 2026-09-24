// 엔딩 연출 화면 (TASK-052). 위아래 검은 띠·샷마다 한 문장·샷 사이 짧은 암전. DOM 만 쓴다.
// 모달이므로 조작은 막히고 게임 시간은 흐른다(목수가 실제로 고치고 주민이 실제로 흩어진다). 카메라는 main 이 샷 계산으로 옮긴다.
// 끝까지 보거나 1 초 뒤 아무 키·클릭으로 건너뛰면 닫힌다. Esc 는 메뉴로 간다. 어느 쪽이든 닫히면 엔딩을 본 것으로 한다.
import { ENDING_CAMERA } from '../game/data/ending';
import { ENDING_TOTAL_SECONDS, shotAt } from '../game/ending/endingShot';
import type { ModalView } from './ModalController';

/** 문장이 나타나고 사라지는 시간(초). */
const FADE_SECONDS = 0.8;
/** 샷 사이 암전 시간(초). */
const DIP_SECONDS = 0.35;

/** 엔딩 연출 모달. */
export class EndingOverlay implements ModalView {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly dip: HTMLDivElement;
  private t = 0;
  private active = false;

  /** parent 에 붙인다. requestClose 는 닫기(락 재요청), onClosed 는 엔딩을 본 것으로 기록한다. */
  constructor(
    parent: HTMLElement,
    private readonly requestClose: () => void,
    private readonly onClosed: () => void,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      display: 'none',
      pointerEvents: 'auto',
      zIndex: '30',
    });
    const bar = (top: boolean): HTMLDivElement => {
      const b = document.createElement('div');
      Object.assign(b.style, {
        position: 'absolute',
        left: '0',
        right: '0',
        height: '11vh',
        background: '#000',
        [top ? 'top' : 'bottom']: '0',
      });
      return b;
    };
    this.dip = document.createElement('div');
    Object.assign(this.dip.style, {
      position: 'absolute',
      inset: '0',
      background: '#000',
      opacity: '0',
    });
    this.text = document.createElement('div');
    Object.assign(this.text.style, {
      position: 'absolute',
      left: '0',
      right: '0',
      bottom: '3.6vh',
      textAlign: 'center',
      color: '#f6efe2',
      font: '500 22px system-ui, sans-serif',
      letterSpacing: '0.04em',
      opacity: '0',
    });
    const hint = document.createElement('div');
    hint.textContent = '아무 키나 누르면 건너뛴다';
    Object.assign(hint.style, {
      position: 'absolute',
      right: '18px',
      top: '3.6vh',
      color: '#f6efe2',
      font: '12px system-ui, sans-serif',
      opacity: '0.45',
    });
    this.root.append(this.dip, bar(true), bar(false), this.text, hint);
    this.root.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.skip();
    });
    parent.append(this.root);
  }

  /** 지난 실시간(초). main 이 카메라 샷을 고른다. */
  get elapsed(): number {
    return this.t;
  }

  /** 열려 있는가. */
  get isOpen(): boolean {
    return this.active;
  }

  /** 처음부터 보인다. */
  open(): void {
    this.t = 0;
    this.active = true;
    this.root.style.display = 'block';
    this.render();
  }

  /** 닫는다. 엔딩을 본 것으로 기록한다. */
  close(): void {
    if (!this.active) return;
    this.active = false;
    this.root.style.display = 'none';
    this.onClosed();
  }

  /** 아무 키나 건너뛰기다. 조작 키가 게임으로 가지 않게 모두 받는다. */
  key(): boolean {
    this.skip();
    return true;
  }

  /** 실시간 dt 초만큼 진행한다. 끝나면 닫기를 요청한다. */
  update(dt: number): void {
    if (!this.active) return;
    this.t += dt;
    if (this.t >= ENDING_TOTAL_SECONDS) {
      this.requestClose();
      return;
    }
    this.render();
  }

  /** 시작 직후가 아니면 건너뛴다. */
  private skip(): void {
    if (this.active && this.t >= ENDING_CAMERA.skipAfterSeconds) this.requestClose();
  }

  /** 지금 샷의 문장과 페이드. */
  private render(): void {
    const at = shotAt(this.t);
    if (!at) return;
    const secs = at.shot.seconds;
    const local = at.u * secs;
    this.text.textContent = at.shot.text;
    this.text.style.opacity = String(
      Math.max(0, Math.min(1, (local - 0.3) / FADE_SECONDS, (secs - local) / FADE_SECONDS)),
    );
    // 샷이 바뀌는 순간 짧게 어두워졌다 밝아진다(첫 샷은 암전에서 시작한다)
    const edge = Math.min(local, secs - local);
    this.dip.style.opacity = String(Math.max(0, 1 - edge / DIP_SECONDS));
  }
}
