// 종·저장소 패널 (MVP_SPEC 13.2 / 13.2.1 / 23, ADR 033, TASK-036). DOM 만 쓴다. 게임 상태를 소유하지 않는다.
// 종에서 열면 [성장] / [저장소] 두 탭, 상자에서 열면 [저장소] 탭만 있다. F 는 항상 이 패널 하나만 연다.
// [성장] 은 VillageLevelSystem.evaluate 결과를 그대로 그린다(조건을 UI 에서 다시 계산하지 않는다, ARCHITECTURE 17.1).
import type { DonationAmount } from '../game/systems/donation';
import type { LevelEvaluation } from '../game/systems/VillageLevelSystem';
import type { MaterialId, VillageStorageData } from '../game/types';
import type { ModalView } from './ModalController';

/** 패널이 읽는 조회와 부르는 명령. */
export interface BellPanelPort {
  evaluate(): LevelEvaluation;
  ring(): boolean;
  storage(): VillageStorageData;
  /** 플레이어 인벤토리에 있는 재료 개수 */
  carried(material: MaterialId): number;
  donate(material: MaterialId, amount: DonationAmount): number;
  /** 닫기 버튼. 포인터 락을 다시 거는 닫기다 */
  requestClose(): void;
}

/** 재료의 한글 이름. */
const MATERIAL_NAMES: Record<MaterialId, string> = { seed: '씨앗', crop: '작물', food: '음식' };
const MATERIALS: readonly MaterialId[] = ['seed', 'crop', 'food'];
/** 표시 갱신 간격(ms). */
const REFRESH_MS = 200;

type Tab = 'growth' | 'storage';

/** 버튼 하나를 만든다. */
function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  Object.assign(b.style, {
    font: '600 13px system-ui, sans-serif',
    padding: '5px 10px',
    borderRadius: '6px',
    border: '1px solid #a88a60',
    background: '#fff8ea',
    color: '#3a2f25',
    cursor: 'pointer',
  });
  b.addEventListener('click', onClick);
  return b;
}

/** 종·저장소 통합 패널. */
export class BellPanel {
  private readonly root: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private tab: Tab = 'growth';
  private withGrowth = true;
  private visible = false;
  private last = 0;

