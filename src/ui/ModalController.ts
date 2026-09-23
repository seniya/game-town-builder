// 화면 상태: 조작 중 / 모달 / 메뉴 (MVP_SPEC 29.0, READY-03). UI 상태이며 게임 상태가 아니다. 저장하지 않는다.
// 상태 전이는 DOM 을 모르는 ScreenStateMachine 이 하고, bindModalKeys 가 DOM 이벤트를 연결한다.

/** 모달 이름. 종·저장소·대사·피해 보고는 해당 Task(036 / 040 / 049 / 051)에서 연결한다. */
export type ModalName = 'inventory' | 'bell' | 'storage' | 'dialogue' | 'damageReport';

/** 화면 상태. resuming 은 모달을 닫고 포인터 락을 다시 기다리는 중이다. */
export type ScreenState =
  | { readonly kind: 'menu' }
  | { readonly kind: 'playing' }
  | { readonly kind: 'resuming' }
  | { readonly kind: 'modal'; readonly name: ModalName };

/** 열고 닫을 수 있는 모달 화면. */
export interface ModalView {
  open(): void;
  close(): void;
}

/** 상태 전이가 일으키는 부수 효과. 브라우저에서는 DOM 을, 테스트에서는 기록용 가짜를 넣는다. */
export interface ScreenEffects {
  /** 포인터 락을 요청한다. 사용자 입력 처리 중에만 성공할 수 있다. 결과를 알려 준다 */
  requestLock(): Promise<boolean>;
  exitLock(): void;
  /** 플레이어 조작 입력 차단 (InputSystem.setGameplayBlocked) */
  setGameplayBlocked(blocked: boolean): void;
  showMenu(): void;
  hideMenu(): void;
}

/** 화면 상태 기계. 게임 시작은 메뉴다. */
export class ScreenStateMachine {
  private current: ScreenState = { kind: 'menu' };

  /** 부수 효과와 모달 화면들을 받는다. 시작 시 메뉴를 보이고 조작을 막는다. */
  constructor(
    private readonly effects: ScreenEffects,
    private readonly views: Partial<Record<ModalName, ModalView>>,
  ) {
    effects.setGameplayBlocked(true);
    effects.showMenu();
  }

  /** 현재 상태. */
  get state(): ScreenState {
    return this.current;
  }

  /** 메뉴는 일시정지다. main 은 이때 world.update 를 부르지 않는다. */
  get paused(): boolean {
    return this.current.kind === 'menu';
  }

  /** 메뉴에서 계속한다(클릭). 포인터 락을 요청한다. */
  resumeFromMenu(): void {
    if (this.current.kind !== 'menu') return;
    this.current = { kind: 'resuming' };
    this.effects.hideMenu();
    void this.relock();
  }

  /** 포인터 락이 걸렸다. */
  lockAcquired(): void {
    if (this.current.kind === 'modal') return;
    this.current = { kind: 'playing' };
    this.effects.hideMenu();
    this.effects.setGameplayBlocked(false);
  }

  /** 포인터 락이 풀렸다. 조작 중이었으면 메뉴를 연다. 모달이 연 경우는 그대로다. */
  lockLost(): void {
    if (this.current.kind !== 'playing') return;
    this.toMenu();
  }

  /** 모달을 연다. 조작 중일 때만 열린다. 한 번에 하나다. */
  open(name: ModalName): boolean {
    if (this.current.kind !== 'playing') return false;
    const view = this.views[name];
    if (!view) return false;
    this.current = { kind: 'modal', name };
    this.effects.setGameplayBlocked(true);
    this.effects.exitLock();
    view.open();
    return true;
  }

  /**
   * 열린 모달을 닫는다. relock 이면(E 키·닫기 버튼처럼 락을 다시 걸 수 있는 입력) 포인터 락을 요청하고,
   * 아니면(Esc) 메뉴로 간다.
   */
  close(relock: boolean): void {
    if (this.current.kind !== 'modal') return;
    this.views[this.current.name]?.close();
    if (!relock) {
      this.toMenu();
      return;
    }
    this.current = { kind: 'resuming' };
    void this.relock();
  }

  /** 키 입력. E 는 인벤토리 열기·닫기, Esc 는 모달 닫기(→ 메뉴). 처리했으면 true. */
  key(code: string): boolean {
    const s = this.current;
    if (code === 'KeyE') {
      if (s.kind === 'playing') return this.open('inventory');
      if (s.kind === 'modal' && s.name === 'inventory') {
        this.close(true);
        return true;
      }
      return false;
    }
    if (code === 'Escape' && s.kind === 'modal') {
      this.close(false);
      return true;
    }
    return false;
  }

  /** 포인터 락을 요청하고, 거부되면 메뉴로 간다. */
  private async relock(): Promise<void> {
    const ok = await this.effects.requestLock();
    if (!ok && this.current.kind === 'resuming') this.toMenu();
  }

  /** 메뉴 상태로 간다. */
  private toMenu(): void {
    this.current = { kind: 'menu' };
    this.effects.setGameplayBlocked(true);
    this.effects.showMenu();
  }
}

/**
 * DOM 의 키·포인터 락 이벤트를 상태 기계에 연결한다. E / Esc 는 여기서 처리하고 게임으로 넘기지 않는다
 * (InputSystem 은 모달 동안 조작을 막으므로 E 가 게임 동작을 일으키지 않는다).
 */
export function bindModalKeys(canvas: HTMLCanvasElement, machine: ScreenStateMachine): void {
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (machine.key(e.code)) e.preventDefault();
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) machine.lockAcquired();
    else machine.lockLost();
  });
}

/** 캔버스에 포인터 락을 요청한다. 브라우저가 거부하면 false. */
export async function requestCanvasLock(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    await canvas.requestPointerLock();
    return true;
  } catch {
    // Esc 직후처럼 브라우저가 잠시 거부하는 경우. 메뉴에서 다시 클릭하면 된다
    return false;
  }
}
