import { defineConfig } from 'vitest/config';

// Vite(SPA)와 Vitest 설정. 테스트는 three·DOM 없이 node 환경에서 실행한다.
export default defineConfig({
  // 상대 경로로 빌드해 아티팩트·정적 호스팅 어디서든 열리게 한다(도토리 마을 게시, ADR 049).
  base: './',
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: { main: 'index.html', dotori: 'dotori.html' },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
