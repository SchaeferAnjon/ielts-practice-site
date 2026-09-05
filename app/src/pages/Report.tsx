import { Link, useParams } from "react-router-dom";
import AnswerSheet from "../components/AnswerSheet";
import { storage } from "../services/storage";

const MOD: Record<string, string> = { listening: "听力", reading: "阅读", writing: "写作", speaking: "口语" };

export default function Report() {
  const { id = "" } = useParams();
  const a = storage.getAttempt(id);
  if (!a) return <div className="empty">没有找到这次练习记录</div>;
  const wrong = a.results.filter((r) => !r.ok);
  const parts = a.module === "listening" ? [[1, 10], [11, 20], [21, 30], [31, 40]] : a.module === "reading" ? [[1, 13], [14, 26], [27, 40]] : [];
  const extra = a.extra as { dims?: { label: string; band: number }[]; words?: number } | undefined;
  return (
    <div className="wrap" style={{ paddingTop: 20 }}>
      <div className="report-hero">
        <div className="score">{a.band}<small>Band</small></div>
        <div className="meta">
          <h2>{MOD[a.module]} · {a.paperTitle}</h2>
          <p>{a.module === "writing" ? `字数 ${extra?.words ?? "—"} · 四维平均 ${a.band}` : `答对 ${a.score} / ${a.total}`} · {new Date(a.at).toLocaleString()}</p>
          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <Link className="btn cta grad" to={`/${a.module}/${a.paperId}`} style={{ height: 44, fontSize: 15 }}>{a.module === "writing" ? "再写一篇" : "重新做这套题"}</Link>
            <Link className="btn" to="/errors" style={{ height: 44 }}>去错题本</Link>
          </div>
        </div>
      </div>

      {parts.length > 0 && (
        <div className="score-grid">
          {parts.map(([s, e], i) => {
            const rs = a.results.filter((r) => r.n >= s && r.n <= e);
            return <div key={i} className="cell"><b>{rs.filter((r) => r.ok).length} / {rs.length}</b><span>{a.module === "listening" ? `Part ${i + 1}` : `Passage ${i + 1}`}</span></div>;
          })}
          <div className="cell"><b style={{ color: "var(--brand)" }}>{a.band}</b><span>换算 Band</span></div>
        </div>
      )}
      {extra?.dims && (
        <div className="score-grid">
          {extra.dims.map((d) => <div key={d.label} className="cell"><b>{d.band.toFixed(1)}</b><span>{d.label}</span></div>)}
        </div>
      )}

      {a.results.length > 0 && (
        <>
          <div className="card" style={{ padding: 16, marginTop: 16 }}>
            <b>答题卡</b>
            <div style={{ marginTop: 8 }}><AnswerSheet total={a.total} answers={{}} results={a.results} /></div>
          </div>
          <div className="card report-list">
            <div className="row head"><span>#</span><span>你的答案</span><span>正确答案</span><span>结果</span><span></span></div>
            {a.results.map((r) => (
              <div key={r.n} className="row">
                <span>{r.n}</span>
                <span className={r.ok ? "ok" : "bad"}>{r.user || "（空）"}</span>
                <span>{r.correct.join(" / ")}</span>
                <span className={r.ok ? "ok" : "bad"}>{r.ok ? "✓" : "✗"}</span>
                <span>{storage.hasError(`${a.module}.${a.paperId}.${r.n}`) ? <span className="tag gray">已在错题本</span> : null}</span>
              </div>
            ))}
          </div>
          <div className="muted small" style={{ margin: "10px 0 30px" }}>错题 {wrong.length} 道。回到做题页可对每道题使用「错因分析 / 定位原文」与「加入错题本」。</div>
        </>
      )}
    </div>
  );
}
