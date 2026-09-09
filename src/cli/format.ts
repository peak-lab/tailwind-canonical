export function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function pluralize(count: number, word: string): string {
  return `${count} ${word}${count !== 1 ? 's' : ''}`;
}

export function timestamp(): string {
  const date = new Date();
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `[${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}]`;
}
