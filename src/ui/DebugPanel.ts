// F3 디버그 패널 (ARCHITECTURE 26, TASK-016). DOM 만 쓴다. 표시값은 주입된 조회로 읽는다.
// 모달이 아니며 조작을 막지 않는다. 체크박스는 커서가 있을 때(메뉴·모달 중) 누를 수 있다.
import type { GameDebugSnapshot } from '../game/systems/DebugSystem';
import type { BlockPos, Vec3 } from '../game/types';

/** 렌더 쪽 계측. main 이 Renderer 에서 읽어 넘긴다. */
export interface RenderDebugStats {
  readonly fps: number;
  readonly frameMs: number;
  readonly maxFrameMs: number;
  readonly drawCalls: number;
  readonly chunksTotal: number;
  readonly chunksMeshed: number;
  readonly chunksPending: number;
  readonly chunksInFlight: number;
  readonly uploadsThisFrame: number;
}

/** 패널이 읽는 조회와 부르는 명령. */
export interface DebugPanelPort {
  game(): GameDebugSnapshot;
  render(): RenderDebugStats;
  setUnlimitedBlocks(on: boolean): void;
  setUnlimitedBlockId(blockId: number): void;
  /** 무제한 모드에서 고를 수 있는 블록 [id, 이름] */
  readonly placeableBlocks: readonly (readonly [number, string])[];
}

/** 표시 갱신 간격(ms). 매 프레임 DOM 을 고치지 않는다. */
const REFRESH_MS = 250;

/** 좌표 표시. */
function fmtVec(v: Vec3 | BlockPos | null, digits = 2): string {
  if (!v) return '—';
  return `${v.x.toFixed(digits)}, ${v.y.toFixed(digits)}, ${v.z.toFixed(digits)}`;
}

/** F3 로 여닫는 디버그 패널. */
export class DebugPanel {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly unlimited: HTMLInputElement;
  private readonly blockSelect: HTMLSelectElement;
  private open = false;
  private lastRefresh = 0;

  /** parent 에 패널을 붙이고 F3 키를 연결한다. 처음에는 닫혀 있다. */
  constructor(
    parent: HTMLElement,
    private readonly port: DebugPanelPort,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '8px',
      top: '8px',
      display: 'none',
      padding: '8px 10px',
      borderRadius: '6px',
      background: 'rgba(12, 14, 16, 0.72)',
      color: '#d8f0d0',
      font: '12px ui-monospace, monospace',
      zIndex: '30',
      userSelect: 'none',
    });
    this.text = document.createElement('pre');
    Object.assign(this.text.style, { margin: '0 0 6px 0', font: 'inherit' });
    const controls = document.createElement('label');
    Object.assign(controls.style, { display: 'flex', gap: '6px', alignItems: 'center' });
    this.unlimited = document.createElement('input');
    this.unlimited.type = 'checkbox';
    this.unlimited.addEventListener('change', () =>
      port.setUnlimitedBlocks(this.unlimited.checked),
    );
    this.blockSelect = document.createElement('select');
    for (const [id, name] of port.placeableBlocks) {
      const o = document.createElement('option');
      o.value = String(id);
      o.textContent = name;
      this.blockSelect.append(o);
    }
    this.blockSelect.addEventListener('change', () =>
      port.setUnlimitedBlockId(Number(this.blockSelect.value)),
    );
    controls.append(
      this.unlimited,
      document.createTextNode('블록 무제한 · 빈 칸이면'),
      this.blockSelect,
    );
    const note = document.createElement('div');
    note.textContent = '시간 배속: TASK-023 에서 연결 (비활성)';
    note.style.opacity = '0.6';
    this.root.append(this.text, controls, note);
    // 패널 조작 클릭이 뒤의 메뉴(클릭하면 계속)로 전달되지 않게 한다
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
    parent.append(this.root);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'F3' || e.repeat) return;
      e.preventDefault();
      this.toggle();
    });
  }

  /** 열려 있는가. */
  get isOpen(): boolean {
    return this.open;
  }

  /** 여닫는다. */
  toggle(): void {
    this.open = !this.open;
    this.root.style.display = this.open ? 'block' : 'none';
    this.lastRefresh = 0;
  }

  /** 매 프레임 부른다. 열려 있고 갱신 간격이 지났을 때만 DOM 을 고친다. */
  update(nowMs: number): void {
    if (!this.open || nowMs - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = nowMs;
    const g = this.port.game();
    const r = this.port.render();
    this.unlimited.checked = g.unlimitedBlocks;
    if (g.unlimitedBlockId !== null && document.activeElement !== this.blockSelect) {
      this.blockSelect.value = String(g.unlimitedBlockId);
    }
    this.text.textContent = [
      `FPS ${r.fps.toFixed(0)}  프레임 ${r.frameMs.toFixed(1)} ms (최대 ${r.maxFrameMs.toFixed(1)})`,
      `드로우콜 ${r.drawCalls}`,
      `청크 ${r.chunksMeshed}/${r.chunksTotal} 메싱됨 · 대기 ${r.chunksPending} · 메싱 중 ${r.chunksInFlight} · 업로드 ${r.uploadsThisFrame}`,
      `플레이어 ${fmtVec(g.playerPos)}  ${g.onGround ? '지면' : '공중'}`,
      `안전 지면 ${fmtVec(g.lastSafeCell, 0)}`,
      `조준 ${fmtVec(g.aimTarget, 0)}  면 ${fmtVec(g.aimFace, 0)}  파괴 ${(g.breakProgress * 100).toFixed(0)}%`,
      `마지막 편집 실패 ${g.lastEditFailure ?? '—'}`,
      `방 / NPC / 몬스터 / 감사 / 레벨 / WorldState / 시간: 해당 Task 에서 추가`,
    ].join('\n');
  }
}
