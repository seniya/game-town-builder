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
  /** "방 경계 상시 표시" 디버그 명령 (ARCHITECTURE 26) */
  setShowRoomBounds(on: boolean): void;
  /** "통행 가능 셀 표시" 디버그 명령 (ARCHITECTURE 26) */
  setShowNavCells(on: boolean): void;
  /** 무제한 모드에서 고를 수 있는 블록 [id, 이름] */
  readonly placeableBlocks: readonly (readonly [number, string])[];
  /** 디버그 시간 배속 (MVP_SPEC 20.2) */
  setTimeScale(scale: number): void;
  /** 시각 강제 설정: 다음 도래하는 hour:minute 로 앞당긴다 (MVP_SPEC 20.3) */
  advanceClockTo(hour: number, minute: number): void;
  /** 디버그 씨앗 투입 (TASK-030) */
  addSeeds(count: number): void;
  /** 디버그 작물 투입 (TASK-031) */
  addCrops(count: number): void;
  /** 고를 수 있는 배속 */
  readonly timeScales: readonly number[];
}

/** 표시 갱신 간격(ms). 매 프레임 DOM 을 고치지 않는다. */
const REFRESH_MS = 250;

/** 좌표 표시. */
function fmtVec(v: Vec3 | BlockPos | null, digits = 2): string {
  if (!v) return '—';
  return `${v.x.toFixed(digits)}, ${v.y.toFixed(digits)}, ${v.z.toFixed(digits)}`;
}

/** 방 계측 줄 (ARCHITECTURE 26): 인식 수 / 타입별 / 큐 길이 / 마지막 판정 ms / 프레임 처리 ms. */
function roomLines(g: GameDebugSnapshot): string[] {
  const r = g.rooms;
  if (!r) return ['방 —'];
  const t = r.byType;
  return [
    `방 ${r.rooms} (식당 ${t.DiningRoom} 주방 ${t.Kitchen} 침실 ${t.Bedroom} 창고 ${t.Storeroom} 빈 방 ${t.EmptyRoom})${g.diagnosisActive ? '  [진단 중]' : ''}`,
    `재판정 큐 ${r.queueLength} · 마지막 판정 ${r.lastDetectMs.toFixed(2)} ms · 이번 프레임 ${r.lastFrameMs.toFixed(2)} ms (최대 ${r.maxFrameMs.toFixed(2)}) · 재시작 ${r.restarts}`,
  ];
}

