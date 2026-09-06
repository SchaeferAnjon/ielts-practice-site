import { useState } from "react";
import { getAiConfig, setAiConfig } from "../services/ai";

/** AI 接口设置：存 localStorage，不进构建包。公网部署请把 endpoint 指向带口令的代理，Key 栏填口令。 */
export default function AiSettingsModal({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState(getAiConfig());
  const [msg, setMsg] = useState("");
  const test = async () => {
    setMsg("测试中…");
    try {
      const res = await fetch(cfg.endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` }, body: JSON.stringify({ model: cfg.model, messages: [{ role: "user", content: "回复 ok" }], max_tokens: 5 }) });
      setMsg(res.ok ? "✓ 接口可用" : `✗ 接口返回 ${res.status}`);
    } catch (e) {
      setMsg(`✗ 请求失败：${(e as Error).message}`);
    }
  };
  return (
    <div className="mask" onClick={onClose}>
      <div className="eb-modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>AI 设置</h3>
        <div className="small muted" style={{ marginTop: 6, lineHeight: 1.6 }}>留空 = 本地模拟（不联网）。任何 OpenAI 兼容接口都行；设置只存在这个浏览器里。公网站点建议接口填自己的代理地址、Key 填代理口令，真正的 API Key 放在代理里。</div>
        <label>接口地址（chat/completions）</label>
        <input className="ai-input" value={cfg.endpoint} onChange={(e) => setCfg({ ...cfg, endpoint: e.target.value })} placeholder="https://api.openai.com/v1/chat/completions" />
        <label>模型</label>
        <input className="ai-input" value={cfg.model} onChange={(e) => setCfg({ ...cfg, model: e.target.value })} placeholder="gpt-4o-mini" />
        <label>API Key / 代理口令</label>
        <input className="ai-input" type="password" value={cfg.key} onChange={(e) => setCfg({ ...cfg, key: e.target.value })} placeholder="留空则本地模拟" />
        {msg && <div className="small" style={{ marginTop: 8 }}>{msg}</div>}
        <div className="modal foot" style={{ padding: 0, background: "transparent", width: "auto", marginTop: 16 }}>
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn" disabled={!cfg.key} onClick={test}>测试</button>
          <button className="btn primary" onClick={() => { setAiConfig(cfg); onClose(); }}>保存</button>
        </div>
      </div>
    </div>
  );
}
