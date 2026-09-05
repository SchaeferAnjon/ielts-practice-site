import type { Answers, Attempt, ErrorItem, ExamMode } from "../data/types";

const K = {
  mode: "ielts.examMode",
  attempts: "ielts.attempts",
  errors: "ielts.errorBook",
  progress: (id: string) => `ielts.progress.${id}`,
  notes: (id: string) => `ielts.notes.${id}`,
  highlights: (id: string) => `ielts.highlights.${id}`,
  drafts: (id: string) => `ielts.draft.${id}`,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private mode */
  }
}

export const storage = {
  getMode: (): ExamMode | null => read<ExamMode | null>(K.mode, null),
  setMode: (m: ExamMode) => write(K.mode, m),

  getProgress: (id: string): Answers => read<Answers>(K.progress(id), {}),
  setProgress: (id: string, a: Answers) => write(K.progress(id), a),
  clearProgress: (id: string) => localStorage.removeItem(K.progress(id)),

  getDraft: (id: string): string => read<string>(K.drafts(id), ""),
  setDraft: (id: string, t: string) => write(K.drafts(id), t),

  getNotes: <T,>(id: string): T[] => read<T[]>(K.notes(id), []),
  setNotes: (id: string, n: unknown[]) => write(K.notes(id), n),
  getHighlights: (id: string): string[] => read<string[]>(K.highlights(id), []),
  setHighlights: (id: string, h: string[]) => write(K.highlights(id), h),

  attempts: (): Attempt[] => read<Attempt[]>(K.attempts, []),
  addAttempt: (a: Attempt) => {
    const list = storage.attempts();
    list.unshift(a);
    write(K.attempts, list.slice(0, 100));
  },
  getAttempt: (id: string): Attempt | undefined => storage.attempts().find((a) => a.id === id),

  errors: (): ErrorItem[] => read<ErrorItem[]>(K.errors, []),
  addError: (e: ErrorItem) => {
    const list = storage.errors().filter((x) => x.id !== e.id);
    list.unshift(e);
    write(K.errors, list);
  },
  removeError: (id: string) => write(K.errors, storage.errors().filter((x) => x.id !== id)),
  hasError: (id: string) => storage.errors().some((x) => x.id === id),
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
