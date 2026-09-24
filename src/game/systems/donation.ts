// 기부: 플레이어 인벤토리의 seed / crop / food 를 마을 저장소로 옮긴다 (MVP_SPEC 13.2 / 13.2.1, TASK-036).
// 플레이어 → 마을 저장소의 유일한 경로다. 부족하면 아무것도 바꾸지 않는다. 되돌리기는 없다.
import type { MaterialId } from '../types';
import type { VillageStorage } from '../VillageStorage';
import type { InventorySystem } from './InventorySystem';

/** 기부 양. 'all' 은 인벤토리에 있는 만큼 전부다. */
export type DonationAmount = number | 'all';

/** 기부하고 실제로 옮긴 개수를 반환한다. 0 이면 아무것도 바뀌지 않았다. */
export function donate(
  inventory: InventorySystem,
  storage: VillageStorage,
  material: MaterialId,
  amount: DonationAmount,
): number {
  const item = { kind: 'material', material } as const;
  const have = inventory.count(item);
  const n = amount === 'all' ? have : Math.min(amount, have);
  if (!Number.isInteger(n) || n <= 0) return 0;
  if (!inventory.remove([{ item, count: n }])) return 0;
  storage.add(material, n);
  return n;
}
