// 마을의 움직이지 않는 부분: 지면·물·건물·나무·장식·소품·파티 장식, 그리고 공사장(청사진) 모습.
// World.staticVersion 이 바뀌면 통째로 다시 짓고, 공사 진행·야적장 목재 더미는 프레임마다 갱신한다.
import * as THREE from 'three';
import { BUILDABLES } from '../data/buildables';
import { FARM, FOUNTAIN, TERRACE } from '../data/villageMap';
import { hash01 } from '../sim/rng';
import type { Blueprint, Building, World } from '../sim/types';
import { bakeryOpen } from '../sim/world';
import { HOUSE_MODELS, instance, place, type InstanceItem, type ModelName } from './assets';
import { groundTexture, paintGround, waterGeometry } from './ground';
import { matBasic, matGlow, matGround, matStd, matWater } from './materials';
import { FLOWER_COLORS, mesh } from './props';

/** 밤에 켜지는 빛 번짐. test(h) 가 참일 때 켜진다. */
export interface Glow {
  sp: THREE.Sprite;
  test: (h: number) => boolean;
}

interface SiteView {
  bp: Blueprint;
  group: THREE.Group;
  rising: THREE.Object3D | null;
  scaffold: THREE.Object3D | null;
  pile: THREE.Group;
  pileN: number;
  fullH: number;
}

/** 모델의 문 방향 회전(KayKit 건물은 남쪽이 앞). */
function yawOf(side: Building['side']): number {
  return side === 's' ? 0 : side === 'n' ? Math.PI : side === 'e' ? Math.PI / 2 : -Math.PI / 2;
}

