import { suggestCanonical, type Config } from '../core/rules.js'

type RuleContext = {
  options: [Config?]
  report: (descriptor: { node: unknown; message: string; fix?: (fixer: { replaceText: (node: unknown, text: string) => unknown }) => unknown }) => void
}

const noArbitraryCanonical = {
  meta: {
    type: 'suggestion' as const,
    fixable: 'code' as const,
    schema: [
      {
        type: 'object',
        properties: {
          customTextTokens: { type: 'object' },
          customSpacingTokens: { type: 'object' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useCanonical: "Use canonical class '{{canonical}}' instead of '{{original}}'",
    },
  },
  create(context: RuleContext) {
    const config: Config = context.options[0] ?? {}

    function checkLiteral(node: { value: unknown; raw?: string; type: string }) {
      if (typeof node.value !== 'string') return
      const classes = node.value.split(/\s+/)
      for (const cls of classes) {
        const suggestion = suggestCanonical(cls, config)
        if (!suggestion) continue
        context.report({
          node,
          message: `Use canonical class '${suggestion.canonical}' instead of '${suggestion.original}'`,
          fix(fixer) {
            const fixed = node.value as string
            const newVal = fixed.replace(cls, suggestion.canonical)
            const quote = node.raw?.startsWith('"') ? '"' : "'"
            return fixer.replaceText(node, `${quote}${newVal}${quote}`)
          },
        })
      }
    }

    return {
      Literal: checkLiteral,
      TemplateLiteral(node: { quasis: Array<{ value: { raw: string }; type: string; value: unknown; raw?: string }> }) {
        for (const quasi of node.quasis) {
          checkLiteral({ value: quasi.value.raw, type: 'Literal' })
        }
      },
    }
  },
}

export default {
  rules: {
    'no-arbitrary-canonical': noArbitraryCanonical,
  },
  configs: {
    recommended: {
      plugins: ['tailwind-canonical'],
      rules: {
        'tailwind-canonical/no-arbitrary-canonical': 'warn',
      },
    },
  },
}
