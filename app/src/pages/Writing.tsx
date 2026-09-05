import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AiPanel from "../components/AiPanel";
import { fmtClock, useTimer } from "../components/useTimer";
import { paperUrl, useJson } from "../services/data";
import { countWords } from "../services/scoring";
import { storage, uid } from "../services/storage";
import { gradeWriting, type WritingGrade } from "../services/ai";
import type { WritingPaper } from "../data/types";

export default function Writing() {
  const { id = "c21t1" } = useParams();
  const { data: paper, error } = useJson<WritingPaper>(paperUrl.writing(id));
  const [ti, setTi] = useState(0);
  const [texts, setTexts] = useState<Record<number, string>>(() => ({ 1: storage.getDraft(`writing.${id}.1`), 2: storage.getDraft(`writing.${id}.2`) }));
  const [running, setRunning] = useState(false);
  const [grade, setGrade] = useState<{ task: number; data: WritingGrade | null } | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [toast, setToast] = useState("");
  const total = useRef(60 * 60);
  const left = useTimer(total.current, running, () => { setRunning(false); setToast("时间到"); });
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(""), 1800); return () => clearTimeout(t); } }, [toast]);

  if (error) return <div className="empty">{error}</div>;
  if (!paper) return <div className="empty">加载中…</div>;
  const task = paper.tasks[ti];
  const text = texts[task.task] ?? "";
  const words = countWords(text);
  const setText = (v: string) => { setTexts((t) => ({ ...t, [task.task]: v })); storage.setDraft(`writing.${id}.${task.task}`, v); };

  async function submit() {
    if (words < 20) { setToast("至少写 20 个词再提交"); return; }
    setGrade({ task: task.task, data: null });
    const g = await gradeWriting(task, text);
    setGrade({ task: task.task, data: g });
    storage.addAttempt({ id: uid(), module: "writing", paperId: paper!.id, paperTitle: `${paper!.title} Task ${task.task}`, at: Date.now(), score: g.overall, total: 9, band: g.overall, results: [], extra: { words, dims: g.dims } });
    setToast(`AI 批改完成：Band ${g.overall}`);
  }

  return (
    <>
      <div className="exam-bar">
        <div className="wrap">
          <div className="title">WRITING <small>{paper.book} · Test {paper.test}</small></div>
          <div className="right">
            <span className={`timer ${left < 300 ? "warn" : ""}`}>{fmtClock(left)}</span>
            {!running ? <button className="btn ghost sm" onClick={() => setRunning(true)}>开始计时（60 分钟）</button> : <button className="btn ghost sm" onClick={() => setRunning(false)}>暂停</button>}
            <Link className="btn ghost sm" to="/">退出</Link>
          </div>
        </div>
      </div>

      <div className="exam-body">
        <div className="write-wrap">
          <div className="write-list">
            {paper.tasks.map((t, i) => (
              <div key={t.task} className={`item ${i === ti ? "active" : ""}`} onClick={() => { setTi(i); setShowSample(false); }}>
                <b>WRITING TASK {t.task}</b>
                <span>{t.kindZh} · {t.minutes} 分钟 · ≥{t.minWords} 词</span>
                <span style={{ display: "block" }}>{countWords(texts[t.task] ?? "") ? `已写 ${countWords(texts[t.task] ?? "")} 词` : "未开始"}</span>
              </div>
            ))}
            <div className="item" onClick={() => setShowSample((v) => !v)} style={{ color: "var(--exam-blue)" }}>
              <b>{showSample ? "返回题目" : "查看官方范文"}</b>
              <span>Band {task.sample.band} 考生作文 + 考官评语</span>
            </div>
          </div>

          <div className="write-main">
            <div className="write-task">
              {!showSample ? (
                <>
                  <h3>WRITING TASK {task.task}</h3>
                  <div>You should spend about {task.minutes} minutes on this task.</div>
                  <div className="prompt">{task.prompt.map((p, i) => <p key={i}>{p}</p>)}</div>
                  <div>Write at least {task.minWords} words.</div>
                  {task.image && (
                    <>
                      {task.imageCaption && <div className="cap">{task.imageCaption}</div>}
                      <img src={task.image} alt={task.imageCaption ?? "chart"} />
                      {task.data && (
                        <table className="qtable small" style={{ marginTop: 10 }}>
                          <thead><tr><th>{task.data.unit}</th>{task.data.years.map((y) => <th key={y}>{y}</th>)}</tr></thead>
                          <tbody>{Object.entries(task.data.series).map(([k, v]) => <tr key={k}><td>{k}</td>{v.map((x, i) => <td key={i}>{x}</td>)}</tr>)}</tbody>
                        </table>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <h3>TEST {paper.test}, WRITING TASK {task.task} · 范文（Band {task.sample.band}）</h3>
                  <div className="sample">{task.sample.text}</div>
                  <div className="sample-comment"><b>考官评语：</b>{task.sample.comment}</div>
                  {task.sample.exampleOverview && <div className="sample-comment"><b>示范 overview：</b>{task.sample.exampleOverview}</div>}
                </>
              )}
            </div>

            <div className="write-editor">
              <div className="bar">
                <span className="wc">Word count: <b>{words}</b> / {task.minWords}</span>
                <span className="muted">{task.task === 1 ? "建议 20 分钟" : "建议 40 分钟"}</span>
              </div>
              <textarea className="lt_f" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your answer here…" spellCheck={false} />
              <div className="foot">
                <button className="btn" onClick={() => { if (confirm("清空本题草稿？")) setText(""); }}>清空</button>
                <button className="submit-btn" onClick={submit} disabled={grade?.data === null}>提交批改</button>
              </div>
            </div>
          </div>
        </div>

        {grade && grade.task === task.task && (
          <div style={{ marginTop: 16 }}>
            <AiPanel title={`Task ${task.task} · AI 批改`} loading={!grade.data} onClose={() => setGrade(null)}>
              {grade.data && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <span style={{ fontSize: 44, fontWeight: 700, color: "var(--brand)" }}>{grade.data.overall.toFixed(1)}</span>
                    <span>总分（四维平均）· {grade.data.summary}</span>
                  </div>
                  <div className="analysis-chart">
                    {grade.data.dims.map((d) => (
                      <div key={d.key} className="dim"><b>{d.band.toFixed(1)}</b><span>{d.label}</span><div className="small muted" style={{ marginTop: 4 }}>{d.comment}</div></div>
                    ))}
                  </div>
                  <b>逐条问题（{grade.data.issues.length}）</b>
                  {grade.data.issues.length === 0 && <div className="muted">没有发现明显问题。</div>}
                  {grade.data.issues.map((it, i) => (
                    <div key={i} className="issue"><span className="kind">{it.kind}</span><span style={{ fontStyle: "italic" }}>{it.quote}</span><div className="fix">→ {it.fix}</div></div>
                  ))}
                  <div style={{ marginTop: 10 }}><b>改写示例：</b><div className="sample" style={{ marginTop: 6 }}>{grade.data.rewrite}</div></div>
                </>
              )}
            </AiPanel>
          </div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
