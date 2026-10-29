import type { Config } from 'tailwind-canonical'

export default {
  // Set false for a customized theme: only the explicit px mappings below apply.
  useDefaultTheme: true,
  // Named text tokens can set line-height; custom mappings require explicit opt-in.
  allowTextSizeLineHeightChanges: false,
  customTextTokens: {
    10: '3xs',
    11: '2xs',
    13: 'xxs',
  },
  customSpacingTokens: {},
  ignorePatterns: [],
} satisfies Config
