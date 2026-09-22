# ADR 004. WorldState 를 저장된 값이 아니라 파생 지표로 정의한다

Status: Accepted
Date: 2026-09-22


> v1.1 적용 범위 (ADR 016): 파생 지표 원칙만 유지한다. 아래 2D 건물·입구 계산 예시는 역사적 설명이며 현재 수치는 MVP_SPEC 21장, 인터페이스는 ARCHITECTURE 22장이 정본이다.

## 배경

초기 문서에서 `WorldState`는 값을 저장하고 건물이 그 값을 직접 올리는 구조였다.

```ts
interface WorldStateData {
  foodLevel: number;
  safetyLevel: number;
  housingLevel: number;
  happinessLevel: number;
  population: number;
}
```

```text
밭 건설    →  foodProduction +1
주방 건설  →  foodEfficiency +1, happiness +1
집 건설    →  housing +2, happiness +1
방벽 건설  →  safety +2
```

문서 검토에서 세 가지 모순이 드러났다.

**1. 건물 효과의 키가 필드명과 일치하지 않았다**

건물 효과는 `foodProduction`, `foodEfficiency`, `happiness`, `housing`, `safety`를
쓰는데 인터페이스 필드는 `foodLevel`, `safetyLevel`, `housingLevel`,
`happinessLevel`이었다.

`worldStateEffects: Partial<WorldStateData>`는 `WorldStateData`의 키만 허용하므로
`foodProduction`과 `foodEfficiency`는 **타입 수준에서 표현 자체가 불가능**했다.
두 값은 인터페이스에 존재하지 않는 개념(생산량, 변환 효율)이었다.

또한 `WorldState` 클래스에 `increaseHappiness()`가 정의되어 있지 않았다.

**2. 지표가 절대 내려갈 수 없었다**

값을 올리는 규칙만 있고 내리는 규칙이 없었다.

건물은 철거되지 않으므로 모든 지표는 단조 증가한다.

그런데 기획에는 `foodLevel < 20 → 식량 부족 이벤트` 조건이 있었다.
**구조적으로 절대 발생할 수 없는 조건**이었다.

**3. `foodLevel` 과 실제 음식의 관계가 정의되지 않았다**

이벤트 조건은 `foodLevel`(0~100)을 보는데, 실제 음식은
`VillageStorage.food`(정수 카운터)로 관리된다.

두 값 사이의 변환 규칙이 어디에도 없어 조건을 평가할 수 없었다.

**4. `population` 이 두 곳에 존재했다**

`WorldState.population`과 `EntityRegistry.npcs.size`가 별도로 존재하고
동기화 주체가 정의되지 않았다.

`ARCHITECTURE.md`가 "반드시 유지해야 한다"고 명시한
`WorldState ≠ EntityRegistry` 경계를 스스로 위반하는 구조였다.

## 결정

`WorldState` 를 **아무것도 저장하지 않는 순수 계산기**로 정의한다.

모든 지표는 마을의 실제 상태로부터 매번 계산되는 파생값이다.

```text
foodLevel      storage.food / (population * mealsPerDay * foodPerMeal * targetDays)
safetyLevel    방벽으로 막힌 입구 타일 수 / gateTiles
housingLevel   전체 침대 수 / population
happinessLevel foodLevel*0.4 + housingLevel*0.3 + safetyLevel*0.3
population     registry.npcs.size
```

변경 API를 제공하지 않는다.

```text
increaseFood()    없다
increaseSafety()  없다
setPopulation()   없다
```

지표를 바꾸려면 **원인이 되는 실제 상태**를 바꾼다.

```text
foodLevel 을 올린다    →  음식을 만든다 (VillageStorage.food++)
safetyLevel 을 올린다  →  입구에 방벽을 세운다
housingLevel 을 올린다 →  집을 짓는다
```

`BuildingConfig`에서 `worldStateEffects`를 제거하고, 건물이 제공하는 기능만
선언한다.

