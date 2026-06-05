import { createRequire } from 'node:module';
import type { Rule } from 'eslint';
import type { Literal, TemplateLiteral } from 'estree';
import { type Config, suggestCanonical } from '../core/rules.js';

const _require = createRequire(import.meta.url);

const noArbitraryCanonical: Rule.RuleModule = {
  meta: {
    type: 'suggestion' as const,
    fixable: 'code' as const,
    // Schema accepts the full tailwind-canonical Config so a single shared
    // config object can be passed as rule options without schema errors (#42).
    // Honored by this rule (via suggestCanonical): customTextTokens,
    // customSpacingTokens, ignorePatterns.
    // Accepted but ignored here (CLI-only): functionNames, attributeNames,
    // sortOrder.
    schema: [
      {
        type: 'object',
        properties: {
          customTextTokens: { type: 'object' },
          customSpacingTokens: { type: 'object' },
          ignorePatterns: { type: 'array' },
          functionNames: { type: 'array', items: { type: 'string' } },
          attributeNames: { type: 'array', items: { type: 'string' } },
          sortOrder: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      useCanonical:
        "Use canonical class '{{canonical}}' instead of '{{original}}'",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    const config: Config = (context.options[0] as Config | undefined) ?? {};

    function checkLiteral(node: Literal) {
      if (typeof node.value !== 'string') return;
      const value = node.value;
      const corrected = value.replace(
        /\S+/g,
        (token) => suggestCanonical(token, config)?.canonical ?? token,
      );
      for (const cls of value.split(/\s+/)) {
        const suggestion = suggestCanonical(cls, config);
        if (!suggestion) continue;
        context.report({
          node,
          message: `Use canonical class '${suggestion.canonical}' instead of '${suggestion.original}'`,
          fix(fixer) {
            const quote = node.raw?.startsWith('"') ? '"' : "'";
            return fixer.replaceText(node, `${quote}${corrected}${quote}`);
          },
        });
      }
    }

    return {
      Literal: checkLiteral,
      TemplateLiteral(node: TemplateLiteral) {
        for (const quasi of node.quasis) {
          checkLiteral({
            type: 'Literal',
            value: quasi.value.raw,
          } as Literal);
        }
      },
    };
  },
};

type TwMerge = (classes: string) => string;

const noConflictingClasses: Rule.RuleModule = {
  meta: {
    type: 'suggestion' as const,
    fixable: 'code' as const,
    schema: [],
    messages: {
      conflicting:
        "Conflicting Tailwind classes detected. Use '{{merged}}' instead.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    let twMerge: TwMerge | null = null;
    let peerMissing = false;

    try {
      const mod = _require('tailwind-merge') as { twMerge: TwMerge };
      twMerge = mod.twMerge;
    } catch {
      peerMissing = true;
    }

    function checkLiteral(node: Literal) {
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
      TemplateLiteral(node: TemplateLiteral) {
        for (const quasi of node.quasis) {
          checkLiteral({
            type: 'Literal',
            value: quasi.value.raw,
          } as Literal);
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
