// 도토리 신문 카드 (SPEC 11.4): 한 주의 사건을 한 장에 보여 준다. World 는 읽기만 한다.
import { dayOf } from '../sim/text';
import type { World } from '../sim/types';

/** 신문 카드: 열기·닫기·지난 호 넘기기. */
export class PaperView {
  private idx = 0;
  private world: World | null = null;

  /** 단추와 바깥 누르기를 연결한다. onPick 은 기사 속 이름을 누르면 불린다. */
  constructor(private readonly onPick: (vid: number) => void) {
    const wrap = el('paperWrap');
    el('paperClose').addEventListener('click', () => this.close());
    el('paperPrev').addEventListener('click', () => {
      if (!this.world) return;
      this.idx = (this.idx + 1) % Math.max(1, this.world.papers.length);
      this.render();
    });
    wrap.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const name = t.closest<HTMLElement>('[data-vid]');
      if (name) {
        this.onPick(Number(name.dataset.vid));
        this.close();
      } else if (t === wrap) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !wrap.hidden) this.close();
    });
  }

  /** 최근 신문 단추를 보이거나 숨긴다(신문이 있을 때만). */
  sync(w: World): void {
    el('paperBtn').hidden = w.papers.length === 0;
  }

  /** no 호(없으면 가장 최근 호)를 연다. */
  open(w: World, no?: number): void {
    if (!w.papers.length) return;
    this.world = w;
    const i = no == null ? 0 : w.papers.findIndex((p) => p.no === no);
    this.idx = i < 0 ? 0 : i;
    this.render();
    el('paperWrap').hidden = false;
    el('paperClose').focus();
  }

  /** 닫는다. */
  close(): void {
    el('paperWrap').hidden = true;
  }

  /** 지금 호를 그린다. */
  private render(): void {
    const w = this.world;
    const p = w?.papers[this.idx];
    if (!w || !p) return;
    el('paperNo').textContent = `제${p.no}호 · ${dayOf(p.t)}일째 저녁`;
    el('paperHead').innerHTML = p.headline;
    el('paperItems').innerHTML = p.items.map((s) => `<li>${s}</li>`).join('');
    const prev = el('paperPrev') as HTMLButtonElement;
    prev.hidden = w.papers.length < 2;
  }
}

/** id 로 요소를 찾는다(없으면 오류). */
function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} 없음`);
  return e;
}
