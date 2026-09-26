// 주민 사이 호감표(-100~100). 주민이 늘면 용량을 두 배씩 늘린다(SPEC 7).

export class Affinity {
  private cap: number;
  private data: Float32Array;

  /** 처음 용량으로 표를 만든다. */
  constructor(cap = 32) {
    this.cap = Math.max(1, cap);
    this.data = new Float32Array(this.cap * this.cap);
  }

  /** 주민 id n 까지 담을 수 있게 늘린다. */
  ensure(n: number): void {
    if (n <= this.cap) return;
    let cap = this.cap;
    while (cap < n) cap *= 2;
    const next = new Float32Array(cap * cap);
    for (let a = 0; a < this.cap; a++)
      next.set(this.data.subarray(a * this.cap, (a + 1) * this.cap), a * cap);
    this.cap = cap;
    this.data = next;
  }

  /** a 가 b 를 얼마나 좋아하는가. */
  get(a: number, b: number): number {
    return this.data[a * this.cap + b] ?? 0;
  }

  /** a 의 b 에 대한 호감을 정한다. */
  set(a: number, b: number, v: number): void {
    this.data[a * this.cap + b] = v < -100 ? -100 : v > 100 ? 100 : v;
  }

  /** a 의 b 에 대한 호감을 d 만큼 바꾼다. */
  add(a: number, b: number, d: number): void {
    this.set(a, b, this.get(a, b) + d);
  }

  /** 저장용: 주민 n 명 부분만 행 우선 배열로. */
  toArray(n: number): number[] {
    const out: number[] = [];
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++) out.push(Math.round(this.get(a, b) * 10) / 10);
    return out;
  }

  /** 저장에서 되살린다. */
  static fromArray(n: number, arr: readonly number[]): Affinity {
    const f = new Affinity(Math.max(32, n));
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) f.set(a, b, arr[a * n + b] ?? 0);
    return f;
  }
}
