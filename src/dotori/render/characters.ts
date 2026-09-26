// 주민 3D 캐릭터: 모델 복제·동작 믹서·모자·손 도구·등짐·우산·낚싯줄. 시뮬레이션 상태를 동작 이름으로 옮긴다.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { JOBS } from '../data/people';
import { convById } from '../sim/social';
import type { Villager, World } from '../sim/types';
import { CHAR_NAMES, model, sizeOf, type ModelName } from './assets';
import { matLine } from './materials';
import type { Overlay } from './overlay';
import {
  makeBagPack,
  makeHat,
  makeLumberPack,
  makeTool,
  makeUmbrella,
  mesh,
  type ToolKind,
} from './props';

/** 주민 키(타일 단위). */
export const CHAR_H = 0.95;
/** 벤치 좌판 높이(타일 단위, Kenney stall-bench 를 0.95 로 맞췄을 때). */
const BENCH_SEAT_H = 0.2;

export interface CharView {
  v: Villager;
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  cur: THREE.AnimationAction | null;
  hand: THREE.Group;
  back: THREE.Group;
  tool: THREE.Group | null;
  toolKind: ToolKind | null;
  packKey: string;
  pack: THREE.Group | null;
  umbrella: THREE.Group;
  line: THREE.Line;
  bobber: THREE.Mesh;
  yaw: number;
  spin: number;
  wt: number;
  catchT: number | null;
  lastCatch: number | null;
  bubbleRef: Villager['bubble'];
  bubbleT0: number;
}

/** 주민 한 명의 3D 캐릭터를 만든다. */
export function makeChar(v: Villager, parent: THREE.Object3D): CharView {
  const src = model(`c:${CHAR_NAMES[v.look.model % CHAR_NAMES.length] ?? 'female-a'}` as ModelName);
  const mdl = SkeletonUtils.clone(src.scene);
  const k = CHAR_H / sizeOf(src.scene).y;
  const root = new THREE.Group();
  mdl.scale.setScalar(k);
  root.add(mdl);
  parent.add(root);
  const mixer = new THREE.AnimationMixer(mdl);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of src.animations) actions.set(clip.name, mixer.clipAction(clip));
  const head = mdl.getObjectByName('head');
  const armR = mdl.getObjectByName('arm-right');
  const torso = mdl.getObjectByName('torso');
  const hat = makeHat(v.job);
  hat.position.set(0, 0.5, 0);
  (head ?? root).add(hat);
  const hand = new THREE.Group();
  hand.position.set(0, -0.32, 0.02);
  (armR ?? mdl).add(hand);
  const back = new THREE.Group();
  (torso ?? mdl).add(back);
  const umbrella = makeUmbrella(v.look.umb, CHAR_H);
  umbrella.visible = false;
  root.add(umbrella);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    matLine(0xffffff, 0.8),
  );
  line.visible = false;
  line.frustumCulled = false;
  parent.add(line);
  const bobber = mesh(new THREE.SphereGeometry(0.05, 10, 8), '#ff5a4f');
  bobber.visible = false;
  parent.add(bobber);
  return {
    v,
    root,
    model: mdl,
    mixer,
    actions,
    cur: null,
    hand,
    back,
    tool: null,
    toolKind: null,
    packKey: '',
    pack: null,
    umbrella,
    line,
    bobber,
    yaw: 0,
    spin: 0,
    wt: 0,
    catchT: null,
    lastCatch: null,
    bubbleRef: null,
    bubbleT0: 0,
  };
}

/** 동작 클립을 부드럽게 바꾼다. once 면 한 번 재생하고 마지막 자세에 멈춘다. */
function play(c: CharView, name: string, ts: number, once: boolean): void {
  const a = c.actions.get(name) ?? c.actions.get('idle');
  if (!a) return;
  a.timeScale = ts;
  if (c.cur === a) return;
  a.reset();
  a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  a.clampWhenFinished = once;
  a.play();
  if (c.cur) a.crossFadeFrom(c.cur, 0.22, false);
  c.cur = a;
}

/** 손에 든 도구를 바꾼다. */
function setTool(c: CharView, kind: ToolKind | null): void {
  if (c.toolKind === kind) return;
  if (c.tool) c.hand.remove(c.tool);
  c.tool = kind ? makeTool(kind) : null;
  c.toolKind = kind;
  if (c.tool) c.hand.add(c.tool);
}

/** 등짐을 바꾼다(목재 개수·보따리). */
function setPack(c: CharView): void {
  const p = c.v.pack;
  const key = p ? `${p.kind}:${p.kind === 'lumber' ? Math.min(6, p.n) : 1}` : '';
  if (key === c.packKey) return;
  c.packKey = key;
  if (c.pack) c.back.remove(c.pack);
  c.pack = null;
  if (!p || (p.kind === 'lumber' && p.n <= 0)) return;
  c.pack = p.kind === 'lumber' ? makeLumberPack(p.n) : makeBagPack(c.v.look.umb);
  c.back.add(c.pack);
}

