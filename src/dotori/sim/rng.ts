// 직렬화할 수 있는 난수(mulberry32). 상태가 숫자 하나라 저장·불러오기 뒤에도 같은 수열이 이어진다.

export class Rng {
  /** 내부 상태(32 비트 정수). 저장에 그대로 들어간다. */
  state: number;

  /** 시드로 난수를 만든다. */
  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** [0, 1) 난수. */
  next(): number {
    let a = (this.state = (this.state + 0x6d2b79f5) | 0);
    a = Math.imul(a ^ (a >>> 15), 1 | a);
    a = (a + Math.imul(a ^ (a >>> 7), 61 | a)) ^ a;
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  }

  /** [a, b] 정수. */
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }

  /** 배열에서 하나를 고른다. 빈 배열이면 undefined. */
  pick<T>(arr: readonly T[]): T | undefined {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** 배열을 제자리에서 섞고 돌려준다. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = t;
    }
    return arr;
  }
}

/** 좌표 등에서 [0, 1) 값을 만드는 결정적 해시(겉모습 흔들림용, 시험판 hash). */
export function hash01(i: number): number {
  const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}
