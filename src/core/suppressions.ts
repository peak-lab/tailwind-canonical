const DISABLE_NEXT_LINE = 'tailwind-canonical-disable-next-line';
const DISABLE = 'tailwind-canonical-disable';
const ENABLE = 'tailwind-canonical-enable';

export function getSuppressedLines(content: string): Set<number> {
  const suppressed = new Set<number>();
  const lines = content.split('\n');
  let block = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;

    if (line.includes(DISABLE_NEXT_LINE)) {
      suppressed.add(lineNo + 1);
    } else if (line.includes(ENABLE)) {
      block = false;
    } else if (line.includes(DISABLE)) {
      block = true;
    }

    if (block) suppressed.add(lineNo);
  }

  return suppressed;
}

export function makeLineSuppressor(content: string): (line: number) => boolean {
  const suppressed = getSuppressedLines(content);
  return (line) => suppressed.has(line);
}

export function createPositionLookup(content: string) {
  const lineStarts = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') lineStarts.push(i + 1);
  }

  return (index: number): { line: number; col: number } => {
    let low = 0;
    let high = lineStarts.length;
    while (low + 1 < high) {
      const mid = Math.floor((low + high) / 2);
      if (lineStarts[mid] <= index) low = mid;
      else high = mid;
    }
    return { line: low + 1, col: index - lineStarts[low] + 1 };
  };
}
