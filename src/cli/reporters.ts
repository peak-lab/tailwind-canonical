import { createHash } from 'node:crypto';
import { isAbsolute, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Finding } from '../core/analyzer.js';
import type { ConsistencyReport } from '../core/consistency.js';
import type { Config } from '../core/rules.js';
import type { TypoFinding } from '../core/typos.js';
import { pluralize } from './format.js';
import type { FileCounts, Sink } from './types.js';

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

const DEFAULT_ANALYZE_TEXT_OPTIONS = {
  maxScaleGroups: 8,
  maxScaleValues: 5,
  maxRareValues: 12,
  maxPatterns: 10,
};

type SarifLevel = 'error' | 'warning' | 'note';

type SarifLocation = {
  physicalLocation: {
    artifactLocation: { uri: string; uriBaseId?: string };
    region: {
      startLine: number;
      startColumn: number;
      endLine?: number;
      endColumn?: number;
    };
  };
};

type SarifReport = {
  $schema: string;
  version: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version?: string;
        informationUri: string;
        rules: Array<{
          id: string;
          name: string;
          shortDescription: { text: string };
          defaultConfiguration: { level: SarifLevel };
        }>;
      };
    };
    results: Array<{
      ruleId: string;
      level?: SarifLevel;
      message: { text: string };
      locations: SarifLocation[];
      partialFingerprints?: Record<string, string>;
    }>;
  }>;
};

type SarifRule = SarifReport['runs'][0]['tool']['driver']['rules'][0];
type SarifResult = SarifReport['runs'][0]['results'][0];

export type SarifContext = { root: string; version?: string };

const SRCROOT = '%SRCROOT%';
const FINGERPRINT_KEY = 'tailwindCanonical/v1';

function artifactLocation(
  file: string,
  root: string,
): SarifLocation['physicalLocation']['artifactLocation'] {
  const rel = relative(root, file);
  if (rel === '' || /^\.\.(?:[\\/]|$)/.test(rel) || isAbsolute(rel)) {
    return { uri: pathToFileURL(file).href };
  }
  const uri = rel.split(/[\\/]/).map(encodeURIComponent).join('/');
  return { uri, uriBaseId: SRCROOT };
}

function fingerprint(parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

function finalizeResults(
  rules: SarifRule[],
  results: SarifResult[],
  root: string,
): SarifResult[] {
  const levels = new Map(
    rules.map((rule) => [rule.id, rule.defaultConfiguration.level]),
  );
  const occurrences = new Map<string, number>();
  return results.map((result) => {
    const locations = result.locations.map((location) => ({
      physicalLocation: {
        ...location.physicalLocation,
        artifactLocation: artifactLocation(
          location.physicalLocation.artifactLocation.uri,
          root,
        ),
      },
    }));
    const key = fingerprint([
      result.ruleId,
      result.message.text,
      ...locations.map(
        (location) => location.physicalLocation.artifactLocation.uri,
      ),
    ]);
    const index = occurrences.get(key) ?? 0;
    occurrences.set(key, index + 1);
    return {
      ruleId: result.ruleId,
      level: result.level ?? levels.get(result.ruleId) ?? 'warning',
      message: result.message,
      locations,
      partialFingerprints: {
        [FINGERPRINT_KEY]: fingerprint([key, String(index)]),
      },
    };
  });
}

export function sarifDocument(
  rules: SarifRule[],
  results: SarifResult[],
  ctx: SarifContext,
): SarifReport {
  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'tailwind-canonical',
            ...(ctx.version ? { version: ctx.version } : {}),
            informationUri: 'https://github.com/peak-lab/tailwind-canonical',
            rules,
          },
        },
        results: finalizeResults(rules, results, ctx.root),
      },
    ],
  };
}

function pointLocation(
  uri: string,
  line: number,
  col: number,
  length?: number,
): SarifLocation {
  const region =
    length === undefined
      ? { startLine: line, startColumn: col }
      : {
          startLine: line,
          startColumn: col,
          endLine: line,
          endColumn: col + length,
        };
  return { physicalLocation: { artifactLocation: { uri }, region } };
}

