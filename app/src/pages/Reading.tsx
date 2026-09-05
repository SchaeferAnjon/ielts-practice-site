import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AnswerSheet from "../components/AnswerSheet";
import QuestionGroup from "../components/QuestionGroup";
import AiPanel from "../components/AiPanel";
import ErrorBookModal from "../components/ErrorBookModal";
import { fmtClock, useTimer } from "../components/useTimer";
import { paperUrl, useJson } from "../services/data";
import { grade, toBand } from "../services/scoring";
import { storage, uid } from "../services/storage";
import { analyzeReadingError, lookupWord, type ReadingAnalysis, type WordEntry } from "../services/ai";
import type { Answers, QuestionResult, ReadingPaper } from "../data/types";

type Note = { id: string; x: number; y: number; quote: string; text: string; passage: number };

export default function Reading() {
  const { id = "c21t1" } = useParams();
  const nav = useNavigate();
  const { data: paper, error } = useJson<ReadingPaper>(paperUrl.reading(id));
  const [pi, setPi] = useState(0);
  const [answers, setAnswers] = useState<Answers>(() => storage.getProgress(`reading.${id}`));
  const [review, setReview] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<QuestionResult[] | null>(null);
  const [current, setCurrent] = useState<number | undefined>();
  const [collapsed, setCollapsed] = useState(false);
  const [highlights, setHighlights] = useState<string[]>(() => storage.getHighlights(`reading.${id}`));
  const [notes, setNotes] = useState<Note[]>(() => storage.getNotes<Note>(`reading.${id}`));
  const [selMenu, setSelMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [dict, setDict] = useState<{ x: number; y: number; entry: WordEntry | null } | null>(null);
  const [analysis, setAnalysis] = useState<{ n: number; data: ReadingAnalysis | null } | null>(null);
  const [locatedPara, setLocatedPara] = useState<string | null>(null);
  const [ebItem, setEbItem] = useState<QuestionResult | null>(null);
  const [toast, setToast] = useState("");
  const [tool, setTool] = useState<"highlight" | "note" | "dict">("highlight");
  const leftRef = useRef<HTMLDivElement>(null);
  const attemptId = useRef("");
  const left = useTimer((paper?.minutes ?? 60) * 60, !!paper && !results, () => submit());

  useEffect(() => storage.setProgress(`reading.${id}`, answers), [answers, id]);
  useEffect(() => storage.setHighlights(`reading.${id}`, highlights), [highlights, id]);
  useEffect(() => storage.setNotes(`reading.${id}`, notes), [notes, id]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 1800); return () => clearTimeout(t); } }, [toast]);

  const passageOf = useMemo(() => (n: number) => paper?.passages.findIndex((p) => p.groups.some((g) => n >= g.range[0] && n <= g.range[1])) ?? 0, [paper]);

  if (error) return <div className="empty">{error}</div>;
  if (!paper) return <div className="empty">加载中…</div>;
  const passage = paper.passages[pi];

  const setAns = (n: number, v: string) => setAnswers((a) => ({ ...a, [n]: v }));
  const toggleReview = (n: number) => setReview((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });

  function submit() {
    if (results) return;
    const r = grade(answers, paper!.answers);
    const score = r.filter((x) => x.ok).length;
    const band = toBand("reading", score, r.length);
    attemptId.current = uid();
    storage.addAttempt({ id: attemptId.current, module: "reading", paperId: paper!.id, paperTitle: paper!.title, at: Date.now(), score, total: r.length, band, results: r });
    setResults(r);
    setToast(`已提交：${score} / ${r.length}，Band ${band}`);
  }
  function reset() {
    setResults(null); setAnswers({}); setReview(new Set()); setAnalysis(null); setLocatedPara(null); storage.clearProgress(`reading.${id}`);
  }

  // ---- 划词：Highlight / Notes / 查词 ----
  const onMouseUp = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? "";
    if (!text || !leftRef.current) { setSelMenu(null); return; }
    const rect = leftRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + leftRef.current.scrollLeft;
    const y = e.clientY - rect.top + leftRef.current.scrollTop;
    if (tool === "dict" && !text.includes(" ")) { void openDict(text, x, y); sel?.removeAllRanges(); return; }
    setSelMenu({ x, y: y + 10, text });
  };
  async function openDict(word: string, x: number, y: number) {
    setDict({ x, y: y + 10, entry: null });
    const entry = await lookupWord(word);
    setDict({ x, y: y + 10, entry });
  }
  const addHighlight = (text: string) => { setHighlights((h) => (h.includes(text) ? h : [...h, text])); setSelMenu(null); window.getSelection()?.removeAllRanges(); };
  const removeHighlight = (text: string) => { setHighlights((h) => h.filter((x) => x !== text)); setSelMenu(null); window.getSelection()?.removeAllRanges(); };
  const addNote = (text: string, x: number, y: number) => { setNotes((n) => [...n, { id: uid(), x: Math.min(x, 480), y, quote: text, text: "", passage: pi }]); setSelMenu(null); window.getSelection()?.removeAllRanges(); };

  /** 把段落文本按 highlights 切成 span */
  const renderPara = (text: string) => {
    const hs = highlights.filter((h) => text.includes(h)).sort((a, b) => b.length - a.length);
    if (!hs.length) return text;
    const re = new RegExp(hs.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
    const out: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const hit = m[0];
      out.push(text.slice(last, m.index));
      out.push(<span key={m.index} className="highlighted" title="点击取消高亮" onClick={() => removeHighlight(hit)}>{hit}</span>);
      last = m.index + hit.length;
    }
    out.push(text.slice(last));
    return out;
  };

  async function analyze(n: number) {
    setPi(passageOf(n));
    setAnalysis({ n, data: null });
    const r = results?.find((x) => x.n === n);
    const d = await analyzeReadingError(paper!, n, r?.user ?? "");
    setAnalysis({ n, data: d });
    const loc = paper!.explain?.[String(n)]?.loc;
    if (loc) { setLocatedPara(loc); setTimeout(() => document.getElementById(`para-${loc}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60); }
  }
  const jump = (n: number) => { setPi(passageOf(n)); setCurrent(n); setTimeout(() => document.getElementById(`q-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); };
  const qText = (n: number) => {
    for (const p of paper!.passages) for (const g of p.groups) {
      if (n < g.range[0] || n > g.range[1]) continue;
      if ("questions" in g) { const q = g.questions.find((x) => x.n === n); if (q) return q.text; }
      if ("items" in g) { const it = g.items.find((x) => x.n === n); if (it) return it.text; }
      if ("lines" in g) return g.lines.find((l) => l.includes(`{{${n}}}`)) ?? g.instruction;
      if ("text" in g && typeof g.text === "string") { const i = g.text.indexOf(`{{${n}}}`); return i >= 0 ? "…" + g.text.slice(Math.max(0, i - 80), i + 40) + "…" : g.text; }
      return g.instruction;
    }
    return `第 ${n} 题`;
  };

  return (
    <>
      <div className="exam-bar">
        <div className="wrap">
          <div className="title">READING <small>{paper.book} · Test {paper.test}</small></div>
          <div className="right">
            <span className={`timer ${left < 300 ? "warn" : ""}`}>{fmtClock(left)}</span>
            <Link className="btn ghost sm" to="/">退出</Link>
          </div>
        </div>
      </div>

      <div className="exam-body">
        <div className="read-head">
          <span>READING PASSAGE {passage.n}</span>
          <div className="tools">
            {paper.passages.map((p, i) => (
              <button key={p.n} className={i === pi ? "on" : ""} onClick={() => setPi(i)}>Passage {p.n}</button>
            ))}
            <span style={{ width: 12 }} />
            <button className={tool === "highlight" ? "on" : ""} onClick={() => setTool("highlight")} title="选中文字后高亮">🖍 Highlight</button>
            <button className={tool === "note" ? "on" : ""} onClick={() => setTool("note")} title="选中文字后贴便签">📝 Notes</button>
            <button className={tool === "dict" ? "on" : ""} onClick={() => setTool("dict")} title="双击/选中单词查词">📖 查词</button>
            <button onClick={() => { setHighlights([]); setNotes([]); }} title="清除本篇所有高亮与便签">清除</button>
          </div>
        </div>

        <div className={`split ${collapsed ? "collapsed" : ""}`}>
          {collapsed && <button className="collapse-tab" onClick={() => setCollapsed(false)}>展开文章 ▶</button>}
          <div className="left passage" ref={leftRef} onMouseUp={onMouseUp} onDoubleClick={(e) => { if (tool !== "dict") return; const w = window.getSelection()?.toString().trim(); if (w && leftRef.current) { const r = leftRef.current.getBoundingClientRect(); void openDict(w, e.clientX - r.left, e.clientY - r.top + leftRef.current.scrollTop); } }}>
            <div className="small muted" style={{ marginBottom: 8 }}>{passage.intro}</div>
            <h2>{passage.title}</h2>
            {passage.subtitle && <div className="subtitle">{passage.subtitle}</div>}
            {passage.paragraphs.map((p) =>
              p.text.split("\n\n").map((chunk, ci) => (
                <p key={p.id + ci} id={ci === 0 ? `para-${p.id}` : undefined} className={locatedPara === p.id ? "located" : ""}>
                  {ci === 0 && p.label && <span className="lbl">{p.label}</span>}
                  {renderPara(chunk)}
                </p>
              )),
            )}
            {passage.footnotes && <div className="fn">{passage.footnotes.map((f) => <div key={f}>{f}</div>)}</div>}

            {selMenu && (
              <div className="sel-menu" style={{ left: selMenu.x, top: selMenu.y }}>
                <button onClick={() => addHighlight(selMenu.text)}>🖍 Highlight</button>
                <button onClick={() => addNote(selMenu.text, selMenu.x, selMenu.y)}>📝 Note</button>
                {!selMenu.text.includes(" ") && <button onClick={() => { void openDict(selMenu.text, selMenu.x, selMenu.y); setSelMenu(null); }}>📖 查词</button>}
                {highlights.includes(selMenu.text) && <button onClick={() => removeHighlight(selMenu.text)}>取消高亮</button>}
                <button onClick={() => setSelMenu(null)}>✕</button>
              </div>
            )}
            {notes.filter((n) => n.passage === pi).map((n) => (
              <NoteCard key={n.id} note={n} onChange={(t) => setNotes((ns) => ns.map((x) => (x.id === n.id ? { ...x, text: t } : x)))} onMove={(x, y) => setNotes((ns) => ns.map((q) => (q.id === n.id ? { ...q, x, y } : q)))} onClose={() => setNotes((ns) => ns.filter((x) => x.id !== n.id))} />
            ))}
            {dict && (
              <div className="dict" style={{ left: Math.min(dict.x, 440), top: dict.y }}>
                {dict.entry ? (
                  <>
                    <h4>{dict.entry.word}<button onClick={() => setDict(null)}>✕</button></h4>
                    {dict.entry.phonetic && <div className="ph">{dict.entry.phonetic}</div>}
                    {dict.entry.defs.map((d, i) => <div key={i} className="def"><i>{d.pos}</i>{d.def}{d.zh && <span className="muted">　{d.zh}</span>}</div>)}
                    {dict.entry.example && <div className="eg">{dict.entry.example}</div>}
                  </>
                ) : <div className="muted">查询中…</div>}
              </div>
            )}
          </div>
          {!collapsed && <button className="collapse-tab" onClick={() => setCollapsed(true)} title="折叠文章">◀ 折叠</button>}
          <div className="right qpaper" style={{ boxShadow: "none" }}>
            {passage.groups.map((g) => (
              <QuestionGroup
                key={g.range.join("-")}
                group={g}
                answers={answers}
                onChange={setAns}
                results={results}
                review={review}
                onToggleReview={toggleReview}
                onFocus={setCurrent}
                extraAfter={(n) => results ? (
                  <span style={{ marginLeft: 10 }}>
                    <button className="btn sm" onClick={() => analyze(n)}>✨ {results.find((r) => r.n === n)?.ok ? "看解析" : "错因分析"}</button>
                    {!results.find((r) => r.n === n)?.ok && <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => setEbItem(results.find((r) => r.n === n)!)}>+ 错题本</button>}
                  </span>
                ) : null}
              />
            ))}
            {analysis && (
              <div style={{ marginTop: 16 }}>
                <AiPanel title={`第 ${analysis.n} 题 · 错因分析`} loading={!analysis.data} onClose={() => { setAnalysis(null); setLocatedPara(null); }}>
                  {analysis.data && (
                    <>
                      <div className="row"><b>你的答案</b><span style={{ color: "var(--err)" }}>{analysis.data.userAnswer}</span></div>
                      <div className="row"><b>正确答案</b><span style={{ color: "var(--ok)" }}>{analysis.data.correctAnswer}</span></div>
                      <div className="row"><b>原文定位</b><span>{analysis.data.location}（左侧已高亮）</span></div>
                      <div className="row"><b>定位句</b><span style={{ fontStyle: "italic" }}>“{analysis.data.keySentence}”</span></div>
                      <div className="row"><b>同义替换</b><span>{analysis.data.paraphrase}</span></div>
                      <div className="row"><b>为什么</b><span>{analysis.data.reason}</span></div>
                      <div className="row"><b>建议</b><span>{analysis.data.tip}</span></div>
                    </>
                  )}
                </AiPanel>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="exam-foot">
        <div className="wrap">
          <AnswerSheet total={40} answers={answers} review={review} results={results} current={current} onJump={jump} />
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {results ? (
              <>
                <button className="btn" onClick={reset}>重做</button>
                <button className="btn primary" onClick={() => nav(`/report/${attemptId.current}`)}>查看报告</button>
              </>
            ) : <button className="submit-btn" onClick={submit}>提交</button>}
          </div>
        </div>
      </div>

      {ebItem && (
        <ErrorBookModal
          item={{ id: `reading.${id}.${ebItem.n}`, module: "reading", paperId: id, paperTitle: paper.title, n: ebItem.n, text: qText(ebItem.n), user: ebItem.user, correct: ebItem.correct }}
          onDone={() => { setEbItem(null); setToast("已加入错题本"); }}
          onClose={() => setEbItem(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

function NoteCard({ note, onChange, onMove, onClose }: { note: Note; onChange: (t: string) => void; onMove: (x: number, y: number) => void; onClose: () => void }) {
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  return (
    <div
      className="note"
      style={{ left: note.x, top: note.y }}
      onMouseMove={(e) => { if (drag.current) { const parent = (e.currentTarget.offsetParent as HTMLElement).getBoundingClientRect(); onMove(e.clientX - parent.left - drag.current.dx + (e.currentTarget.offsetParent as HTMLElement).scrollLeft, e.clientY - parent.top - drag.current.dy + (e.currentTarget.offsetParent as HTMLElement).scrollTop); } }}
      onMouseUp={() => (drag.current = null)}
      onMouseLeave={() => (drag.current = null)}
    >
      <div className="handle" onMouseDown={(e) => { const r = e.currentTarget.parentElement!.getBoundingClientRect(); drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }; e.preventDefault(); }}>
        <span>Note</span>
        <button onClick={onClose} title="删除便签">✕</button>
      </div>
      <div className="quote">“{note.quote}”</div>
      <textarea value={note.text} onChange={(e) => onChange(e.target.value)} placeholder="写点笔记…" />
    </div>
  );
}
