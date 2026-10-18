import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['.wrangler/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest', sourceType: 'module',
      globals: { ...globals.serviceworker, ...globals.node, WebSocketPair: 'readonly' }, // Workers runtime global
    },
  },
];
