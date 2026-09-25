// 인벤토리 / 제작 패널 (MVP_SPEC 8.5 / 23.2 / 29, TASK-015). E 로 연다. DOM 만 쓴다.
// 게임 상태를 소유하지 않는다. 표시는 조회로 읽고, 제작·칸 이동은 주입된 명령을 부른다.
import type { EventBus } from '../game/EventBus';
import type { RecipeStatus } from '../game/systems/CraftingSystem';
import type { ItemStack } from '../game/systems/InventorySystem';
import type { ItemRef } from '../game/types';
import type { ItemIconFor } from './Hotbar';
import { itemLabel } from './itemLabels';
import type { ModalView } from './ModalController';

/** 패널이 읽는 조회와 부르는 명령. */
export interface InventoryPanelPort {
  readonly slotCount: number;
  readonly hotbarSlots: number;
  slot(index: number): ItemStack | null;
  recipes(): readonly RecipeStatus[];
  craft(recipeId: string): void;
  swap(a: number, b: number): void;
  /** 닫기 버튼. 포인터 락을 다시 거는 닫기다 */
  requestClose(): void;
}

/** 블록 아이템 참조. */
function block(blockId: number): ItemRef {
  return { kind: 'block', blockId };
}

/** 인벤토리 36 칸과 레시피 목록. 칸을 차례로 두 번 누르면 두 칸을 바꾼다. */
export class InventoryPanel implements ModalView {
  private readonly root: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly list: HTMLDivElement;
  private picked: number | null = null;
  private visible = false;

