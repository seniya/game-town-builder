// 상호작용 대상 선택 (READY-07, MVP_SPEC 13.2.1, ADR 033). 순수 함수이며 아무것도 바꾸지 않는다.
// 블록 편집과 같은 조준 광선·사거리로 가장 가까운 대상 하나를 고른다. 광선은 첫 고체에서 멈추므로 가림을 따로 계산하지 않는다.
import { balance } from '../data/balance';
import { BlockId } from '../data/blocks';
import type { Player } from '../entities/Player';
import type { AabbBody, BlockPos, Vec3 } from '../types';
import type { CollisionWorld } from '../voxel/collision';
import { aimRay, findAimTarget } from './aim';

/** F 로 열 수 있는 대상. */
export type InteractTarget =
  | { readonly kind: 'bell'; readonly pos: BlockPos }
  | { readonly kind: 'chest'; readonly pos: BlockPos }
  | { readonly kind: 'npc'; readonly npcId: string };

/** 광선이 축 정렬 몸체와 만나는 거리. 만나지 않거나 뒤쪽이면 null. 슬랩 방식이다. */
export function rayHitsBody(origin: Vec3, dir: Vec3, body: AabbBody): number | null {
  const h = body.width / 2;
  const lo = [body.pos.x - h, body.pos.y, body.pos.z - h];
  const hi = [body.pos.x + h, body.pos.y + body.height, body.pos.z + h];
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  let tmin = 0;
  let tmax = Number.POSITIVE_INFINITY;
  for (let a = 0; a < 3; a++) {
    const oa = o[a] ?? 0;
    const da = d[a] ?? 0;
    const l = lo[a] ?? 0;
    const u = hi[a] ?? 0;
    if (Math.abs(da) < 1e-9) {
      if (oa < l || oa > u) return null;
      continue;
    }
    let t1 = (l - oa) / da;
    let t2 = (u - oa) / da;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

/**
 * 지금 F 를 누르면 열릴 대상 하나 (MVP_SPEC 13.2.1).
 * 사거리 안 광선 위에서 블록보다 가까운 주민이 있으면 주민, 아니면 조준한 블록이 종·상자일 때 그 블록. 없으면 null.
 */
export function findInteractTarget(
  world: CollisionWorld,
  player: Player,
  npcs: Iterable<{ readonly id: string; readonly body: AabbBody }>,
): InteractTarget | null {
  const hit = findAimTarget(world, player);
  const ray = aimRay(world, player);
  const limit = Math.min(hit?.distance ?? Number.POSITIVE_INFINITY, balance.player.reachDistance);
  let best: { id: string; t: number } | null = null;
  for (const n of npcs) {
    const t = rayHitsBody(ray.origin, ray.direction, n.body);
    if (t !== null && t <= limit && (!best || t < best.t)) best = { id: n.id, t };
  }
  if (best) return { kind: 'npc', npcId: best.id };
  if (!hit) return null;
  const id = world.getBlock(hit.pos.x, hit.pos.y, hit.pos.z);
  if (id === BlockId.bell) return { kind: 'bell', pos: hit.pos };
  if (id === BlockId.chest) return { kind: 'chest', pos: hit.pos };
  return null;
}
