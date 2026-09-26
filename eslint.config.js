import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// 엔진 격리 규칙 (MVP_SPEC 5.2 / ARCHITECTURE 2.2): game / ui / workers 는 three 를 모른다.
const THREE_RESTRICTION = {
  patterns: [
    {
      group: ['three', 'three/*'],
      message:
        'src/game, src/ui, src/workers 에서는 three 를 import 하지 않는다 (ARCHITECTURE 2.2).',
    },
  ],
};

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'graft/**', 'coverage/**', 'prototypes/**'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        console: 'readonly',
        self: 'readonly',
        Worker: 'readonly',
        navigator: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
  {
    files: ['src/game/**', 'src/ui/**', 'src/workers/**'],
    rules: {
      'no-restricted-imports': ['error', THREE_RESTRICTION],
    },
  },
);
