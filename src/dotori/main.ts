// 도토리 마을(v2) 시작점: 에셋 불러오기 → 저장 불러오기(없으면 새 마을) → 입력·패널 연결 → 메인 루프.
// 1× 에서 실제 1 초에 게임 6 분(SPEC 1). 주소 ?fresh=1 새 마을, ?seed=N 시드, ?ff=분 미리 진행, ?scene=grown 가꾼 마을,
// ?residents=N 처음 주민 수(큰 마을 시험), ?map=large 큰 지도(160 × 104), ?debug=1 계측 표시, ?lod=0 주민 LOD 끄기(비교 측정).
import './ui/style.css';
import { SoundSystem } from './audio/Sound';
import { atten } from './audio/mix';
import { TIME } from './data/balance';
import { BUILDABLES, type BuildKind } from './data/buildables';
import { LAYOUTS, type MapId } from './data/villageMap';
import { Renderer3D, type ViewState } from './render/Renderer3D';
import { checkPlace } from './sim/build';
import { place, plantGhost, plantLove, plantParty, remove } from './sim/commands';
import { newWorld } from './sim/create';
import { mk } from './sim/decide';
import { getT, recomputeLocations, setT } from './sim/map';
import { startConv } from './sim/social';
import { pathStats } from './sim/path';
import { deserialize, serialize } from './sim/save';
import { computeStats } from './sim/stats';
import { run, step } from './sim/step';
import { NJ } from './sim/text';
import { TILE, type World } from './sim/types';
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
import { PaperView } from './ui/paper';
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
const sound = new SoundSystem();
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
  // 동작 보기판은 그림 확인용이라 저장하지 않는다(진짜 마을 저장을 덮지 않게)
  if (lab) return;
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

/** 동작 보기판(SPEC 13, `?scene=motion`)에서 걸어 다니는 사람: 좌우로 오간다. */
interface LabWalker {
  v: World['vs'][number];
  x0: number;
  x1: number;
  spd: number;
  dir: number;
}

/** 동작 보기판 상태. 시뮬레이션은 멈추고 동작만 흐른다. */
let lab: { walkers: LabWalker[]; talk: [number, number] | null; t: number } | null = null;

/**
 * 관찰용 장면 'motion'(SPEC 13): 남쪽 큰길(42 번 줄)에 주민을 한 줄로 세워 몸짓을 나란히 보인다.
 * 시뮬레이션 규칙은 쓰지 않고 행동만 정해 둔다(그림 확인용). 이름표가 동작 이름이다.
 */
