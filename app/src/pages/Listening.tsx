import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AudioPlayer, { type AudioHandle } from "../components/AudioPlayer";
import AnswerSheet from "../components/AnswerSheet";
import QuestionGroup from "../components/QuestionGroup";
import AiPanel from "../components/AiPanel";
import ErrorBookModal from "../components/ErrorBookModal";
import IssueModal from "../components/IssueModal";
import { fmtClock, useTimer } from "../components/useTimer";
import { audioUrl, paperUrl, useIndex, useJson } from "../services/data";
import { grade, toBand } from "../services/scoring";
import { storage, uid } from "../services/storage";
import { lineTimes, locateListeningSentence, type ListeningLocate } from "../services/ai";
import type { Answers, ListeningPaper, QuestionResult } from "../data/types";

export default function Listening() {
  const { id = "c21t1" } = useParams();
  const nav = useNavigate();
  const { data: paper, error } = useJson<ListeningPaper>(paperUrl.listening(id));
  const idx = useIndex();
  const [part, setPart] = useState(0);
  const [answers, setAnswers] = useState<Answers>(() => storage.getProgress(`listening.${id}`));
  const [review, setReview] = useState<Set<number>>(new Set());
  const [results, setResults] = useState<QuestionResult[] | null>(null);
  const [current, setCurrent] = useState<number | undefined>();
  const [started, setStarted] = useState(false);
  const [locate, setLocate] = useState<{ n: number; data: ListeningLocate | null } | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [ebItem, setEbItem] = useState<QuestionResult | null>(null);
  const [issueItem, setIssueItem] = useState<QuestionResult | null>(null);
  const [toast, setToast] = useState("");
  const player = useRef<AudioHandle>(null);
  const attemptId = useRef<string>("");

  const left = useTimer(40 * 60, started && !results, () => submit());

  useEffect(() => storage.setProgress(`listening.${id}`, answers), [answers, id]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 1800); return () => clearTimeout(t); } }, [toast]);

  const multiGroups = useMemo(() => (paper ? paper.parts.flatMap((p) => p.groups.filter((g) => g.type === "mc-multi").map((g) => g.range)) : []), [paper]);
  const multiStarts = useMemo(() => Object.fromEntries(multiGroups.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => [a + i, a]))), [multiGroups]);
  const partOf = (n: number) => paper?.parts.findIndex((p) => p.groups.some((g) => n >= g.range[0] && n <= g.range[1])) ?? 0;

  if (error) return <div className="empty">{error}</div>;
  if (!paper) return <div className="empty">加载中…</div>;
  const cur = paper.parts[part];
  const { times, precise } = lineTimes(cur.transcript, cur.duration);

  const setAns = (n: number, v: string) => setAnswers((a) => ({ ...a, [n]: v }));
  const toggleReview = (n: number) => setReview((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; });

  function submit() {
    if (results) return;
    const r = grade(answers, paper!.answers, multiGroups);
    const score = r.filter((x) => x.ok).length;
    const band = toBand("listening", score, r.length);
    attemptId.current = uid();
    storage.addAttempt({ id: attemptId.current, module: "listening", paperId: paper!.id, paperTitle: paper!.title, at: Date.now(), score, total: r.length, band, results: r });
    setResults(r);
    player.current?.pause();
    setToast(`已提交：${score} / ${r.length}，Band ${band}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reset() {
    setResults(null); setAnswers({}); setReview(new Set()); setLocate(null); setStarted(false); storage.clearProgress(`listening.${id}`);
  }
  async function doLocate(n: number) {
    const pi = partOf(n);
    setPart(pi);
    setLocate({ n, data: null });
    const p = paper!.parts[pi];
    const d = await locateListeningSentence(p.transcript, p.duration, n);
    setLocate({ n, data: d });
    setShowScript(true);
  }
  const jump = (n: number) => {
    setPart(partOf(n));
    setCurrent(n);
    setTimeout(() => document.getElementById(`q-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const qText = (n: number) => {
    for (const p of paper!.parts) for (const g of p.groups) {
      if (n < g.range[0] || n > g.range[1]) continue;
      if ("questions" in g) { const q = g.questions.find((x) => x.n === n); if (q) return q.text; }
      if ("items" in g) { const it = g.items.find((x) => x.n === n); if (it) return `${g.instruction} — ${it.text}`; }
      if ("text" in g && typeof g.text === "string") return g.text;
      if ("lines" in g) return g.lines.find((l) => l.includes(`{{${n}}}`)) ?? g.instruction;
      if ("table" in g) return g.table.rows.flat().find((c) => c.includes(`{{${n}}}`)) ?? g.instruction;
      return g.instruction;
    }
    return `第 ${n} 题`;
  };

  return (
    <>
      <div className="exam-bar">
        <div className="wrap">
          <div className="title">LISTENING <small>{paper.book} · Test {paper.test}</small></div>
          <div className="right">
            <span className={`timer ${left < 300 ? "warn" : ""}`} title="听力 30 分钟 + 10 分钟誊写，按 40 分钟计">{fmtClock(left)}</span>
            <Link className="btn ghost sm" to="/">退出</Link>
          </div>
        </div>
      </div>

      <div className="exam-body">
        {idx && (() => { const meta = idx.papers.find((p) => p.id === id); return meta && meta.audioParts.length > 0 && !meta.audioParts.includes(cur.part) ? <div className="card" style={{ padding: "10px 16px", marginBottom: 10, color: "var(--err)" }}>本 Part 的音频资料里缺失，只能对照原文做题。</div> : null; })()}
        <AudioPlayer ref={player} src={audioUrl(cur.audio, idx)} countdown={null} onEnded={() => { if (part < paper.parts.length - 1 && !results) setToast("本 Part 音频结束，可切换到下一 Part"); }} locked={false} />
        {!started && !results && (
          <div className="card" style={{ padding: "12px 18px", marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>真实考试听力只播放一遍。点击「开始计时」后倒计时 40 分钟；练习时可以随意暂停与重听。</span>
            <button className="btn primary" onClick={() => { setStarted(true); player.current?.play(); }}>开始计时并播放</button>
          </div>
        )}

        <div className="part-tabs">
          {paper.parts.map((p, i) => {
            const done = p.groups.every((g) => { for (let n = g.range[0]; n <= g.range[1]; n++) if (!(answers[multiStarts[n] ?? n] ?? "").trim()) return false; return true; });
            return (
              <button key={p.part} className={i === part ? "active" : ""} onClick={() => setPart(i)}>
                Part {p.part}<span className={`dot ${done ? "done" : ""}`} />
              </button>
            );
          })}
          <button style={{ marginLeft: "auto" }} onClick={() => setShowScript((v) => !v)}>{showScript ? "隐藏原文" : "查看原文"}</button>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div className="qpaper" style={{ flex: 1, minWidth: 0 }}>
            <h3>PART {cur.part}　<span className="muted small">Questions {cur.groups[0].range[0]}-{cur.groups[cur.groups.length - 1].range[1]}</span></h3>
            {cur.groups.map((g) => (
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
                    <button className="btn sm" onClick={() => doLocate(n)}>✨ 定位原文</button>
                    {!results.find((r) => r.n === n)?.ok && (
                      <button className="btn sm" style={{ marginLeft: 6 }} onClick={() => setEbItem(results.find((r) => r.n === n)!)}>+ 错题本</button>
                    )}
                    <button className="btn sm" style={{ marginLeft: 6 }} title="题目或答案有误，记下来" onClick={() => setIssueItem(results.find((r) => r.n === n)!)}>⚑ 报错</button>
                  </span>
                ) : null}
              />
            ))}
          </div>

          {(showScript || locate) && (
            <div style={{ width: 380, flexShrink: 0 }}>
              {locate && (
                <AiPanel title={`第 ${locate.n} 题 · 原文定位`} loading={!locate.data} onClose={() => setLocate(null)}>
                  {locate.data && (
                    <>
                      {locate.data.lines.map((l) => (
                        <div className="row" key={l.idx}>
                          <b><span className="tm" style={{ cursor: "pointer", color: "var(--exam-blue)" }} onClick={() => player.current?.seek(l.time - (locate.data?.precise ? 0.5 : 3))}>▶ {fmtClock(l.time)}{l.end ? `–${fmtClock(l.end)}` : ""}</span></b>
                          <span><b style={{ color: "var(--text-3)" }}>{l.s}: </b>{l.text}</span>
                        </div>
                      ))}
                      <div className="small muted" style={{ marginTop: 6 }}>{locate.data.hint}</div>
                    </>
                  )}
                </AiPanel>
              )}
              {showScript && (
                <div className="card" style={{ padding: 14, marginTop: 12 }}>
                  <b>Part {cur.part} 原文</b> <span className="small muted">（点时间戳跳转{precise ? "，ASR 逐词对齐" : "，时间为估算"}）</span>
                  <div className="transcript" style={{ marginTop: 8 }}>
                    {cur.transcript.map((l, i) => {
                      const hit = locate?.n != null && l.q?.includes(locate.n);
                      return (
                        <div key={i} className={`l ${hit ? "hit" : ""}`} id={`tl-${i}`}>
                          <span className="tm" onClick={() => player.current?.seek(times[i] - (precise ? 0.5 : 3))}>{fmtClock(times[i])}</span>
                          <span className="s">{l.s}</span>
                          <span>{l.t}{l.q && results ? <span className="small muted"> [Q{l.q.join(",")}]</span> : null}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="exam-foot">
        <div className="wrap">
          <AnswerSheet total={40} answers={answers} review={review} results={results} current={current} onJump={jump} multiStarts={multiStarts} />
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {results ? (
              <>
                <button className="btn" onClick={reset}>重做</button>
                <button className="btn primary" onClick={() => nav(`/report/${attemptId.current}`)}>查看报告</button>
              </>
            ) : (
              <button className="submit-btn" onClick={submit}>提交</button>
            )}
          </div>
        </div>
      </div>

      {issueItem && (
        <IssueModal
          item={{ id: `listening.${id}.${issueItem.n}`, module: "listening", paperId: id, paperTitle: paper.title, n: issueItem.n, text: qText(issueItem.n), correct: issueItem.correct }}
          onDone={() => { setIssueItem(null); setToast("已记录报错，可在错题本页复制全部报错"); }}
          onClose={() => setIssueItem(null)}
        />
      )}
      {ebItem && (
        <ErrorBookModal
          item={{ id: `listening.${id}.${ebItem.n}`, module: "listening", paperId: id, paperTitle: paper.title, n: ebItem.n, text: qText(ebItem.n), user: ebItem.user, correct: ebItem.correct }}
          onDone={() => { setEbItem(null); setToast("已加入错题本"); }}
          onClose={() => setEbItem(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