function fileLocations(files: string[]): SarifLocation[] {
  return files.map((uri) => pointLocation(uri, 1, 1));
}

function uniqueFiles(entries: Array<{ files: string[] }>): string[] {
  return [...new Set(entries.flatMap((entry) => entry.files))];
}

export function typoSarifDocument(
  findings: TypoFinding[],
  ctx: SarifContext,
): SarifReport {
  return sarifDocument(
    [
      {
        id: 'color-typo',
        name: 'ColorTypo',
        shortDescription: {
          text: 'Class color name is a likely typo of a Tailwind color',
        },
        defaultConfiguration: { level: 'warning' },
      },
    ],
    findings.map((f) => ({
      ruleId: 'color-typo',
      message: { text: `${f.original} → ${f.suggestion}` },
      locations: [pointLocation(f.file, f.line, f.col, f.original.length)],
    })),
    ctx,
  );
}

export function findingsSarifDocument(
  findings: Finding[],
  ctx: SarifContext,
): SarifReport {
  return sarifDocument(
    [
      {
        id: 'no-arbitrary-canonical',
        name: 'NoArbitraryCanonical',
        shortDescription: {
          text: 'Arbitrary value has a canonical Tailwind equivalent',
        },
        defaultConfiguration: { level: 'warning' },
      },
    ],
    findings.map((f) => ({
      ruleId: 'no-arbitrary-canonical',
      message: {
        text: `${f.suggestion.original} → ${f.suggestion.canonical}`,
      },
      locations: [
        pointLocation(f.file, f.line, f.col, f.suggestion.original.length),
      ],
    })),
    ctx,
  );
}

const ANALYZE_SARIF_RULES: SarifRule[] = [
  {
    id: 'color-variant-inconsistency',
    name: 'ColorVariantInconsistency',
    shortDescription: {
      text: 'Multiple color variants of the same family used for one property',
    },
    defaultConfiguration: { level: 'note' },
  },
  {
    id: 'scale-inconsistency',
    name: 'ScaleInconsistency',
    shortDescription: {
      text: 'Inconsistent scale values used for the same property',
    },
    defaultConfiguration: { level: 'note' },
  },
  {
    id: 'rare-scale-value',
    name: 'RareScaleValue',
    shortDescription: {
      text: 'A scale value appears rarely within an otherwise common property',
    },
    defaultConfiguration: { level: 'note' },
  },
  {
    id: 'repeated-combination',
    name: 'RepeatedCombination',
    shortDescription: {
      text: 'Identical class combination repeated across files',
    },
    defaultConfiguration: { level: 'note' },
  },
];

export function analyzeSarifDocument(
  report: ConsistencyReport,
  ctx: SarifContext,
): SarifReport {
  const colorResults = report.colorVariants.map((group) => ({
    ruleId: 'color-variant-inconsistency',
    message: {
      text: `${group.variants.length} ${group.family} color variants for ${group.property}: ${group.variants.map((v) => v.token).join(', ')}`,
    },
    locations: fileLocations(uniqueFiles(group.variants)),
  }));
  const scaleResults = report.scaleInconsistencies.map((scale) => ({
    ruleId: 'scale-inconsistency',
    message: {
      text: `${scale.property} inconsistency: ${scale.values.map((v) => scaleClass(scale.property, v.value)).join(' vs ')}`,
    },
    locations: fileLocations(uniqueFiles(scale.values)),
  }));
  const rareResults = report.rareScaleValues.map((rare) => ({
    ruleId: 'rare-scale-value',
    message: {
      text: `${rare.className} is rare for ${rare.property}: ${rare.count} occurrence(s) in ${rare.files.length} file(s), within ${rare.propertyCount} ${rare.property} uses`,
    },
    locations: fileLocations(rare.files),
  }));
  const comboResults = report.combinations.map((combo) => ({
    ruleId: 'repeated-combination',
    message: {
      text: `Repeated class combination: ${combo.classes.join(' ')}`,
    },
    locations: fileLocations(combo.files),
  }));

  return sarifDocument(
    ANALYZE_SARIF_RULES,
    [...colorResults, ...scaleResults, ...rareResults, ...comboResults],
    ctx,
  );
}

