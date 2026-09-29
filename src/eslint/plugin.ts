import { createRequire } from 'node:module';
import type { Rule } from 'eslint';
import type { Literal, TemplateLiteral } from 'estree';
import {
  type Config,
  type Suggestion,
  suggestCanonical,
} from '../core/rules.js';

const _require = createRequire(import.meta.url);

/**
 * A string-bearing node handed to `checkLiteral`: either a real `Literal` or a
 * synthetic stand-in for a `TemplateLiteral` quasi. For quasis, `quasiRange`
 * carries the range of the quasi's inner text only (excluding the surrounding
 * backticks / `${`…`}` delimiters) so the fixer can replace it in place without
 * stripping those delimiters and corrupting the template.
 */
type StringNode = Literal & {
  quasiRange?: [number, number];
  valueIsRaw?: boolean;
  parent?: { type?: string };
};

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
      const isTagged =
        (node as TemplateLiteral & { parent?: { type?: string } }).parent
          ?.type === 'TaggedTemplateExpression';
      for (const quasi of node.quasis) {
        const value = isTagged
          ? quasi.value.raw
          : (quasi.value.cooked ?? quasi.value.raw);
        checkLiteral({
          type: 'Literal',
          value,
          raw: quasi.value.raw,
          range: quasi.range,
          loc: quasi.loc,
          quasiRange: quasiTextRange(quasi),
          valueIsRaw: isTagged || quasi.value.cooked === null,
        } as StringNode);
      }
    },
  };
}

function quoteReplacement(node: StringNode, value: string): string {
  const quote = node.raw?.startsWith('"') ? '"' : "'";
  if (node.parent?.type === 'JSXAttribute') {
    return `${quote}${escapeJsxAttribute(value, quote)}${quote}`;
  }
  return `${quote}${escapeString(value, quote)}${quote}`;
}

function escapeString(value: string, quote: '"' | "'"): string {
  const escaped = JSON.stringify(value).slice(1, -1);
  return quote === '"'
    ? escaped
    : escaped.replace(/\\"/g, '"').replace(/'/g, "\\'");
}

function escapeJsxAttribute(value: string, quote: '"' | "'"): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(quote === '"' ? /"/g : /'/g, quote === '"' ? '&quot;' : '&apos;');
}

function escapeTemplateText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\r/g, '\\r');
}

function replacementText(node: StringNode, value: string): string {
  if (node.quasiRange) {
    return node.valueIsRaw ? value : escapeTemplateText(value);
  }
  return quoteReplacement(node, value);
}

function replaceString(
  fixer: Rule.RuleFixer,
  node: StringNode,
  value: string,
): Rule.Fix {
  const text = replacementText(node, value);
  return node.quasiRange
    ? fixer.replaceTextRange(node.quasiRange, text)
    : fixer.replaceText(node, text);
}

const noArbitraryCanonical: Rule.RuleModule = {
  meta: {
    type: 'suggestion' as const,
    fixable: 'code' as const,
    // Schema accepts the full tailwind-canonical Config so a single shared
    // config object can be passed as rule options without schema errors (#42).
    // Honored by this rule (via suggestCanonical): customTextTokens,
    // customSpacingTokens, ignorePatterns, tailwindVersion.
    // Accepted but ignored here (CLI-only): functionNames, attributeNames,
    // sortOrder.
    schema: [
      {
        type: 'object',
        properties: {
          customTextTokens: { type: 'object' },
          customSpacingTokens: { type: 'object' },
          ignorePatterns: { type: 'array' },
          tailwindVersion: { enum: [3, 4] },
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
      const suggestions: Suggestion[] = [];
      const corrected = node.value.replace(/\S+/g, (token) => {
        const suggestion = suggestCanonical(token, config);
        if (!suggestion) return token;
        suggestions.push(suggestion);
        return suggestion.canonical;
      });
      if (suggestions.length === 0) return;

      const message =
        suggestions.length === 1
          ? `Use canonical class '${suggestions[0].canonical}' instead of '${suggestions[0].original}'`
          : `Use canonical classes '${suggestions.map((s) => s.canonical).join(' ')}' instead of '${suggestions.map((s) => s.original).join(' ')}'`;

      context.report({
        node,
        message,
        fix: (fixer) => replaceString(fixer, node, corrected),
      });
    }

    return makeStringRuleVisitor(checkLiteral);
  },
};

type TwMerge = (classes: string) => string;

function loadTwMerge(): TwMerge | null {
  try {
    return (_require('tailwind-merge') as { twMerge: TwMerge }).twMerge;
  } catch {
    return null;
  }
}

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
    const twMerge = loadTwMerge();

    function checkLiteral(node: StringNode) {
      if (!twMerge) return;
      if (typeof node.value !== 'string') return;
      const merged = twMerge(node.value);
      if (merged === node.value) return;
      context.report({
        node,
        message: `Conflicting Tailwind classes detected. Use '${merged}' instead.`,
        fix: (fixer) => replaceString(fixer, node, merged),
      });
    }

    return makeStringRuleVisitor(checkLiteral);
  },
};

interface TailwindCanonicalPlugin {
  rules: {
    'no-arbitrary-canonical': Rule.RuleModule;
    'no-conflicting-classes': Rule.RuleModule;
  };
  configs: {
    recommended: {
      plugins: { 'tailwind-canonical': TailwindCanonicalPlugin };
      rules: Record<string, string>;
    };
  };
}

const plugin: TailwindCanonicalPlugin = {
  rules: {
    'no-arbitrary-canonical': noArbitraryCanonical,
    'no-conflicting-classes': noConflictingClasses,
  },
  configs: {} as TailwindCanonicalPlugin['configs'],
};

plugin.configs.recommended = {
  plugins: { 'tailwind-canonical': plugin },
  rules: {
    'tailwind-canonical/no-arbitrary-canonical': 'warn',
  },
};

export default plugin;
