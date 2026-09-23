// 방 인식·해제의 최소 효과음 (TASK-021, MVP_SPEC 30). DOM 의 Web Audio 만 쓴다. 파일 에셋 없이 합성한다.
// 최종 음질과 전체 오디오는 TASK-050 에서 완성한다. 게임 상태를 소유하지 않고 이벤트만 구독한다.
import type { EventBus } from '../game/EventBus';

/** 인식 성공 화음: 밝은 장3화음 아르페지오 위에 한 옥타브 위 종소리. 주파수(Hz)와 시작 지연(초). */
const SUCCESS_NOTES: readonly (readonly [number, number])[] = [
  [523.25, 0],
  [659.25, 0.07],
  [783.99, 0.14],
  [1046.5, 0.24],
];
/** 해제 경고: 낮게 내려가는 두 음. */
const WARN_NOTES: readonly (readonly [number, number])[] = [
  [392.0, 0],
  [277.18, 0.16],
];

/** 방 이벤트 효과음. 첫 사용자 입력 전에는 브라우저가 소리를 막으므로 그때 AudioContext 를 연다. */
export class RoomSound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** 같은 프레임에 여러 방이 바뀌어도 한 번만 울린다 */
  private lastPlayed = { success: -1, warn: -1 };

  /** 방 이벤트를 구독하고, 첫 키·클릭에서 오디오를 준비한다. */
  constructor(events: EventBus) {
    const unlock = (): void => {
      this.ensure();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    // 소리 준비는 이벤트 밖(현재 작업이 끝난 뒤)에서 한다. 방 판정 예산에 오디오 비용을 섞지 않는다
    const later = (kind: 'success' | 'warn'): void => queueMicrotask(() => this.play(kind));
    events.on('ROOM_REGISTERED', () => later('success'));
    events.on('ROOM_TYPE_CHANGED', () => later('success'));
    events.on('ROOM_UNREGISTERED', (p) => {
      // 합병은 새 방 등록음이 곧 따라오므로 경고음을 내지 않는다
      if (p.reason.reason !== 'MERGED') later('warn');
    });
  }

  /** AudioContext 를 만들거나 재개한다. 지원하지 않으면 무음이다. */
  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext;
      if (typeof Ctor !== 'function') return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** 효과음 하나를 낸다. 같은 종류를 50 ms 안에 다시 내지 않는다. */
  private play(kind: 'success' | 'warn'): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime;
    if (t0 - this.lastPlayed[kind] < 0.05) return;
    this.lastPlayed[kind] = t0;
    if (kind === 'success') {
      for (const [f, d] of SUCCESS_NOTES) this.bell(ctx, f, t0 + d, 1.4);
    } else {
      for (const [f, d] of WARN_NOTES) this.buzz(ctx, f, t0 + d, 0.28);
    }
  }

  /** 맑은 종소리: 사인파 기음 + 비화성 배음, 빠른 어택과 긴 감쇠. */
  private bell(ctx: AudioContext, freq: number, at: number, length: number): void {
    for (const [ratio, gain] of [
      [1, 0.5],
      [2.76, 0.12],
      [5.4, 0.05],
    ] as const) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(gain, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + length / ratio);
      osc.connect(g).connect(this.master as GainNode);
      osc.start(at);
      osc.stop(at + length);
    }
  }

  /** 짧은 경고음: 삼각파에 저역 필터, 음 끝이 살짝 내려간다. */
  private buzz(ctx: AudioContext, freq: number, at: number, length: number): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, at);
    osc.frequency.linearRampToValueAtTime(freq * 0.94, at + length);
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.45, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc
      .connect(filter)
      .connect(g)
      .connect(this.master as GainNode);
    osc.start(at);
    osc.stop(at + length + 0.02);
  }
}
