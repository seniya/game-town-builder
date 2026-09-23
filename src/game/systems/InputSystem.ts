// 키보드 / 마우스 입력 수집 (ARCHITECTURE 15, update 2 번). DOM 을 모른다.
// DOM 이벤트는 src/ui/domInput.ts 가 받아 아래 원시 입력 메서드로 넣는다. 테스트는 같은 메서드를 직접 부른다.
// update 는 프레임 사이에 쌓인 입력을 InputFrame 한 장으로 확정한다. 다른 시스템은 frame 만 읽는다.
import type { SlotSystem } from '../GameWorld';

/** 이번 프레임에 확정된 입력. 읽기 전용이다. */
export interface InputFrame {
  /** 앞(+1) / 뒤(-1). W / S */
  readonly moveForward: number;
  /** 오른쪽(+1) / 왼쪽(-1). D / A */
  readonly moveRight: number;
  readonly run: boolean;
  /** Space 를 누르고 있는가. 착지 중 누르고 있으면 다시 뛴다 */
  readonly jump: boolean;
  /** 포인터 락 중 마우스 이동 픽셀. 락이 아니면 0 */
  readonly lookDeltaX: number;
  readonly lookDeltaY: number;
  /** 좌클릭 유지 (파괴 진행) */
  readonly primaryHeld: boolean;
  /** 이번 프레임에 우클릭을 눌렀다 (설치) */
  readonly secondaryPressed: boolean;
  /** 이번 프레임에 누른 숫자키 1~9 의 핫바 인덱스 0~8. 없으면 null */
  readonly hotbarSelect: number | null;
  /** 휠 칸 수. 아래(+) / 위(-) */
  readonly wheelSteps: number;
  /** 이번 프레임에 새로 누른 키 코드 (KeyboardEvent.code). E / Tab / F / F3 / Escape 등 */
  readonly pressed: ReadonlySet<string>;
  /** 포인터 락 상태. 마우스 조작은 락 중에만 게임으로 들어온다 */
  readonly pointerLocked: boolean;
}

/** 아무 입력도 없는 프레임. */
export const EMPTY_INPUT_FRAME: InputFrame = {
  moveForward: 0,
  moveRight: 0,
  run: false,
  jump: false,
  lookDeltaX: 0,
  lookDeltaY: 0,
  primaryHeld: false,
  secondaryPressed: false,
  hotbarSelect: null,
  wheelSteps: 0,
  pressed: new Set(),
  pointerLocked: false,
};

/** 마우스 버튼 번호 (MouseEvent.button). */
export const MouseButton = { primary: 0, secondary: 2 } as const;

/** 입력 상태를 모아 프레임마다 InputFrame 으로 확정한다. */
export class InputSystem implements SlotSystem {
  /** 실제로 눌려 있는 키 */
  private readonly held = new Set<string>();
  /** 눌려 있지만 새로 누르기 전까지 게임에 넣지 않는 키 (모달 전후, READY-03) */
  private readonly suppressed = new Set<string>();
  private blocked = false;
  private readonly pressedSinceFrame = new Set<string>();
  private readonly buttons = new Set<number>();
  private secondaryClicked = false;
  private dx = 0;
  private dy = 0;
  private wheel = 0;
  private locked = false;
  private current: InputFrame = EMPTY_INPUT_FRAME;

  /** 마지막 update 에서 확정한 입력. */
  get frame(): InputFrame {
    return this.current;
  }

  /** 키를 눌렀다. 자동 반복은 새로 누른 것으로 세지 않는다. */
  keyDown(code: string, repeat = false): void {
    if (this.blocked) this.suppressed.add(code);
    else if (!repeat) this.suppressed.delete(code);
    if (!repeat && !this.held.has(code)) this.pressedSinceFrame.add(code);
    this.held.add(code);
  }

  /** 키를 뗐다. */
  keyUp(code: string): void {
    this.held.delete(code);
    this.suppressed.delete(code);
  }

