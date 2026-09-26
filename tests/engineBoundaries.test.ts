import { describe, expect, it } from 'vitest';

// src 의 모든 TypeScript 원문. 구조 규칙(AGENTS 5)을 코드 전체에 대해 검사한다.
const sources = import.meta.glob<string>('../src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('구조 규칙 (AGENTS 5, ARCHITECTURE 9.4)', () => {
  it('src 원문을 읽었다', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(10);
  });

  it('THREE.Material 생성(new ...Material)은 src/render/materials.ts 에만 있다', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.endsWith('/render/materials.ts'))
      .filter(([, src]) => /new\s+(THREE\.)?\w*Material\s*\(/.test(src))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
    // v1 은 src/render/materials.ts, v2(도토리 마을)는 src/dotori/render/materials.ts 가 재질을 만든다.
    const materials = Object.entries(sources).find(
      ([p]) => p.endsWith('/render/materials.ts') && !p.includes('/dotori/'),
    );
    expect(materials?.[1]).toMatch(/new THREE\.ShaderMaterial\(/);
  });

  it('game / ui / workers 는 three 를 import 하지 않는다 (lint 규칙의 이중 확인)', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => /\/src\/(game|ui|workers)\//.test(path))
      .filter(([, src]) => /from\s+['"]three(\/[^'"]*)?['"]|import\(\s*['"]three/.test(src))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('도토리 마을 sim·data·ui 는 three 를 import 하지 않는다 (docs/dotori/ARCHITECTURE 1)', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => /\/src\/dotori\/(sim|data|ui)\//.test(path))
      .filter(([, src]) => /from\s+['"]three(\/[^'"]*)?['"]|import\(\s*['"]three/.test(src))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('blockToWorld 라는 이름의 함수가 없다', () => {
    const offenders = Object.entries(sources)
      .filter(([, src]) => /\bblockToWorld\b(?!Min|Center)/.test(src))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
