import type { ReactNode } from "react";
import { getAiMode } from "../services/ai";

export default function AiPanel({ title, loading, children, onClose }: { title: string; loading?: boolean; children?: ReactNode; onClose?: () => void }) {
  return (
    <div className="ai-panel">
      <h4>
        ✨ {title}
        <span className="badge">{getAiMode() === "live" ? "真实模型" : "本地模拟"}</span>
        {onClose && <button className="btn sm" style={{ marginLeft: "auto" }} onClick={onClose}>收起</button>}
      </h4>
      {loading ? <div className="loading">AI 分析中…</div> : children}
    </div>
  );
}
