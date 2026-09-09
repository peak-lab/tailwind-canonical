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

export type SarifReport = {
  $schema: string;
  version: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        informationUri: string;
        rules: Array<{
          id: string;
          name: string;
          shortDescription: { text: string };
        }>;
      };
    };
    results: Array<{
      ruleId: string;
      message: { text: string };
      locations: Array<{
        physicalLocation: {
          artifactLocation: { uri: string };
          region: { startLine: number; startColumn: number };
        };
      }>;
    }>;
  }>;
};

export type SarifRule = SarifReport['runs'][0]['tool']['driver']['rules'][0];
export type SarifResult = SarifReport['runs'][0]['results'][0];

export function sarifDocument(
  rules: SarifRule[],
  results: SarifResult[],
): SarifReport {
  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'tailwind-canonical',
            informationUri: 'https://github.com/peak-lab/tailwind-canonical',
            rules,
          },
        },
        results,
      },
    ],
  };
}

export function fileLocations(files: string[]): SarifResult['locations'] {
  return files.map((uri) => ({
    physicalLocation: {
      artifactLocation: { uri },
      region: { startLine: 1, startColumn: 1 },
    },
  }));
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

export function scaleClass(property: string, value: string): string {
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
