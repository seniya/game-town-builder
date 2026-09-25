// 나침반 HUD (MVP_SPEC 29: 화면 위 가운데). 카메라가 보는 방위를 동서남북 띠로 보여 준다. DOM 만 쓴다.
// 방위 규약: 북 = −z, 동 = +x, 남 = +z, 서 = −x. 방위각은 북에서 시계 방향 라디안이다. 게임 상태를 소유하지 않는다 (29.1).

/** 띠에 놓는 눈금: 네 방위는 글자, 사이 방위는 작은 점. */
const MARKS: readonly { readonly deg: number; readonly label: string; readonly major: boolean }[] =
  [
    { deg: 0, label: '북', major: true },
    { deg: 45, label: '·', major: false },
    { deg: 90, label: '동', major: true },
    { deg: 135, label: '·', major: false },
    { deg: 180, label: '남', major: true },
    { deg: 225, label: '·', major: false },
    { deg: 270, label: '서', major: true },
    { deg: 315, label: '·', major: false },
  ];

/** 띠의 너비(px)와 한쪽 끝까지 보이는 각도(°). */
const WIDTH_PX = 220;
const HALF_SPAN_DEG = 100;

/** 매 프레임 카메라 방위각을 읽어 동서남북 띠를 움직인다. 1° 이상 바뀔 때만 DOM 을 고친다. */
export class CompassHud {
  private readonly root: HTMLDivElement;
  private readonly marks: HTMLSpanElement[] = [];
  private shownDeg = Number.NaN;

  /** parent 에 HUD 를 붙인다. heading 은 카메라가 보는 방위각(라디안, 북 0·동 π/2)을 돌려준다. */
  constructor(
    parent: HTMLElement,
    private readonly heading: () => number,
  ) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'fixed',
      left: '50%',
      top: '10px',
      width: `${WIDTH_PX}px`,
      height: '26px',
      transform: 'translateX(-50%)',
      borderRadius: '13px',
      background: 'rgba(62, 42, 30, 0.62)',
      color: '#f4efe2',
      font: '600 14px system-ui, sans-serif',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '20',
      // 양 끝을 흐리게 해 띠가 이어지는 느낌을 준다
      maskImage: 'linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent)',
    });
    const needle = document.createElement('div');
    Object.assign(needle.style, {
      position: 'absolute',
      left: '50%',
      bottom: '0',
      width: '0',
      height: '0',
      transform: 'translateX(-50%)',
      borderLeft: '5px solid transparent',
      borderRight: '5px solid transparent',
      borderBottom: '5px solid #f2c46b',
    });
    this.root.append(needle);
    for (const m of MARKS) {
      const s = document.createElement('span');
      s.textContent = m.label;
      Object.assign(s.style, {
        position: 'absolute',
        top: '3px',
        left: '0',
        width: '24px',
        marginLeft: '-12px',
        textAlign: 'center',
        color: m.label === '북' ? '#f2c46b' : '#f4efe2',
        opacity: m.major ? '1' : '0.55',
      });
      this.marks.push(s);
      this.root.append(s);
    }
    parent.append(this.root);
  }

  /** 매 프레임 부른다. 방위가 1° 이상 바뀌었을 때만 눈금 위치를 고친다. */
  update(): void {
    const deg = Math.round(normalizeDeg((this.heading() * 180) / Math.PI));
    if (deg === this.shownDeg) return;
    this.shownDeg = deg;
    MARKS.forEach((m, i) => {
      const el = this.marks[i];
      if (!el) return;
      const d = signedDeltaDeg(m.deg, deg);
      const visible = Math.abs(d) <= HALF_SPAN_DEG;
      el.style.display = visible ? '' : 'none';
      if (visible) el.style.left = `${WIDTH_PX / 2 + (d / HALF_SPAN_DEG) * (WIDTH_PX / 2)}px`;
    });
  }
}

/** 각도를 [0, 360) 으로 맞춘다. */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** 방위 target 이 현재 방위 current 에서 몇 도 오른쪽(+)·왼쪽(−)에 있는가. [−180, 180) 이다. */
export function signedDeltaDeg(target: number, current: number): number {
  return normalizeDeg(target - current + 180) - 180;
}

/** 수평 시선 벡터(dx, dz)의 방위각(라디안). 북(−z) 0, 동(+x) π/2. */
export function headingFromDirection(dx: number, dz: number): number {
  return Math.atan2(dx, -dz);
}
