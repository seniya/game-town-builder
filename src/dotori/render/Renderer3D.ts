// 도토리 마을 3D 렌더러: 장면·카메라·빛·하늘·구름, 주민, 공사장, 겹쳐 그리기, 고르기(주민·타일), 가꾸기 미리보기.
// World 를 읽기만 한다(ARCHITECTURE 2). 출처와 라이선스: docs/research/2026-09-26-cc0-3d-asset-packs.md
import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { BUILDABLES, type BuildKind } from '../data/buildables';
import type { Side } from '../data/villageMap';
import { hash01 } from '../sim/rng';
import { hourOf } from '../sim/text';
import type { FxKind, Villager, World } from '../sim/types';
import { doorOf, sideDir } from '../sim/world';
import { CHAR_NAMES, loadAll, model, sizeOf, type ModelName } from './assets';
import { animate, CHAR_H, disposeChar, makeChar, type CharView } from './characters';
import { matBasic, matGhost } from './materials';
import { Overlay } from './overlay';
import { makeHat } from './props';
import { makeGlowTex, siteLabel, VillageView } from './village';

/** 렌더러가 읽는 화면 상태(ui/app 이 소유). */
export interface ViewState {
  selected: number | null;
  follow: boolean;
  hover: number | null;
  /** 가꾸기 미리보기: 놓을 것·칸·문 방향·가능 여부. */
  ghost: { kind: BuildKind | 'remove'; x: number; y: number; side: Side; ok: boolean } | null;
  reduceMotion: boolean;
}

const C = (h: string): THREE.Color => new THREE.Color(h);
const SKY: [number, THREE.Color][] = [
  [0, C('#141b3a')],
  [5, C('#1d2750')],
  [6.5, C('#f2b8a6')],
  [8, C('#bfe3f5')],
  [17, C('#bfe3f5')],
  [19, C('#f6ad7b')],
  [20.5, C('#2a2f5c')],
  [24, C('#141b3a')],
];

/** 시각에 따른 하늘색. */
function skyAt(h: number): THREE.Color {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [a, ca] = SKY[i] as [number, THREE.Color];
    const [b, cb] = SKY[i + 1] as [number, THREE.Color];
    if (h >= a && h <= b) return ca.clone().lerp(cb, (h - a) / (b - a));
  }
  return (SKY[0] as [number, THREE.Color])[1].clone();
}

export class Renderer3D {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  private controls!: MapControls;
  private overlay!: Overlay;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private village!: VillageView;
  private chars = new Map<number, CharView>();
  private charGroup = new THREE.Group();
  private selRing!: THREE.Mesh;
  private ghost!: THREE.Group;
  private ghostKey = '';
  private ghostMat = matGhost(0x7be08a, 0.45);
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private cw = 800;
  private ch = 500;
  private dpr = 1;
  private animT = 0;
  private stage!: HTMLElement;
  private view!: ViewState;
  private portraitR: THREE.WebGLRenderer | null = null;
  private portraitScene: THREE.Scene | null = null;
  private portraitCam: THREE.PerspectiveCamera | null = null;
  private portraitCache = new Map<number, HTMLCanvasElement>();
  private W = 80;
  private H = 52;

  /** 에셋을 모두 불러온다. */
  load(base: string, onProgress: (p: number) => void): Promise<void> {
    return loadAll(base, onProgress);
  }

