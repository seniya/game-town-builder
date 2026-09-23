// DOM 입력 → InputSystem 배선과 포인터 락 (TASK-010, MVP_SPEC 9.2). three 를 import 하지 않는다.
// 게임 상태를 소유하지 않는다. 원시 이벤트를 InputSystem 의 메서드로 넘기기만 한다.
import type { InputSystem } from '../game/systems/InputSystem';

/** 브라우저 기본 동작을 막을 키. Tab 포커스 이동·F3 검색·Space 스크롤 등. */
const PREVENT_DEFAULT_KEYS: ReadonlySet<string> = new Set(['Tab', 'F3', 'Space', 'KeyF', 'KeyE']);

/** 연결 해제 함수. */
export type Unbind = () => void;

/**
 * 캔버스와 창의 입력 이벤트를 InputSystem 에 연결한다.
 * 포인터 락 요청은 화면 상태 기계(ModalController)가 한다. 락이 아닐 때의 클릭은 게임 조작이 아니다.
 * 락이 풀리거나 창이 포커스를 잃으면 눌린 입력을 모두 뗀다.
 */
export function bindDomInput(canvas: HTMLCanvasElement, input: InputSystem): Unbind {
  const isLocked = (): boolean => document.pointerLockElement === canvas;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
    input.keyDown(e.code, e.repeat);
  };
  const onKeyUp = (e: KeyboardEvent): void => input.keyUp(e.code);
  const onMouseMove = (e: MouseEvent): void => input.mouseMove(e.movementX, e.movementY);
  const onMouseDown = (e: MouseEvent): void => {
    // 락이 아닐 때의 클릭(메뉴·모달 조작, 락을 거는 클릭)은 게임 조작이 아니다 (클릭 관통 방지)
    if (!isLocked()) return;
    input.mouseDown(e.button);
  };
  const onMouseUp = (e: MouseEvent): void => input.mouseUp(e.button);
  const onWheel = (e: WheelEvent): void => {
    if (!isLocked()) return;
    e.preventDefault();
    input.wheelScroll(e.deltaY);
  };
  const onContextMenu = (e: Event): void => e.preventDefault();
  const onLockChange = (): void => {
    const locked = isLocked();
    input.setPointerLocked(locked);
    if (!locked) input.releaseAll();
  };
  const onBlur = (): void => input.releaseAll();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('pointerlockchange', onLockChange);
  window.addEventListener('blur', onBlur);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mouseup', onMouseUp);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
    document.removeEventListener('pointerlockchange', onLockChange);
    window.removeEventListener('blur', onBlur);
  };
}
