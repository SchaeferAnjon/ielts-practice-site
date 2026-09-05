import type { Answers, QuestionResult } from "../data/types";

export default function AnswerSheet({
  total,
  answers,
  review,
  results,
  current,
  onJump,
  multiStarts,
}: {
  total: number;
  answers: Answers;
  review?: Set<number>;
  results?: QuestionResult[] | null;
  current?: number;
  onJump?: (n: number) => void;
  multiStarts?: Record<number, number>;
}) {
  const res = new Map((results ?? []).map((r) => [r.n, r.ok]));
  return (
    <div className="answer-sheet">
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => {
        const key = multiStarts?.[n] ?? n;
        const done = !!(answers[key] ?? "").trim();
        const cls = ["q"];
        if (results) cls.push(res.get(n) ? "ok" : "bad");
        else if (done) cls.push("done");
        if (review?.has(n)) cls.push("review");
        if (current === n) cls.push("cur");
        return (
          <button key={n} className={cls.join(" ")} onClick={() => onJump?.(n)} title={`第 ${n} 题`}>
            {n}
          </button>
        );
      })}
    </div>
  );
}
