import { useState } from "react";
import { storage } from "../services/storage";
import type { ErrorItem } from "../data/types";

const QTYPES = ["填空", "单选", "多选", "配对", "判断 T/F/NG", "段落信息匹配", "摘要选词", "其他"];

export default function ErrorBookModal({ item, onDone, onClose }: { item: Omit<ErrorItem, "qtype" | "note" | "at">; onDone: () => void; onClose: () => void }) {
  const [qtype, setQtype] = useState(QTYPES[0]);
  const [note, setNote] = useState("");
  return (
    <div className="mask" onClick={onClose}>
      <div className="eb-modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>加入错题本 · 第 {item.n} 题</h3>
        <div className="small muted" style={{ marginTop: 6, lineHeight: 1.6 }}>{item.text}</div>
        <label>题型</label>
        <div className="qt_btns" style={{ flexWrap: "wrap" }}>
          {QTYPES.map((t) => (
            <button key={t} className={`qt_btn ${qtype === t ? "on" : ""}`} onClick={() => setQtype(t)}>{t}</button>
          ))}
        </div>
        <label>备注（错因 / 提醒自己什么）</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="例如：没看到 not，同义替换没认出来…" />
        <div className="modal foot" style={{ padding: 0, background: "transparent", width: "auto", marginTop: 16 }}>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={() => { storage.addError({ ...item, qtype, note, at: Date.now() }); onDone(); }}>保存</button>
        </div>
      </div>
    </div>
  );
}