  /** WebGL 렌더러, 카메라, 조작, 빛, 겹쳐 그리기 층을 만든다. */
  init(canvas: HTMLCanvasElement, stage: HTMLElement, view: ViewState): void {
    this.stage = stage;
    this.view = view;
    const r = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xbfe3f5, 60, 150);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 400);
    this.hemi = new THREE.HemisphereLight(0xdff1ff, 0x6f8f4f, 1.1);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, {
      left: -48,
      right: 48,
      top: 36,
      bottom: -36,
      near: 1,
      far: 170,
    });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    this.sun = sun;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.village = new VillageView(this.scene, makeGlowTex());
    this.scene.add(this.charGroup);
    this.controls = new MapControls(this.camera, canvas);
    Object.assign(this.controls, {
      enableDamping: true,
      dampingFactor: 0.12,
      screenSpacePanning: false,
      minDistance: 7,
      maxDistance: 85,
      maxPolarAngle: 1.22,
      minPolarAngle: 0.3,
      zoomSpeed: 1.1,
    });
    this.controls.listenToKeyEvents(window);
    this.overlay = new Overlay(canvas, this.camera);
    this.selRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), matBasic(0xffffff, 0.9));
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.position.y = 0.03;
    this.scene.add(this.selRing);
    this.ghost = new THREE.Group();
    this.scene.add(this.ghost);
    new ResizeObserver(() => this.resize()).observe(stage);
    this.resize();
  }

  /** 창 크기에 맞춘다. */
  private resize(): void {
    const b = this.stage.getBoundingClientRect();
    this.cw = Math.max(1, b.width);
    this.ch = Math.max(1, b.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(this.cw, this.ch, false);
    this.overlay.resize(this.cw, this.ch, this.dpr);
    this.camera.aspect = this.cw / this.ch;
    this.camera.updateProjectionMatrix();
  }

  /** 새 마을·불러오기: 장면을 통째로 다시 짓는다. */
  rebuild(w: World): void {
    this.W = w.W;
    this.H = w.H;
    for (const c of this.chars.values()) disposeChar(c);
    this.chars.clear();
    this.portraitCache.clear();
    this.overlay.clear();
    this.village.rebuild(w);
    for (const v of w.vs) this.chars.set(v.id, makeChar(v, this.charGroup));
  }

  /** 기본 시점: 광장을 비스듬히 내려다본다. */
  fit(): void {
    this.controls.target.set(33, 0, 21);
    this.camera.position.set(33, 27, 45);
    this.controls.update();
  }

  /** 카메라가 보는 점을 (x, z) 쪽으로 k 만큼 옮긴다. */
  focus(x: number, z: number, k = 1): void {
    const t = this.controls.target;
    const dx = (x - t.x) * k;
    const dz = (z - t.z) * k;
    t.x += dx;
    t.z += dz;
    this.camera.position.x += dx;
    this.camera.position.z += dz;
  }

  /** 가까이 보기(자동 관찰용): (x, z) 를 거리 d 에서 비스듬히 내려다본다. */
  closeUp(x: number, z: number, d: number): void {
    this.controls.target.set(x, 0, z);
    this.camera.position.set(x, d * 0.7, z + d * 0.72);
    this.controls.update();
  }

  /** 끌어서 이동하지 못하게(놓기 모드에서 왼쪽 끌기를 칠하기로 쓴다). */
  setPanEnabled(on: boolean): void {
    if (this.controls) this.controls.enablePan = on;
  }

  /** 보는 점을 지도 안으로 제한한다. */
  private clampTarget(): void {
    const t = this.controls.target;
    const ox = Math.min(this.W - 2, Math.max(2, t.x)) - t.x;
    const oz = Math.min(this.H - 2, Math.max(2, t.z)) - t.z;
    if (ox || oz || t.y) {
      t.x += ox;
      t.z += oz;
      this.camera.position.x += ox;
      this.camera.position.z += oz;
      this.camera.position.y -= t.y;
      t.y = 0;
    }
  }

  /** 화면 좌표에서 가장 가까운 주민(밖에 있는 사람). */
  pickVillager(sx: number, sy: number): number | null {
    let best: number | null = null;
    let bd = 34;
    for (const c of this.chars.values()) {
      if (c.v.inside != null) continue;
      const p = this.overlay.project(c.root.position.x, CHAR_H * 0.5, c.root.position.z);
      if (!p) continue;
      const d = Math.hypot(p[0] - sx, p[1] - sy);
      if (d < bd) {
        bd = d;
        best = c.v.id;
      }
    }
    return best;
  }

  /** 타일 가운데의 화면 좌표(자동 관찰용). */
  screenOf(x: number, y: number): [number, number] | null {
    return this.overlay.project(x + 0.5, 0, y + 0.5);
  }

  /** 화면 좌표 → 바닥 타일. */
  pickTile(sx: number, sy: number): { x: number; y: number } | null {
    const ndc = new THREE.Vector2((sx / this.cw) * 2 - 1, -(sy / this.ch) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return null;
    const x = Math.floor(hit.x);
    const y = Math.floor(hit.z);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return null;
    return { x, y };
  }

  /** 감정·공사 연출. */
  fx(w: World, vid: number, kind: FxKind): void {
    const c = this.chars.get(vid);
    const v = w.vs[vid];
    if (!v || v.inside != null) return;
    if (kind === 'catch') {
      if (c) c.catchT = this.animT;
      return;
    }
    const map: Partial<Record<FxKind, 'heart' | 'steam' | 'sweat' | 'sparkle'>> = {
      heart: 'heart',
      steam: 'steam',
      sweat: 'sweat',
      sparkle: 'sparkle',
    };
    const b = map[kind];
    if (b)
      this.overlay.burst(b, v.x, CHAR_H + 0.3, v.y, b === 'heart' ? 6 : b === 'sparkle' ? 7 : 3);
  }

  /** 공사장 연출(목재 내려놓기·완성 꽃가루). */
  siteFx(x: number, z: number, kind: FxKind): void {
    if (kind === 'done') {
      this.overlay.burst('sparkle', x, 1.2, z, 14);
      for (let i = 0; i < 40; i++)
        this.overlay.burst(
          'confetti',
          x + (Math.random() - 0.5) * 2,
          2.6,
          z + (Math.random() - 0.5) * 2,
          1,
        );
    } else this.overlay.burst('dust', x, 0.1, z, 6);
  }

  /** 가꾸기 미리보기 발자국을 만든다(모양이 바뀔 때만). */
  private updateGhost(): void {
    const gh = this.view.ghost;
    if (!gh) {
      this.ghost.visible = false;
      return;
    }
    const size =
      gh.kind === 'remove'
        ? { w: 1, h: 1 }
        : { w: BUILDABLES[gh.kind].w, h: BUILDABLES[gh.kind].h };
    const key = `${gh.kind}|${gh.side}`;
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      for (const o of [...this.ghost.children]) this.ghost.remove(o);
      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(size.w - 0.06, size.h - 0.06),
        this.ghostMat,
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(size.w / 2, 0.05, size.h / 2);
      this.ghost.add(pad);
      if (gh.kind === 'house') {
        const d = doorOf(0, 0, size.w, size.h, gh.side);
        const dir = sideDir(gh.side);
        // 원뿔은 +y 를 가리킨다. x 축으로 눕혀 북(-z)을 가리키게 한 뒤, 묶음을 y 축으로 돌려 문 방향을 가리킨다.
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 3), this.ghostMat);
        arrow.rotation.x = -Math.PI / 2;
        const holder = new THREE.Group();
        holder.position.set(d.x + 0.5 + dir.x * 0.9, 0.08, d.y + 0.5 + dir.y * 0.9);
        holder.rotation.y = Math.atan2(-dir.x, -dir.y);
        holder.add(arrow);
        this.ghost.add(holder);
      }
    }
    this.ghostMat.color.set(
      gh.kind === 'remove' ? (gh.ok ? 0xffb14a : 0xff6b6b) : gh.ok ? 0x7be08a : 0xff6b6b,
    );
    this.ghost.position.set(gh.x, 0, gh.y);
    this.ghost.visible = true;
  }

  /** 하늘·해·빛·등불·물색을 시각에 맞춘다. */
  private updateSky(w: World, h: number): void {
    const sky = skyAt(h);
    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(sky);
    // 해는 5:30 에 떠서 20:00 에 진다. 저녁 노을이 19 시 무렵까지 보이게 한다.
    const day = Math.min(1, Math.max(0, Math.sin(((h - 5.5) / 14.5) * Math.PI)));
    const ang = ((h - 5.5) / 14.5) * Math.PI;
    const cx = w.W / 2;
    const cz = w.H / 2;
    const sun = this.sun;
    if (day > 0.02) {
      sun.position.set(cx + Math.cos(ang) * 46, 10 + Math.sin(ang) * 50, cz - 26);
      sun.color.set(h < 8 || h > 17 ? '#ffc38a' : '#fff4e0');
      sun.intensity = 0.5 + day * 2.3;
    } else {
      sun.position.set(cx - 20, 44, cz - 12);
      sun.color.set('#9fb4ff');
      sun.intensity = 0.55;
    }
    sun.target.position.set(cx, 0, cz);
    this.hemi.intensity = 0.8 + day * 0.5;
    this.hemi.color.set(day > 0.1 ? '#dff1ff' : '#8090c8');
    this.hemi.groundColor.set(day > 0.1 ? '#6f8f4f' : '#2a2f4a');
    const night = Math.min(1, Math.max(0, 1 - day * 2.5));
    for (const L of this.village.lampLights) L.intensity = night * 6;
    for (const gl of this.village.glows) {
      const on = gl.test(h);
      const m = gl.sp.material;
      m.opacity += ((on ? night : 0) - m.opacity) * 0.1;
      gl.sp.visible = m.opacity > 0.01;
    }
    if (this.village.waterMat) this.village.waterMat.color.set(day > 0.1 ? '#6cc6ec' : '#35507a');
    this.renderer.toneMappingExposure = 1.0 + day * 0.1;
    const P = w.party;
    if (this.village.partyDeco)
      this.village.partyDeco.visible = !!(P && w.t >= P.start - 40 && w.t < P.end);
  }

  /** 새로 생긴 주민의 캐릭터를 만든다(이사). */
  private syncChars(w: World): void {
    for (const v of w.vs)
      if (!this.chars.has(v.id)) this.chars.set(v.id, makeChar(v, this.charGroup));
  }

  /** 한 프레임: 정적 장면 확인 → 주민 → 하늘 → 3D → 겹쳐 그리기. alpha 는 틱 사이 보간(0~1). */
  frame(w: World, dt: number, dtA: number, alpha: number, now: number): void {
    this.animT += dtA;
    if (this.village.version !== w.staticVersion) this.village.rebuild(w);
    this.syncChars(w);
    const h = hourOf(w.t) + alpha / 60;
    const ctx = { animT: this.animT, dtA, overlay: this.overlay };
    for (const c of this.chars.values()) {
      const v = c.v;
      c.root.visible = v.inside == null;
      if (v.inside != null) {
        c.line.visible = c.bobber.visible = false;
        continue;
      }
      c.root.position.set(v.px + (v.x - v.px) * alpha, 0, v.py + (v.y - v.py) * alpha);
      animate(w, c, ctx);
    }
    this.village.update(w);
    const sel = this.view.selected != null ? w.vs[this.view.selected] : undefined;
    if (this.view.follow && sel) {
      const p = this.posOf(w, sel, alpha);
      this.focus(p.x, p.z, 0.12);
    }
    this.controls.update();
    this.clampTarget();
    this.selRing.visible = !!(sel && sel.inside == null);
    if (sel && this.selRing.visible) {
      const p = this.posOf(w, sel, alpha);
      this.selRing.position.set(p.x, 0.03, p.z);
    }
    this.updateGhost();
    this.updateSky(w, h);
    if (this.village.waterMat) this.village.waterMat.opacity = 0.6 + Math.sin(now / 900) * 0.04;
    // 굴뚝 연기와 파티 꽃가루
    if (dtA > 0) {
      for (const b of w.buildings) {
        if (b.kind === 'yard' || b.kind === 'mill') continue;
        const occ = w.vs.some(
          (v) => v.inside === b.id && !(v.act && v.act.type === 'sleep' && v.act.phase === 'do'),
        );
        if (occ && Math.random() < dtA * (b.kind === 'bakery' ? 2.4 : 0.9))
          this.overlay.burst(
            'smoke',
            b.x + b.w * 0.68,
            (this.village.roofH.get(b.id) ?? 2.5) * 0.95,
            b.y + b.h * 0.4,
            1,
          );
      }
      const P = w.party;
      if (P && w.t >= P.start && w.t < P.end && !this.view.reduceMotion && Math.random() < dtA * 14)
        this.overlay.burst('confetti', 26.5 + Math.random() * 10, 2.6, 13.5 + Math.random() * 6, 1);
    }
    this.renderer.render(this.scene, this.camera);
    this.drawOverlay(w, dtA, h, now, sel);
    void dt;
  }

  /** 주민의 보간 위치(집 안이면 문 앞). */
  private posOf(w: World, v: Villager, alpha: number): { x: number; z: number } {
    if (v.inside != null) {
      const b = w.bmap.get(v.inside);
      if (b) return { x: b.door.x + 0.5, z: b.door.y + 0.5 };
    }
    return { x: v.px + (v.x - v.px) * alpha, z: v.py + (v.y - v.py) * alpha };
  }

  /** 겹쳐 그리기: 비, 입자, 잠 z, 공사 진행 막대, 말풍선, 이름표. */
  private drawOverlay(
    w: World,
    dtA: number,
    h: number,
    now: number,
    sel: Villager | undefined,
  ): void {
    const ov = this.overlay;
    const o = ov.ctx;
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    o.clearRect(0, 0, this.cw, this.ch);
    if (w.weather.rain) {
      o.fillStyle = 'rgba(60,70,90,0.16)';
      o.fillRect(0, 0, this.cw, this.ch);
    }
    ov.drawParts(dtA);
    if (h >= 21 || h < 7) {
      o.fillStyle = 'rgba(255,255,255,0.9)';
      o.textAlign = 'center';
      o.textBaseline = 'middle';
      for (const b of w.buildings) {
        if (b.kind !== 'house') continue;
        if (
          !w.vs.some(
            (v) => v.inside === b.id && v.act && v.act.type === 'sleep' && v.act.phase === 'do',
          )
        )
          continue;
        const rh = this.village.roofH.get(b.id) ?? 2.5;
        for (let k = 0; k < 2; k++) {
          const p = ((now / 1000) * 0.35 + k * 0.5 + hash01(b.x)) % 1;
          const s = ov.project(b.x + b.w * 0.6 + p * 0.5, rh + p * 1.1, b.y + b.h * 0.5);
          if (!s) continue;
          o.globalAlpha = Math.sin(p * Math.PI);
          o.font = `700 ${12 + p * 8}px "Jua",sans-serif`;
          o.fillText('z', s[0], s[1]);
        }
      }
      o.globalAlpha = 1;
    }
    if (w.weather.rain) {
      o.strokeStyle = 'rgba(210,225,255,0.45)';
      o.lineWidth = 1;
      o.beginPath();
      const tm = now / 1000;
      const n = this.view.reduceMotion ? 60 : 180;
      for (let i = 0; i < n; i++) {
        const x = (hash01(i) * this.cw + tm * 60) % this.cw;
        const y = ((hash01(i * 3) + tm * 1.6) % 1) * this.ch;
        o.moveTo(x, y);
        o.lineTo(x - 3, y + 10);
      }
      o.stroke();
    }
    for (const s of this.village.siteInfo()) {
      const p = ov.project(s.x, s.bp.kind === 'house' ? 2.9 : 1.3, s.z);
      if (p) ov.progress(p[0], p[1], s.frac, siteLabel(s.bp));
    }
    for (const c of this.chars.values()) {
      const v = c.v;
      if (v.inside != null) continue;
      const p = ov.project(c.root.position.x, CHAR_H + 0.35, c.root.position.z);
      if (!p) continue;
      const live = v.bubble && v.bubble.until > w.t;
      if (v.bubble !== c.bubbleRef) {
        c.bubbleRef = v.bubble;
        c.bubbleT0 = this.animT;
      }
      if (live && v.bubble)
        ov.bubble(p[0], p[1], v.bubble.e, v === sel, (this.animT - c.bubbleT0) / 0.22);
      if (v === sel || v.id === this.view.hover) {
        const q = ov.project(c.root.position.x, 0, c.root.position.z);
        if (q) ov.name(q[0], q[1] + 14, v.name, v === sel);
      }
    }
  }

  /** 패널 초상화: 같은 캐릭터를 따로 한 번 찍어 캐시한다. */
  portrait(v: Villager): HTMLCanvasElement {
    const hit = this.portraitCache.get(v.id);
    if (hit) return hit;
    if (!this.portraitR) {
      const pc = document.createElement('canvas');
      pc.width = pc.height = 112;
      this.portraitR = new THREE.WebGLRenderer({
        canvas: pc,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      this.portraitR.outputColorSpace = THREE.SRGBColorSpace;
      this.portraitScene = new THREE.Scene();
      this.portraitScene.add(new THREE.HemisphereLight(0xffffff, 0x88aa77, 1.6));
      const d = new THREE.DirectionalLight(0xffffff, 1.6);
      d.position.set(1, 2, 3);
      this.portraitScene.add(d);
      this.portraitCam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
      this.portraitCam.position.set(0, CHAR_H * 0.78, 1.55);
      this.portraitCam.lookAt(0, CHAR_H * 0.68, 0);
    }
    const src = model(
      `c:${CHAR_NAMES[v.look.model % CHAR_NAMES.length] ?? 'female-a'}` as ModelName,
    );
    const mdl = SkeletonUtils.clone(src.scene);
    mdl.scale.setScalar(CHAR_H / sizeOf(src.scene).y);
    const mixer = new THREE.AnimationMixer(mdl);
    const idle = src.animations.find((a) => a.name === 'idle');
    if (idle) {
      mixer.clipAction(idle).play();
      mixer.update(0.3);
    }
    const head = mdl.getObjectByName('head');
    const hat = makeHat(v.job);
    hat.position.set(0, 0.5, 0);
    (head ?? mdl).add(hat);
    mdl.rotation.y = -0.35;
    const ps = this.portraitScene as THREE.Scene;
    ps.add(mdl);
    this.portraitR.render(ps, this.portraitCam as THREE.PerspectiveCamera);
    ps.remove(mdl);
    const img = document.createElement('canvas');
    img.width = img.height = 112;
    img.getContext('2d')?.drawImage(this.portraitR.domElement, 0, 0);
    this.portraitCache.set(v.id, img);
    return img;
  }
}
