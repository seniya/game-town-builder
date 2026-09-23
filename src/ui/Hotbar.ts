// 화면 하단 핫바 9 칸 (MVP_SPEC 29, TASK-014). DOM 만 쓴다. INVENTORY_CHANGED 를 구독해 표시만 한다.
import type { EventBus } from '../game/EventBus';
import type { ItemStack } from '../game/systems/InventorySystem';
import type { ItemRef } from '../game/types';
import { itemLabel } from './itemLabels';

/** 핫바가 읽는 인벤토리 조회. */
export interface HotbarSource {
  readonly selected: number;
  slot(index: number): ItemStack | null;
}

/** 아이템 → 아이콘 URL. main.ts 가 render 의 아이콘 생성기를 주입한다. */
export type ItemIconFor = (item: ItemRef) => string;

/** 칸 하나의 DOM. */
interface SlotView {
  readonly root: HTMLDivElement;
  readonly icon: HTMLImageElement;
  readonly count: HTMLSpanElement;
}

/** 핫바. 선택 칸을 강조하고, 선택이 바뀌면 아이템 이름을 잠깐 보인다. */
export class Hotbar {
  private readonly views: SlotView[] = [];
  private readonly name: HTMLDivElement;
  private nameTimer = 0;
  private lastSelected = -1;
  private lastSelectedKey = '';

  /** root 에 핫바를 붙이고 인벤토리 변경을 구독한다. */
  constructor(
    root: HTMLElement,
    events: EventBus,
    private readonly source: HotbarSource,
    private readonly iconFor: ItemIconFor,
    slots: number,
  ) {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'fixed',
      left: '50%',
      bottom: '14px',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '4px',
      padding: '5px',
      borderRadius: '10px',
      background: 'rgba(28, 24, 20, 0.55)',
      pointerEvents: 'none',
      userSelect: 'none',
    });
    for (let i = 0; i < slots; i++) {
      const cell = document.createElement('div');
      Object.assign(cell.style, {
        position: 'relative',
        width: '48px',
        height: '48px',
        borderRadius: '6px',
        background: 'rgba(255, 248, 232, 0.12)',
        boxSizing: 'border-box',
      });
      const icon = document.createElement('img');
      Object.assign(icon.style, {
        position: 'absolute',
        inset: '4px',
        width: '40px',
        height: '40px',
        imageRendering: 'pixelated',
      });
      const count = document.createElement('span');
      Object.assign(count.style, {
        position: 'absolute',
        right: '4px',
        bottom: '1px',
        color: '#fffaf0',
        font: 'bold 13px system-ui, sans-serif',
        textShadow: '0 1px 2px rgba(0,0,0,0.9)',
      });
      const key = document.createElement('span');
      key.textContent = String(i + 1);
      Object.assign(key.style, {
        position: 'absolute',
        left: '4px',
        top: '1px',
        color: 'rgba(255, 250, 240, 0.55)',
        font: '10px system-ui, sans-serif',
      });
      cell.append(icon, count, key);
      bar.append(cell);
      this.views.push({ root: cell, icon, count });
    }
    this.name = document.createElement('div');
    Object.assign(this.name.style, {
      position: 'fixed',
      left: '50%',
      bottom: '78px',
      transform: 'translateX(-50%)',
      color: '#fffaf0',
      font: '15px system-ui, sans-serif',
      textShadow: '0 1px 3px rgba(0,0,0,0.9)',
      pointerEvents: 'none',
      transition: 'opacity 0.3s',
      opacity: '0',
    });
    root.append(bar, this.name);
    events.on('INVENTORY_CHANGED', () => this.render());
    this.render();
  }

  /** 인벤토리 상태로 칸을 다시 그린다. */
  render(): void {
    this.views.forEach((v, i) => {
      const stack = this.source.slot(i);
      if (stack) {
        const url = this.iconFor(stack.item);
        if (v.icon.src !== url) v.icon.src = url;
        v.icon.style.display = 'block';
        v.count.textContent = stack.count > 1 ? String(stack.count) : '';
        v.root.title = itemLabel(stack.item);
      } else {
        v.icon.style.display = 'none';
        v.icon.removeAttribute('src');
        v.count.textContent = '';
        v.root.title = '';
      }
      const selected = i === this.source.selected;
      v.root.style.outline = selected ? '2px solid #ffe7a8' : 'none';
      v.root.style.background = selected
        ? 'rgba(255, 231, 168, 0.28)'
        : 'rgba(255, 248, 232, 0.12)';
    });
    this.flashName();
  }

  /** 선택 칸이나 그 칸의 아이템이 바뀌었으면 이름을 1.5 초 보인다. */
  private flashName(): void {
    const stack = this.source.slot(this.source.selected);
    const key = stack ? itemLabel(stack.item) : '';
    if (this.source.selected === this.lastSelected && key === this.lastSelectedKey) return;
    this.lastSelected = this.source.selected;
    this.lastSelectedKey = key;
    if (!stack) {
      this.name.style.opacity = '0';
      return;
    }
    this.name.textContent = key;
    this.name.style.opacity = '1';
    window.clearTimeout(this.nameTimer);
    this.nameTimer = window.setTimeout(() => (this.name.style.opacity = '0'), 1500);
  }
}
