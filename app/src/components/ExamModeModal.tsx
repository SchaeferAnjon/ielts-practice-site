import { useState } from "react";
import type { ExamMode } from "../data/types";

const MODES: { id: ExamMode; icon: string; title: string; desc: string }[] = [
  { id: "paper", icon: "📝", title: "纸笔考", desc: "答题卡风格，先做题后统一填写答案；适合习惯纸质真题的同学。" },
  { id: "cbt", icon: "💻", title: "机考", desc: "复刻当前官方机考界面：分屏阅读、Highlight / Notes / Review、下划线填空。推荐。" },
  { id: "cbt-old", icon: "🖥️", title: "旧机考", desc: "2023 年以前的机考界面风格（更紧凑的题目布局），仅界面细节不同。" },
];

export default function ExamModeModal({ current, onSelect, onClose }: { current: ExamMode | null; onSelect: (m: ExamMode) => void; onClose?: () => void }) {
  const [sel, setSel] = useState<ExamMode>(current ?? "cbt");
  return (
    <div className="mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>请选择考试模式</h2>
        <div className="sub">选择后所有科目的做题界面按该模式呈现，可随时在顶部切换。</div>
        <div className="mode-cards">
          {MODES.map((m) => (
            <div key={m.id} className={`mode-card ${sel === m.id ? "selected" : ""}`} onClick={() => setSel(m.id)}>
              <div className="icon">{m.icon}</div>
              <h3>{m.title}</h3>
              <p>{m.desc}</p>
            </div>
          ))}
        </div>
        <div className="foot">
          {onClose && <button className="btn" onClick={onClose}>取消</button>}
          <button className="btn grad" onClick={() => onSelect(sel)}>确定进入</button>
        </div>
      </div>
    </div>
  );
}
