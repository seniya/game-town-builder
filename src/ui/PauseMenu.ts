// Esc 메뉴 (MVP_SPEC 9.2 / 29.0). 게임 시작 화면도 이 메뉴다. 열려 있는 동안 게임은 멈춘다.
// DOM 만 쓴다. 클릭하면 onResume 을 부른다(포인터 락 요청은 이 클릭 안에서 해야 브라우저가 허용한다).

/** 조작 안내 (MVP_SPEC 9.2). */
const CONTROLS: readonly [string, string][] = [
  ['W A S D', '이동'],
  ['Shift', '달리기'],
  ['Space', '점프'],
  ['마우스', '시선'],
  ['좌클릭 (누르고 있기)', '블록 부수기'],
  ['우클릭', '블록 놓기'],
  ['1 ~ 9 / 휠', '핫바 선택'],
  ['E', '인벤토리 · 제작'],
  ['F', '종 · 상자 (조준한 것)'],
  ['M', '소리 켜기 / 끄기'],
  ['F3', '디버그 패널'],
  ['Esc', '메뉴'],
];

/** 일시정지 메뉴 오버레이. */
export class PauseMenu {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private started = false;

  /** parent 에 오버레이를 붙인다. 오버레이를 클릭하면 onResume 을 부른다. */
  constructor(parent: HTMLElement, onResume: () => void) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(20, 24, 28, 0.45)',
      cursor: 'pointer',
      userSelect: 'none',
      zIndex: '20',
    });
    const card = document.createElement('div');
    this.card = card;
    Object.assign(card.style, {
      minWidth: '300px',
      padding: '22px 28px',
      borderRadius: '12px',
      background: 'rgba(250, 244, 232, 0.94)',
      color: '#3a2f25',
      font: '14px system-ui, sans-serif',
      boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
    });
    const name = document.createElement('div');
    name.textContent = '작은 마을 복구';
    Object.assign(name.style, { font: 'bold 20px system-ui, sans-serif', marginBottom: '4px' });
    this.title = document.createElement('div');
    Object.assign(this.title.style, { marginBottom: '14px', color: '#7a5f3e' });
    const table = document.createElement('div');
    Object.assign(table.style, {
      display: 'grid',
      gridTemplateColumns: 'auto auto',
      gap: '4px 18px',
    });
    for (const [key, what] of CONTROLS) {
      const k = document.createElement('div');
      k.textContent = key;
      k.style.fontWeight = '600';
      const w = document.createElement('div');
      w.textContent = what;
      table.append(k, w);
    }
    card.append(name, this.title, table);
    this.root.append(card);
    this.root.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onResume();
    });
    parent.append(this.root);
    this.renderTitle();
  }

  /**
   * 켜고 끄는 버튼을 카드 아래에 더한다(소리 등). 버튼 클릭은 "계속" 으로 전달하지 않는다.
   * label 은 현재 상태의 문구를 만든다.
   */
  addToggle(
    label: (on: boolean) => string,
    get: () => boolean,
    set: (on: boolean) => void,
  ): () => void {
    const b = document.createElement('button');
    Object.assign(b.style, {
      marginTop: '14px',
      font: '600 13px system-ui, sans-serif',
      padding: '5px 12px',
      borderRadius: '6px',
      border: '1px solid #a88a60',
      background: '#fff8ea',
      color: '#3a2f25',
      cursor: 'pointer',
    });
    const render = (): void => void (b.textContent = label(get()));
    b.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      set(!get());
      render();
    });
    render();
    this.card.append(b);
    return render;
  }

  /** 메뉴를 보인다. */
  show(): void {
    this.renderTitle();
    this.root.style.display = 'flex';
  }

  /** 메뉴를 숨긴다. 한 번 숨긴 뒤에는 "계속" 문구가 된다. */
  hide(): void {
    this.started = true;
    this.root.style.display = 'none';
  }

  /** 시작 전이면 "클릭해서 시작", 이후에는 "일시정지 · 클릭해서 계속". */
  private renderTitle(): void {
    this.title.textContent = this.started ? '일시정지 · 클릭해서 계속' : '클릭해서 시작';
  }
}
