import type { Answers, Attempt, ErrorItem, ExamMode, Issue } from "../data/types";

const K = {
  mode: "ielts.examMode",
  attempts: "ielts.attempts",
  errors: "ielts.errorBook",
  issues: "ielts.issues",
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

  issues: (): Issue[] => read<Issue[]>(K.issues, []),
  addIssue: (i: Issue) => write(K.issues, [i, ...storage.issues().filter((x) => x.id !== i.id)]),
  removeIssue: (id: string) => write(K.issues, storage.issues().filter((x) => x.id !== id)),
  clearIssues: () => write(K.issues, []),

  /** 导出所有本站数据（练习记录、错题本、进度、草稿、笔记、报错）为 JSON 字符串 */
  exportAll: (): string => {
    const out: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("ielts.")) out[k] = read(k, null);
    }
    return JSON.stringify({ app: "ielts-practice", version: 1, exportedAt: new Date().toISOString(), data: out }, null, 1);
  },
  /** 导入 exportAll 的结果；同名键覆盖，其余保留。返回导入的键数 */
  importAll: (json: string): number => {
    const obj = JSON.parse(json);
    const data = (obj && obj.app === "ielts-practice" && obj.data) || obj;
    let n = 0;
    for (const [k, v] of Object.entries(data)) if (k.startsWith("ielts.")) { write(k, v); n++; }
    return n;
  },
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