  /** parent 에 패널을 붙이고 인벤토리 변경을 구독한다. 처음에는 숨겨져 있다. */
  constructor(
    parent: HTMLElement,
    events: EventBus,
    private readonly port: InventoryPanelPort,
    private readonly iconFor: ItemIconFor,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      display: 'none',
      gap: '18px',
      padding: '18px',
      borderRadius: '18px',
      background: 'rgba(250, 244, 232, 0.96)',
      color: '#3a2f25',
      font: '13px system-ui, sans-serif',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      userSelect: 'none',
      zIndex: '10',
    });
    const left = document.createElement('div');
    left.append(heading('인벤토리'));
    this.grid = document.createElement('div');
    Object.assign(this.grid.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(9, 44px)',
      gap: '4px',
    });
    left.append(this.grid);
    const right = document.createElement('div');
    right.style.width = '300px';
    right.append(heading('제작'));
    this.list = document.createElement('div');
    Object.assign(this.list.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      maxHeight: '420px',
      overflowY: 'auto',
      paddingRight: '4px',
    });
    right.append(this.list);
    const close = document.createElement('button');
    close.textContent = '닫기 (E)';
    Object.assign(close.style, { marginTop: '10px', padding: '4px 12px', cursor: 'pointer' });
    close.addEventListener('click', () => port.requestClose());
    left.append(close);
    this.root.append(left, right);
    parent.append(this.root);
    events.on('INVENTORY_CHANGED', () => {
      if (this.visible) this.render();
    });
    // 해금은 레벨이 오르는 즉시 보인다 (TASK-037)
    events.on('VILLAGE_LEVEL_UP', () => {
      if (this.visible) this.render();
    });
  }

  /** 연다. */
  open(): void {
    this.visible = true;
    this.picked = null;
    this.root.style.display = 'flex';
    this.render();
  }

  /** 닫는다. */
  close(): void {
    this.visible = false;
    this.picked = null;
    this.root.style.display = 'none';
  }

  /** 칸과 레시피를 다시 그린다. */
  render(): void {
    this.renderGrid();
    this.renderRecipes();
  }

  /** 36 칸. 가방 27 칸 위, 핫바 9 칸 아래에 둔다. */
  private renderGrid(): void {
    this.grid.replaceChildren();
    const { slotCount, hotbarSlots } = this.port;
    const order: number[] = [];
    for (let i = hotbarSlots; i < slotCount; i++) order.push(i);
    for (let i = 0; i < hotbarSlots; i++) order.push(i);
    order.forEach((index, n) => {
      const cell = document.createElement('div');
      const hotbar = index < hotbarSlots;
      Object.assign(cell.style, {
        position: 'relative',
        width: '44px',
        height: '44px',
        borderRadius: '6px',
        background: hotbar ? 'rgba(122, 95, 62, 0.28)' : 'rgba(122, 95, 62, 0.16)',
        outline: this.picked === index ? '2px solid #c98a2e' : 'none',
        marginTop: n === slotCount - hotbarSlots ? '8px' : '0',
        cursor: 'pointer',
      });
      const stack = this.port.slot(index);
      if (stack) {
        const img = document.createElement('img');
        img.src = this.iconFor(stack.item);
        Object.assign(img.style, {
          position: 'absolute',
          inset: '4px',
          width: '36px',
          height: '36px',
          imageRendering: 'pixelated',
        });
        cell.append(img);
        if (stack.count > 1) cell.append(countBadge(stack.count));
        cell.title = itemLabel(stack.item);
      }
      cell.addEventListener('click', () => this.pick(index));
      this.grid.append(cell);
    });
  }

  /** 칸 선택. 두 번째로 누른 칸과 내용을 바꾼다. */
  private pick(index: number): void {
    if (this.picked === null) {
      if (!this.port.slot(index)) return;
      this.picked = index;
      this.renderGrid();
      return;
    }
    const from = this.picked;
    this.picked = null;
    if (from !== index) this.port.swap(from, index);
    else this.renderGrid();
  }

  /** 레시피 목록. 해금되지 않은 레시피도 회색으로 보이고 필요 레벨을 표시한다 (MVP_SPEC 23.2). */
  private renderRecipes(): void {
    this.list.replaceChildren();
    for (const status of this.port.recipes()) {
      const { recipe } = status;
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '4px 6px',
        borderRadius: '6px',
        background: 'rgba(122, 95, 62, 0.1)',
        opacity: status.unlocked ? '1' : '0.45',
        filter: status.unlocked ? 'none' : 'grayscale(1)',
      });
      row.dataset.recipe = recipe.id;
      const img = document.createElement('img');
      img.src = this.iconFor(block(recipe.output.blockId));
      Object.assign(img.style, { width: '28px', height: '28px', imageRendering: 'pixelated' });
      const text = document.createElement('div');
      Object.assign(text.style, { flex: '1', minWidth: '0', whiteSpace: 'nowrap' });
      const title = document.createElement('div');
      title.textContent = `${itemLabel(block(recipe.output.blockId))} × ${recipe.output.count}`;
      title.style.fontWeight = '600';
      const needs = document.createElement('div');
      needs.style.color = '#7a5f3e';
      needs.textContent = status.unlocked
        ? recipe.inputs.map((i) => `${itemLabel(block(i.blockId))} ${i.count}`).join(' · ')
        : `마을 레벨 ${status.requiredLevel} 필요`;
      text.append(title, needs);
      const button = document.createElement('button');
      button.textContent = '만들기';
      button.disabled = !status.craftable;
      Object.assign(button.style, {
        padding: '3px 10px',
        cursor: status.craftable ? 'pointer' : 'default',
      });
      button.addEventListener('click', () => this.port.craft(recipe.id));
      row.append(img, text, button);
      this.list.append(row);
    }
  }
}

/** 제목 한 줄. */
function heading(text: string): HTMLDivElement {
  const h = document.createElement('div');
  h.textContent = text;
  Object.assign(h.style, { font: 'bold 15px system-ui, sans-serif', marginBottom: '8px' });
  return h;
}

/** 개수 표시. */
function countBadge(count: number): HTMLSpanElement {
  const c = document.createElement('span');
  c.textContent = String(count);
  Object.assign(c.style, {
    position: 'absolute',
    right: '3px',
    bottom: '0',
    color: '#fffaf0',
    font: 'bold 12px system-ui, sans-serif',
    textShadow: '0 1px 2px rgba(0,0,0,0.9)',
  });
  return c;
}
