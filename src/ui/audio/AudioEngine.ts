// 오디오 엔진 (MVP_SPEC 30, TASK-050). AudioContext 하나·마스터 음량·음소거·합성 리버브를 모든 소리가 함께 쓴다.
// 첫 사용자 입력 전에는 브라우저가 소리를 막으므로 그때 연다. Web Audio 가 없으면(시험 환경) 조용히 아무것도 하지 않는다.
// 음소거는 사용자 편의 설정이라 localStorage 에 기억한다(읽기·쓰기 실패는 무시한다). 게임 상태가 아니다.

const MUTE_KEY = 'gtb.muted';

/** 소리 출력의 공용 경로. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private reverbIn: GainNode | null = null;
  private mutedFlag: boolean;
  private readonly listeners: ((muted: boolean) => void)[] = [];

  /** 첫 키·클릭에서 오디오를 연다. */
  constructor() {
    this.mutedFlag = readMuted();
    if (typeof window === 'undefined') return;
    const unlock = (): void => void this.ensure();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /** 음소거 중인가. */
  get muted(): boolean {
    return this.mutedFlag;
  }

  /** 음소거를 바꾼다. 마스터 음량을 부드럽게 내린다. */
  setMuted(muted: boolean): void {
    this.mutedFlag = muted;
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // 사생활 보호 모드 등에서 저장이 막히면 이번 세션만 기억한다
    }
    const ctx = this.context;
    if (ctx && this.masterGain)
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.8, ctx.currentTime, 0.05);
    for (const f of this.listeners) f(muted);
  }

  /** 음소거 변경을 구독한다(메뉴 버튼 표시). */
  onMuteChange(fn: (muted: boolean) => void): void {
    this.listeners.push(fn);
  }

  /** 준비된 AudioContext. 아직 사용자 입력 전이거나 지원하지 않으면 null. */
  get ctx(): AudioContext | null {
    return this.context && this.context.state === 'running' ? this.context : null;
  }

  /** 마른 출력(리버브 없음). */
  get dry(): AudioNode | null {
    return this.masterGain;
  }

  /** 리버브를 거치는 출력(종·방 인식음). */
  get wet(): AudioNode | null {
    return this.reverbIn;
  }

  /** AudioContext 를 만들거나 재개한다. */
  ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.context) {
      const Ctor = window.AudioContext;
      if (typeof Ctor !== 'function') return null;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.mutedFlag ? 0 : 0.8;
      master.connect(ctx.destination);
      // 합성 잔향: 감쇠하는 잡음 임펄스 2.4 초
      const convolver = ctx.createConvolver();
      convolver.buffer = impulse(ctx, 2.4, 2.6);
      const send = ctx.createGain();
      send.gain.value = 1;
      const wetOut = ctx.createGain();
      wetOut.gain.value = 0.55;
      send.connect(convolver).connect(wetOut).connect(master);
      send.connect(master);
      this.context = ctx;
      this.masterGain = master;
      this.reverbIn = send;
    }
    if (this.context.state === 'suspended') void this.context.resume();
    return this.context;
  }
}

/** 저장된 음소거 값. 읽을 수 없으면 false. */
function readMuted(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** 감쇠 잡음 임펄스 응답(스테레오). */
function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}