function motionScene(w: World): void {
  w.t = 10 * 60;
  for (const v of w.vs) v.inside = v.home;
  const row = 42;
  const slots: {
    name: string;
    job: World['vs'][number]['job'];
    act?: Parameters<typeof mk>[1];
    where?: 'harvest' | null;
    walk?: number;
    pack?: 'lumber' | 'wheat' | 'bag';
  }[] = [
    { name: '망치질', job: '목수', act: 'build' },
    { name: '공방 망치', job: '목수', act: 'work' },
    { name: '도끼질', job: '나무꾼', act: 'work' },
    { name: '괭이질', job: '농부', act: 'work' },
    { name: '거두기', job: '농부', act: 'work', where: 'harvest' },
    { name: '둘러보기', job: '한량', act: 'idle' },
    { name: '말하기', job: '한량' },
    { name: '듣기', job: '한량' },
    { name: '걷기', job: '한량', walk: 2 },
    { name: '짐 지고', job: '목수', walk: 1.6, pack: 'lumber' },
    { name: '수레', job: '농부', walk: 1.6, pack: 'wheat' },
    { name: '달리기', job: '한량', walk: 3.6 },
  ];
  lab = { walkers: [], talk: null, t: 0 };
  // 줄 둘레의 나무를 치워 가리지 않게 한다
  for (let y = row - 2; y <= row + 5; y++)
    for (let x = 27; x < 64; x++) if (getT(w, x, y) === TILE.FOREST) setT(w, x, y, TILE.GRASS);
  recomputeLocations(w);
  w.staticVersion++;
  slots.forEach((sl, i) => {
    const v = w.vs[i];
    if (!v) return;
    // 대화하는 두 사람(6·7 번)은 마주 보게 가까이 선다
    const x = 30 + i * 2.6 + (i === 7 ? -1.4 : 0);
    v.name = sl.name;
    v.job = sl.job;
    v.inside = null;
    v.talk = null;
    v.x = v.px = x;
    v.y = v.py = row + 0.5;
    v.dir = { x: 0, y: 1 };
    v.pack = sl.pack ? { kind: sl.pack, n: 6, site: null } : null;
    if (sl.walk) {
      v.act = mk(w, sl.walk > 3 ? 'flee' : 'wander', { phase: 'go' });
      lab?.walkers.push({ v, x0: x - 0.9, x1: x + 0.9, spd: sl.walk, dir: 1 });
    } else if (sl.act) {
      v.act = mk(w, sl.act, { phase: 'do', until: Number.MAX_SAFE_INTEGER, face: { x: 0, y: 1 } });
      if (sl.where) v.act.where = sl.where;
    } else v.act = null;
  });
  const a = w.vs[6];
  const b = w.vs[7];
  if (a && b) {
    a.dir = { x: 1, y: 0 };
    b.dir = { x: -1, y: 0 };
    startConv(w, a, b, 'chat');
    const c = w.convs.find((c) => c.a === a.id);
    if (c) {
      c.argue = false;
      c.until = Number.MAX_SAFE_INTEGER;
    }
    lab.talk = [a.id, b.id];
  }
}

/** 동작 보기판 한 프레임: 걷는 사람을 옮기고, 대화의 말하는 쪽을 2 초마다 바꾼다. */
function labFrame(w: World, dt: number): void {
  if (!lab) return;
  lab.t += dt;
  for (const k of lab.walkers) {
    const v = k.v;
    let x = v.x + k.dir * k.spd * dt;
    if (x > k.x1 || x < k.x0) {
      k.dir = -k.dir;
      x = Math.min(k.x1, Math.max(k.x0, x));
    }
    // 보간 비율이 0 이라 화면 위치는 px 다. x 를 방향 쪽으로 조금 앞에 두어 '걷는 중' 으로 보이게 한다.
    v.px = x;
    v.x = x + k.dir * 0.01;
    v.py = v.y;
  }
  if (lab.talk) {
    const c = w.convs.find((c) => c.a === lab?.talk?.[0]);
    if (c) c.speaker = Math.floor(lab.t / 2) % 2 === 0 ? lab.talk[0] : lab.talk[1];
  }
}

/** 동작 보기판을 켜고 끈다(M 키, 아티팩트처럼 주소 옵션을 못 쓰는 곳에서도 볼 수 있게). */
function toggleMotionLab(): void {
  if (lab) {
    const saved = readSave();
    const back = saved ? deserialize(saved) : null;
    lab = null;
    attach(back ?? freshWorld(Number(params.get('seed')) || 20260926));
    say('🏡 마을로 돌아왔어요');
    return;
  }
  writeSave();
  const w = newWorld(20260926);
  motionScene(w);
  attach(w);
  r3.closeUp(44, 43, 17);
  say('🎬 동작 보기판이에요. 다시 M 을 누르면 마을로 돌아가요');
}

/** 새 마을을 만든다. */
function freshWorld(seed: number, pick?: MapId): World {
  lab = null;
  const n = Number(params.get('residents')) || undefined;
  // 지도(SPEC 2): 고른 것, 아니면 `?map=large` 이거나 지금 큰 지도에서 "새 마을" 을 누르면 큰 지도로 다시 시작한다.
  const cur = world as World | undefined;
  const map: MapId =
    pick ??
    (params.get('map') === 'large' ||
    (cur && cur.W === LAYOUTS.large.W && cur.H === LAYOUTS.large.H)
      ? 'large'
      : 'village');
  const w = newWorld(seed, n ? { residents: n, map } : { map });
  if (params.get('scene') === 'grown') grownScene(w);
  if (params.get('scene') === 'motion') motionScene(w);
  return w;
}