const TRANSFORM_LABELS: ReadonlyArray<{
  key: keyof FileCounts;
  applied: string;
  pending: string;
  unit: string;
}> = [
  {
    key: 'fixed',
    applied: 'fixed ',
    pending: 'would fix',
    unit: 'replacement',
  },
  {
    key: 'deduped',
    applied: 'deduped',
    pending: 'would dedup',
    unit: 'class string',
  },
  {
    key: 'merged',
    applied: 'merged ',
    pending: 'would merge',
    unit: 'conflict',
  },
  {
    key: 'sorted',
    applied: 'sorted ',
    pending: 'would sort',
    unit: 'class string',
  },
];

export function logTransformCounts(
  counts: FileCounts,
  file: string,
  check: boolean,
  sink: Sink,
): void {
  for (const { key, applied, pending, unit } of TRANSFORM_LABELS) {
    const count = counts[key];
    if (count > 0) {
      sink.log(
        `  ${check ? pending : applied} ${file} (${pluralize(count, unit)})`,
      );
    }
  }
}

export function logFindings(findings: Finding[], sink: Sink): void {
  for (const finding of findings) {
    const tag = finding.suggestion.isCustomToken ? ' [custom token]' : '';
    sink.log(
      `  ${finding.file}:${finding.line}:${finding.col}  ${finding.suggestion.original} → ${finding.suggestion.canonical}${tag}`,
    );
  }
}

export function logWatchFindings(
  file: string,
  findings: Finding[],
  timestamp: string,
  sink: Sink,
): void {
  if (findings.length === 0) return;
  sink.log(`${timestamp} ${file} — ${pluralize(findings.length, 'finding')}`);
  for (const finding of findings) {
    const tag = finding.suggestion.isCustomToken ? ' [custom token]' : '';
    sink.log(
      `  ${finding.line}:${finding.col}  ${finding.suggestion.original} → ${finding.suggestion.canonical}${tag}`,
    );
  }
}

export function logTyposText(findings: TypoFinding[], sink: Sink): void {
  for (const finding of findings) {
    sink.log(
      `  ${finding.file}:${finding.line}:${finding.col}  ${finding.original} → ${finding.suggestion} [typo]`,
    );
  }
  sink.log(
    findings.length === 0
      ? '✓ No likely typos found'
      : `\n✖ Found ${pluralize(findings.length, 'likely typo')}`,
  );
}

export function writeJson(sink: Sink, value: unknown): void {
  sink.write(`${JSON.stringify(value, null, 2)}\n`);
}

function scaleClass(property: string, value: string): string {
  return value.startsWith('-')
    ? `-${property}-${value.slice(1)}`
    : `${property}-${value}`;
}

function compactPath(file: string): string {
  const normalized = file.replace(/\\/g, '/');
  const parts = normalized.split('/');
  return parts.length <= 4 ? normalized : `.../${parts.slice(-4).join('/')}`;
}

function withMore<T>(
  values: T[],
  limit: number,
  format: (value: T) => string,
): string {
  const shown = values.slice(0, limit).map(format);
  const remaining = values.length - shown.length;
  if (remaining > 0) shown.push(`+${remaining} more`);
  return shown.join(', ');
}

function scaleTotalUses(
  scale: ConsistencyReport['scaleInconsistencies'][number],
): number {
  return scale.values.reduce((sum, value) => sum + value.count, 0);
}

