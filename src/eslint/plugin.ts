import { type Config, suggestCanonical } from '../core/rules.js';

type RuleContext = {
  options: [Config?];
  report: (descriptor: {
    node: unknown;
    message: string;
    fix?: (fixer: {
      replaceText: (node: unknown, text: string) => unknown;
    }) => unknown;
  }) => void;
};

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
      useCanonical:
        "Use canonical class '{{canonical}}' instead of '{{original}}'",
    },
  },
  create(context: RuleContext) {
    const config: Config = context.options[0] ?? {};

    function checkLiteral(node: {
      value: unknown;
      raw?: string;
      type: string;
    }) {
      if (typeof node.value !== 'string') return;
      const classes = node.value.split(/\s+/);
      for (const cls of classes) {
        const suggestion = suggestCanonical(cls, config);
        if (!suggestion) continue;
        context.report({
          node,
          message: `Use canonical class '${suggestion.canonical}' instead of '${suggestion.original}'`,
          fix(fixer) {
            const fixed = node.value as string;
            const newVal = fixed.replace(cls, suggestion.canonical);
            const quote = node.raw?.startsWith('"') ? '"' : "'";
            return fixer.replaceText(node, `${quote}${newVal}${quote}`);
          },
        });
      }
    }

    return {
      Literal: checkLiteral,
      TemplateLiteral(node: {
        quasis: Array<{
          value: { raw: string };
          type: string;
        }>;
      }) {
        for (const quasi of node.quasis) {
          checkLiteral({ value: quasi.value.raw, type: 'Literal' });
        }
      },
    };
  },
};

type TwMerge = (classes: string) => string;

const noConflictingClasses = {
  meta: {
    type: 'suggestion' as const,
    fixable: 'code' as const,
    schema: [],
    messages: {
      conflicting:
        "Conflicting Tailwind classes detected. Use '{{merged}}' instead.",
    },
  },
  create(context: RuleContext & { options: [] }) {
    let twMerge: TwMerge | null = null;
    let peerMissing = false;

    try {
      // eslint plugins run synchronously — require() is the only option here
      // biome-ignore lint/suspicious/noExplicitAny: dynamic require for optional peer
      const mod = (require as any)('tailwind-merge');
      twMerge = mod.twMerge as TwMerge;
    } catch {
      peerMissing = true;
    }

    function checkLiteral(node: {
      value: unknown;
      raw?: string;
      type: string;
    }) {
      if (peerMissing || !twMerge) return;
      if (typeof node.value !== 'string') return;
      const merged = twMerge(node.value);
      if (merged === node.value) return;
      context.report({
        node,
        message: `Conflicting Tailwind classes detected. Use '${merged}' instead.`,
        fix(fixer) {
          const quote = node.raw?.startsWith('"') ? '"' : "'";
          return fixer.replaceText(node, `${quote}${merged}${quote}`);
        },
      });
    }

    return {
      Literal: checkLiteral,
      TemplateLiteral(node: {
        quasis: Array<{ value: { raw: string }; type: string }>;
      }) {
        for (const quasi of node.quasis) {
          checkLiteral({ value: quasi.value.raw, type: 'Literal' });
        }
      },
    };
  },
};

export default {
  rules: {
    'no-arbitrary-canonical': noArbitraryCanonical,
    'no-conflicting-classes': noConflictingClasses,
  },
  configs: {
    recommended: {
      plugins: ['tailwind-canonical'],
      rules: {
        'tailwind-canonical/no-arbitrary-canonical': 'warn',
      },
    },
  },
};
