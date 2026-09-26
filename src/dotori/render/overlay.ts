// 3D 위에 겹쳐 그리는 2D 층: 감정 입자, 말풍선, 이름표, 비, 잠 z. 월드 좌표를 화면 좌표로 투영해 그린다.
import * as THREE from 'three';

export type BurstType =
  | 'soil'
  | 'dirt'
  | 'chip'
  | 'spark'
  | 'splash'
  | 'heart'
  | 'steam'
  | 'sweat'
  | 'sparkle'
  | 'smoke'
  | 'note'
  | 'z'
  | 'dust'
  | 'confetti'
  | 'sawdust';

interface Particle {
  type: 'dot' | 'puff' | 'rect' | 'heart' | 'drop' | 'star' | 'note' | 'z';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  life: number;
  age: number;
  size: number;
  grow: number;
  color: string;
  rot: number;
  vr: number;
}

const EMOJI_FONT = 'system-ui,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const MAX_PARTS = 900;

/** 입자 종류별 초기값(시험판). 크기와 속도는 월드 단위. */
function preset(
  type: BurstType,
  x: number,
  y: number,
  z: number,
  i: number,
): Partial<Particle> | null {
  const r = Math.random;
  const sx = r() - 0.5;
  const sz = r() - 0.5;
  switch (type) {
    case 'soil':
    case 'dirt':
      return {
        type: 'dot',
        x,
        y,
        z,
        vx: sx * 1.4,
        vz: sz * 1.4,
        vy: 1.1 + r() * 1.2,
        g: -6,
        life: 0.55,
        size: 0.05,
        color: type === 'soil' ? '#8a5a34' : '#6e4a2c',
      };
    case 'chip':
      return {
        type: 'rect',
        x,
        y,
        z,
        vx: sx * 2.2,
        vz: sz * 2.2,
        vy: 1.4 + r() * 1.2,
        g: -7,
        life: 0.6,
        size: 0.07,
        color: r() < 0.5 ? '#e8c48c' : '#c99a5e',
        rot: r() * 6,
        vr: (r() - 0.5) * 20,
      };
    case 'sawdust':
      return {
        type: 'dot',
        x: x + sx * 0.6,
        y,
        z: z + sz * 0.6,
        vx: sx * 1.2,
        vz: sz * 1.2,
        vy: 0.9 + r(),
        g: -5,
        life: 0.7,
        size: 0.035,
        color: r() < 0.5 ? '#f1d8a8' : '#d9b27a',
      };
    case 'spark':
      return {
        type: 'dot',
        x,
        y,
        z,
        vx: sx * 2.6,
        vz: sz * 2.6,
        vy: 1 + r() * 1.6,
        g: -5,
        life: 0.35,
        size: 0.035,
        color: '#ffd35a',
      };
    case 'splash':
      return {
        type: 'dot',
        x,
        y,
        z,
        vx: sx * 1.8,
        vz: sz * 1.8,
        vy: 1.6 + r() * 1.1,
        g: -6,
        life: 0.65,
        size: 0.05,
        color: '#e9f8ff',
      };
    case 'heart':
      return {
        type: 'heart',
        x: x + sx * 0.5,
        y,
        z: z + sz * 0.5,
        vy: 0.55 + r() * 0.4,
        life: 1.5,
        size: 0.13 + r() * 0.07,
        color: r() < 0.5 ? '#ff7fa3' : '#ff5c8a',
      };
    case 'steam':
      return {
        type: 'puff',
        x: x + (i % 2 ? 0.2 : -0.2),
        y,
        z,
        vx: i % 2 ? 0.5 : -0.5,
        vy: 0.7,
        life: 0.7,
        size: 0.07,
        grow: 0.12,
        color: 'rgba(255,255,255,0.95)',
      };
    case 'sweat':
      return {
        type: 'drop',
        x: x + (i % 2 ? 0.25 : -0.25),
        y,
        z,
        vx: i % 2 ? 0.6 : -0.6,
        vy: 0.9,
        g: -5,
        life: 0.6,
        size: 0.07,
        color: '#8fd3ff',
      };
    case 'sparkle':
      return {
        type: 'star',
        x: x + sx * 0.9,
        y: y + r() * 0.5,
        z: z + sz * 0.5,
        vy: 0.25,
        life: 1,
        size: 0.1 + r() * 0.08,
        color: '#fff3a0',
      };
    case 'smoke':
      return {
        type: 'puff',
        x: x + sx * 0.08,
        y,
        z,
        vx: 0.12 + r() * 0.12,
        vy: 0.38,
        life: 2.6,
        size: 0.12,
        grow: 0.3,
        color: 'rgba(236,236,236,0.55)',
      };
    case 'note':
      return {
        type: 'note',
        x: x + sx * 0.5,
        y,
        z,
        vx: sx * 0.35,
        vy: 0.55,
        life: 1.5,
        size: 0.3,
        color: ['#ff7fa3', '#ffb347', '#5fbfff'][i % 3] ?? '#ff7fa3',
      };
    case 'z':
      return { type: 'z', x, y, z, vx: 0.18, vy: 0.3, life: 1.8, size: 0.26, color: '#ffffff' };
    case 'dust':
      return {
        type: 'puff',
        x: x + sx * 0.1,
        y,
        z: z + sz * 0.1,
        vx: sx * 0.3,
        vy: 0.12,
        life: 0.45,
        size: 0.06,
        grow: 0.12,
        color: 'rgba(225,210,175,0.7)',
      };
    case 'confetti':
      return {
        type: 'rect',
        x,
        y,
        z,
        vx: sx * 0.6,
        vz: sz * 0.6,
        vy: -0.4 - r() * 0.3,
        life: 3,
        size: 0.07,
        color: ['#ff7896', '#ffd166', '#7fd6ff', '#b7f07a'][i % 4] ?? '#ffd166',
        rot: r() * 6,
        vr: (r() - 0.5) * 10,
      };
  }
}

