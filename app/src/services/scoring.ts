import type { Answers, QuestionResult } from "../data/types";

/** 归一化填空答案：小写、去首尾空格、去多余空格与标点、连字符/空格互换视为等价 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,;:!?"()£$€]/g, "")
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NUM_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
};

function numeric(s: string): string {
  return s.split(" ").map((w) => NUM_WORDS[w] ?? w).join(" ");
}

export function isCorrect(user: string, correct: string[]): boolean {
  const u = normalize(user);
  if (!u) return false;
  return correct.some((c) => {
    const cc = normalize(c);
    return cc === u || numeric(cc) === numeric(u);
  });
}

/** 多选题（如 21&22 选 B、D）：用户答案是 "B,D" 形式，任一正确即得分；按题号顺序分配 */
function multiPick(user: string, correct: string[], slot: number): { ok: boolean; picked: string } {
  const picks = user.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
  const hits = picks.filter((p) => correct.includes(p));
  const misses = picks.filter((p) => !correct.includes(p));
  const ordered = [...hits, ...misses];
  const picked = ordered[slot] ?? "";
  return { ok: !!picked && correct.includes(picked), picked };
}

export function grade(
  answers: Answers,
  key: Record<string, string[]>,
  multiGroups: [number, number][] = [],
): QuestionResult[] {
  const results: QuestionResult[] = [];
  const multiIndex = new Map<number, { start: number; slot: number }>();
  multiGroups.forEach(([a, b]) => {
    for (let n = a; n <= b; n++) multiIndex.set(n, { start: a, slot: n - a });
  });
  for (const nStr of Object.keys(key)) {
    const n = Number(nStr);
    const correct = key[nStr];
    const m = multiIndex.get(n);
    if (m) {
      const user = answers[m.start] ?? "";
      const { ok, picked } = multiPick(user, correct, m.slot);
      results.push({ n, user: picked, correct, ok });
    } else {
      const user = (answers[n] ?? "").trim();
      results.push({ n, user, correct, ok: isCorrect(user, correct) });
    }
  }
  return results.sort((a, b) => a.n - b.n);
}

/** 雅思 9 分制换算（学术类；官方公布的近似区间） */
const LISTENING_BAND: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1],
];
const READING_BAND: [number, number][] = [
  [39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1],
];

export function toBand(module: "listening" | "reading", score: number, total = 40): number {
  const scaled = total === 40 ? score : Math.round((score / total) * 40);
  const table = module === "listening" ? LISTENING_BAND : READING_BAND;
  for (const [min, band] of table) if (scaled >= min) return band;
  return 0;
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
