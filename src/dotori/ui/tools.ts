// 가꾸기 도구 막대: 보기 / 집·꽃밭·벤치·등불·나무·길 / 치우기. 단축키 1~7, Esc 로 보기, R 로 문 방향.
import { BUILD_ORDER, BUILDABLES, type BuildKind } from '../data/buildables';
import type { Side } from '../data/villageMap';

export type ToolMode = 'view' | BuildKind | 'remove';

const SIDES: readonly Side[] = ['s', 'w', 'n', 'e'];
const SIDE_NAME: Record<Side, string> = { s: '남', w: '서', n: '북', e: '동' };

export class Toolbar {
  mode: ToolMode = 'view';
  side: Side = 's';
  private readonly el: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly onChange: (m: ToolMode) => void;

  /** 도구 막대 단추를 만든다. onChange 는 모드가 바뀔 때 불린다. */
  constructor(el: HTMLElement, hint: HTMLElement, onChange: (m: ToolMode) => void) {
    this.el = el;
    this.hint = hint;
    this.onChange = onChange;
    const btn = (mode: ToolMode, icon: string, label: string, sub: string, key: string): string =>
      `<button data-mode="${mode}" aria-pressed="false" title="${label} (${key})"><span class="ic">${icon}</span>${label}<small>${sub}</small></button>`;
    const parts = [btn('view', '👀', '보기', '주민 고르기', 'Esc'), '<span class="sep"></span>'];
    BUILD_ORDER.forEach((k, i) => {
      const d = BUILDABLES[k];
      parts.push(btn(k, d.e, d.label, d.lumber ? `목재 ${d.lumber}` : '바로', String(i + 1)));
    });
    parts.push(
      '<span class="sep"></span>',
      btn('remove', '🧹', '치우기', '놓은 것만', String(BUILD_ORDER.length + 1)),
    );
    el.innerHTML = parts.join('');
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      const m = b?.dataset.mode as ToolMode | undefined;
      if (m) this.set(this.mode === m && m !== 'view' ? 'view' : m);
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') this.set('view');
      else if (e.key === 'r' || e.key === 'R') this.rotate();
      else {
        const n = Number(e.key);
        if (n >= 1 && n <= BUILD_ORDER.length) this.set(BUILD_ORDER[n - 1] as BuildKind);
        else if (n === BUILD_ORDER.length + 1) this.set('remove');
      }
    });
    this.set('view');
  }

  /** 모드를 바꾼다. */
  set(m: ToolMode): void {
    this.mode = m;
    for (const b of this.el.querySelectorAll('button'))
      b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    this.showHint(null);
    this.onChange(m);
  }

  /** 집 문 방향을 돌린다. */
  rotate(): void {
    this.side = SIDES[(SIDES.indexOf(this.side) + 1) % SIDES.length] as Side;
    this.showHint(null);
  }

  /** 도구 설명 또는 놓을 수 없는 이유를 보인다. reason 이 null 이면 설명. */
  showHint(reason: string | null): void {
    if (this.mode === 'view') {
      this.hint.hidden = true;
      return;
    }
    this.hint.hidden = false;
    this.hint.classList.toggle('bad', !!reason);
    if (reason) {
      this.hint.textContent = reason;
      return;
    }
    if (this.mode === 'remove') {
      this.hint.textContent =
        '내가 놓은 것을 눌러 치워요. 짓는 중이면 받은 목재를, 다 지은 것은 절반을 돌려받아요';
      return;
    }
    const d = BUILDABLES[this.mode];
    const door = this.mode === 'house' ? ` · 문: ${SIDE_NAME[this.side]}쪽` : '';
    this.hint.textContent = `${d.e} ${d.label}: ${d.hint}${door} · 오른쪽 끌기로 회전, 방향키로 이동`;
  }
}