/** World 를 화면에 붙인다(새 마을·불러오기). */
function attach(w: World): void {
  world = w;
  computeStats(w);
  r3.rebuild(w);
  resetFeed(w);
  notices.clear();
  paper.close();
  paper.sync(w);
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
  paper.sync(world);
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
const paper = new PaperView((vid) => select(vid, true));

/** 새 신문이 나오면 카드를 연다(SPEC 11.4). */
function showPaper(w: World, no: number): void {
  paper.sync(w);
  paper.open(w, no);
}

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
  $('paperBtn').addEventListener('click', () => paper.open(world));
  $('sp1').addEventListener('click', () => setSpeed(1));
  $('sp3').addEventListener('click', () => setSpeed(3));
  $('sp8').addEventListener('click', () => setSpeed(8));
  // 확인 창(confirm)은 아티팩트 보기 화면에서 막혀 있어, 한 번 더 누르면 새로 시작하는 방식으로 묻는다.
  // 한 번 누르면 "큰 들판으로"(160 × 104, SPEC 2)도 함께 보인다. 둘 중 하나를 누르면 그 지도로 새로 시작한다.
  let resetArmed: ReturnType<typeof setTimeout> | null = null;
  const disarm = (): void => {
    if (resetArmed) clearTimeout(resetArmed);
    resetArmed = null;
    $('reset').textContent = '새 마을';
    $('resetLarge').hidden = true;
  };
  const restart = (map: MapId): void => {
    disarm();
    clearSave();
    attach(freshWorld((Math.random() * 1e9) | 0, map));
    writeSave();
    say(map === 'large' ? '🌱 넓은 들판에서 새 마을을 시작했어요' : '🌱 새 마을을 시작했어요');
  };
  $('reset').addEventListener('click', () => {
    if (!resetArmed) {
      $('reset').textContent = '정말 새로? 한 번 더';
      $('resetLarge').hidden = false;
      resetArmed = setTimeout(disarm, 4000);
      return;
    }
    restart(world.W === LAYOUTS.large.W ? 'large' : 'village');
  });
  $('resetLarge').addEventListener('click', () => restart('large'));
  window.addEventListener('keydown', (e) => {
    // M: 동작 보기판(SPEC 13.5)을 켜고 끈다. 끄면 저장된 마을로 돌아온다(보기판은 저장하지 않는다).
    if (e.code === 'KeyM' && !(e.target instanceof HTMLInputElement)) {
      toggleMotionLab();
      return;
    }
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
    sound.setHidden(document.visibilityState === 'hidden');
  });
  bindSound();
}

