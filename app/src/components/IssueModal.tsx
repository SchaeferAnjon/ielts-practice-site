import { useState } from "react";
import { storage } from "../services/storage";
import type { Issue } from "../data/types";

/** 题目报错：记录到本地，错题本页可复制全部报错发给维护者 */
export default function IssueModal({ item, onDone, onClose }: { item: Omit<Issue, "note" | "at">; onDone: () => void; onClose: () => void }) {
  const [note, setNote] = useState("");
  return (
    <div className="mask" onClick={onClose}>
      <div className="eb-modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>题目报错 · 第 {item.n} 题</h3>
        <div className="small muted" style={{ marginTop: 6, lineHeight: 1.6 }}>{item.text}</div>
        <div className="small muted" style={{ marginTop: 4 }}>当前标准答案：{item.correct.join(" / ")}</div>
        <label>哪里不对（答案错 / 题干缺字 / 原文定位错 / 图看不清…）</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：书上答案是 B，这里写成 C" autoFocus />
        <div className="modal foot" style={{ padding: 0, background: "transparent", width: "auto", marginTop: 16 }}>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={!note.trim()} onClick={() => { storage.addIssue({ ...item, note: note.trim(), at: Date.now() }); onDone(); }}>保存</button>
        </div>
      </div>
    </div>
  );
}
