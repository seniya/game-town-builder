# 웹 3D 복셀 스택 조사

조사일: 2026-09-22
조사 목적: 3D 복셀 전환에 쓸 렌더러와 복셀 표현 방식 결정
관련 결정: ADR 011 / 014

---

# 0. 이 문서의 위치

**이 문서는 정본이 아니다. 근거다.**

ADR 011 은 Three.js 를, ADR 014 는 청크 16³ 와 그리디 메싱을 선택했다.
그 선택이 기댄 수치와 출처가 여기에 있다.

## 0.1 신뢰도에 대한 정직한 고지

```text
조사 방법        웹 검색 결과 요약
자체 벤치마크     하지 않았다
프로토타입       만들지 않았다
```

**아래 수치는 전부 남의 측정이다.** 우리 월드(128 × 64 × 128)에서
측정한 값이 아니다.

`TASK-053` 에서 우리 수치를 직접 측정하고, 이 문서와 다르면
이 문서를 갱신한다.

---

# 1. 렌더러 선택

## 1.1 생태계 규모

```text
Three.js     주간 다운로드 500 만
Babylon.js   Three.js 의 약 1/300
PlayCanvas   Three.js 의 약 1/300
```

출처: [Cinevva — 2026 웹 게임 엔진 비교][c1]

## 1.2 번들 크기

```text
Three.js     168 KB
Babylon.js   1.4 MB
```

출처: [Utsubo — Three.js vs Babylon.js vs PlayCanvas (2026)][u1]

## 1.3 Babylon.js 가 더 가진 것

Babylon 9.0 (2026-03):

```text
WebGPU / WebGL 양쪽의 클러스터드 라이팅
WebGPU 컴퓨트 셰이더 기반 볼류메트릭 라이팅
3D 가우시안 스플랫 그림자
Havok 물리 엔진 내장
무료 웹 에디터
애셋 파이프라인
컴포넌트 모델
```

출처: [Cinevva][c1], [Utsubo][u1]

## 1.4 우리가 그것을 쓰지 않는 이유

| Babylon 의 강점 | 우리 프로젝트 |
|---|---|
| Havok 물리 | 복셀 충돌은 그리드 AABB 로 직접 계산한다. 물리 엔진을 쓰지 않는다 |
| 웹 에디터 | 월드를 코드와 데이터로 생성한다. 씬 파일을 만들지 않는다 |
| 컴포넌트 모델 | 게임 규칙을 엔진에서 분리한다 (ADR 006). 엔진 컴포넌트를 쓰지 않는다 |
| 애셋 파이프라인 | 애셋이 아틀라스 1 장 + 소수의 모델뿐이다 |
| 고급 라이팅 | 복셀 광원 전파를 구현하지 않는다 (ADR 014) |

우리가 실제로 필요한 것은 `BufferGeometry`, 텍스처 1 장, 방향광, 카메라뿐이다.

**Three.js 의 레퍼런스 양이 직접적인 비용 차이를 만든다.**
이 프로젝트는 문서 기반으로 AI 코딩 에이전트가 작업한다.

→ ADR 011

## 1.5 WebGPU

```text
Safari 26 (2025-09) 이후 브라우저 지원이 사실상 보편적이다
"모든 신규 프로젝트는 WebGL 폴백과 함께 WebGPU 를 목표로 해야 한다"
컴퓨트 중심 애플리케이션에서 이득이 크다
```

출처: [Cinevva][c1]

**그럼에도 우리는 WebGL2 로 시작한다.**

```text
우리 월드        128 × 64 × 128 = 청크 256 개
드로우콜         수백 단위
컴퓨트 셰이더     필요한 작업이 없다
그리디 메싱       CPU (Worker) 작업이지 GPU 작업이 아니다
```

`WebGPURenderer` 는 TSL / NodeMaterial 이라는 다른 재질 시스템을 쓴다.
지금 도입하면 얻는 것 없이 불확실성만 늘어난다.

전환 조건은 ADR 011 에 명시했다.
전환 비용을 낮추기 위해 재질 생성을 `src/render/materials.ts` 한 곳에 모았다.

---

# 2. 복셀 표현

## 2.1 왜 청킹인가 — 면 수 비교

```text
16 × 16 격자 기준

나이브 (모든 복셀의 6 면)        24,576 면
청킹 + 면 컬링                   1,536 면      6.25%
```

출처: [Clay Garrett — Voxel Performance: Instancing vs Chunking][cg1]

