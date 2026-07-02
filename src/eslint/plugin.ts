import { createRequire } from 'node:module';
import type { Rule } from 'eslint';
import type { Literal, TemplateLiteral } from 'estree';
import { type Config, suggestCanonical } from '../core/rules.js';

const _require = createRequire(import.meta.url);

/**
 * A string-bearing node handed to `checkLiteral`: either a real `Literal` or a
 * synthetic stand-in for a `TemplateLiteral` quasi. For quasis, `quasiRange`
 * carries the range of the quasi's inner text only (excluding the surrounding
 * backticks / `${`…`}` delimiters) so the fixer can replace it in place without
 * stripping those delimiters and corrupting the template.
 */
type StringNode = Literal & { quasiRange?: [number, number] };

/**
 * Inner-text range of a `TemplateElement`. In espree, `quasi.range` spans the
 * delimiters too (the opening backtick or `}` plus the closing backtick or
 * `${`). The leading delimiter is always one character, so the raw text starts
 * at `range[0] + 1` and runs for `raw.length` characters.
 */
function quasiTextRange(
  quasi: TemplateLiteral['quasis'][number],
): [number, number] | undefined {
  if (!quasi.range) return undefined;
  const start = quasi.range[0] + 1;
  return [start, start + quasi.value.raw.length];
}

/**
 * Builds the shared ESLint visitor that runs `checkLiteral` on every string
 * `Literal` and on each quasi of a `TemplateLiteral`. Both rules walk class
 * strings identically, so the traversal lives here once. Quasi nodes carry the
 * real `range`/`loc` so `context.report` and the fixer operate on actual source
 * positions instead of a detached synthetic node.
 */
function makeStringRuleVisitor(
  checkLiteral: (node: StringNode) => void,
): Rule.RuleListener {
  return {
    Literal: (node) => checkLiteral(node as StringNode),
    TemplateLiteral(node: TemplateLiteral) {
      for (const quasi of node.quasis) {
        checkLiteral({
          type: 'Literal',
          value: quasi.value.cooked ?? quasi.value.raw,
          raw: quasi.value.raw,
          range: quasi.range,
          loc: quasi.loc,
          quasiRange: quasiTextRange(quasi),
        } as StringNode);
      }
    },
  };
}

function quoteReplacement(node: StringNode, value: string): string {
  const quote = node.raw?.startsWith('"') ? '"' : "'";
  return `${quote}${value}${quote}`;
}

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

    function checkLiteral(node: StringNode) {
      if (typeof node.value !== 'string') return;
      const value = node.value;
      const suggestions = [...value.matchAll(/\S+/g)]
        .map((match) => suggestCanonical(match[0], config))
        .filter((suggestion) => suggestion !== null);
      if (suggestions.length === 0) return;

      const corrected = value.replace(
        /\S+/g,
        (token) => suggestCanonical(token, config)?.canonical ?? token,
      );

      const message =
        suggestions.length === 1
          ? `Use canonical class '${suggestions[0].canonical}' instead of '${suggestions[0].original}'`
          : `Use canonical classes '${suggestions.map((s) => s.canonical).join(' ')}' instead of '${suggestions.map((s) => s.original).join(' ')}'`;

      context.report({
        node,
        message,
        fix(fixer) {
          if (node.quasiRange)
            return fixer.replaceTextRange(node.quasiRange, corrected);
          return fixer.replaceText(node, quoteReplacement(node, corrected));
        },
      });
    }

    return makeStringRuleVisitor(checkLiteral);
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

    function checkLiteral(node: StringNode) {
      if (peerMissing || !twMerge) return;
      if (typeof node.value !== 'string') return;
      const merged = twMerge(node.value);
      if (merged === node.value) return;
      context.report({
        node,
        message: `Conflicting Tailwind classes detected. Use '${merged}' instead.`,
        fix(fixer) {
          if (node.quasiRange)
            return fixer.replaceTextRange(node.quasiRange, merged);
          return fixer.replaceText(node, quoteReplacement(node, merged));
        },
      });
    }

    return makeStringRuleVisitor(checkLiteral);
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