/** 하트 경로. */
function heartPath(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x, y + s * 0.35);
  c.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
  c.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  c.closePath();
}

const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export class Overlay {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private parts: Particle[] = [];
  private readonly tmp = new THREE.Vector3();
  camera: THREE.PerspectiveCamera;
  cw = 800;
  ch = 500;

  /** 그림판 위에 겹치는 캔버스를 만든다. */
  constructor(after: HTMLCanvasElement, camera: THREE.PerspectiveCamera) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    after.after(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D 캔버스를 만들 수 없다');
    this.ctx = ctx;
    this.camera = camera;
  }

  /** 크기를 맞춘다. */
  resize(cw: number, ch: number, dpr: number): void {
    this.cw = cw;
    this.ch = ch;
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(ch * dpr);
  }

  /** 새 마을을 지을 때 입자를 비운다. */
  clear(): void {
    this.parts.length = 0;
  }

  /** 월드 좌표 → 화면 좌표. 카메라 뒤면 null. */
  project(x: number, y: number, z: number): [number, number] | null {
    const v = this.tmp.set(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return [((v.x + 1) / 2) * this.cw, ((1 - v.y) / 2) * this.ch];
  }

  /** 그 위치에서 한 월드 단위가 몇 픽셀인가. */
  pxPerUnit(x: number, y: number, z: number): number {
    const d = this.camera.position.distanceTo(this.tmp.set(x, y, z));
    return this.ch / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * d);
  }

  /** 입자 묶음을 띄운다. (x, z) 바닥 좌표, y 높이. */
  burst(type: BurstType, x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const p = preset(type, x, y, z, i);
      if (!p || this.parts.length >= MAX_PARTS) continue;
      this.parts.push({
        type: 'dot',
        x,
        y,
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        g: 0,
        life: 1,
        age: 0,
        size: 0.05,
        grow: 0,
        color: '#fff',
        rot: 0,
        vr: 0,
        ...p,
      });
    }
  }

  /** 입자를 움직이고 그린다. */
  drawParts(dt: number): void {
    const o = this.ctx;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i] as Particle;
      p.age += dt;
      if (p.age >= p.life) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.vr) p.rot += p.vr * dt;
      if (p.y < 0.02 && p.g < 0) {
        p.y = 0.02;
        p.vx *= 0.5;
        p.vz *= 0.5;
        p.vy = 0;
      }
      const s = this.project(p.x, p.y, p.z);
      if (!s) continue;
      const [sx, sy] = s;
      if (sx < -40 || sy < -40 || sx > this.cw + 40 || sy > this.ch + 40) continue;
      const k = p.age / p.life;
      const sz = Math.max(1, (p.size + p.grow * k) * this.pxPerUnit(p.x, p.y, p.z));
      o.globalAlpha = Math.min(1, (1 - k) * 1.6);
      o.fillStyle = p.color;
      switch (p.type) {
        case 'dot':
        case 'puff':
          o.beginPath();
          o.arc(sx, sy, sz, 0, 7);
          o.fill();
          break;
        case 'rect':
          o.save();
          o.translate(sx, sy);
          o.rotate(p.rot);
          o.fillRect(-sz, -sz * 0.45, sz * 2, sz * 0.9);
          o.restore();
          break;
        case 'heart':
          heartPath(o, sx, sy, sz);
          o.fill();
          break;
        case 'drop':
          o.beginPath();
          o.moveTo(sx, sy - sz * 1.3);
          o.quadraticCurveTo(sx + sz, sy, sx, sy + sz * 0.7);
          o.quadraticCurveTo(sx - sz, sy, sx, sy - sz * 1.3);
          o.fill();
          break;
        case 'star':
          o.beginPath();
          for (let j = 0; j < 8; j++) {
            const a = (j * Math.PI) / 4;
            const r2 = j % 2 ? sz * 0.35 : sz;
            o.lineTo(sx + Math.cos(a) * r2, sy + Math.sin(a) * r2);
          }
          o.closePath();
          o.fill();
          break;
        case 'note':
          o.font = `700 ${sz * 1.3}px sans-serif`;
          o.textAlign = 'center';
          o.textBaseline = 'middle';
          o.fillText('♪', sx, sy);
          break;
        case 'z':
          o.font = `700 ${sz}px "Jua",sans-serif`;
          o.textAlign = 'center';
          o.textBaseline = 'middle';
          o.fillText('z', sx, sy);
          break;
      }
    }
    o.globalAlpha = 1;
  }

  /** 말풍선: 새 감정이면 통통 튀며 나타난다(bounce 0~1). */
  bubble(x: number, y: number, e: string, strong: boolean, bounce: number): void {
    const o = this.ctx;
    const sc = Math.max(0.01, easeOutBack(Math.min(1, Math.max(0, bounce))));
    const fs = 17;
    const w = fs * 1.5;
    const h = fs * 1.35;
    o.save();
    o.translate(x, y);
    o.scale(sc, sc);
    o.fillStyle = strong ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.82)';
    o.strokeStyle = 'rgba(60,50,40,0.25)';
    o.lineWidth = 1;
    o.beginPath();
    o.roundRect(-w / 2, -h, w, h, h / 2.2);
    o.moveTo(-3, 0);
    o.lineTo(0, 4);
    o.lineTo(3, 0);
    o.fill();
    o.stroke();
    o.font = `${fs}px ${EMOJI_FONT}`;
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.fillStyle = '#000';
    o.fillText(e, 0, -h / 2 + 1);
    o.restore();
  }

  /** 이름표. */
  name(x: number, y: number, name: string, strong: boolean): void {
    const o = this.ctx;
    o.font = `${strong ? '700 ' : ''}12px "Gowun Dodum",sans-serif`;
    const w = o.measureText(name).width + 10;
    o.fillStyle = strong ? 'rgba(47,125,109,0.95)' : 'rgba(30,40,40,0.7)';
    o.beginPath();
    o.roundRect(x - w / 2, y - 8, w, 16, 8);
    o.fill();
    o.fillStyle = '#fff';
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.fillText(name, x, y);
  }

  /** 공사장 진행 막대와 목재 수. */
  progress(x: number, y: number, frac: number, label: string): void {
    const o = this.ctx;
    const w = 54;
    o.fillStyle = 'rgba(30,40,40,0.72)';
    o.beginPath();
    o.roundRect(x - w / 2 - 4, y - 9, w + 8, 18, 9);
    o.fill();
    o.fillStyle = 'rgba(255,255,255,0.25)';
    o.fillRect(x - w / 2, y + 3, w, 3);
    o.fillStyle = '#ffd166';
    o.fillRect(x - w / 2, y + 3, w * Math.min(1, Math.max(0, frac)), 3);
    o.font = '11px "Gowun Dodum",sans-serif';
    o.fillStyle = '#fff';
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.fillText(label, x, y - 2);
  }
}
