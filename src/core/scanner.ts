import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULT_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte']
const DEFAULT_IGNORE = ['node_modules', '.next', 'dist', '.git', 'build', 'coverage']

export type ScanOptions = {
  extensions?: string[]
  ignore?: string[]
}

export function scanFiles(dir: string, options: ScanOptions = {}): string[] {
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS
  const ignore = options.ignore ?? DEFAULT_IGNORE
  const files: string[] = []

  function walk(current: string) {
    const entries = readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        files.push(full)
      }
    }
  }

  const stat = statSync(dir)
  if (stat.isFile()) return extensions.some((ext) => dir.endsWith(ext)) ? [dir] : []
  walk(dir)
  return files
}
