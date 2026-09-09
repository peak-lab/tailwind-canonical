export type Sink = {
  log: (message: string) => void;
  error: (message: string) => void;
  write: (message: string) => void;
};

export type RunResult = { exitCode: number; watching?: boolean };

export type Reporter = 'text' | 'json' | 'sarif';

export type FileCounts = {
  fixed: number;
  deduped: number;
  merged: number;
  sorted: number;
};