청킹은 복셀을 묶어 하나의 메시로 합치고,
사용자에게 절대 보이지 않을 면을 제거하는 것이다.

출처: [Clay Garrett][cg1]

**블록 하나를 InstancedMesh 인스턴스 하나로 그리는 방식을 버린 근거가 이 수치다.**

→ ADR 014

## 2.2 청크 크기

```text
16 × 16 × 16   컬링 성능과 편집 속도의 균형점 (sweet spot)
32 × 32 × 32   청크 갱신이 느려도 괜찮다면 조금 더 빠르다
```

출처: [Voxel Tools 문서 — Performance][vt1]

우리는 **건축 게임** 이다. 편집 빈도가 매우 높다.
블록 하나를 놓을 때 32³ = 32,768 복셀을 다시 메싱하는 것은 받아들일 수 없다.

16³ 을 선택했다. → ADR 014

## 2.3 그리디 메싱

알고리즘:

> 좌측 상단에서 시작해 가능한 한 오른쪽으로 가고,
> 그 다음 가능한 한 아래로 내려가며, 새 메시가 만들어질 때까지 반복한다.

출처: [James Hylands — Greedy meshing in javascript][jh1]

최적화된 구현은 비트 연산으로 **한 번에 64 면을 컬링** 하고,
공기와 맞닿아 보여야 하는 면을 나타내는 면 마스크를 만든다.

출처: [binary-greedy-meshing (cgerikj)][bg1]

## 2.4 드로우콜의 한계

청크마다 드라이버 상태를 바꾸고 드로우콜을 하나씩 발행하므로,
**분리된 청크가 아주 많아지면 드라이버 오버헤드가 커진다.**

출처: [Nick McDonald — High Performance Voxel Engine: Vertex Pooling][nm1]

우리 월드는 청크 256 개다. 이 한계에 닿지 않는다.
닿으면 ADR 011 의 WebGPU 전환 조건("드로우콜 2000 초과")이 발동한다.

## 2.5 메싱을 메인 스레드에서 하지 않는다

메싱과 생성 작업은 비동기 태스크 풀로 프레임에 분산해
프레임 스터터를 방지하는 것이 권장된다.

출처: [Voxel Plugin 문서 — Performance and Profiling][vp1]

우리는 Web Worker 풀 + 프레임당 GPU 업로드 상한(`chunkUploadsPerFrame: 2`)으로 구현한다.

→ ADR 014 / ARCHITECTURE 9.1

## 2.6 InstancedMesh 의 올바른 용도

동일한 오브젝트를 많이 그릴 때 `THREE.InstancedMesh` 가 성능을 크게 개선한다.

출처: [Three.js InstancedMesh 문서][t1], [Seele AI — Three.js Games 2026 가이드][se1]

**우리는 이것을 블록에 쓰지 않는다.** 2.1 의 이유다.
주민 / 몬스터 같은 반복 엔티티에는 나중에 검토할 수 있다.

---

# 3. 조사 사실 → 우리 결정 매핑

| 사실 | 출처 | 우리 결정 |
|---|---|---|
| Three.js 주간 500 만 다운로드 (300 배) | [c1] | Three.js 채택 — ADR 011 |
| Three.js 168 KB vs Babylon 1.4 MB | [u1] | Three.js 채택 — ADR 011 |
| Babylon 은 Havok / 에디터 / 컴포넌트 모델을 준다 | [c1][u1] | 우리가 쓰지 않는 기능이라 판단 — ADR 011 |
| WebGPU 는 Safari 26 이후 보편적 | [c1] | 그럼에도 WebGL2 로 시작. 전환 조건 명시 — ADR 011 |
| 나이브 24,576 면 → 청킹 1,536 면 | [cg1] | 인스턴싱 대신 청크 메싱 — ADR 014 |
| 16³ 이 컬링과 편집의 균형점 | [vt1] | 청크 16³ — ADR 014 |
| 32³ 은 렌더는 빠르나 편집이 느리다 | [vt1] | 32³ 기각 (건축 게임) — ADR 014 |
| 비트 연산으로 64 면 동시 컬링 가능 | [bg1] | 그리디 메싱 구현 참조 — TASK-005 |
| 청크가 많으면 드라이버 오버헤드 | [nm1] | 드로우콜 2000 을 WebGPU 전환 조건으로 — ADR 011 |
| 비동기 태스크 풀로 스터터 방지 | [vp1] | Worker 풀 + 업로드 상한 — ADR 014 |

---

# 4. 확인하지 못한 것