  /** parent 에 패널을 붙인다. 처음에는 숨겨져 있다. */
  constructor(
    parent: HTMLElement,
    private readonly port: BellPanelPort,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      display: 'none',
      minWidth: '360px',
      padding: '16px 18px',
      borderRadius: '12px',
      background: 'rgba(250, 244, 232, 0.97)',
      color: '#3a2f25',
      font: '14px system-ui, sans-serif',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
      userSelect: 'none',
      zIndex: '10',
    });
    this.tabs = document.createElement('div');
    Object.assign(this.tabs.style, { display: 'flex', gap: '6px', marginBottom: '12px' });
    this.body = document.createElement('div');
    const close = button('닫기', () => this.port.requestClose());
    Object.assign(close.style, { position: 'absolute', right: '12px', top: '12px' });
    this.root.append(close, this.tabs, this.body);
    parent.append(this.root);
  }

  /** 종 패널(성장·저장소 탭) 모달 화면. */
  readonly bellView: ModalView = {
    open: () => this.show(true),
    close: () => this.hide(),
  };

  /** 상자 패널(저장소 탭만) 모달 화면. */
  readonly storageView: ModalView = {
    open: () => this.show(false),
    close: () => this.hide(),
  };

  /** 열려 있는가. */
  get isOpen(): boolean {
    return this.visible;
  }

  /** 매 프레임 부른다. 열려 있을 때만 간격마다 다시 그린다(주민이 먹고 요리하는 동안 값이 바뀐다). */
  update(nowMs: number): void {
    if (!this.visible || nowMs - this.last < REFRESH_MS) return;
    this.last = nowMs;
    this.render();
  }

  /** 연다. withGrowth 면 종 패널이다. */
  private show(withGrowth: boolean): void {
    this.withGrowth = withGrowth;
    this.tab = withGrowth ? 'growth' : 'storage';
    this.visible = true;
    this.root.style.display = 'block';
    this.render();
  }

  /** 닫는다. */
  private hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
  }

  /** 탭과 본문을 다시 그린다. */
  private render(): void {
    this.tabs.replaceChildren();
    const tabs: [Tab, string][] = this.withGrowth
      ? [
          ['growth', '성장'],
          ['storage', '저장소'],
        ]
      : [['storage', '저장소']];
    for (const [t, name] of tabs) {
      const b = button(name, () => {
        this.tab = t;
        this.render();
      });
      if (t === this.tab) Object.assign(b.style, { background: '#e8c983', borderColor: '#8a6a3a' });
      this.tabs.append(b);
    }
    this.body.replaceChildren(this.tab === 'growth' ? this.growth() : this.storageTab());
  }

  /** [성장] 탭: 레벨, 모든 게이트의 현재 / 필요, 종 치기 버튼. */
  private growth(): HTMLElement {
    const e = this.port.evaluate();
    const box = document.createElement('div');
    const title = document.createElement('div');
    title.style.font = '700 16px system-ui, sans-serif';
    title.style.marginBottom = '8px';
    box.append(title);
    if (e.nextLevel === null) {
      title.textContent = `마을 레벨 ${e.level} · 최고 레벨`;
      const p = document.createElement('div');
      p.textContent = '다음 단계가 없습니다.';
      box.append(p);
      return box;
    }
    title.textContent = `마을 레벨 ${e.level} → ${e.nextLevel}`;
    const table = document.createElement('div');
    Object.assign(table.style, {
      display: 'grid',
      gridTemplateColumns: 'auto auto auto',
      gap: '4px 16px',
      marginBottom: '12px',
    });
    for (const g of e.gates) {
      const name = document.createElement('div');
      name.textContent = g.requirement;
      const value = document.createElement('div');
      value.textContent = `${g.current} / ${g.required}`;
      value.style.fontVariantNumeric = 'tabular-nums';
      const state = document.createElement('div');
      state.textContent = g.met ? 'OK' : '부족';
      Object.assign(state.style, { fontWeight: '700', color: g.met ? '#3b7d3a' : '#b0412f' });
      if (!g.met) value.style.color = '#b0412f';
      table.append(name, value, state);
      if (g.hint) {
        const hint = document.createElement('div');
        hint.textContent = g.hint;
        Object.assign(hint.style, { gridColumn: '1 / 4', fontSize: '12px', opacity: '0.75' });
        table.append(hint);
      }
    }
    const ring = button(`종을 친다 (감사 포인트 ${e.cost})`, () => {
      if (this.port.ring()) this.render();
    });
    ring.disabled = !e.canRing;
    if (!e.canRing) Object.assign(ring.style, { opacity: '0.45', cursor: 'not-allowed' });
    box.append(table, ring);
    return box;
  }

  /** [저장소] 탭: 마을 저장소 값과 재료별 기부 버튼. */
  private storageTab(): HTMLElement {
    const s = this.port.storage();
    const box = document.createElement('div');
    Object.assign(box.style, {
      display: 'grid',
      gridTemplateColumns: 'auto auto auto auto auto',
      gap: '6px 12px',
      alignItems: 'center',
    });
    for (const h of ['', '마을', '내 가방', '', '']) {
      const d = document.createElement('div');
      d.textContent = h;
      Object.assign(d.style, { fontSize: '12px', opacity: '0.7' });
      box.append(d);
    }
    for (const m of MATERIALS) {
      const carried = this.port.carried(m);
      const name = document.createElement('div');
      name.textContent = MATERIAL_NAMES[m];
      const village = document.createElement('div');
      village.textContent = String(s[m]);
      const mine = document.createElement('div');
      mine.textContent = String(carried);
      const one = button('1 개 기부', () => {
        this.port.donate(m, 1);
        this.render();
      });
      const all = button('전부 기부', () => {
        this.port.donate(m, 'all');
        this.render();
      });
      for (const b of [one, all]) {
        b.disabled = carried === 0;
        if (carried === 0) Object.assign(b.style, { opacity: '0.45', cursor: 'not-allowed' });
      }
      box.append(name, village, mine, one, all);
    }
    return box;
  }
}
