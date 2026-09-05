import { useState } from "react";
import { Link } from "react-router-dom";
import { storage } from "../services/storage";
import type { ErrorItem } from "../data/types";

const MOD: Record<string, string> = { listening: "听力", reading: "阅读", writing: "写作", speaking: "口语" };

export default function ErrorBook() {
  const [items, setItems] = useState<ErrorItem[]>(() => storage.errors());
  const [mod, setMod] = useState("all");
  const [open, setOpen] = useState<ErrorItem | null>(null);
  const list = items.filter((i) => mod === "all" || i.module === mod);
  return (
    <div className="wrap" style={{ paddingTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>错题本 <span className="muted small">{items.length} 道</span></h2>
        <div className="qt_btns" style={{ margin: 0 }}>
          {[["all", "全部"], ["listening", "听力"], ["reading", "阅读"]].map(([k, v]) => <button key={k} className={`qt_btn ${mod === k ? "on" : ""}`} onClick={() => setMod(k)}>{v}</button>)}
        </div>
      </div>
      {list.length === 0 && <div className="empty">还没有错题。做完题提交后，在错题旁点「+ 错题本」。</div>}
      <div className="eb-grid">
        {list.map((it) => (
          <div key={it.id} className="card eb-card" onClick={() => setOpen(it)}>
            <div><span className="tag">{MOD[it.module]}</span> <span className="tag gray">{it.qtype}</span> <span className="small muted">第 {it.n} 题</span></div>
            <div className="q">{it.text}</div>
            <div className="foot"><span>{it.paperTitle}</span><span>{new Date(it.at).toLocaleDateString()}</span></div>
          </div>
        ))}
      </div>
      {open && (
        <div className="mask" onClick={() => setOpen(null)}>
          <div className="eb-modal" onClick={(e) => e.stopPropagation()}>
            <div><span className="tag">{MOD[open.module]}</span> <span className="tag gray">{open.qtype}</span> {open.paperTitle} · 第 {open.n} 题</div>
            <p style={{ lineHeight: 1.7 }}>{open.text}</p>
            <div className="row" style={{ fontSize: 13 }}>你的答案：<span style={{ color: "var(--err)" }}>{open.user || "（空）"}</span>　正确答案：<span style={{ color: "var(--ok)" }}>{open.correct.join(" / ")}</span></div>
            {open.note && <div className="sample" style={{ marginTop: 10 }}>备注：{open.note}</div>}
            <div className="modal foot" style={{ padding: 0, background: "transparent", width: "auto", marginTop: 16 }}>
              <button className="btn" onClick={() => { storage.removeError(open.id); setItems(storage.errors()); setOpen(null); }}>移出错题本</button>
              <Link className="btn primary" to={`/${open.module}/${open.paperId}`}>去重做这套题</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
