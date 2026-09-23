// 엔티티 목록 (ARCHITECTURE 12, 27). population 은 npcs.size 다.
// 주민 수를 고정하지 않는다. id 기반 가변 컬렉션만 쓴다 (ARCHITECTURE 2.3).

/** 레지스트리가 요구하는 최소 형태. 구체 NPC / Monster 는 TASK-028 / 045 에서 정의한다. */
export interface EntityRecord {
  readonly id: string;
}

/** id 로 조회하는 엔티티 모음 하나. 삽입 순서를 유지한다. */
export class EntityCollection<T extends EntityRecord> {
  private readonly byId = new Map<string, T>();

  /** 개수. */
  get size(): number {
    return this.byId.size;
  }

  /** 추가한다. 같은 id 가 이미 있으면 버그이므로 예외를 던진다. */
  add(entity: T): void {
    if (this.byId.has(entity.id)) throw new Error(`중복 엔티티 id: ${entity.id}`);
    this.byId.set(entity.id, entity);
  }

  /** 제거한다. 있었으면 true. */
  remove(id: string): boolean {
    return this.byId.delete(id);
  }

  /** id 로 조회한다. */
  get(id: string): T | undefined {
    return this.byId.get(id);
  }

  /** 삽입 순서대로 순회한다. */
  values(): IterableIterator<T> {
    return this.byId.values();
  }
}

/** 게임의 모든 엔티티 목록. */
export class EntityRegistry<
  TNpc extends EntityRecord = EntityRecord,
  TMonster extends EntityRecord = EntityRecord,
> {
  readonly npcs = new EntityCollection<TNpc>();
  readonly monsters = new EntityCollection<TMonster>();
}
