import { readFileSync } from 'node:fs'
import { suggestCanonical, type Config, type Suggestion } from './rules.js'

export type Finding = {
  file: string
  line: number
  col: number
  suggestion: Suggestion
}

const CLASS_REGEX = /className(?:Name)?\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`|\{([^}]+)\})/g
const SINGLE_CLASS_REGEX = /[^\s"'`{}]+/g

function extractClasses(content: string): Array<{ cls: string; index: number }> {
  const found: Array<{ cls: string; index: number }> = []

  let match: RegExpExecArray | null
  CLASS_REGEX.lastIndex = 0

  while ((match = CLASS_REGEX.exec(content)) !== null) {
    const raw = match[1] ?? match[2] ?? match[3] ?? match[4] ?? ''
    SINGLE_CLASS_REGEX.lastIndex = 0
    let clsMatch: RegExpExecArray | null
    while ((clsMatch = SINGLE_CLASS_REGEX.exec(raw)) !== null) {
      found.push({ cls: clsMatch[0], index: match.index + (match[0].indexOf(raw)) + clsMatch.index })
    }
  }

  return found
}

function indexToLineCol(content: string, index: number): { line: number; col: number } {
  const before = content.slice(0, index)
  const line = before.split('\n').length
  const col = index - before.lastIndexOf('\n')
  return { line, col }
}

export function analyzeFile(filePath: string, config: Config = {}): Finding[] {
  const content = readFileSync(filePath, 'utf8')
  const findings: Finding[] = []

  for (const { cls, index } of extractClasses(content)) {
    const suggestion = suggestCanonical(cls, config)
    if (!suggestion) continue
    const { line, col } = indexToLineCol(content, index)
    findings.push({ file: filePath, line, col, suggestion })
  }

  return findings
}