/** 그림에 쓰는 시간(초)과 연출 층. */
export interface AnimCtx {
  animT: number;
  dtA: number;
  overlay: Overlay;
}

/** 시뮬레이션 상태를 동작·도구·방향·연출로 옮긴다. */
export function animate(w: World, c: CharView, ctx: AnimCtx): void {
  const { animT, dtA, overlay } = ctx;
  const v = c.v;
  const a = v.act;
  const T = animT + v.id * 0.73;
  const moving = v.x !== v.px || v.y !== v.py;
  let clip = 'idle';
  let ts = 1;
  let once = false;
  let tool: ToolKind | null = null;
  let face: { x: number; y: number } | null = null;
  let fish: { x: number; y: number } | null = null;
  let spin = false;
  const conv = convById(w, v.talk);
  if (conv) {
    const o = w.vs[conv.a === v.id ? conv.b : conv.a];
    if (o) face = { x: o.x - v.x, y: o.y - v.y };
    const idx = Math.floor((w.t - conv.start) / 3);
    const last = idx >= conv.lines.length - 1;
    if (conv.argue) {
      clip = 'emote-no';
      ts = 1.5;
    } else if (conv.kind === 'confess') {
      clip = last
        ? conv.success
          ? 'jump'
          : v.id === conv.a
            ? 'die'
            : 'emote-no'
        : v.id === conv.a
          ? 'holding-both'
          : 'idle';
      once = last && !conv.success && v.id === conv.a;
    } else if (conv.kind === 'welcome') {
      clip = conv.speaker === v.id ? (idx === 0 ? 'interact-right' : 'emote-yes') : 'emote-yes';
      ts = 0.9;
    } else if (conv.speaker === v.id) {
      clip = idx === 0 ? 'interact-right' : 'emote-yes';
      ts = 0.8;
    }
  } else if (moving) {
    const run = a && (a.type === 'flee' || a.target != null);
    const heavy = v.pack != null && (v.pack.kind === 'bag' || v.pack.n >= 6);
    clip = run ? 'sprint' : 'walk';
    ts = run ? 1.1 : heavy ? 1.1 : 1.4;
  } else if (a && a.phase === 'do') {
    if (a.face) face = a.face;
    switch (a.type) {
      case 'work': {
        const pl = JOBS[v.job].place;
        if (pl === 'farm') {
          clip = 'attack-melee-right';
          ts = 0.6;
          tool = 'hoe';
        } else if (pl === 'forest') {
          clip = 'attack-melee-right';
          ts = 0.8;
          tool = 'axe';
        } else if (pl === 'workshop') {
          clip = 'interact-right';
          ts = 1.6;
          tool = 'hammer';
        } else if (pl === 'shore') {
          clip = 'holding-right';
          tool = 'rod';
          fish = a.face;
        }
        break;
      }
      case 'build':
        clip = (T * 0.7) % 6 < 0.8 ? 'crouch' : 'interact-right';
        ts = 1.7;
        tool = 'hammer';
        break;
      case 'fun':
        if (a.where === 'shore') {
          clip = 'holding-right';
          tool = 'rod';
          fish = a.face;
        } else if (a.where === 'bench' || a.where === 'plaza') {
          clip = 'sit';
          if (v.trait === '외톨이' || v.id % 3 === 0) tool = 'book';
          face = a.face ?? { x: 0, y: 1 };
          // 앉기 동작은 엉덩이를 바닥 높이에 둔다. 벤치 자리 가운데로 옮기고 좌판 높이만큼 올린다.
          const bench = a.decor != null ? w.decor.find((d) => d.id === a.decor) : undefined;
          if (bench) c.root.position.set(bench.x + 0.5, BENCH_SEAT_H, bench.y + 0.5);
        } else if (a.where === 'grass' || a.where === 'flower') {
          clip = (T * 0.3) % 4 < 2.4 ? 'pick-up' : 'idle';
          ts = 0.6;
        }
        break;
      case 'social':
        clip = (T * 0.45) % 5 < 0.9 ? 'emote-yes' : 'idle';
        break;
      case 'party':
      case 'raindance': {
        const st = a.type === 'raindance' ? 2 : v.id % 3;
        clip = st === 0 ? 'jump' : st === 1 ? 'emote-yes' : 'idle';
        ts = st === 1 ? 1.6 : 1;
        spin = st === 2;
        if (v.job === '주점 주인' || v.id % 4 === 0) tool = 'mug';
        break;
      }
      case 'nap':
        clip = 'die';
        once = true;
        break;
      case 'hunt':
        clip = 'pick-up';
        ts = 0.9;
        break;
      default:
        clip = 'idle';
    }
  }
  if (!tool && v.carry && v.carry.until > w.t) tool = v.carry.item;
  if (v.job === '주점 주인' && !tool && a && a.type === 'social') tool = 'mug';
  play(c, clip, ts, once);
  setTool(c, tool);
  setPack(c);
  // 방향: 걷는 방향, 대화 상대, 일하는 대상 쪽을 본다.
  const d = face ?? (moving ? { x: v.x - v.px, y: v.y - v.py } : v.dir);
  if (spin) c.spin += dtA * 6;
  else c.spin = 0;
  if (d.x || d.y) {
    const target = Math.atan2(d.x, d.y) + c.spin;
    let diff = target - c.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    c.yaw += diff * Math.min(1, dtA * 10 + (spin ? 1 : 0));
  }
  c.root.rotation.y = c.yaw;
  c.umbrella.visible =
    w.weather.rain && !(a && (a.type === 'raindance' || a.type === 'nap')) && v.inside == null;
  // 낚싯줄과 찌
  const tip0 = c.tool?.userData.tip as THREE.Vector3 | undefined;
  if (fish && c.tool && tip0) {
    const tip = tip0.clone();
    c.tool.localToWorld(tip);
    const bx = v.x + (fish.x || 0) * 1.1;
    const bz = v.y + (fish.y || 0) * 1.1;
    const catching = c.catchT != null && animT - c.catchT < 1.0;
    const by = 0.06 + (catching ? 0.35 : Math.sin(T * 2.4) * 0.02);
    const g = c.line.geometry.attributes.position as THREE.BufferAttribute;
    g.setXYZ(0, tip.x, tip.y, tip.z);
    g.setXYZ(1, bx, by, bz);
    g.needsUpdate = true;
    c.line.visible = true;
    c.bobber.visible = true;
    c.bobber.position.set(bx, by, bz);
    if (c.catchT != null && c.lastCatch !== c.catchT) {
      c.lastCatch = c.catchT;
      overlay.burst('splash', bx, 0.1, bz, 10);
    }
  } else {
    c.line.visible = false;
    c.bobber.visible = false;
  }
  // 연출 입자
  if (dtA > 0 && v.inside == null) {
    const hy = CHAR_H + 0.25;
    const R = Math.random;
    if (conv && conv.argue && R() < dtA * 4) overlay.burst('steam', v.x, hy, v.y, 2);
    const confessOk =
      conv &&
      conv.kind === 'confess' &&
      conv.success &&
      Math.floor((w.t - conv.start) / 3) >= conv.lines.length - 1;
    if (((conv && conv.kind === 'date') || confessOk) && R() < dtA * 1.6)
      overlay.burst('heart', v.x, hy, v.y, 1);
    if (
      a &&
      a.phase === 'do' &&
      (a.type === 'party' || a.type === 'raindance') &&
      (v.trait === '파티광' || a.type === 'raindance') &&
      R() < dtA * 1.3
    )
      overlay.burst('note', v.x, hy, v.y, 1);
    if (a && a.phase === 'do' && a.type === 'nap' && R() < dtA * 0.9)
      overlay.burst('z', v.x, 0.5, v.y, 1);
    if (moving && a && (a.type === 'flee' || a.target != null) && R() < dtA * 7)
      overlay.burst('dust', v.x, 0.05, v.y, 1);
    if (a && a.type === 'flee' && R() < dtA * 3) overlay.burst('sweat', v.x, hy, v.y, 1);
    if (a && a.phase === 'do' && !conv && (a.type === 'work' || a.type === 'build')) {
      const pl = a.type === 'build' ? 'build' : JOBS[v.job].place;
      const per =
        pl === 'farm'
          ? 1.6
          : pl === 'forest'
            ? 1.2
            : pl === 'workshop'
              ? 0.6
              : pl === 'build'
                ? 0.55
                : 0;
      if (per) {
        c.wt += dtA;
        if (c.wt > per) {
          c.wt -= per;
          const fx = v.x + Math.sin(c.yaw) * 0.45;
          const fz = v.y + Math.cos(c.yaw) * 0.45;
          if (pl === 'build') {
            overlay.burst('sawdust', fx, 0.35, fz, 4);
            overlay.burst('spark', fx, 0.4, fz, 2);
          } else
            overlay.burst(
              pl === 'farm' ? 'soil' : pl === 'forest' ? 'chip' : 'spark',
              fx,
              0.15,
              fz,
              pl === 'workshop' ? 5 : 4,
            );
        }
      }
    }
    if (a && a.phase === 'do' && a.type === 'hunt' && R() < dtA * 1.2)
      overlay.burst('dirt', v.x + Math.sin(c.yaw) * 0.35, 0.1, v.y + Math.cos(c.yaw) * 0.35, 3);
  }
  c.mixer.update(dtA);
}

/** 캐릭터를 장면에서 뺀다(새 마을·불러오기). */
export function disposeChar(c: CharView): void {
  c.root.removeFromParent();
  c.line.removeFromParent();
  c.bobber.removeFromParent();
  c.mixer.stopAllAction();
}
