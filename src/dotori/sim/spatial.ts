// 주민 공간 격자: 가까운 주민만 빠르게 찾는다(주민 수의 제곱 반복을 피한다, ARCHITECTURE 4).
import type { Villager } from './types';

export class SpatialGrid {
  private readonly cell: number;
  private readonly buckets = new Map<number, Villager[]>();

  /** 한 칸의 크기(타일). */
  constructor(cell: number) {
    this.cell = cell;
  }

  /** 칸 좌표를 하나의 키로. 지도 크기가 달라도 겹치지 않게 넓게 잡는다. */
  private key(cx: number, cy: number): number {
    return (cy + 1024) * 4096 + (cx + 1024);
  }

  /** 주민 목록으로 격자를 다시 채운다. 목록 순서가 칸 안 순서가 된다(결정적). */
  rebuild(vs: readonly Villager[]): void {
    for (const b of this.buckets.values()) b.length = 0;
    for (const v of vs) {
      const k = this.key(Math.floor(v.x / this.cell), Math.floor(v.y / this.cell));
      let b = this.buckets.get(k);
      if (!b) {
        b = [];
        this.buckets.set(k, b);
      }
      b.push(v);
    }
  }

  /** (x, y) 가 든 칸과 둘레 여덟 칸의 주민에게 fn 을 부른다. */
  forNear(x: number, y: number, fn: (v: Villager) => void): void {
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const b = this.buckets.get(this.key(cx + dx, cy + dy));
        if (b) for (const v of b) fn(v);
      }
  }
}
