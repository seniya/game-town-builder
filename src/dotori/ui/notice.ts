// 큰 순간 알림 카드: 새 주민 도착·완공·고백 성공·파티 시작 같은 소식을 화면 왼쪽 아래에 잠깐 띄운다.
// 누르면 그 소식의 주민에게 카메라가 간다. 알림 대상은 소식 문장의 머리 이모지로 고른다(sim 은 바꾸지 않는다).
import type { FeedEntry } from '../sim/types';

/** 알림 카드로 띄울 소식인가. */
export function isHighlight(e: FeedEntry): boolean {
  const h = e.html;
  if (e.kind === 'arrive') return h.startsWith('🧳');
  if (e.kind === 'build') return h.includes('다 지어졌다') || h.includes('처음');
  if (e.kind === 'love') return h.startsWith('💑');
  if (e.kind === 'party') return h.startsWith('🎉 파티가 시작됐다');
  if (e.kind === 'find') return h.startsWith('🌰');
  return false;
}

export class Notices {
  private readonly el: HTMLElement;
  private readonly onPick: (vid: number) => void;
  private readonly maxShown = 3;
  private readonly ttl = 7000;

  /** 알림 상자를 만든다. onPick 은 카드를 누르면 불린다. */
  constructor(el: HTMLElement, onPick: (vid: number) => void) {
    this.el = el;
    this.onPick = onPick;
  }

  /** 소식 하나를 카드로 띄운다. */
  push(e: FeedEntry): void {
    const card = document.createElement('button');
    card.className = 'notice';
    card.type = 'button';
    card.innerHTML = `${e.html}${e.ids.length ? '<small>눌러서 보기</small>' : ''}`;
    const vid = e.ids[0];
    card.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (vid != null) this.onPick(vid);
      card.remove();
    });
    this.el.prepend(card);
    while (this.el.children.length > this.maxShown) this.el.lastElementChild?.remove();
    setTimeout(() => {
      card.classList.add('out');
      setTimeout(() => card.remove(), 400);
    }, this.ttl);
  }

  /** 모두 지운다(새 마을). */
  clear(): void {
    this.el.innerHTML = '';
  }
}
