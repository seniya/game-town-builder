// 플레이어 인벤토리 / 핫바 (MVP_SPEC 13.1, ARCHITECTURE 15 / 27). 인벤토리의 유일한 소유자다.
// 핫바 9 칸 + 가방 27 칸, 스택 64. 블록과 재료(seed / crop / food)를 구분하지 않고 같은 칸에 담는다.
// 모든 변경 API 는 전부 성공하거나 아무것도 바꾸지 않는다. 바뀌면 INVENTORY_CHANGED 를 발행한다.
import { balance } from '../data/balance';
import type { EventBus } from '../EventBus';
import type { SlotSystem } from '../GameWorld';
import type { ItemRef } from '../types';
import type { InputFrameSource } from './PlayerMovementSystem';

/** 칸 하나의 내용. count 는 1 ~ stackSize 다. */
export interface ItemStack {
  readonly item: ItemRef;
  readonly count: number;
}

/** 추가·제거 요청 한 항목. */
export interface ItemAmount {
  readonly item: ItemRef;
  readonly count: number;
}

const INV = balance.inventory;
/** 전체 칸 수. 0 ~ 8 이 핫바, 9 ~ 35 가 가방이다. */
export const INVENTORY_SLOTS = INV.hotbarSlots + INV.bagSlots;

/** 두 ItemRef 가 같은 아이템인가. */
export function sameItem(a: ItemRef, b: ItemRef): boolean {
  if (a.kind === 'block') return b.kind === 'block' && a.blockId === b.blockId;
  return b.kind === 'material' && a.material === b.material;
}

/** 블록 아이템 참조. */
export function blockItem(blockId: number): ItemRef {
  return { kind: 'block', blockId };
}

/** 인벤토리. update 는 핫바 선택 입력을 반영한다 (update 2 번, InputSystem 뒤). */
export class InventorySystem implements SlotSystem {
  private slots: (ItemStack | null)[] = new Array<ItemStack | null>(INVENTORY_SLOTS).fill(null);
  private selectedIndex = 0;

  /** 이벤트 버스와 입력원을 받는다. 처음에는 비어 있다 (MVP_SPEC 13.3). */
  constructor(
    private readonly events: EventBus,
    private readonly input: InputFrameSource | null = null,
  ) {}

  /** 선택된 핫바 칸 0 ~ 8. */
  get selected(): number {
    return this.selectedIndex;
  }

  /** 칸 내용의 읽기 전용 복사본. UI 가 표시에 쓴다. */
  snapshot(): readonly (ItemStack | null)[] {
    return [...this.slots];
  }

  /** 칸 하나. */
  slot(index: number): ItemStack | null {
    return this.slots[index] ?? null;
  }

  /** 선택된 핫바 칸의 내용. */
  selectedStack(): ItemStack | null {
    return this.slot(this.selectedIndex);
  }

  /** 아이템의 총 개수. */
  count(item: ItemRef): number {
    let n = 0;
    for (const s of this.slots) if (s && sameItem(s.item, item)) n += s.count;
    return n;
  }

  /** 입력의 숫자키·휠로 핫바 선택을 바꾼다. */
  update(): void {
    const frame = this.input?.frame;
    if (!frame) return;
    if (frame.hotbarSelect !== null) this.select(frame.hotbarSelect);
    else if (frame.wheelSteps !== 0) this.scroll(frame.wheelSteps);
  }