```text
JavaScript / TypeScript 에서의 그리디 메싱 실제 속도
    →  출처들은 대부분 C++ / Rust 기준이다
    →  TASK-005 에서 직접 측정한다

18³ padded 뷰를 Worker 에 넘기는 비용
    →  transferable 로 넘기므로 복사는 없지만, 자르는 비용은 우리가 낸다
    →  TASK-006 에서 측정한다

우리 월드 크기에서의 실제 드로우콜 수
    →  청크 256 개 × 최대 2 메시 = 최대 512. 계산값이지 측정값이 아니다
    →  TASK-007 에서 확인한다

정점 AO 를 그리디 메싱과 함께 계산할 때의 병합 제약
    →  AO 값이 다르면 면을 병합할 수 없다. 병합률이 얼마나 떨어지는지 모른다
    →  TASK-005 에서 확인한다
```

**네 번째 항목이 가장 위험하다.**

그리디 메싱의 병합 효과와 정점 AO 는 서로 충돌한다.
AO 를 켜면 2.1 의 6.25% 라는 수치를 얻지 못할 수 있다.

`TASK-005` 에서 AO 유무의 정점 수를 둘 다 측정하고,
차이가 크면 ADR 014 의 조명 결정을 다시 본다.

---

# 5. 출처 목록

## 엔진 비교

[c1]: https://app.cinevva.com/blog/2026-06-09-web-game-engines-2026-comparison
[u1]: https://www.utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison
[sl1]: https://www.slant.co/versus/11077/11348/~babylon-js_vs_three-js

- [c1] Web game engines in 2026: PlayCanvas vs Three.js vs Babylon.js vs Unity WebGL — Cinevva
- [u1] Three.js Alternatives Compared: Babylon.js vs PlayCanvas (2026) — Utsubo
- [sl1] Babylon.js vs Three.js detailed comparison as of 2026 — Slant

## 복셀 성능

[cg1]: https://medium.com/@claygarrett/voxel-performance-instancing-vs-chunking-9643d776c11d
[vt1]: https://voxel-tools.readthedocs.io/en/latest/performance/
[nm1]: https://nickmcd.me/2021/04/04/high-performance-voxel-engine/
[vp1]: https://docs.voxelplugin.com/1.2/technical-notes/performance-and-profiling

- [cg1] Voxel Performance: Instancing vs Chunking — Clay Garrett   ★ 면 수 비교의 주 출처
- [vt1] Performance — Voxel Tools documentation   ★ 청크 크기의 주 출처
- [nm1] High Performance Voxel Engine: Vertex Pooling — Nick McDonald
- [vp1] Performance and Profiling — Voxel Plugin

## 그리디 메싱

[jh1]: https://www.jameshylands.co.uk/2022/10/greedy-meshing-in-javascript.html
[bg1]: https://github.com/cgerikj/binary-greedy-meshing

- [jh1] Greedy meshing in javascript — James Hylands
- [bg1] binary-greedy-meshing — cgerikj (GitHub)

## Three.js

[t1]: https://threejs.org/docs/#api/en/objects/InstancedMesh
[t2]: https://threejsfundamentals.org/threejs/lessons/threejs-voxel-geometry.html
[se1]: https://www.seeles.ai/resources/blogs/three-js-games-ultimate-guide
[co1]: https://tympanus.net/codrops/2023/03/28/turning-3d-models-to-voxel-art-with-three-js/

- [t1] InstancedMesh — Three.js 공식 문서
- [t2] Three.js Voxel (Minecraft Like) Geometry — threejsfundamentals
- [se1] Three.js Games: Complete Guide for 2026 — Seele AI
- [co1] Turning 3D Models to Voxel Art with Three.js — Codrops

---

# 6. 이 문서를 다시 봐야 할 때

```text
TASK-005 에서 AO 때문에 병합률이 크게 떨어진다
    →  4 장의 네 번째 항목. ADR 014 의 조명 결정을 재검토한다

드로우콜이 2000 을 넘거나 GPU 프레임 타임이 예산의 절반을 넘는다
    →  1.5 와 ADR 011 의 WebGPU 전환 조건을 재검토한다

월드를 256 × 128 × 256 이상으로 키우려 한다
    →  2.2 와 2.4 를 다시 읽는다. 청크 크기와 렌더 백엔드를 함께 재검토한다

TASK-053 에서 실제 수치를 측정한다
    →  이 문서의 모든 수치는 남의 측정이다. 우리 수치로 갱신한다
```