```ts
interface BuildingConfig {
  residentCapacity: number;   // 침대 수. 집만 > 0
  blocksMonsters: boolean;    // 입구 차단. 방벽만 true
}
```

`WorldState`는 `SaveData`에 포함하지 않는다.

계산 본체는 `computeWorldState()` 순수 함수로 분리한다.

## 검토한 대안

**A. 필드명을 맞추고 감소 규칙을 추가한다**

`WorldStateData`에 `foodProduction`, `foodEfficiency`를 추가하고,
시간 경과·인구당 소비·몬스터 침입에 따른 감소 규칙을 정의한다.

문제:

- 감소 규칙이 새로운 밸런스 축을 만든다. 하루에 얼마씩 줄어드는가,
  인구 1명당 얼마인가, 몬스터 1마리당 얼마인가를 모두 정해야 한다.
- 지표와 실제 창고 수량이 어긋날 수 있다.
  `foodLevel 80`인데 `storage.food 0`인 상태가 발생 가능하다.
  이것은 "숫자만 바뀌는 시스템을 만들지 않는다"는 기획 원칙에 반한다.
- `population` 이중 관리 문제가 해결되지 않는다.

**B. 일부는 저장하고 일부는 파생으로 한다**

`safetyLevel`과 `happinessLevel`만 누적값으로 두고 나머지는 파생.

문제:

- 어느 지표가 어느 종류인지 기억해야 한다.
- `SaveData`에 지표가 일부만 들어가 저장 스펙이 복잡해진다.
- 두 종류가 섞이면 새 지표를 추가할 때마다 판단이 필요하다.

**C. 전부 파생값으로 만든다**

채택.

**D. WorldState 를 아예 없앤다**

이벤트 조건이 `storage.food`, `bedCount` 같은 원시 값을 직접 보게 한다.

문제:

- `happinessLevel`처럼 여러 값을 종합한 지표를 표현할 수 없다.
- Debug Panel과 UI에 마을 상태를 한눈에 보여줄 수단이 없어진다.
- 0~100 정규화가 사라져 이벤트 조건이 밸런스 수치에 직접 묶인다.

## 예상되는 결과

긍정적:

- **지표와 실제 마을 모습이 어긋날 수 없다.** 창고가 비면 `foodLevel`은 반드시 0이다.
- **지표가 내려간다.** 주민이 밥을 먹으면 `food`가 줄고 `foodLevel`이 내려간다.
  주민이 늘면 같은 침대 수로도 `housingLevel`이 내려간다.
  `foodLevel < 20` 같은 조건이 자연히 발생한다.
- **진실의 원천이 하나다.** `population`은 `registry.npcs.size`뿐이다.
- **`SaveData` 가 단순해진다.** 지표를 저장하지 않으므로
  저장된 지표와 실제 상태가 불일치할 여지가 없다.
- **테스트가 쉽다.** `computeWorldState()`는 입력과 출력만 있는 순수 함수다.
- **엔딩의 감정이 수치로 뒷받침된다.** 새 주민이 오면 `housingLevel` 100 → 75,
  `foodLevel` 67 → 50이 되어 다음 건설 동기가 자동으로 생긴다.

부정적 / 위험:

- 매 프레임 계산이 발생한다. NPC 3~4명 규모에서는 무시할 수 있고,
  `GameWorld.update` 끝에서 1회만 호출하는 규칙을 둔다.
- `happinessLevel`이 독립적인 의미를 갖지 않고 세 지표의 가중 평균일 뿐이다.
  MVP에서는 마을 분위기 표시 용도로 충분하다.
- `population == 0`에서 0으로 나누는 경우를 반드시 가드해야 한다.
- 건물이 "지으면 숫자가 오른다"는 직접적 보상을 주지 않는다.
  보상은 주민의 행동 변화로 전달되어야 하며, 이것이 기획 의도와 일치한다.
