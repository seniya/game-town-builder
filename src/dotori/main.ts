// 도토리 마을(v2) 시작점: 에셋 불러오기 → 저장 불러오기(없으면 새 마을) → 입력·패널 연결 → 메인 루프.
// 1× 에서 실제 1 초에 게임 6 분(SPEC 1). 주소 ?fresh=1 새 마을, ?seed=N 시드, ?ff=분 미리 진행, ?scene=grown 가꾼 마을,
// ?residents=N 처음 주민 수(큰 마을 시험), ?debug=1 계측 표시.
import './ui/style.css';
import { TIME } from './data/balance';
import { BUILDABLES, type BuildKind } from './data/buildables';
import { Renderer3D, type ViewState } from './render/Renderer3D';
import { checkPlace } from './sim/build';
import { place, plantGhost, plantLove, plantParty, remove } from './sim/commands';
import { newWorld } from './sim/create';
import { deserialize, serialize } from './sim/save';
import { computeStats } from './sim/stats';
import { run, step } from './sim/step';
import { NJ } from './sim/text';
import type { World } from './sim/types';
import { log } from './sim/world';
import {
  appendFeed,
  resetFeed,
  updateClock,
  updatePerson,
  updateRumors,
  updateStats,
} from './ui/panel';
import { isHighlight, Notices } from './ui/notice';
import { Toolbar, type ToolMode } from './ui/tools';