/** F3 로 여닫는 디버그 패널. */
export class DebugPanel {
  private readonly root: HTMLDivElement;
  private readonly text: HTMLPreElement;
  private readonly unlimited: HTMLInputElement;
  private readonly blockSelect: HTMLSelectElement;
  private readonly roomBounds: HTMLInputElement;
  private readonly navCells: HTMLInputElement;
  private readonly scaleButtons = new Map<number, HTMLButtonElement>();
  private readonly extraRows: HTMLElement;
  private extraLines: (() => string[]) | null = null;
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
    const roomControls = document.createElement('label');
    Object.assign(roomControls.style, { display: 'flex', gap: '6px', alignItems: 'center' });
    this.roomBounds = document.createElement('input');
    this.roomBounds.type = 'checkbox';
    this.roomBounds.addEventListener('change', () =>
      port.setShowRoomBounds(this.roomBounds.checked),
    );
    this.navCells = document.createElement('input');
    this.navCells.type = 'checkbox';
    this.navCells.addEventListener('change', () => port.setShowNavCells(this.navCells.checked));
    roomControls.append(
      this.roomBounds,
      document.createTextNode('방 경계 상시 표시'),
      this.navCells,
      document.createTextNode('통행 가능 셀 표시'),
    );
    const timeControls = document.createElement('div');
    Object.assign(timeControls.style, { display: 'flex', gap: '4px', alignItems: 'center' });
    timeControls.append(document.createTextNode('시간'));
    for (const scale of port.timeScales) {
      const b = document.createElement('button');
      b.textContent = `${scale}×`;
      b.addEventListener('click', () => port.setTimeScale(scale));
      this.scaleButtons.set(scale, b);
      timeControls.append(b);
    }
    const hourInput = document.createElement('input');
    Object.assign(hourInput, { type: 'number', min: '0', max: '23', step: '1', value: '20' });
    hourInput.style.width = '3.5em';
    const jump = document.createElement('button');
    jump.textContent = '시로 앞당기기';
    jump.addEventListener('click', () => {
      const h = Math.floor(Number(hourInput.value));
      if (h >= 0 && h <= 23) port.advanceClockTo(h, 0);
    });
    const seeds = document.createElement('button');
    seeds.textContent = '씨앗 +5';
    seeds.addEventListener('click', () => port.addSeeds(5));
    const crops = document.createElement('button');
    crops.textContent = '작물 +2';
    crops.addEventListener('click', () => port.addCrops(2));
    timeControls.append(hourInput, jump, seeds, crops);
    this.extraRows = document.createElement('div');
    this.root.append(this.text, controls, roomControls, timeControls, this.extraRows);
    // 패널 조작 클릭이 뒤의 메뉴(클릭하면 계속)로 전달되지 않게 한다
    this.root.addEventListener('mousedown', (e) => e.stopPropagation());
    parent.append(this.root);
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'F3' || e.repeat) return;
      e.preventDefault();
      this.toggle();
    });
  }

  /** 후속 Task 의 추가 표시 줄(NPC·통행 등)과 조작 요소를 붙인다. */
  addSection(lines: () => string[], controls: readonly HTMLElement[] = []): void {
    const prev = this.extraLines;
    this.extraLines = () => [...(prev ? prev() : []), ...lines()];
    this.extraRows.append(...controls);
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
    this.roomBounds.checked = g.showRoomBounds;
    this.navCells.checked = g.showNavCells;
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
      ...roomLines(g),
      `시간 ${g.clockText ?? '—'} (${g.phase ?? '—'}) · 배속 ${g.timeScale}× · gameMinutes ${g.gameMinutes?.toFixed(1) ?? '—'}`,
      g.nav && g.paths
        ? `통행 캐시 ${g.nav.cachedCells} · 감시 칸 ${g.nav.watchedCells} · 경로 대기 ${g.paths.pending} · 이번 프레임 확장 ${g.paths.lastFrameNodes} · 완료 ${g.paths.completed}`
        : '통행 —',
      g.farm
        ? `농사: 밭 ${g.farm.farmland} · 작물 ${g.farm.crops} (성숙 ${g.farm.mature}) · 예약 ${g.farm.claims} · 씨앗 ${g.seed ?? '—'}`
        : '농사 —',
      g.cooking
        ? `요리: 화덕 ${g.cooking.stoves} · 예약 ${g.cooking.claims} · 조리 중 ${g.cooking.cooking} (재료 예약 ${g.cooking.reservedCrop}) · 작물 ${g.crop ?? '—'} · 음식 ${g.food ?? '—'}`
        : '요리 —',
      `NPC ${g.npcs.length}${g.sleep ? ` · 침대 배정 ${g.sleep.assigned}/${g.sleep.beds} (확인 중 ${g.sleep.checking})` : ''}`,
      ...g.npcs.map(
        (n) =>
          `  ${n.id}: ${n.label} · 목적지 ${fmtVec(n.destination, 0)} · 경로 ${n.pathLength} · 침대 ${n.bed ?? '—'}`,
      ),
      ...(this.extraLines ? this.extraLines() : []),
      `몬스터 / 감사 / 레벨 / WorldState: 해당 Task 에서 추가`,
    ].join('\n');
    for (const [scale, b] of this.scaleButtons)
      b.style.fontWeight = scale === g.timeScale ? 'bold' : 'normal';
  }
}
