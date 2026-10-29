import { createRequire } from 'node:module';
import type { Rule } from 'eslint';
import type { Literal, TemplateLiteral } from 'estree';
import { validateConfig } from '../core/config.js';
import { mergeClasses } from '../core/merger.js';
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
  templatePrefix?: string;
  templateSuffix?: string;
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

type ContextNode = {
  type: string;
  name?: string | { name?: string };
  parent?: ContextNode;
  callee?: ContextNode;
  value?: ContextNode | string;
  key?: ContextNode;
  left?: ContextNode;
  operator?: string;
  consequent?: ContextNode;
  alternate?: ContextNode;
};

/** Only inspect strings whose syntax establishes that they contain classes. */
function isClassContext(node: ContextNode, config: Config): boolean {
  const attributes = config.attributeNames?.length
    ? config.attributeNames
    : ['className'];
  const functions = config.functionNames ?? ['cn', 'clsx', 'cva'];
  const properties: Array<{ key: string; isKey: boolean }> = [];
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (parent.type === 'JSXAttribute') {
      const name = parent.name;
      return (
        properties.length === 0 &&
        typeof name === 'object' &&
        attributes.includes(name.name ?? '')
      );
    }
    if (parent.type === 'CallExpression') {
      if (parent.callee?.type !== 'Identifier') return false;
      const name = String(parent.callee.name);
      if (!functions.includes(name)) return false;
      if (properties.length === 0) return true;
      if (name === 'cva') {
        if (properties.some((property) => property.isKey)) return false;
        return (
          (properties.length === 3 && properties[2].key === 'variants') ||
          (properties.length === 2 &&
            properties[1].key === 'compoundVariants' &&
            ['class', 'className'].includes(properties[0].key))
        );
      }
      // clsx-style object arguments emit their keys; values are predicates.
      return properties.every((property) => property.isKey);
    }
    if (parent.type === 'Property') {
      properties.push({
        key: String(parent.key?.name ?? parent.key?.value ?? ''),
        isKey: current === parent.key,
      });
    }
    if (
      parent.type === 'LogicalExpression' &&
      parent.operator === '&&' &&
      current === parent.left
    )
      return false;
    if (
      parent.type === 'ConditionalExpression' &&
      current !== parent.consequent &&
      current !== parent.alternate
    )
      return false;
    if (
      ![
        'JSXExpressionContainer',
        'ArrayExpression',
        'ObjectExpression',
        'Property',
        'ConditionalExpression',
        'LogicalExpression',
      ].includes(parent.type)
    )
      return false;
    current = parent;
  }
  return false;
}

function makeStringRuleVisitor(
  checkLiteral: (node: StringNode) => void,
  config: Config = {},
): Rule.RuleListener {
  return {
    Literal: (node) => {
      if (isClassContext(node as unknown as ContextNode, config)) {
        checkLiteral(node as StringNode);
      }
    },
    TemplateLiteral(node: TemplateLiteral) {
      if (!isClassContext(node as unknown as ContextNode, config)) return;
      for (const [index, quasi] of node.quasis.entries()) {
        const value = quasi.value.cooked ?? quasi.value.raw;
        // A token touching an interpolation is incomplete: e.g.
        // `text-[12px]${suffix}` must not become `text-xs${suffix}`.
        const start =
          value.match(index > 0 ? /^\S*\s*/ : /^\s*/)?.[0].length ?? 0;
        const trailing =
          value.match(index < node.quasis.length - 1 ? /\s*\S*$/ : /\s*$/)?.[0]
            .length ?? 0;
        const end = Math.max(start, value.length - trailing);
        const inner = value.slice(start, end);
        checkLiteral({
          type: 'Literal',
          value: inner,
          raw: quasi.value.raw,
          range: quasi.range,
          loc: quasi.loc,
          quasiRange: quasiTextRange(quasi),
          valueIsRaw: quasi.value.cooked === null,
          templatePrefix: value.slice(0, start),
          templateSuffix: value.slice(end),
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
    const full =
      (node.templatePrefix ?? '') + value + (node.templateSuffix ?? '');
    return node.valueIsRaw ? full : escapeTemplateText(full);
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
    // functionNames and attributeNames restrict class string detection.
    // Other CLI-only keys are accepted for shared config objects.
    schema: [
      {
        type: 'object',
        properties: {
          customTextTokens: { type: 'object' },
          customSpacingTokens: { type: 'object' },
          ignorePatterns: { type: 'array' },
          tailwindVersion: { enum: [3, 4] },
          useDefaultTheme: { type: 'boolean' },
          functionNames: { type: 'array', items: { type: 'string' } },
          attributeNames: { type: 'array', items: { type: 'string' } },
          sortOrder: { type: 'array', items: { type: 'string' } },
          extraColorFamilies: { type: 'object' },
          extraScaleProperties: { type: 'array', items: { type: 'string' } },
          extraColors: { type: 'array', items: { type: 'string' } },
          analyze: { type: 'object' },
          minRareScalePropertyOccurrences: { type: 'number' },
          rareScaleMaxFiles: { type: 'number' },
          rareScaleMaxCount: { type: 'number' },
          defaultCommand: { type: 'object' },
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
    const config = validateConfig(context.options[0], 'ESLint rule options');

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

    return makeStringRuleVisitor(checkLiteral, config);
  },
};

type TwMerge = (classes: string) => string;

function loadTwMerge(): TwMerge {
  try {
    return (_require('tailwind-merge') as { twMerge: TwMerge }).twMerge;
  } catch {
    throw new Error(
      'The no-conflicting-classes rule requires the optional peer dependency "tailwind-merge". Install it with: pnpm add -D tailwind-merge',
    );
  }
}

const noConflictingClasses: Rule.RuleModule = {
  meta: {
    type: 'suggestion' as const,
    fixable: 'code' as const,
    schema: noArbitraryCanonical.meta?.schema ?? [],
    messages: {
      conflicting:
        "Conflicting Tailwind classes detected. Use '{{merged}}' instead.",
    },
  },
  create(context: Rule.RuleContext): Rule.RuleListener {
    const twMerge = loadTwMerge();
    const config = validateConfig(context.options[0], 'ESLint rule options');

    function checkLiteral(node: StringNode) {
      if (typeof node.value !== 'string') return;
      const merged = mergeClasses(node.value, twMerge, config);
      if (merged === node.value) return;
      context.report({
        node,
        message: `Conflicting Tailwind classes detected. Use '${merged}' instead.`,
        fix: (fixer) => replaceString(fixer, node, merged),
      });
    }

    return makeStringRuleVisitor(checkLiteral, config);
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
      rules: Record<string, 'warn'>;
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
