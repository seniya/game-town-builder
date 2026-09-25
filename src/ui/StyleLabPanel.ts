// 스타일 시안 장면 조작판 (STYLE-001, MVP_SPEC 45.1). DOM 만 쓴다. 장면 명령은 주입된 포트로 부른다.
// 자세·명암 단계·외곽선·시점 버튼과, 모형 위에 띄우는 이름표, 계측 한 줄을 그린다.

/** 조작판이 부르는 장면 명령과 읽는 값. */
export interface StyleLabPort {
  setPose(pose: 'idle' | 'walk' | 'cook' | 'sit' | 'work'): void;
  setToonSteps(steps: 2 | 3): void;
  setOutline(on: boolean): void;
  setView(index: number): void;
}

/** 이름표 하나(화면 픽셀). */
export interface StyleLabLabel {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}

/** 조작판의 처음 선택. URL 로 정해 headless 관찰에도 쓴다. */
export interface StyleLabInitial {
  readonly pose: 'idle' | 'walk' | 'cook' | 'sit' | 'work';
  readonly steps: 2 | 3;
  readonly outline: boolean;
  readonly view: number;
}

const POSES = [
  ['idle', '서기'],
  ['walk', '걷기'],
  ['cook', '조리'],
  ['sit', '앉기'],
  ['work', '밭일'],
] as const;
const VIEWS = ['주민', '가구', '블록', '전경', '얼굴'] as const;

/** 둥근 말랑 버튼 모양(시안 UI 톤의 맛보기). */
const BUTTON_CSS =
  'border:0;border-radius:999px;padding:6px 12px;margin:2px;font:600 13px system-ui,sans-serif;' +
  'cursor:pointer;background:#fff4df;color:#5a4030;box-shadow:0 2px 0 #d9b98f;';
const ACTIVE_CSS = 'background:#ffb865;color:#fff;box-shadow:0 2px 0 #c97a2a;';

/** 조작판. */
export class StyleLabPanel {
  private readonly root = document.createElement('div');
  private readonly labelLayer = document.createElement('div');
  private readonly statsLine = document.createElement('div');
  private readonly labelEls: HTMLDivElement[] = [];

  /** 조작판을 body 에 붙이고 처음 선택을 장면에 적용한다. */
  constructor(
    private readonly port: StyleLabPort,
    initial: StyleLabInitial,
  ) {
    this.root.style.cssText =
      'position:fixed;left:12px;top:12px;max-width:min(560px,calc(100vw - 24px));padding:10px 12px;' +
      'background:rgba(255,250,240,0.92);border-radius:18px;box-shadow:0 4px 14px rgba(60,40,20,0.25);' +
      'font:13px system-ui,sans-serif;color:#5a4030;z-index:10;';
    const title = document.createElement('div');
    title.textContent = '스타일 시안 (STYLE-001) — 지금 ↔ 시안';
    title.style.cssText = 'font-weight:700;font-size:15px;margin-bottom:6px;';
    this.root.append(title);
    this.row(
      '자세',
      POSES.map(([k, t]) => [k, t] as const),
      initial.pose,
      (k) => port.setPose(k),
    );
    this.row(
      '명암',
      [
        [2, '2 단'],
        [3, '3 단'],
      ] as const,
      initial.steps,
      (k) => port.setToonSteps(k),
    );
    this.row(
      '외곽선',
      [
        [true, '켬'],
        [false, '끔'],
      ] as const,
      initial.outline,
      (k) => port.setOutline(k),
    );
    this.row(
      '시점',
      VIEWS.map((t, i) => [i, t] as const),
      initial.view,
      (k) => port.setView(k),
    );
    const hint = document.createElement('div');
    hint.textContent = '끌어서 돌리기 · 휠로 확대/축소';
    hint.style.cssText = 'opacity:0.7;margin-top:4px;font-size:12px;';
    this.statsLine.style.cssText = 'opacity:0.7;margin-top:2px;font-size:12px;';
    this.root.append(hint, this.statsLine);
    this.labelLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;';
    document.body.append(this.labelLayer, this.root);
    port.setPose(initial.pose);
    port.setToonSteps(initial.steps);
    port.setOutline(initial.outline);
    port.setView(initial.view);
  }

  /** 이름표 위치를 맞춘다. 매 프레임 부른다. */
  updateLabels(labels: readonly StyleLabLabel[]): void {
    labels.forEach((l, i) => {
      let el = this.labelEls[i];
      if (!el) {
        el = document.createElement('div');
        el.style.cssText =
          'position:absolute;transform:translate(-50%,-100%);padding:3px 9px;border-radius:999px;' +
          'background:rgba(255,250,240,0.9);color:#5a4030;font:600 12px system-ui,sans-serif;white-space:nowrap;' +
          'box-shadow:0 2px 6px rgba(60,40,20,0.2);';
        this.labelLayer.append(el);
        this.labelEls.push(el);
      }
      el.textContent = l.text;
      el.style.display = l.visible ? 'block' : 'none';
      el.style.left = `${l.x.toFixed(0)}px`;
      el.style.top = `${l.y.toFixed(0)}px`;
    });
  }

  /** 계측 한 줄을 바꾼다. */
  setStats(text: string): void {
    this.statsLine.textContent = text;
  }

  /** 버튼 한 줄. 누르면 같은 줄의 다른 버튼 선택을 푼다. */
  private row<K extends string | number | boolean>(
    name: string,
    items: readonly (readonly [K, string])[],
    initial: K,
    apply: (k: K) => void,
  ): void {
    const line = document.createElement('div');
    const head = document.createElement('span');
    head.textContent = name;
    head.style.cssText = 'display:inline-block;width:48px;font-weight:600;';
    line.append(head);
    const buttons: HTMLButtonElement[] = [];
    for (const [key, text] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      const paint = (on: boolean) => (b.style.cssText = BUTTON_CSS + (on ? ACTIVE_CSS : ''));
      paint(key === initial);
      b.addEventListener('click', () => {
        for (const other of buttons) other.style.cssText = BUTTON_CSS;
        paint(true);
        apply(key);
      });
      buttons.push(b);
      line.append(b);
    }
    this.root.append(line);
  }
}