  /**
   * 모달 동안 플레이어 조작 입력을 막는다 (MVP_SPEC 29.0). 막는 동안 frame 의 조작 값은 비어 있다.
   * 막을 때와 풀 때 모두 눌린 키·버튼을 뗀 것으로 하며, 계속 누르고 있던 키는 새로 눌러야 들어간다.
   */
  setGameplayBlocked(blocked: boolean): void {
    this.blocked = blocked;
    for (const code of this.held) this.suppressed.add(code);
    this.buttons.clear();
    this.secondaryClicked = false;
    this.pressedSinceFrame.clear();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }

  /** 조작 입력이 막혀 있는가. */
  get gameplayBlocked(): boolean {
    return this.blocked;
  }

  /** 마우스가 움직였다. 락 중일 때만 시선에 쓴다. */
  mouseMove(dx: number, dy: number): void {
    if (!this.locked) return;
    this.dx += dx;
    this.dy += dy;
  }

  /** 마우스 버튼을 눌렀다. 락 중일 때만 게임 조작이다. */
  mouseDown(button: number): void {
    if (!this.locked) return;
    this.buttons.add(button);
    if (button === MouseButton.secondary) this.secondaryClicked = true;
  }

  /** 마우스 버튼을 뗐다. */
  mouseUp(button: number): void {
    this.buttons.delete(button);
  }

  /** 휠. deltaY 의 부호만 한 칸으로 센다. */
  wheelScroll(deltaY: number): void {
    if (!this.locked || deltaY === 0) return;
    this.wheel += Math.sign(deltaY);
  }

  /** 포인터 락이 걸리거나 풀렸다. 풀리면 눌린 버튼과 쌓인 시선 이동을 버린다. */
  setPointerLocked(locked: boolean): void {
    this.locked = locked;
    if (!locked) {
      this.buttons.clear();
      this.secondaryClicked = false;
      this.dx = 0;
      this.dy = 0;
      this.wheel = 0;
    }
  }

  /** 창이 포커스를 잃었다. keyup 을 못 받으므로 눌린 키를 모두 뗀 것으로 한다. */
  releaseAll(): void {
    this.held.clear();
    this.suppressed.clear();
    this.buttons.clear();
    this.pressedSinceFrame.clear();
    this.secondaryClicked = false;
  }

  /** 쌓인 입력으로 이번 프레임을 확정하고 한 번성 입력을 비운다. */
  update(): void {
    if (this.blocked) {
      this.current = { ...EMPTY_INPUT_FRAME, pointerLocked: this.locked };
      this.pressedSinceFrame.clear();
      this.secondaryClicked = false;
      this.dx = 0;
      this.dy = 0;
      this.wheel = 0;
      return;
    }
    const h = new Set([...this.held].filter((c) => !this.suppressed.has(c)));
    const axis = (plus: string, minus: string): number =>
      (h.has(plus) ? 1 : 0) - (h.has(minus) ? 1 : 0);
    let hotbarSelect: number | null = null;
    for (let i = 1; i <= 9; i++) if (this.pressedSinceFrame.has(`Digit${i}`)) hotbarSelect = i - 1;
    this.current = {
      moveForward: axis('KeyW', 'KeyS'),
      moveRight: axis('KeyD', 'KeyA'),
      run: h.has('ShiftLeft') || h.has('ShiftRight'),
      jump: h.has('Space'),
      lookDeltaX: this.dx,
      lookDeltaY: this.dy,
      primaryHeld: this.buttons.has(MouseButton.primary),
      secondaryPressed: this.secondaryClicked,
      hotbarSelect,
      wheelSteps: this.wheel,
      pressed: new Set(this.pressedSinceFrame),
      pointerLocked: this.locked,
    };
    this.pressedSinceFrame.clear();
    this.secondaryClicked = false;
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }
}