const SAVE_KEY = 'dotori.save.v1';
const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 없음`);
  return el;
};
const params = new URLSearchParams(location.search);

const view: ViewState = {
  selected: null,
  follow: false,
  hover: null,
  ghost: null,
  reduceMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
};
let world: World;
let speed = 1;
let lastSpeed = 1;
const r3 = new Renderer3D();

/** 저장소 읽기(쓸 수 없는 환경이면 null). */
function readSave(): string | null {
  try {
    return window.localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

/** 저장한다. 실패해도 게임은 계속된다(SPEC 6). */
function writeSave(): void {
  try {
    window.localStorage.setItem(SAVE_KEY, serialize(world));
  } catch {
    // 사생활 보호 창·용량 초과: 저장 없이 계속한다.
  }
}

/** 저장을 지운다. */
function clearSave(): void {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // 무시
  }
}

/** 관찰용 장면 'grown': 집 셋·꽃밭 둘·벤치·등불을 놓고 이틀 반을 돌린 마을. */
function grownScene(w: World): void {
  const plan: [BuildKind, number, number][] = [
    ['bench', 45, 22],
    ['flowerbed', 44, 24],
    ['lamp', 49, 21],
    ['house', 50, 21],
    ['house', 54, 21],
    ['flowerbed', 28, 10],
    ['bench', 30, 11],
    ['house', 58, 21],
    ['lamp', 53, 25],
  ];
  for (const [k, x, y] of plan) place(w, k, x, y, 's');
  w.lumber += 40;
  run(w, 1440 * 2 + 660);
}

/** 새 마을을 만든다. */
function freshWorld(seed: number): World {
  const n = Number(params.get('residents')) || undefined;
  const w = newWorld(seed, n ? { residents: n } : {});
  if (params.get('scene') === 'grown') grownScene(w);
  return w;
}

/** World 를 화면에 붙인다(새 마을·불러오기). */
function attach(w: World): void {
  world = w;
  computeStats(w);
  r3.rebuild(w);
  resetFeed(w);
  notices.clear();
  w.out.length = 0;
  const host = w.party ? w.vs[w.party.host] : undefined;
  $('intro').innerHTML = host
    ? `제멋대로인 주민 ${w.vs.length}명이 사는 작은 마을이에요. 오늘 밤 7시, 파티광 ${NJ(host, '가', '이')} 광장에서 파티를 열고 싶어 해요. 아래 도구로 집과 꽃밭을 놓으면 목수들이 목재를 날라 직접 지어요.`
    : `제멋대로인 주민 ${w.vs.length}명이 사는 작은 마을이에요. 아래 도구로 집과 꽃밭을 놓으면 목수들이 목재를 날라 직접 지어요.`;
  view.selected = host?.id ?? w.vs[0]?.id ?? null;
  view.follow = false;
  $('followBtn').setAttribute('aria-pressed', 'false');
  r3.fit();
  refreshPanels();
}

/** 패널 전체 갱신. */
function refreshPanels(): void {
  updateClock(world);
  updateStats(world);
  updateRumors(world);
  const v = view.selected != null ? (world.vs[view.selected] ?? null) : null;
  updatePerson(world, v, drawPortrait);
}

/** 초상화를 카드 캔버스에 그린다(같은 사람이면 다시 그리지 않는다). */
function drawPortrait(c: HTMLCanvasElement, v: World['vs'][number]): void {
  if (c.dataset.vid === String(v.id)) return;
  c.dataset.vid = String(v.id);
  const g = c.getContext('2d');
  if (!g) return;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(r3.portrait(v), 0, 0, c.width, c.height);
}

/** 주민을 고른다. center 면 카메라를 옮긴다. */
function select(id: number | null, center: boolean): void {
  view.selected = id;
  const v = id != null ? world.vs[id] : undefined;
  if (v && center) {
    const b = v.inside != null ? world.bmap.get(v.inside) : undefined;
    r3.focus(b ? b.door.x + 0.5 : v.x, b ? b.door.y + 0.5 : v.y);
  }
  refreshPanels();
}

let toast: ReturnType<typeof setTimeout> | null = null;
/** 화면 위쪽에 짧은 알림. */
function say(text: string): void {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('hide');
  if (toast) clearTimeout(toast);
  toast = setTimeout(() => el.classList.add('hide'), 2200);
}

/** 큰 순간 알림 카드. 누르면 그 주민을 고르고 카메라를 옮긴다. */
const notices = new Notices($('notices'), (vid) => select(vid, true));

/** 도구 막대. */
const tools = new Toolbar($('tools'), $('toolHint'), (m: ToolMode) => {
  r3.setPanEnabled(m === 'view');
  if (m === 'view') view.ghost = null;
  ($('world') as HTMLCanvasElement).style.cursor = m === 'view' ? 'grab' : 'crosshair';
});

/** 마우스 칸 위치에 도구 미리보기를 둔다. */
function updateGhost(sx: number, sy: number): void {
  const m = tools.mode;
  if (m === 'view') return;
  const t = r3.pickTile(sx, sy);
  if (!t) {
    view.ghost = null;
    return;
  }
  if (m === 'remove') {
    const has =
      world.blueprints.some(
        (b) => t.x >= b.x && t.x < b.x + b.w && t.y >= b.y && t.y < b.y + b.h,
      ) ||
      world.decor.some(
        (d) => d.playerBuilt && t.x >= d.x && t.x < d.x + d.w && t.y >= d.y && t.y < d.y + d.h,
      ) ||
      world.buildings.some(
        (b) => b.playerBuilt && t.x >= b.x && t.x < b.x + b.w && t.y >= b.y && t.y < b.y + b.h,
      );
    view.ghost = { kind: 'remove', x: t.x, y: t.y, side: 's', ok: has };
    return;
  }
  const d = BUILDABLES[m];
  const x = t.x - Math.floor((d.w - 1) / 2);
  const y = t.y - Math.floor((d.h - 1) / 2);
  const chk = checkPlace(world, m, x, y, tools.side);
  view.ghost = { kind: m, x, y, side: tools.side, ok: chk.ok };
  tools.showHint(chk.ok ? null : chk.reason);
}

/** 미리보기 자리에 놓거나 치운다. */
function applyTool(quiet: boolean): void {
  const g = view.ghost;
  if (!g) return;
  if (g.kind === 'remove') {
    const r = remove(world, g.x, g.y);
    if (!quiet) say(r.ok ? '🧹 치웠어요' : r.reason);
    return;
  }
  const r = place(world, g.kind, g.x, g.y, g.side);
  if (!r.ok) {
    if (!quiet) say(r.reason);
    return;
  }
  const d = BUILDABLES[g.kind];
  if (d.work > 0) {
    if (!quiet) say(`${d.e} ${d.label} 청사진을 놓았어요. 목수가 곧 목재를 날라 와요`);
    log(world, `📐 당신이 ${d.label} 청사진을 놓았다.`, [], 'plant');
  }
  updateStats(world);
}

/** 캔버스 입력: 짧게 누르면 고르기·놓기, 끌면 카메라(보기) 또는 칠하기(길·나무). */
function bindInput(el: HTMLCanvasElement): void {
  let down: { x: number; y: number; btn: number } | null = null;
  let painting = false;
  const rel = (e: PointerEvent): [number, number] => {
    const b = el.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  };
  el.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, btn: e.button };
    $('camHint').classList.add('hide');
    const paintable = tools.mode === 'road' || tools.mode === 'tree';
    if (e.button === 0 && paintable) {
      painting = true;
      const [sx, sy] = rel(e);
      updateGhost(sx, sy);
      applyTool(true);
    }
  });
  el.addEventListener('pointermove', (e) => {
    const [sx, sy] = rel(e);
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 && tools.mode === 'view') {
      if (view.follow) {
        view.follow = false;
        $('followBtn').setAttribute('aria-pressed', 'false');
      }
    }
    if (tools.mode === 'view') {
      if (!down) {
        view.hover = r3.pickVillager(sx, sy);
        el.style.cursor = view.hover != null ? 'pointer' : 'grab';
      }
      return;
    }
    updateGhost(sx, sy);
    if (painting) applyTool(true);
  });
  el.addEventListener('pointerup', (e) => {
    const [sx, sy] = rel(e);
    const click = down && down.btn === 0 && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 6;
    if (click && tools.mode === 'view') {
      const id = r3.pickVillager(sx, sy);
      if (id != null) select(id, false);
    } else if (click && !painting && tools.mode !== 'view') {
      updateGhost(sx, sy);
      applyTool(false);
    }
    painting = false;
    down = null;
  });
  el.addEventListener('pointerleave', () => {
    if (tools.mode !== 'view') view.ghost = null;
    view.hover = null;
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

/** 버튼과 키를 연결한다. */
function bindControls(): void {
  document.querySelector('.side')?.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-vid]');
    if (t) select(Number(t.dataset.vid), true);
  });
  $('followBtn').addEventListener('click', () => {
    view.follow = !view.follow;
    $('followBtn').setAttribute('aria-pressed', String(view.follow));
  });
  const withSel = (fn: (w: World, v: World['vs'][number]) => boolean): void => {
    const v = view.selected != null ? world.vs[view.selected] : undefined;
    if (v && fn(world, v)) refreshPanels();
  };
  $('plParty').addEventListener('click', () => withSel(plantParty));
  $('plLove').addEventListener('click', () => withSel(plantLove));
  $('plGhost').addEventListener('click', () => withSel(plantGhost));
  const setSpeed = (s: number): void => {
    speed = s;
    for (const [id, val] of [
      ['sp0', 0],
      ['sp1', 1],
      ['sp3', 3],
      ['sp8', 8],
    ] as const)
      $(id).setAttribute('aria-pressed', String(val === s));
  };
  $('sp0').addEventListener('click', () => {
    if (speed) lastSpeed = speed;
    setSpeed(0);
  });
  $('sp1').addEventListener('click', () => setSpeed(1));
  $('sp3').addEventListener('click', () => setSpeed(3));
  $('sp8').addEventListener('click', () => setSpeed(8));
  // 확인 창(confirm)은 아티팩트 보기 화면에서 막혀 있어, 한 번 더 누르면 새로 시작하는 방식으로 묻는다.
  let resetArmed: ReturnType<typeof setTimeout> | null = null;
  $('reset').addEventListener('click', () => {
    const btn = $('reset');
    if (!resetArmed) {
      btn.textContent = '정말 새로? 한 번 더';
      resetArmed = setTimeout(() => {
        resetArmed = null;
        btn.textContent = '새 마을';
      }, 3000);
      return;
    }
    clearTimeout(resetArmed);
    resetArmed = null;
    btn.textContent = '새 마을';
    clearSave();
    attach(freshWorld((Math.random() * 1e9) | 0));
    writeSave();
    say('🌱 새 마을을 시작했어요');
  });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (speed) {
        lastSpeed = speed;
        setSpeed(0);
      } else setSpeed(lastSpeed || 1);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') writeSave();
  });
}

/** 메인 루프: 실제 시간 → 틱 → sim 알림 비우기 → 그리기 → 패널. */
function loop(): void {
  let last = performance.now();
  let acc = 0;
  let lastUI = 0;
  let lastR = 0;
  // ?debug=1: 프레임·시뮬레이션 시간 계측(SPEC 7 측정용).
  const dbg = params.get('debug') ? document.createElement('div') : null;
  if (dbg) {
    dbg.className = 'debug';
    $('stage').append(dbg);
  }
  let simMs = 0;
  let frames = 0;
  let fpsT = performance.now();
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const s0 = performance.now();
    if (speed > 0) {
      acc += dt * speed * TIME.minPerSec;
      let n = 0;
      while (acc >= 1 && n < TIME.maxTicksPerFrame) {
        step(world);
        acc -= 1;
        n++;
        if (world.t % 60 === 0) writeSave();
      }
      if (n >= TIME.maxTicksPerFrame) acc = 0;
    }
    simMs += performance.now() - s0;
    frames++;
    if (dbg && now - fpsT > 1000) {
      dbg.textContent = `${Math.round((frames * 1000) / (now - fpsT))} fps · 시뮬 ${(simMs / frames).toFixed(2)} ms/프레임 · 주민 ${world.vs.length}`;
      frames = 0;
      simMs = 0;
      fpsT = now;
    }
    for (const ev of world.out) {
      if (ev.type === 'log') {
        appendFeed(ev.entry);
        if (isHighlight(ev.entry)) notices.push(ev.entry);
      } else if (ev.type === 'fx') r3.fx(world, ev.vid, ev.fx);
      else r3.siteFx(ev.x, ev.y, ev.fx);
    }
    world.out.length = 0;
    const dtA = speed > 0 ? dt * (speed >= 8 ? 1.6 : speed >= 3 ? 1.25 : 1) : 0;
    r3.frame(world, dt, dtA, Math.min(1, acc), now);
    if (now - lastUI > 250) {
      lastUI = now;
      updateClock(world);
      updateStats(world);
      const v = view.selected != null ? (world.vs[view.selected] ?? null) : null;
      updatePerson(world, v, drawPortrait);
    }
    if (now - lastR > 1000) {
      lastR = now;
      updateRumors(world);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** 시작. */
async function main(): Promise<void> {
  const pct = $('loadPct');
  try {
    await r3.load(`${import.meta.env.BASE_URL}dotori/assets`, (p) => {
      pct.textContent = `${Math.round(p * 100)}%`;
    });
  } catch (e) {
    $('loading').textContent = `3D 모델을 불러오지 못했어요: ${(e as Error).message}`;
    throw e;
  }
  $('loading').hidden = true;
  r3.init($('world') as HTMLCanvasElement, $('stage'), view);
  bindInput($('world') as HTMLCanvasElement);
  bindControls();
  const saved = params.get('fresh') || params.get('scene') ? null : readSave();
  const loaded = saved ? deserialize(saved) : null;
  if (saved && !loaded) say('저장을 읽지 못해 새 마을로 시작해요');
  attach(loaded ?? freshWorld(Number(params.get('seed')) || 20260926));
  const ff = Number(params.get('ff')) || 0;
  for (let i = 0; i < ff; i++) step(world);
  world.out.length = 0;
  if (ff) resetFeed(world);
  // 자동 관찰(headless)용 손잡이. 게임 상태를 바꾸는 명령은 UI 와 같은 sim 명령만 쓴다.
  (window as unknown as { __dotori: unknown }).__dotori = {
    get world() {
      return world;
    },
    view,
    tools,
    r3,
    select,
    setSpeed: (s: number) => {
      speed = s;
      for (const [id, val] of [
        ['sp0', 0],
        ['sp1', 1],
        ['sp3', 3],
        ['sp8', 8],
      ] as const)
        $(id).setAttribute('aria-pressed', String(val === s));
    },
  };
  loop();
}

void main();
