export type Suggestion = {
  original: string
  canonical: string
  isCustomToken: boolean
}

const TEXT_SIZE_MAP: Record<number, string> = {
  8: '3xs',
  9: '3xs',
  10: '3xs',
  11: '2xs',
  12: 'xs',
  13: 'xxs',
  14: 'sm',
  16: 'base',
  18: 'lg',
  20: 'xl',
  24: '2xl',
  30: '3xl',
  36: '4xl',
  48: '5xl',
  60: '6xl',
  72: '7xl',
}

const BUILT_IN_TEXT: Record<number, string> = {
  12: 'xs',
  14: 'sm',
  16: 'base',
  18: 'lg',
  20: 'xl',
  24: '2xl',
  30: '3xl',
  36: '4xl',
  48: '5xl',
  60: '6xl',
  72: '7xl',
}

const ROUNDED_MAP: Record<number, string> = {
  2: 'sm',
  4: 'sm',
  6: 'md',
  8: 'lg',
  12: 'xl',
  16: '2xl',
  24: '3xl',
}

export type Config = {
  customTextTokens?: Record<number, string>
  customSpacingTokens?: Record<number, string>
  ignorePatterns?: RegExp[]
}

export function suggestCanonical(cls: string, config: Config = {}): Suggestion | null {
  const textTokens = { ...TEXT_SIZE_MAP, ...config.customTextTokens }
  const spacingTokens = config.customSpacingTokens ?? {}

  const textMatch = cls.match(/^(text)-\[(\d+)px\]$/)
  if (textMatch) {
    const px = parseInt(textMatch[2], 10)
    const token = textTokens[px]
    if (!token) return null
    const isCustomToken = !BUILT_IN_TEXT[px]
    return { original: cls, canonical: `text-${token}`, isCustomToken }
  }

  const spacingPrefixes = [
    'h', 'w', 'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr',
    'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr',
    'gap', 'gap-x', 'gap-y',
    'top', 'left', 'right', 'bottom', 'inset',
    'size', 'min-h', 'max-h', 'min-w', 'max-w',
    'translate-x', 'translate-y',
    'space-x', 'space-y',
  ]

  const spacingMatch = cls.match(new RegExp(`^(${spacingPrefixes.join('|')})-\\[(\\d+)px\\]$`))
  if (spacingMatch) {
    const prefix = spacingMatch[1]
    const px = parseInt(spacingMatch[2], 10)

    if (spacingTokens[px]) {
      return { original: cls, canonical: `${prefix}-${spacingTokens[px]}`, isCustomToken: true }
    }

    if (px % 4 === 0) {
      const unit = px / 4
      return { original: cls, canonical: `${prefix}-${unit}`, isCustomToken: false }
    }
    return null
  }

  const roundedMatch = cls.match(/^(rounded|rounded-[a-z]+)-\[(\d+)px\]$/)
  if (roundedMatch) {
    const prefix = roundedMatch[1]
    const px = parseInt(roundedMatch[2], 10)
    const token = ROUNDED_MAP[px]
    if (!token) return null
    return { original: cls, canonical: `${prefix.replace(/-$/, '')}-${token}`, isCustomToken: false }
  }

  return null
}
