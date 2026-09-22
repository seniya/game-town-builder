# ADR 009. 마을 입구 타일에는 방벽만 지을 수 있다

Status: Accepted
Date: 2026-09-22

## 배경

ADR 005에서 마을 입구를 정확히 한 곳, 폭 5 타일로 고정하고
`safetyLevel`을 입구 커버리지로 정의했다.

```text
safetyLevel = round(100 * 방벽으로 막힌 입구 타일 수 / 5)
```

이 정의는 입구 타일이 `BuildableArea` 안에 있을 것을 요구한다.
방벽을 그 위에 세워야 하기 때문이다.

그런데 `BuildValidator`의 판정 조건에는 건물 종류에 대한 제약이 없었다.

```text
out_of_bounds / map_collision / overlaps_building
outside_buildable_area / insufficient_resources
```

즉 입구 타일 위에 집과 밭과 주방을 지을 수 있었다.

두 가지 방식으로 게임이 진행 불능이 된다.

**1. 엔딩 도달 불가**

```text
집(4×4)으로 입구 5칸 중 4칸을 덮는다
    ↓
그 타일에 방벽을 세울 수 없다  (overlaps_building)
    ↓
safetyLevel 이 영원히 100 에 도달하지 못한다
    ↓
EVENT_NEW_RESIDENT 의 조건이 영원히 거짓이다
```

**2. 완전한 통행 차단**

```text
밭(3×3) + 주방(2×2) 으로 입구 5칸을 전부 덮는다
    ↓
건물 타일은 'ground' 와 'monster' 두 레이어 모두 Blocked 다
    ↓
플레이어 · NPC · 새 주민 전원이 통과할 수 없다
```

두 상태 모두 **되돌릴 수 없다.** MVP에는 건물 철거가 없다.

플레이어는 20~30분 세션의 중간에서 영구히 막히고, 그 사실을 알 방법도 없다.

## 결정

`BuildValidator`에 여섯 번째 Invalid 사유를 추가한다.

```text
blocks_village_gate    입구 타일을 방벽이 아닌 건물로 점유하는가
```

```ts
const occupiesGate = occupiedTiles.some((t) =>
  gateTiles.some((g) => g.x === t.x && g.y === t.y)
);

if (occupiesGate && config.blocksMonsters !== true) {
  return { valid: false, reason: 'blocks_village_gate' };
}
```

`blocksMonsters === true`인 건물은 방벽뿐이므로, 입구에는 방벽만 지을 수 있다.

`BuildValidationInput`에 `gateTiles`를 추가한다.

Ghost Preview에 사유를 표시한다.

```text
마을 입구에는 방벽만 세울 수 있습니다
```

## 검토한 대안

**A. 입구를 BuildableArea 에서 제외한다**

가장 단순해 보이지만 방벽도 세울 수 없게 된다.

`safetyLevel`이 영원히 0이 되어 ADR 005의 정의 자체가 무너진다.

**B. 건물 철거를 구현한다**

잘못 지었으면 부수고 다시 지으면 된다.

문제:

- 환불 규칙(전액? 절반?), 철거 중 상태, 철거 애니메이션, NavigationGrid 복원,
  밭 안의 작물 처리, 집에 배정된 NPC 처리가 모두 따라온다.
- `MVP_SPEC.md` 92장이 철거를 명시적으로 제외한다.
- 실수를 되돌리는 기능은 실수를 막는 것보다 비싸다.

**C. 배치 후 경고만 표시한다**

"입구가 막혔습니다"를 알려주고 배치는 허용한다.

문제:

- 되돌릴 수단이 없으므로 경고가 무의미하다.
- 플레이어에게 회복 불가능한 실수를 알려주기만 하는 것은 UI가 아니라 통보다.

**D. 건물 종류별 허용 목록을 맵 속성으로 둔다**

Tiled에 `allowedBuildings` 같은 속성을 두고 타일마다 지정한다.

문제:

- MVP의 제약은 "입구에는 방벽만" 하나뿐인데 범용 규칙 시스템을 만들게 된다.
- 맵 제작자가 실수하면 같은 문제가 그대로 재발한다.

**E. blocksMonsters 로 한 줄 판정한다**

채택. 새 개념을 도입하지 않고 기존 필드로 판정한다.

"몬스터를 막는 건물만 입구에 놓을 수 있다"는 규칙이
"입구는 막되 사람은 다닌다"는 ADR 005의 의도와 그대로 일치한다.

## 예상되는 결과

긍정적:

- 회복 불가능한 진행 불능 상태가 구조적으로 발생하지 않는다.
- 새 필드나 새 개념을 도입하지 않는다. 조건 한 줄이다.
- Acceptance Test 6·7이 어떤 플레이 순서에서도 성립한다.
- 입구가 "방벽을 세우는 곳"이라는 것이 Ghost Preview로 학습된다.

부정적 / 위험:

- `BuildValidator`가 `gateTiles`를 알아야 하므로 입력이 하나 늘어난다.
  순수 함수는 유지되며, 테스트에서는 배열 리터럴로 넘긴다.
- 플레이어가 입구 근처에 집을 짓고 싶어도 못 짓는다.
  입구는 마을 경계이므로 집을 지을 만한 자리가 아니며, 실제 제약은 작다.
- 맵의 `BuildableArea`가 입구를 포함해야 한다는 제약이 남는다.
  `TASK-004`의 AC 로 검사한다.