  /** 핫바 칸을 고른다. 범위 밖이면 무시한다. */
  select(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= INV.hotbarSlots) return;
    if (index === this.selectedIndex) return;
    this.selectedIndex = index;
    this.changed();
  }

  /** 휠 칸 수만큼 핫바 선택을 돌린다. 끝에서 반대편으로 넘어간다. */
  scroll(steps: number): void {
    const n = INV.hotbarSlots;
    this.select((((this.selectedIndex + steps) % n) + n) % n);
  }

  /** 모든 항목을 한꺼번에 넣을 공간이 있는가. */
  canAdd(items: readonly ItemAmount[]): boolean {
    return this.planAdd(items) !== null;
  }

  /**
   * 항목들을 모두 넣는다. 공간이 모자라면 아무것도 넣지 않고 false 를 반환한다.
   * 같은 아이템 스택을 먼저 채우고(핫바 → 가방 순) 남으면 빈 칸을 앞에서부터 쓴다.
   */
  add(items: readonly ItemAmount[]): boolean {
    const plan = this.planAdd(items);
    if (!plan) return false;
    if (plan === this.slots) return true;
    this.slots = plan;
    this.changed();
    return true;
  }

  /** 항목들을 모두 뺄 수 있는가. */
  canRemove(items: readonly ItemAmount[]): boolean {
    return this.planRemove(items) !== null;
  }

  /** 항목들을 모두 뺀다. 하나라도 모자라면 아무것도 빼지 않고 false. 뒤쪽 칸부터 뺀다. */
  remove(items: readonly ItemAmount[]): boolean {
    const plan = this.planRemove(items);
    if (!plan) return false;
    this.slots = plan;
    this.changed();
    return true;
  }

  /** 선택된 핫바 칸에서 1 개를 뺄 수 있는가 (설치 소비). */
  canConsumeSelected(): boolean {
    return (this.selectedStack()?.count ?? 0) > 0;
  }

  /** 선택된 핫바 칸에서 1 개를 뺀다. 비어 있으면 false 이며 아무것도 바꾸지 않는다. */
  consumeSelected(): boolean {
    const s = this.selectedStack();
    if (!s) return false;
    this.slots[this.selectedIndex] = s.count > 1 ? { item: s.item, count: s.count - 1 } : null;
    this.changed();
    return true;
  }

  /** 로드 복원용. 칸 배열 전체를 교체한다. */
  restore(slots: readonly (ItemStack | null)[], selected: number): void {
    const next = new Array<ItemStack | null>(INVENTORY_SLOTS).fill(null);
    slots.slice(0, INVENTORY_SLOTS).forEach((s, i) => (next[i] = s));
    this.slots = next;
    this.selectedIndex = Math.min(Math.max(0, Math.floor(selected)), INV.hotbarSlots - 1);
    this.changed();
  }

  /** 추가 결과 칸 배열. 공간이 모자라면 null. 넣을 것이 없으면 현재 배열 그대로. */
  private planAdd(items: readonly ItemAmount[]): (ItemStack | null)[] | null {
    if (items.every((it) => it.count === 0)) return this.slots;
    const next = [...this.slots];
    for (const { item, count } of items) {
      assertCount(count);
      let left = count;
      for (let i = 0; i < next.length && left > 0; i++) {
        const s = next[i];
        if (!s || !sameItem(s.item, item) || s.count >= INV.stackSize) continue;
        const put = Math.min(left, INV.stackSize - s.count);
        next[i] = { item: s.item, count: s.count + put };
        left -= put;
      }
      for (let i = 0; i < next.length && left > 0; i++) {
        if (next[i]) continue;
        const put = Math.min(left, INV.stackSize);
        next[i] = { item, count: put };
        left -= put;
      }
      if (left > 0) return null;
    }
    return next;
  }

  /** 제거 결과 칸 배열. 모자라면 null. */
  private planRemove(items: readonly ItemAmount[]): (ItemStack | null)[] | null {
    const next = [...this.slots];
    for (const { item, count } of items) {
      assertCount(count);
      let left = count;
      for (let i = next.length - 1; i >= 0 && left > 0; i--) {
        const s = next[i];
        if (!s || !sameItem(s.item, item)) continue;
        const take = Math.min(left, s.count);
        next[i] = s.count > take ? { item: s.item, count: s.count - take } : null;
        left -= take;
      }
      if (left > 0) return null;
    }
    return next;
  }

  /** INVENTORY_CHANGED 를 발행한다. */
  private changed(): void {
    this.events.emit('INVENTORY_CHANGED', undefined);
  }
}

/** 개수 인자가 0 이상의 정수인지 검사한다. */
function assertCount(count: number): void {
  if (!Number.isInteger(count) || count < 0) throw new RangeError(`개수가 잘못되었다: ${count}`);
}
