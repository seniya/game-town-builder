// 종소리 (MVP_SPEC 23.3, TASK-036). 레벨이 오르면 합성한 종소리를 세 번 울린다. 파일 에셋 없이 Web Audio 로 만든다.
// 최종 음질은 TASK-050 에서 다듬는다. 게임 상태를 소유하지 않고 이벤트만 구독한다.
import type { EventBus } from '../game/EventBus';

/** 종의 배음 비율과 상대 세기(작은 교회 종에 가까운 비화성 배음). */
const PARTIALS: readonly (readonly [number, number])[] = [
  [0.5, 0.5],
  [1, 1],
  [1.2, 0.6],
  [1.5, 0.45],
  [2, 0.35],
  [2.74, 0.25],
];

/** 레벨 업 종소리. */
export class BellSound {
  private ctx: AudioContext | null = null;

  /** 이벤트를 구독한다. 첫 사용자 입력 뒤에만 소리가 난다(브라우저 정책). */
  constructor(events: EventBus) {
    const unlock = (): void => void this.ensure();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    events.on('VILLAGE_LEVEL_UP', () => queueMicrotask(() => this.ring()));
  }

  /** AudioContext 를 만들거나 재개한다. 지원하지 않으면 null. */
  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = window.AudioContext;
      if (typeof Ctor !== 'function') return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** 종을 세 번 친다. */
  private ring(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    for (let k = 0; k < 3; k++) this.strike(ctx, ctx.currentTime + k * 0.9, 523.25);
  }

  /** 한 번 친 소리: 배음마다 사인파, 빠른 어택과 긴 감쇠. */
  private strike(ctx: AudioContext, t0: number, base: number): void {
    const out = ctx.createGain();
    out.gain.value = 0.18;
    out.connect(ctx.destination);
    for (const [ratio, amp] of PARTIALS) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.value = base * ratio;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(amp, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4 / Math.max(1, ratio));
      osc.connect(g).connect(out);
      osc.start(t0);
      osc.stop(t0 + 2.6);
    }
  }
}