/** 빛 번짐 텍스처(둥근 그라데이션). */
export function makeGlowTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class VillageView {
  readonly group = new THREE.Group();
  glows: Glow[] = [];
  lampLights: THREE.PointLight[] = [];
  waterMat: THREE.MeshStandardMaterial | null = null;
  partyDeco: THREE.Group | null = null;
  /** 건물 id → 지붕 높이(굴뚝 연기 위치). */
  roofH = new Map<number, number>();
  private sites = new Map<number, SiteView>();
  private yardPile = new THREE.Group();
  private yardN = -1;
  private groundCanvas: HTMLCanvasElement | null = null;
  private groundTex: THREE.CanvasTexture | null = null;
  version = -1;
  private readonly glowTex: THREE.Texture;
  private readonly scene: THREE.Scene;

  /** 장면에 마을 묶음을 붙인다. */
  constructor(scene: THREE.Scene, glowTex: THREE.Texture) {
    this.scene = scene;
    this.glowTex = glowTex;
    scene.add(this.group);
  }

  /** 빛 번짐 하나를 더한다. */
  private addGlow(
    x: number,
    y: number,
    z: number,
    size: number,
    color: number,
    test: (h: number) => boolean,
  ): void {
    const sp = new THREE.Sprite(matGlow(this.glowTex, color, 0));
    sp.position.set(x, y, z);
    sp.scale.setScalar(size);
    this.group.add(sp);
    this.glows.push({ sp, test });
  }

  /** 마을을 통째로 다시 짓는다. */
  rebuild(w: World): void {
    this.version = w.staticVersion;
    for (const o of [...this.group.children]) this.group.remove(o);
    for (const L of this.lampLights) this.scene.remove(L);
    this.lampLights = [];
    this.glows = [];
    this.sites.clear();
    this.roofH.clear();
    const G = this.group;
    // 지면
    this.groundCanvas = paintGround(w, this.groundCanvas ?? undefined);
    this.groundTex?.dispose();
    this.groundTex = groundTexture(this.groundCanvas);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(w.W, w.H), matGround(this.groundTex));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(w.W / 2, 0, w.H / 2);
    ground.receiveShadow = true;
    ground.name = 'ground';
    G.add(ground);
    const skirt = new THREE.Mesh(
      new THREE.PlaneGeometry(w.W + 120, w.H + 120),
      matStd('#7fb466', 1),
    );
    skirt.rotation.x = -Math.PI / 2;
    skirt.position.set(w.W / 2, -0.02, w.H / 2);
    skirt.receiveShadow = true;
    G.add(skirt);
    this.waterMat = this.waterMat ?? matWater();
    const water = new THREE.Mesh(waterGeometry(w), this.waterMat);
    water.position.y = 0.04;
    water.receiveShadow = true;
    G.add(water);
    // 건물
    for (const b of w.buildings) this.addBuilding(w, b);
    // 장식
    for (const d of w.decor) {
      const cx = d.x + d.w / 2;
      const cz = d.y + d.h / 2;
      if (d.kind === 'bench')
        place('stall-bench', cx, cz, 0.95, Math.PI / 2 + (hash01(d.id) < 0.5 ? 0 : Math.PI), G);
      else if (d.kind === 'lamp') {
        place('lantern', cx, cz, 0.2, 0, G);
        this.addGlow(cx, 1.25, cz, 2.4, 0xffc070, () => true);
      } else this.addFlowerbed(d.x, d.y, d.w, d.h, d.id);
    }
    // 분수와 소품(시험판 배치)
    place('fountain-round', FOUNTAIN.x + 0.5, FOUNTAIN.y + 0.5, 2.4, 0, G);
    this.addGlow(FOUNTAIN.x + 0.5, 0.6, FOUNTAIN.y + 0.5, 2.2, 0x9fdcff, () => true);
    place('wheelbarrow', 17.5, 25.3, 0.8, 1.2, G);
    place('sack', 17.2, 24.6, 0.35, 0.3, G);
    place('sack', 17.7, 24.5, 0.35, 1.1, G);
    place('barrel', TERRACE.x - 0.5, TERRACE.y + 0.4, 0.45, 0, G);
    place('barrel', TERRACE.x - 0.6, TERRACE.y + 1.0, 0.45, 0.7, G);
    place('crate_A_small', TERRACE.x + TERRACE.w + 0.4, TERRACE.y + 0.5, 0.45, 0.3, G);
    place('crate_open', 33.3, 21.4, 0.7, 0.2, G);
    place('bucket_water', 42.6, 30.6, 0.3, 0, G);
    place('stall-red', 37.5, 13.4, 1.4, Math.PI, G);
    place('stall-green', 24.6, 14.2, 1.4, Math.PI / 2, G);
    place('cart', 43.2, 21.4, 1.1, 1.3, G);
    place('building_well_blue', 23.5, 11.5, 1.1, 0.3, G);
    for (const [lx, ly] of [
      [26, 13],
      [36, 19],
      [21, 21],
      [31, 31],
      [44, 19],
    ] as const) {
      const L = new THREE.PointLight(0xffb866, 0, 7, 1.6);
      L.position.set(lx + 0.5, 1.3, ly + 0.5);
      this.scene.add(L);
      this.lampLights.push(L);
    }
    // 나무·바위·물풀·작물·밭 울타리
    this.addNature(w);
    // 파티 장식
    this.addPartyDeco();
    // 공사장
    for (const bp of w.blueprints) this.addSite(bp);
    // 야적장 목재 더미
    this.yardPile = new THREE.Group();
    this.yardN = -1;
    G.add(this.yardPile);
  }

  /** 건물 하나를 모델로 놓는다. */
  private addBuilding(w: World, b: Building): void {
    const G = this.group;
    const cx = b.x + b.w / 2;
    const cz = b.y + b.h / 2;
    const yaw = yawOf(b.side);
    let o: THREE.Object3D;
    if (b.kind === 'house')
      o = place(
        HOUSE_MODELS[(b.variant * 3 + (w.seed | 0)) % HOUSE_MODELS.length] as ModelName,
        cx,
        cz,
        Math.min(b.w, b.h) * 0.92,
        yaw,
        G,
      );
    else if (b.kind === 'bakery') o = place('building_market_yellow', cx, cz, b.w * 0.95, yaw, G);
    else if (b.kind === 'tavern') o = place('building_tavern_red', cx, cz, b.w * 0.8, yaw, G);
    else if (b.kind === 'workshop')
      o = place('building_blacksmith_blue', cx, cz, b.w * 0.9, yaw, G);
    else if (b.kind === 'yard')
      o = place('building_lumbermill_yellow', cx, cz - 0.2, b.w * 0.8, yaw, G);
    else o = place('building_windmill_yellow', cx, cz, 2.2, 0.4, G);
    this.roofH.set(b.id, (o.userData.height as number) ?? 2.5);
    if (b.kind === 'mill' || b.kind === 'yard') return;
    const d = b.side;
    const gx = d === 'e' ? b.x + b.w + 0.05 : d === 'w' ? b.x - 0.05 : b.door.x + 0.5;
    const gz = d === 's' ? b.y + b.h + 0.05 : d === 'n' ? b.y - 0.05 : b.door.y + 0.5;
    const lit =
      b.kind === 'bakery'
        ? (h: number): boolean => bakeryOpen(h)
        : b.kind === 'tavern'
          ? (h: number): boolean => h >= 17 || h < 1
          : (): boolean =>
              w.vs.some(
                (v) =>
                  v.inside === b.id && !(v.act && v.act.type === 'sleep' && v.act.phase === 'do'),
              );
    this.addGlow(gx, 0.7, gz, 2.6, 0xffc070, lit);
  }

  /** 꽃밭: 낮은 생울타리 둘레와 알록달록한 꽃. */
  private addFlowerbed(x: number, y: number, fw: number, fh: number, seed: number): THREE.Group {
    const g = new THREE.Group();
    const n = fw * fh * 9;
    const stems = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4),
      matStd('#5aa35a'),
      n,
    );
    const heads: THREE.InstancedMesh[] = FLOWER_COLORS.map(
      (c) => new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 8, 6), matStd(c, 0.6), n),
    );
    const counts = heads.map(() => 0);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const px = x + 0.15 + hash01(seed * 31 + i) * (fw - 0.3);
      const pz = y + 0.15 + hash01(seed * 17 + i * 3) * (fh - 0.3);
      const hgt = 0.16 + hash01(seed + i * 7) * 0.12;
      m.makeTranslation(px, hgt / 2, pz);
      stems.setMatrixAt(i, m);
      const ci = Math.floor(hash01(seed * 5 + i * 11) * heads.length);
      const hm = heads[ci];
      if (!hm) continue;
      m.makeTranslation(px, hgt + 0.03, pz);
      hm.setMatrixAt(counts[ci] ?? 0, m);
      counts[ci] = (counts[ci] ?? 0) + 1;
    }
    heads.forEach((h, i) => {
      h.count = counts[i] ?? 0;
      h.castShadow = true;
      g.add(h);
    });
    stems.castShadow = true;
    g.add(stems);
    // 둘레 생울타리(낮은 초록 띠)
    const rim = matStd('#6fa85a');
    const hx = 0.08;
    for (const [px, pz, sx, sz] of [
      [x + fw / 2, y + hx, fw, 0.16],
      [x + fw / 2, y + fh - hx, fw, 0.16],
      [x + hx, y + fh / 2, 0.16, fh],
      [x + fw - hx, y + fh / 2, 0.16, fh],
    ] as const) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.14, sz), rim);
      b.position.set(px, 0.07, pz);
      b.castShadow = true;
      b.receiveShadow = true;
      g.add(b);
    }
    this.group.add(g);
    return g;
  }

  /** 나무·바위·물풀·작물·밭 울타리. 같은 모델은 InstancedMesh 로 묶는다. */
  private addNature(w: World): void {
    const G = this.group;
    const treesA: InstanceItem[] = [];
    const treesB: InstanceItem[] = [];
    for (const f of w.L.forest) {
      const it = {
        x: f.x + 0.5 + (hash01(f.x + f.y * 3) - 0.5) * 0.4,
        z: f.y + 0.5 + (hash01(f.x * 5 + f.y) - 0.5) * 0.4,
        s: 0.85 + hash01(f.x * 3 + f.y * 11) * 0.5,
        yaw: hash01(f.x + f.y) * 6,
      };
      (hash01(f.x * 13 + f.y * 7) < 0.5 ? treesA : treesB).push(it);
    }
    instance('tree_single_A', treesA, 1.25, G);
    instance('tree_single_B', treesB, 1.25, G);
    const rocks = w.L.grass
      .filter((t) => hash01(t.x * 29 + t.y * 3) < 0.012)
      .map((t) => ({
        x: t.x + 0.5,
        z: t.y + 0.5,
        s: 0.8 + hash01(t.x) * 0.8,
        yaw: hash01(t.y) * 6,
      }));
    instance('rock_single_C', rocks, 0.32, G);
    instance(
      'waterlily_A',
      w.L.water
        .filter((t) => hash01(t.x * 7 + t.y * 5) < 0.12)
        .map((t) => ({ x: t.x + 0.5, z: t.y + 0.5, s: 1, yaw: hash01(t.x) * 6 })),
      0.45,
      G,
    );
    instance(
      'waterplant_A',
      w.L.shore
        .filter((t) => hash01(t.x * 11 + t.y) < 0.15)
        .map((t) => ({ x: t.x + 0.5, z: t.y + 0.5, s: 1, yaw: hash01(t.y) * 6 })),
      0.4,
      G,
    );
    // 밭 작물: 줄마다 둥근 채소 포기(두 가지 초록)와 가끔 주황 당근 잎. 크기를 조금씩 흔든다.
    const n = w.L.farm.length * 3;
    const heads = [matStd('#8cc063', 0.7), matStd('#6fae4f', 0.7)].map(
      (m) => new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 10, 7), m, n),
    );
    const tops = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.05, 0.12, 5),
      matStd('#f08a3c', 0.7),
      n,
    );
    const counts = [0, 0];
    let tc = 0;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const f of w.L.farm)
      for (let i = 0; i < 3; i++) {
        const r = hash01(f.x * 37 + f.y * 11 + i);
        const k = 0.8 + r * 0.45;
        const x = f.x + 0.2 + i * 0.3;
        const z = f.y + 0.42;
        if (f.y % 3 === 0 && r < 0.5) {
          m4.compose(p.set(x, 0.06, z), q.identity(), sc.setScalar(k));
          tops.setMatrixAt(tc++, m4);
          continue;
        }
        const which = f.y % 2;
        const hm = heads[which];
        if (!hm) continue;
        q.setFromAxisAngle(up, r * 6);
        m4.compose(p.set(x, 0.08 * k, z), q, sc.set(k, k * 0.72, k));
        hm.setMatrixAt(counts[which] ?? 0, m4);
        counts[which] = (counts[which] ?? 0) + 1;
      }
    heads.forEach((h, i) => {
      h.count = counts[i] ?? 0;
      h.castShadow = true;
      G.add(h);
    });
    tops.count = tc;
    tops.castShadow = true;
    G.add(tops);
    // 밭 울타리(말뚝)
    const posts: [number, number][] = [];
    const fx0 = FARM.x;
    const fx1 = FARM.x + FARM.w;
    const fz0 = FARM.y;
    const fz1 = FARM.y + FARM.h;
    for (let x = fx0; x <= fx1; x++) {
      posts.push([x, fz0]);
      posts.push([x, fz1]);
    }
    for (let z = fz0 + 1; z < fz1; z++) {
      posts.push([fx0, z]);
      if (z !== 31) posts.push([fx1, z]);
    }
    const post = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.08, 0.45, 0.08),
      matStd('#9a6a3c'),
      posts.length,
    );
    posts.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0.22, z);
      post.setMatrixAt(i, m4);
    });
    post.castShadow = true;
    G.add(post);
  }

  /** 파티 장식(깃발과 전구 줄). 파티가 있을 때만 보인다. */
  private addPartyDeco(): void {
    const deco = new THREE.Group();
    this.group.add(deco);
    const flags: ModelName[] = ['flag_red', 'flag_yellow', 'flag_blue', 'flag_green'];
    (
      [
        [26.3, 13.3],
        [36.7, 13.3],
        [26.3, 19.7],
        [36.7, 19.7],
        [31.5, 13.2],
        [31.5, 19.8],
      ] as const
    ).forEach(([x, z], i) => place(flags[i % 4] as ModelName, x, z, 0.9, i, deco));
    for (let i = 0; i < 16; i++)
      for (const zz of [13.3, 19.7]) {
        const col = [0xff7896, 0xffd166, 0x7fd6ff][i % 3] ?? 0xffd166;
        const x = 26.5 + i * (10 / 15);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), matBasic(col));
        bulb.position.set(x, 1.5 - Math.sin((i / 15) * Math.PI) * 0.25, zz);
        deco.add(bulb);
        const sp = new THREE.Sprite(matGlow(this.glowTex, col, 0.8));
        sp.position.copy(bulb.position);
        sp.scale.setScalar(0.8);
        deco.add(sp);
      }
    deco.visible = false;
    this.partyDeco = deco;
  }

  /** 공사장 모습: 말뚝·줄, 목재 더미, (집은) 비계와 차오르는 집, (장식은) 커지는 모형. */
  private addSite(bp: Blueprint): void {
    const g = new THREE.Group();
    this.group.add(g);
    const x0 = bp.x;
    const z0 = bp.y;
    const x1 = bp.x + bp.w;
    const z1 = bp.y + bp.h;
    // 네 모서리 말뚝과 줄
    for (const [px, pz] of [
      [x0 + 0.08, z0 + 0.08],
      [x1 - 0.08, z0 + 0.08],
      [x0 + 0.08, z1 - 0.08],
      [x1 - 0.08, z1 - 0.08],
    ] as const)
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.4, 0.06), '#c79a60', px, 0.2, pz));
    const rope = matStd('#f3e2b8');
    for (const [px, pz, sx, sz] of [
      [(x0 + x1) / 2, z0 + 0.08, bp.w - 0.16, 0.02],
      [(x0 + x1) / 2, z1 - 0.08, bp.w - 0.16, 0.02],
      [x0 + 0.08, (z0 + z1) / 2, 0.02, bp.h - 0.16],
      [x1 - 0.08, (z0 + z1) / 2, 0.02, bp.h - 0.16],
    ] as const) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.02, sz), rope);
      r.position.set(px, 0.34, pz);
      g.add(r);
    }
    const cx = bp.x + bp.w / 2;
    const cz = bp.y + bp.h / 2;
    let rising: THREE.Object3D | null = null;
    let scaffold: THREE.Object3D | null = null;
    let fullH = 1;
    if (bp.kind === 'house') {
      const yaw = yawOf(bp.side);
      rising = place(
        HOUSE_MODELS[(bp.id * 3) % HOUSE_MODELS.length] as ModelName,
        cx,
        cz,
        Math.min(bp.w, bp.h) * 0.92,
        yaw,
        g,
      );
      scaffold = place('building_scaffolding', cx, cz, Math.max(bp.w, bp.h) * 1.02, yaw, g);
    } else if (bp.kind === 'bench') rising = place('stall-bench', cx, cz, 0.95, Math.PI / 2, g);
    else if (bp.kind === 'lamp') rising = place('lantern', cx, cz, 0.2, 0, g);
    else if (bp.kind === 'flowerbed') {
      const holder = new THREE.Group();
      g.add(holder);
      const fb = this.addFlowerbed(bp.x, bp.y, bp.w, bp.h, bp.id);
      this.group.remove(fb);
      holder.add(fb);
      rising = holder;
    }
    if (rising) {
      fullH = rising.scale.y;
      rising.scale.y = fullH * 0.02;
    }
    const pile = new THREE.Group();
    g.add(pile);
    this.sites.set(bp.id, { bp, group: g, rising, scaffold, pile, pileN: -1, fullH });
  }

  /** 목재 더미(n 개를 통나무 몇 개로). */
  private static pileOf(pile: THREE.Group, n: number, x: number, z: number): void {
    for (const o of [...pile.children]) pile.remove(o);
    const logs = Math.min(9, Math.ceil(n / 3));
    for (let i = 0; i < logs; i++) {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const log = mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8),
        col % 2 ? '#b98552' : '#a8744a',
        x + (col - 1) * 0.15 + row * 0.07,
        0.07 + row * 0.12,
        z,
      );
      log.rotation.z = Math.PI / 2;
      log.rotation.y = 0.2;
      pile.add(log);
    }
  }

  /** 프레임마다: 공사 진행(차오르는 모형·비계), 공사장·야적장 목재 더미. */
  update(w: World): void {
    for (const s of this.sites.values()) {
      const bp = s.bp;
      const done = 1 - bp.workLeft / bp.workTotal;
      if (s.rising) {
        const k = bp.kind === 'house' ? 0.02 + done * 0.98 : 0.02 + done * 0.98;
        s.rising.scale.y = s.fullH * k;
        s.rising.visible = done > 0.001;
      }
      if (s.scaffold) s.scaffold.visible = done < 0.97;
      const remain = bp.got - Math.round(done * bp.need);
      if (remain !== s.pileN) {
        s.pileN = remain;
        const side =
          bp.kind === 'house'
            ? { x: bp.x - 0.1, z: bp.y + bp.h + 0.35 }
            : { x: bp.x + bp.w + 0.35, z: bp.y + bp.h / 2 };
        VillageView.pileOf(s.pile, Math.max(0, remain), side.x + 0.5, side.z);
      }
    }
    if (w.lumber !== this.yardN) {
      this.yardN = w.lumber;
      const yard = w.buildings.find((b) => b.kind === 'yard');
      for (const o of [...this.yardPile.children]) this.yardPile.remove(o);
      if (yard) {
        const stacks = Math.min(4, Math.ceil(w.lumber / 12));
        for (let i = 0; i < stacks; i++) {
          const p = new THREE.Group();
          VillageView.pileOf(
            p,
            Math.min(12, w.lumber - i * 12),
            yard.x + 0.3 + i * 0.75,
            yard.y + yard.h + 0.25 + (i % 2) * 0.1,
          );
          this.yardPile.add(p);
        }
      }
    }
  }

  /** 청사진 id 의 공사 중심과 진행(오버레이 진행 막대용). */
  siteInfo(): { x: number; z: number; frac: number; bp: Blueprint }[] {
    return [...this.sites.values()].map((s) => ({
      x: s.bp.x + s.bp.w / 2,
      z: s.bp.y + s.bp.h / 2,
      frac: 1 - s.bp.workLeft / s.bp.workTotal,
      bp: s.bp,
    }));
  }
}

/** 청사진 이름(진행 막대 문구). */
export function siteLabel(bp: Blueprint): string {
  const def = BUILDABLES[bp.kind];
  return bp.got < bp.need ? `${def.e} 목재 ${bp.got}/${bp.need}` : `${def.e} 짓는 중`;
}