/** 소리 단추와 작은 창. 첫 누르기·키 입력에서 소리를 연다(자동재생 정책, SPEC 12.1). */
function bindSound(): void {
  sound.load();
  const btn = $('soundBtn');
  const pop = $('soundPop');
  const on = $('soundOn') as HTMLInputElement;
  const vol = $('soundVol') as HTMLInputElement;
  const paint = (): void => {
    btn.textContent = sound.on ? (sound.volume > 0.5 ? '🔊' : '🔉') : '🔇';
    on.checked = sound.on;
    vol.value = String(Math.round(sound.volume * 100));
  };
  paint();
  const unlock = (): void => sound.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    pop.hidden = !pop.hidden;
    btn.setAttribute('aria-expanded', String(!pop.hidden));
  });
  pop.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => {
    if (pop.hidden) return;
    pop.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
  });
  on.addEventListener('change', () => {
    sound.setOn(on.checked);
    paint();
  });
  vol.addEventListener('input', () => {
    sound.setVolume(Number(vol.value) / 100);
    if (!sound.on && Number(vol.value) > 0) sound.setOn(true);
    paint();
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
  let drawMs = 0;
  let tickMax = 0;
  let ticks = 0;
  let frames = 0;
  let fpsT = performance.now();
  let path0 = pathStats(world);
  const frame = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const s0 = performance.now();
    if (speed > 0 && !lab) {
      acc += dt * speed * TIME.minPerSec;
      let n = 0;
      while (acc >= 1 && n < TIME.maxTicksPerFrame) {
        const t0 = dbg ? performance.now() : 0;
        step(world);
        if (dbg) {
          tickMax = Math.max(tickMax, performance.now() - t0);
          ticks++;
        }
        acc -= 1;
        n++;
        if (world.t % 60 === 0) writeSave();
      }
      if (n >= TIME.maxTicksPerFrame) acc = 0;
    }
    simMs += performance.now() - s0;
    frames++;
    if (dbg && now - fpsT > 1000) {
      // 계측(SPEC 7): fps, 프레임당 시뮬·그리기 CPU 시간, 가장 긴 틱, 그리기 호출, 주민 LOD 갈래, 경로(초당 탐색·캐시 적중)
      const ps = pathStats(world);
      const L = r3.lodStats;
      const sec = (now - fpsT) / 1000;
      dbg.textContent =
        `${Math.round(frames / sec)} fps · 시뮬 ${(simMs / frames).toFixed(2)} ms/프레임(틱 ${ticks}, 최대 ${tickMax.toFixed(2)} ms)` +
        ` · 그리기 ${(drawMs / frames).toFixed(2)} ms · 호출 ${r3.drawCalls()}\n` +
        `주민 ${world.vs.length}(가까이 ${L.full} · 멀리 ${L.lite} · 화면 밖 ${L.off}) · 지도 ${world.W}×${world.H}` +
        ` · 경로 ${Math.round((ps.searches - path0.searches) / sec)}/초 적중 ${Math.round((ps.hits - path0.hits) / sec)}/초 미룸 ${Math.round((ps.busy - path0.busy) / sec)}/초`;
      path0 = ps;
      frames = 0;
      simMs = 0;
      drawMs = 0;
      tickMax = 0;
      ticks = 0;
      fpsT = now;
    }
    for (const ev of world.out) {
      if (ev.type === 'log') {
        appendFeed(ev.entry);
        if (isHighlight(ev.entry)) {
          notices.push(ev.entry);
          sound.notice();
        }
      } else if (ev.type === 'fx') r3.fx(world, ev.vid, ev.fx);
      else if (ev.type === 'siteFx') {
        r3.siteFx(ev.x, ev.y, ev.fx);
        if (ev.fx === 'done') sound.done(atten(r3.listener(), ev.x, ev.y).gain);
      } else showPaper(world, ev.no);
    }
    world.out.length = 0;
    let dtA = speed > 0 ? dt * (speed >= 8 ? 1.6 : speed >= 3 ? 1.25 : 1) : 0;
    // 동작 보기판: 시뮬레이션은 멈추고 동작만 1× 로 흐른다
    if (lab) {
      labFrame(world, dt);
      dtA = dt;
    }
    const d0 = performance.now();
    r3.frame(world, dt, dtA, Math.min(1, acc), now);
    drawMs += performance.now() - d0;
    sound.update(world, r3.listener(), speed, r3.animClock());
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
      paper.sync(world);
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
  r3.lodOn = params.get('lod') !== '0';
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
    sound,
    select,
    /** 가꾸기 명령(UI 와 같은 sim 명령). */
    place: (k: BuildKind, x: number, y: number) => place(world, k, x, y, 's'),
    /** 조건을 만족할 때까지(최대 n 틱) 시뮬레이션을 돌린다. */
    runUntil: (pred: (w: World) => boolean, n: number) => {
      for (let i = 0; i < n && !pred(world); i++) step(world);
      world.out.length = 0;
      return world.t;
    },
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
