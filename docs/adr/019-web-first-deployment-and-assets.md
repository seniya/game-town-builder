# ADR 019. Web-first, not Browser-only — 공통 게임 기반과 에셋 입출력 경계를 유지한다

Status: Accepted — 장기 배포 원칙, Desktop wrapper 미선정
Date: 2026-09-22
Basis: 사용자 논의 반영 — 웹 기술 유지, 대형 에셋과 Browser/Desktop 배포 분리
Related: ADR 006 / 011 / 014 / 017 / 018
Amends: ADR 011의 WebGPU 검토 조건과 플레이스홀더 적용 범위

## 배경

현재 MVP의 플랫폼은 Desktop Web Browser이며 스택은 TypeScript·Three.js·WebGL2·
Vite·Web Worker다. 장기에는 큰 마을과 수 GB 이상의 그림·모델·음악 에셋이 생길 수 있다.
총 에셋 크기가 커진다는 이유만으로 웹 기술을 버리거나 모든 데이터를 한 번에
다운로드·상주시킬 필요는 없다는 방향을 프로젝트 원칙으로 채택한다.
이는 배포 구현이나 특정 하드웨어 성능을 검증했다는 의미가 아니다.

## 결정

**Web-first, not Browser-only.** 공통 Game Core와 렌더 코드를 발전시키되
최종 배포 형태를 브라우저 하나로 제한하지 않는다. 정본은
[ARCHITECTURE 2.4](../project/ARCHITECTURE.md#24-web-first-not-browser-only)와 9.5다.

- 현재 스택을 유지한다. 지금 Unity/Godot로 전환하지 않는다.
- Browser build는 즉시 실행·데모·초기 플레이와 필요한 에셋 팩 다운로드를 목표로 한다.
- Desktop/Steam build는 설치·대형 에셋·로컬 파일 접근을 위한 장기 후보로 둔다.
  Electron 등 구체 wrapper를 선정하거나 Steam 배포 완료를 전제하지 않는다.
- 장기 AssetManager는 요청·수명·상주 예산을, AssetStore는 저장 위치와 바이트 획득을
  담당한다. BrowserAssetStore/ DesktopAssetStore를 플랫폼 어댑터로 주입하고 게임
  로직은 실제 저장 위치를 모른다. 현재 구현하지 않는 어댑터를 미리 만들지 않는다.
- Core/Village/Region/Character/Audio 팩을 필요 시 로드하고 해제한다. 다운로드 캐시와
  RAM/GPU 상주 예산을 구별한다. 긴 BGM streaming, KTX2/Basis, glTF/GLB는 도입 시
  검증할 후보이며 현재 의존성이나 에셋 포맷을 강제하지 않는다.
- MVP는 계속 WebGL2다. WebGPU는 실제 GPU 병목을 확인하고 현재 렌더 최적화와
  전환 비용을 비교한 뒤에만 검토한다. 월드 크기·드로우콜만으로 전환하지 않는다.
  WASM·추가 Worker·SharedArrayBuffer도 실제 계산/전송/동기화 병목에 근거해야 한다.
  GPU 병목이 이 모든 기술을 자동으로 정당화하지 않는다. 도입에는 별도 ADR이 필요하다.
- 초기 플레이스홀더는 허용하되 기본 팔레트·조명·주민 실루엣·생활 동작은 각 재미
  검증 지점에서 개선한다. 대형 에셋 파이프라인이 없어도 감성 축을 검증해야 한다.

## 검토한 대안

- 대형 에셋을 이유로 엔진을 지금 교체: 현재 핵심 경험 검증의 근거가 아니므로 기각.
- 브라우저만 영구 지원: 장기 설치형 배포와 로컬 에셋 활용 가능성을 제한하므로 기각.
- Desktop wrapper와 전 에셋 파이프라인을 즉시 구현: 미검증 비용이므로 보류.
- 플랫폼 경계와 필요한 만큼 로드하는 원칙만 확정: 채택. 구체 배포·캐시·포맷은 실제
  에셋 규모, 지원 환경, profiling을 바탕으로 후속 결정한다.

## 예상되는 결과

MVP 플랫폼·WebGL2·현재 저장 규칙을 유지하면서 공통 게임 코드를 다른 배포에 사용할
여지를 남긴다. 향후 팩 버전·캐시 무효화·메모리 해제·다운로드 실패·저장 마이그레이션을
각 소유 경계에서 검증해야 한다. 지금의 작은 에셋 규모가 영구 전제가 되지 않는다.
에셋 공급 확장과 게임의 아름다움은 별도 문제이며, 기능 완성 뒤로 감성 품질을 미루지 않는다.
