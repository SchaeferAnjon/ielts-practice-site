import { Fragment, useState, type ReactNode } from "react";
import type { Answers, Group, Option, QuestionResult } from "../data/types";

type Props = {
  group: Group;
  answers: Answers;
  onChange: (n: number, v: string) => void;
  results?: QuestionResult[] | null;
  review?: Set<number>;
  onToggleReview?: (n: number) => void;
  onFocus?: (n: number) => void;
  extraAfter?: (n: number) => ReactNode;
};

const GAP_RE = /\{\{(\d+)\}\}/g;

export default function QuestionGroup({ group: g, answers, onChange, results, review, onToggleReview, onFocus, extraAfter }: Props) {
  const res = new Map((results ?? []).map((r) => [r.n, r]));
  const locked = !!results;

  const statusCls = (n: number) => (res.has(n) ? (res.get(n)!.ok ? "ok" : "bad") : "");
  const ReviewBtn = ({ n }: { n: number }) =>
    onToggleReview && !locked ? (
      <button className={`review-btn ${review?.has(n) ? "on" : ""}`} onClick={() => onToggleReview(n)} title="标记稍后检查">
        {review?.has(n) ? "★ Review" : "☆ Review"}
      </button>
    ) : null;
  const ResultLine = ({ n }: { n: number }) => {
    const r = res.get(n);
    if (!r) return null;
    return (
      <div className="result-line">
        {r.ok ? <span className="ok">✓ 正确</span> : <span className="bad">✗ 你的答案：{r.user || "（空）"}　正确答案：{r.correct.join(" / ")}</span>}
        {extraAfter?.(n)}
      </div>
    );
  };

  /** 把含 {{n}} 的文本渲染成 文字 + 下划线输入框 */
  const renderGapText = (text: string) => {
    const parts: ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    GAP_RE.lastIndex = 0;
    while ((m = GAP_RE.exec(text))) {
      parts.push(text.slice(last, m.index));
      const n = Number(m[1]);
      parts.push(
        <span key={`g${n}`} className={`gap ${statusCls(n)}`} id={`q-${n}`}>
          <span className="n">{n}</span>
          <input
            value={answers[n] ?? ""}
            disabled={locked}
            onFocus={() => onFocus?.(n)}
            onChange={(e) => onChange(n, e.target.value)}
            placeholder="………"
            autoComplete="off"
          />
          {res.has(n) && !res.get(n)!.ok && <span className="ans">({res.get(n)!.correct[0]})</span>}
          <ReviewBtn n={n} />
        </span>,
      );
      last = m.index + m[0].length;
    }
    parts.push(text.slice(last));
    return parts;
  };

  const header = (
    <>
      <div className="instr">
        <b>Questions {g.range[0]}{g.range[1] !== g.range[0] ? `-${g.range[1]}` : ""}</b>
        {g.instruction}
      </div>
      {"limit" in g && g.limit && <div className="limit">{g.limit}</div>}
    </>
  );

  switch (g.type) {
    case "table":
      return (
        <div className="qgroup">
          {header}
          {g.title && <div className="gtitle">{g.title}</div>}
          <table className="qtable">
            <thead>
              <tr>{g.table.head.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {g.table.rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{renderGapText(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
          {rangeResults(g, ResultLine, locked)}
        </div>
      );

    case "notes":
      return (
        <div className="qgroup">
          {header}
          {g.title && <div className="gtitle">{g.title}</div>}
          <div className="notes-lines">
            {g.lines.map((line, i) =>
              line.startsWith("## ") ? (
                <div key={i} className="h">{line.slice(3)}</div>
              ) : (
                <div key={i} className="li">{renderGapText(line)}</div>
              ),
            )}
          </div>
          {rangeResults(g, ResultLine, locked)}
        </div>
      );

    case "summary":
      return (
        <div className="qgroup">
          {header}
          {g.title && <div className="gtitle">{g.title}</div>}
          <div className="summary-text">{renderGapText(g.text)}</div>
          {rangeResults(g, ResultLine, locked)}
        </div>
      );

    case "summary-select":
      return (
        <div className="qgroup">
          {header}
          {g.title && <div className="gtitle">{g.title}</div>}
          <SelectGapText text={g.text} options={g.options} answers={answers} onChange={onChange} locked={locked} statusCls={statusCls} onFocus={onFocus} />
          <OptionBox options={g.options} />
          {rangeResults(g, ResultLine, locked)}
        </div>
      );

    case "mc":
      return (
        <div className="qgroup">
          {header}
          {g.title && <div className="gtitle">{g.title}</div>}
          {g.questions.map((q) => (
            <div className="mcq" key={q.n} id={`q-${q.n}`}>
              <div className="stem"><span className="n">{q.n}</span>{q.text} <ReviewBtn n={q.n} /></div>
              {q.options.map((o) => {
                const r = res.get(q.n);
                const cls = r ? (r.correct.includes(o.k) ? "ok" : answers[q.n] === o.k ? "bad" : "") : "";
                return (
                  <label key={o.k} className={cls}>
                    <input type="radio" name={`q${q.n}`} disabled={locked} checked={answers[q.n] === o.k} onChange={() => { onChange(q.n, o.k); onFocus?.(q.n); }} />
                    <span className="k">{o.k}</span>
                    <span>{o.text}</span>
                  </label>
                );
              })}
              <ResultLine n={q.n} />
            </div>
          ))}
        </div>
      );

    case "mc-multi": {
      const start = g.range[0];
      const picked = (answers[start] ?? "").split(",").filter(Boolean);
      const toggle = (k: string) => {
        let next = picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k];
        if (next.length > g.count) next = next.slice(-g.count);
        onChange(start, next.join(","));
        onFocus?.(start);
      };
      const rs = [g.range[0], g.range[1]].map((n) => res.get(n)).filter(Boolean) as QuestionResult[];
      const correct = rs[0]?.correct ?? [];
      return (
        <div className="qgroup">
          {header}
          <div className="mcq" id={`q-${start}`}>
            <div className="stem"><span className="n">{g.range[0]}-{g.range[1]}</span>{g.text} <ReviewBtn n={start} /></div>
            {g.options.map((o) => {
              const cls = results ? (correct.includes(o.k) ? "ok" : picked.includes(o.k) ? "bad" : "") : "";
              return (
                <label key={o.k} className={cls}>
                  <input type="checkbox" disabled={locked} checked={picked.includes(o.k)} onChange={() => toggle(o.k)} />
                  <span className="k">{o.k}</span>
                  <span>{o.text}</span>
                </label>
              );
            })}
            {results && (
              <div className="result-line">
                {rs.every((r) => r.ok) ? <span className="ok">✓ 两项全对</span> : <span className="bad">✗ 你选了 {picked.join(", ") || "（空）"}　正确：{correct.join(", ")}</span>}
                {extraAfter?.(start)}
              </div>
            )}
          </div>
        </div>
      );
    }

    case "matching":
      return (
        <div className="qgroup">
          {header}
          <OptionBox options={g.options} title={g.optionsTitle} />
          {g.itemsTitle && <div style={{ fontWeight: 700, margin: "8px 0 4px" }}>{g.itemsTitle}</div>}
          <MatchItems items={g.items} options={g.options} answers={answers} onChange={onChange} locked={locked} statusCls={statusCls} ReviewBtn={ReviewBtn} ResultLine={ResultLine} onFocus={onFocus} />
        </div>
      );

    case "section-match":
      return (
        <div className="qgroup">
          {header}
          <div className="tfng">
            {g.questions.map((q) => (
              <div key={q.n} className={`row ${statusCls(q.n)}`} id={`q-${q.n}`}>
                <span className="n">{q.n}</span>
                <span className="txt">{q.text} <ReviewBtn n={q.n} /><ResultLine n={q.n} /></span>
                <select value={answers[q.n] ?? ""} disabled={locked} onFocus={() => onFocus?.(q.n)} onChange={(e) => onChange(q.n, e.target.value)}>
                  <option value="">—</option>
                  {g.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      );

    case "people-match":
      return (
        <div className="qgroup">
          {header}
          <div className="tfng">
            {g.questions.map((q) => (
              <div key={q.n} className={`row ${statusCls(q.n)}`} id={`q-${q.n}`}>
                <span className="n">{q.n}</span>
                <span className="txt">{q.text} <ReviewBtn n={q.n} /><ResultLine n={q.n} /></span>
                <select value={answers[q.n] ?? ""} disabled={locked} onFocus={() => onFocus?.(q.n)} onChange={(e) => onChange(q.n, e.target.value)}>
                  <option value="">—</option>
                  {g.options.map((o) => <option key={o.k} value={o.k}>{o.k}</option>)}
                </select>
              </div>
            ))}
          </div>
          <OptionBox options={g.options} title={g.optionsTitle} />
        </div>
      );

    case "tfng":
    case "ynng": {
      const opts = g.type === "tfng" ? ["TRUE", "FALSE", "NOT GIVEN"] : ["YES", "NO", "NOT GIVEN"];
      return (
        <div className="qgroup">
          {header}
          <div className="legend">
            {g.legend.map(([k, v]) => (
              <Fragment key={k}><b>{k}</b><span>{v}</span></Fragment>
            ))}
          </div>
          <div className="tfng">
            {g.questions.map((q) => (
              <div key={q.n} className={`row ${statusCls(q.n)}`} id={`q-${q.n}`}>
                <span className="n">{q.n}</span>
                <span className="txt">{q.text} <ReviewBtn n={q.n} /><ResultLine n={q.n} /></span>
                <select value={answers[q.n] ?? ""} disabled={locked} onFocus={() => onFocus?.(q.n)} onChange={(e) => onChange(q.n, e.target.value)}>
                  <option value="">—</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      );
    }
  }
}

function rangeResults(g: Group, ResultLine: ({ n }: { n: number }) => ReactNode, show?: boolean) {
  if (!show) return null;
  const out: ReactNode[] = [];
  for (let n = g.range[0]; n <= g.range[1]; n++) out.push(<div key={n} style={{ display: "flex", gap: 6 }}><span className="small muted" style={{ minWidth: 22 }}>{n}</span><ResultLine n={n} /></div>);
  return <div style={{ marginTop: 8 }}>{out}</div>;
}

function OptionBox({ options, title }: { options: Option[]; title?: string }) {
  return (
    <div className="matchbox">
      {title && <div className="t">{title}</div>}
      {options.map((o) => (
        <div key={o.k}><span className="k">{o.k}</span><span>{o.text}</span></div>
      ))}
    </div>
  );
}

/** 拖拽配对：把左侧选项 chip 拖到题目后面的框里；也支持下拉选择作为备选 */
function MatchItems({ items, options, answers, onChange, locked, statusCls, ReviewBtn, ResultLine, onFocus }: {
  items: { n: number; text: string }[];
  options: Option[];
  answers: Answers;
  onChange: (n: number, v: string) => void;
  locked: boolean;
  statusCls: (n: number) => string;
  ReviewBtn: ({ n }: { n: number }) => ReactNode;
  ResultLine: ({ n }: { n: number }) => ReactNode;
  onFocus?: (n: number) => void;
}) {
  const [over, setOver] = useState<number | null>(null);
  return (
    <div className="match-items">
      {!locked && (
        <div className="chips">
          {options.map((o) => (
            <span key={o.k} className="chip" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", o.k)} title="拖到右侧题目框内">
              <span className="k">{o.k}</span>{o.text.length > 28 ? o.text.slice(0, 28) + "…" : o.text}
            </span>
          ))}
        </div>
      )}
      {items.map((it) => (
        <div key={it.n} className={`row ${statusCls(it.n)}`} id={`q-${it.n}`}>
          <span className="n">{it.n}</span>
          <span style={{ flex: 1 }}>{it.text} <ReviewBtn n={it.n} /><ResultLine n={it.n} /></span>
          <span
            className={`drop ${over === it.n ? "over" : ""}`}
            onDragOver={(e) => { if (!locked) { e.preventDefault(); setOver(it.n); } }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); if (!locked) { onChange(it.n, e.dataTransfer.getData("text/plain")); onFocus?.(it.n); } }}
          >
            {answers[it.n] || "拖到这里"}
          </span>
          <select value={answers[it.n] ?? ""} disabled={locked} onFocus={() => onFocus?.(it.n)} onChange={(e) => onChange(it.n, e.target.value)}>
            <option value="">—</option>
            {options.map((o) => <option key={o.k} value={o.k}>{o.k}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}

function SelectGapText({ text, options, answers, onChange, locked, statusCls, onFocus }: {
  text: string; options: Option[]; answers: Answers; onChange: (n: number, v: string) => void; locked: boolean; statusCls: (n: number) => string; onFocus?: (n: number) => void;
}) {
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = /\{\{(\d+)\}\}/g;
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index));
    const n = Number(m[1]);
    parts.push(
      <span key={n} className={`gap ${statusCls(n)}`} id={`q-${n}`}>
        <span className="n">{n}</span>
        <select value={answers[n] ?? ""} disabled={locked} onFocus={() => onFocus?.(n)} onChange={(e) => onChange(n, e.target.value)} style={{ height: 26, border: "none", borderBottom: "1.5px solid #333", background: "transparent" }}>
          <option value="">……</option>
          {options.map((o) => <option key={o.k} value={o.k}>{o.k}</option>)}
        </select>
      </span>,
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <div className="summary-text">{parts}</div>;
}
