import { defineConfig } from 'vitest/config';

// Vite(SPA)와 Vitest 설정. 테스트는 three·DOM 없이 node 환경에서 실행한다.
export default defineConfig({
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
