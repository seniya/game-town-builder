// 화면 중앙 조준점 (MVP_SPEC 29). DOM 만 쓴다. 게임 상태를 소유하지 않는다.

/** 조준점. 대상이 있으면 강조한다. 포인터 락이 아니면 숨긴다(메뉴·모달 중). */
export class Crosshair {
  private readonly dot: HTMLDivElement;
  private lastActive: boolean | null = null;

  /** root 에 조준점과 안내 요소를 붙인다. */
  constructor(root: HTMLElement) {
    this.dot = document.createElement('div');
    Object.assign(this.dot.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      width: '6px',
      height: '6px',
      margin: '-3px 0 0 -3px',
      borderRadius: '50%',
      pointerEvents: 'none',
      boxShadow: '0 0 0 1.5px rgba(20, 24, 28, 0.7)',
    });
    root.append(this.dot);
  }

  /** 조준 대상 유무와 포인터 락 상태를 반영한다. 바뀐 경우에만 DOM 을 고친다. */
  update(hasTarget: boolean, locked: boolean): void {
    if (hasTarget !== this.lastActive) {
      this.lastActive = hasTarget;
      this.dot.style.background = hasTarget ? '#fff6d8' : 'rgba(255, 255, 255, 0.55)';
      this.dot.style.transform = hasTarget ? 'scale(1.35)' : 'scale(1)';
    }
    this.dot.style.display = locked ? 'block' : 'none';
  }
}
