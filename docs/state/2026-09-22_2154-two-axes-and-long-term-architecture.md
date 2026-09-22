# 두 핵심 축과 장기 확장·배포 원칙 개정

Date: 2026-09-22
Status: 문서 개정 완료. 구현·플레이·성능 검증은 미착수
Basis: 사용자가 제공한 논의 17개 항목과 기존 프로젝트 문서·ADR

## 변경 내용

- GAME_DESIGN: 건축→인식→사용→관찰의 시스템 축과 공간→주민→생활→애착의 감성 축을
  동등한 성공 조건으로 명시했다. 초기 그래픽 기준, 감성 검증 질문, 주민 50~100명의
  큰 마을과 저녁 생활 장면을 추가했다.
- ARCHITECTURE: MVP 경계와 장기 구현을 구분했다. 사건 기반 Job/후보 관리,
  Room/Resource/Facility/Job 인덱스, multi-rate, Simulation LOD, 계층 경로와 Worker,
  청크 스트리밍 및 에셋/플랫폼 경계를 구체화했다.
- TASKS: 팔레트·주민 실루엣·생활 동작을 해당 구현 Task의 검증과 연결했다.
  첫 취침 통과 뒤 TASK-PERF-001, 기존 역할 시스템 연결 뒤 TASK-PERF-002를 배치했다.
  큰 고정 fixture에서 100명 이동·방/가구·경로·메싱, 이후 역할 후보/예약 부하를 측정한다.
- MVP_SPEC: 두 축의 관계, MVP 플랫폼과 장기 배포의 구분, 감성 실패 시 대응만 보완했다.
  주민 3→5명, 128×64×128 섬, 방 5종, 블록·자원·역할·해금·밸런스·성능 예산은 유지했다.
- README: 두 축, 현재 v1.2 문서 단계, 장기 규모와 Web-first 원칙, 새 ADR을 안내했다.

## 결정과 충돌 보완

- [ADR 018](../adr/018-event-driven-scalable-simulation.md): ADR 017의 확장 경계를
  Job System·다중 주기·Simulation LOD·계층 경로·인덱스와 조기 검증으로 구체화했다.
- [ADR 019](../adr/019-web-first-deployment-and-assets.md): **Web-first, not Browser-only**,
  공통 Game Core와 Browser/Desktop 배포, AssetManager/AssetStore 경계를 기록했다.
  Desktop wrapper와 새 포맷·라이브러리의 채택은 확정하지 않았다.
- ADR 011의 월드 크기/드로우콜 기준은 profiling 신호로 바꾸고 실제 GPU 병목이
  확인될 때만 WebGPU를 검토하도록 했다. 플레이스홀더를 이유로 감성 검증을 미루지 않는다.
- ARCHITECTURE의 단일 dt·직접 위치 동기화는 MVP 선택으로 한정했다. update 슬롯은
  처리 순서이며 모든 AI가 매 렌더 프레임 완전 갱신해야 한다는 계약이 아니다.
- ADR 014의 작은 월드/아틀라스 전제는 MVP로 한정하고 ADR 017에 후속 결정을 연결했다.
- 지붕·자동 점등·HaulJob·광석 생산·허기·음식 부족 예시가 새 MVP 규칙이 되지 않도록
  명시했다. 성능 fixture 수치도 게임 콘텐츠와 분리했다.

## 검증과 한계

- AGENTS → GAME_DESIGN → MVP_SPEC → ARCHITECTURE → TASKS → 관련 ADR 순서로 읽었다.
- 프로젝트 문서·README·AGENTS·ADR 총 25개 파일의 fenced block 짝과 로컬 Markdown
  링크/앵커를 검사했다. 오류 없음.
- 기존 53개 Task와 신규 PERF 2개의 ID 유일성, 전체 실행 순서 포함, 의존 선행 여부를
  검사했다. 55개 모두 통과.
- git HEAD와 비교해 MVP_SPEC의 범위(2.2), 확장 경계(3.0), 5~39장과 41~44장이
  그대로임을 확인했다. 40장은 원인별 실패 대응 설명만 바꿨다.
- `git diff --check` 통과. 기존 사용자 변경 `.gitignore`와 `.ignore`는 작업 대상에서 제외했다.
- 문서 작업이며 package.json과 게임 코드가 아직 없다. 단위 테스트·빌드·브라우저
  플레이·synthetic 성능 시험은 실행할 수 없다. 어떤 구현 Task도 완료 처리하지 않았다.
- 새 외부 조사는 하지 않았다. 웹에서 100명과 대형 에셋을 지원한다는 실측 결과가 아니라
  사용자 논의를 반영한 설계 방향이다. 새 연구 문서를 성능 근거처럼 만들지 않았다.

## 다음 할 일

TASK-001부터 구현한다. TASK-022와 TASK-033에서 시스템 축과 감성 축을 함께 평가하고,
부정적이면 기존 범위의 판정·진단·팔레트·조명·가구·주민 표현을 개선한다.
TASK-PERF-001/002는 명시된 위치에서 실행하고 병목과 미검증 항목을 기록한다.
Job/LOD/계층 경로/스트리밍·설치형 배포는 실제 도입 전에 구체 계약과 측정 기준을
확정하며, 범용 Job System이 생기면 동일 부하를 실제 Job 경로로 재검증한다.
