import type { Config } from 'tailwind-canonical'

export default {
  // Set false for a customized theme: only the explicit px mappings below apply.
  useDefaultTheme: true,
  customTextTokens: {
    10: '3xs',
    11: '2xs',
    13: 'xxs',
  },
  customSpacingTokens: {},
  ignorePatterns: [],
} satisfies Config