export function logAnalyzeText(
  report: ConsistencyReport,
  issueCount: number,
  config: Config,
  sink: Sink,
): void {
  const options = {
    maxScaleGroups:
      config.analyze?.maxScaleGroups ??
      DEFAULT_ANALYZE_TEXT_OPTIONS.maxScaleGroups,
    maxScaleValues:
      config.analyze?.maxScaleValues ??
      DEFAULT_ANALYZE_TEXT_OPTIONS.maxScaleValues,
    maxRareValues:
      config.analyze?.maxRareValues ??
      DEFAULT_ANALYZE_TEXT_OPTIONS.maxRareValues,
    maxPatterns:
      config.analyze?.maxPatterns ?? DEFAULT_ANALYZE_TEXT_OPTIONS.maxPatterns,
  };

  sink.log('tailwind-canonical analyze');
  sink.log(`Files analyzed: ${report.filesAnalyzed}`);
  sink.log(
    `Issue groups: ${issueCount} (${pluralize(report.colorVariants.length, 'color')}, ${pluralize(report.scaleInconsistencies.length, 'scale')}, ${pluralize(report.combinations.length, 'pattern')})`,
  );
  if (report.rareScaleValues.length > 0)
    sink.log(`Rare values: ${report.rareScaleValues.length}`);
  if (issueCount === 0) {
    sink.log('\nNo cross-file inconsistencies found');
    return;
  }
  if (report.colorVariants.length > 0) {
    sink.log('\nColor variants');
    for (const group of report.colorVariants) {
      const tokens = group.variants
        .map((value) => `${group.property}-${value.token} x${value.count}`)
        .join(', ');
      sink.log(`  - ${group.property}/${group.family}: ${tokens}`);
    }
  }
  if (report.scaleInconsistencies.length > 0) {
    sink.log('\nScale inconsistency groups');
    const scales = [...report.scaleInconsistencies].sort(
      (a, b) =>
        scaleTotalUses(b) - scaleTotalUses(a) ||
        a.property.localeCompare(b.property),
    );
    for (const scale of scales.slice(0, options.maxScaleGroups)) {
      const files = new Set(scale.values.flatMap((value) => value.files));
      sink.log(
        `  - ${scale.property}: ${scale.values.length} values, ${scaleTotalUses(scale)} uses, ${pluralize(files.size, 'file')}`,
      );
      sink.log(
        `    Top: ${withMore(scale.values, options.maxScaleValues, (value) => `${scaleClass(scale.property, value.value)} (${pluralize(value.count, 'use')}, ${pluralize(value.files.length, 'file')})`)}`,
      );
    }
    const remaining = scales.length - options.maxScaleGroups;
    if (remaining > 0) sink.log(`  - +${remaining} more scale groups`);
  }
  if (report.rareScaleValues.length > 0) {
    sink.log('\nRare scale values');
    for (const rare of report.rareScaleValues.slice(0, options.maxRareValues)) {
      const example = rare.files[0]
        ? `; e.g. ${compactPath(rare.files[0])}`
        : '';
      sink.log(
        `  - ${rare.className}: ${pluralize(rare.count, 'use')} in ${pluralize(rare.files.length, 'file')} (${rare.propertyCount} ${rare.property} uses total)${example}`,
      );
    }
    const remaining = report.rareScaleValues.length - options.maxRareValues;
    if (remaining > 0) sink.log(`  - +${remaining} more rare values`);
  }
  if (report.combinations.length > 0) {
    sink.log('\nRepeated patterns');
    for (const combo of report.combinations.slice(0, options.maxPatterns)) {
      sink.log(
        `  - Pattern: "${combo.classes.join(' ')}" repeated in ${pluralize(combo.files.length, 'file')}`,
      );
    }
    const remaining = report.combinations.length - options.maxPatterns;
    if (remaining > 0) sink.log(`  - +${remaining} more repeated patterns`);
  }
  sink.log(
    `\nFound ${pluralize(issueCount, 'consistency issue')} across ${pluralize(report.filesAnalyzed, 'file')}`,
  );
}
