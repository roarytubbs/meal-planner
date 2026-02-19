import { defineConfig, globalIgnores } from 'eslint/config'
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  globalIgnores([
    '.next/**',
    '.vercel/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
])
