import { useEffect, useMemo, useRef, useState } from "react";
import AiPanel from "../components/AiPanel";
import { paperUrl, useJson } from "../services/data";
import { generateSpeakingAnswer, scoreSpeaking, type SpeakingAnswer, type SpeakingScore } from "../services/ai";
import type { SpeakingBank, SpeakingTopic } from "../data/types";

const CATS = [["all", "全部"], ["new", "本季新题"], ["retained", "保留话题"], ["evergreen", "必考话题"]] as const;
const THEMES = [["all", "全部"], ["people", "人物"], ["place", "地点"], ["event", "经历"], ["thing", "事物"]] as const;

export default function Speaking() {
  const { data: seasons } = useJson<{ file: string; label: string }[]>(paperUrl.speakingSeasons());
  const [seasonFile, setSeasonFile] = useState("speaking.json");
  const { data: bank, error } = useJson<SpeakingBank>(paperUrl.speaking(seasonFile));
  const [part, setPart] = useState<1 | 2>(1);
  const [cat, setCat] = useState<string>("all");
  const [theme, setTheme] = useState<string>("all");
  const [region, setRegion] = useState<"mainland" | "all">("mainland");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<SpeakingTopic | null>(null);
  const [ans, setAns] = useState<Record<string, SpeakingAnswer | "loading">>({});
  const [keywords, setKeywords] = useState("");
  const [cueAns, setCueAns] = useState<SpeakingAnswer | "loading" | null>(null);

  const list = useMemo(() => {
    if (!bank) return [];
    const kw = q.trim().toLowerCase();
    return bank.topics.filter((t) =>
      t.part === part &&
      (cat === "all" || t.category === cat) &&
      (region === "all" || t.region === region) &&
      (part === 1 || theme === "all" || t.theme === theme) &&
      (!kw || t.title.toLowerCase().includes(kw) || (t.titleZh ?? "").includes(kw) || t.questions.some((x) => x.text.toLowerCase().includes(kw)) || t.part3.some((x) => x.text.toLowerCase().includes(kw))),
    );
  }, [bank, part, cat, region, theme, q]);

  useEffect(() => { if (list.length && (!sel || !list.includes(sel))) setSel(list[0]); }, [list, sel]);
  useEffect(() => { setCueAns(null); setAns({}); setKeywords(""); }, [sel]);

  if (error) return <div className="empty">{error}</div>;
  if (!bank) return <div className="empty">加载题库中…</div>;

  async function gen(topic: SpeakingTopic, question: string) {
    setAns((a) => ({ ...a, [question]: "loading" }));
    const r = await generateSpeakingAnswer(topic, question, keywords);
    setAns((a) => ({ ...a, [question]: r }));
  }
  async function genCue(topic: SpeakingTopic) {
    setCueAns("loading");
    setCueAns(await generateSpeakingAnswer(topic, undefined, keywords));
  }
  const meta = bank.meta as { season?: string; topics?: number; questions?: number; answered?: number; source?: string };

  return (
    <div className="wrap" style={{ paddingTop: 20 }}>
      <div className="card" style={{ padding: "16px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ margin: 0 }}>雅思口语题库 <span className="tag red">{meta.season}</span>
            {seasons && seasons.length > 1 && (
              <select className="ai-input" style={{ width: "auto", marginLeft: 10, height: 28, fontSize: 13 }} value={seasonFile} onChange={(e) => { setSeasonFile(e.target.value); setSel(null); }}>
                {seasons.map((x) => <option key={x.file} value={x.file}>{x.label}</option>)}
              </select>
            )}
          </h2>
          <span className="small muted">来源：{meta.source}（文字版 PDF 全量抽取）· {meta.topics} 个话题 / {meta.questions} 道题 · {meta.answered} 题带真实参考答案</span>
        </div>
        <div className="filter-row">
          <span className="lbl">部分</span>
          <div className="qt_btns">
            <button className={`qt_btn ${part === 1 ? "on" : ""}`} onClick={() => setPart(1)}>Part 1</button>
            <button className={`qt_btn ${part === 2 ? "on" : ""}`} onClick={() => setPart(2)}>Part 2 & 3</button>
          </div>
          <span className="lbl">类别</span>
          <div className="qt_btns">{CATS.map(([k, v]) => <button key={k} className={`qt_btn ${cat === k ? "on" : ""}`} onClick={() => setCat(k)}>{v}</button>)}</div>
          {part === 2 && (
            <>
              <span className="lbl">主题</span>
              <div className="qt_btns">{THEMES.map(([k, v]) => <button key={k} className={`qt_btn ${theme === k ? "on" : ""}`} onClick={() => setTheme(k)}>{v}</button>)}</div>
            </>
          )}
          <span className="lbl">考区</span>
          <div className="qt_btns">
            <button className={`qt_btn ${region === "mainland" ? "on" : ""}`} onClick={() => setRegion("mainland")}>大陆</button>
            <button className={`qt_btn ${region === "all" ? "on" : ""}`} onClick={() => setRegion("all")}>含非大陆</button>
          </div>
          <input className="search" placeholder="搜索话题 / 题目关键词…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="speak-layout">
        <div className="card topic-list">
          {list.length === 0 && <div className="empty">没有符合条件的话题</div>}
          {list.map((t) => (
            <div key={t.id} className={`topic ${sel?.id === t.id ? "active" : ""}`} onClick={() => setSel(t)}>
              <div className="t">
                {t.part === 2 ? t.title : t.title}
                <small>{t.titleZh ?? ""}{t.part === 1 ? `${t.questions.length} 问` : ` · Part 3 ${t.part3.length} 问`}{t.answer || t.questions.some((x) => x.answer) || t.part3.some((x) => x.answer) ? " · 有答案" : ""}</small>
              </div>
              <span className={`tag ${t.category === "new" ? "red" : t.category === "evergreen" ? "green" : "gray"}`}>{t.category === "new" ? "新题" : t.category === "evergreen" ? "必考" : "保留"}</span>
            </div>
          ))}
        </div>

        {sel && (
          <div className="card topic-detail">
            <h2>{sel.part === 2 ? sel.cue?.title : sel.title}</h2>
            <div className="small muted">{sel.titleZh} · Part {sel.part}{sel.part === 2 ? " & 3" : ""} · {sel.region === "mainland" ? "大陆考区" : "非大陆考区"}</div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0" }}>
              <input className="search" style={{ width: 320 }} placeholder="AI 定制素材：输入你的关键词（如 my hometown Chengdu, hotpot）" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
              <span className="small muted">生成答案时会把关键词编进例子里</span>
            </div>

            {sel.part === 2 && sel.cue && (
              <>
                <div className="cue-card">
                  <b>{sel.cue.title}</b>
                  <div>You should say:</div>
                  <ul className="pts">{sel.cue.points.map((p) => <li key={p}>{p}</li>)}</ul>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="btn primary sm" onClick={() => genCue(sel)}>✨ 生成 Part 2 参考答案</button>
                  <Recorder label="录 Part 2（1-2 分钟）" />
                </div>
                {cueAns && (
                  <div style={{ marginTop: 10 }}>
                    <AiPanel title="Part 2 参考答案" loading={cueAns === "loading"}>
                      {cueAns !== "loading" && <AnswerBody a={cueAns} />}
                    </AiPanel>
                  </div>
                )}
                <h3 style={{ margin: "18px 0 6px" }}>Part 3</h3>
              </>
            )}

            <div className="qlist">
              {(sel.part === 1 ? sel.questions : sel.part3).map((qq, i) => (
                <div key={i} className="qi">
                  <div className="q">
                    <span>{i + 1}. {qq.text}</span>
                    <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button className="btn sm" onClick={() => gen(sel, qq.text)}>✨ {qq.answer ? "参考答案" : "AI 答案"}</button>
                    </span>
                  </div>
                  {ans[qq.text] && (
                    <div className="a">
                      {ans[qq.text] === "loading" ? <span className="muted">生成中…</span> : <AnswerBody a={ans[qq.text] as SpeakingAnswer} compact />}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {sel.part === 1 && <div style={{ marginTop: 12 }}><Recorder label="录一段 Part 1 回答" /></div>}
          </div>
        )}
      </div>
    </div>
  );
}

function AnswerBody({ a, compact }: { a: SpeakingAnswer; compact?: boolean }) {
  return (
    <>
      <div style={{ whiteSpace: "pre-line" }}>{a.answer}</div>
      {a.answerZh && <div className="zh">{a.answerZh}</div>}
      {!compact && (
        <>
          <div style={{ marginTop: 8 }}><b>答题结构：</b><ol style={{ margin: "4px 0 0", paddingLeft: 20 }}>{a.structure.map((s) => <li key={s}>{s}</li>)}</ol></div>
          <div style={{ marginTop: 6 }}><b>高分短语：</b>{a.phrases.map((p) => <span key={p} className="tag" style={{ margin: "2px 4px 2px 0" }}>{p}</span>)}</div>
        </>
      )}
      <div className="src">{a.source === "bank" ? "来源：题库附带的真实参考答案（含中文翻译）" : a.source === "live" ? "来源：真实模型生成" : "来源：本地模板（未接入模型，仅演示结构）；此题题库无现成答案"}</div>
    </>
  );
}

function Recorder({ label }: { label: string }) {
  const [state, setState] = useState<"idle" | "rec" | "done">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [secs, setSecs] = useState(0);
  const [score, setScore] = useState<SpeakingScore | "loading" | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const [err, setErr] = useState("");

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => chunks.current.push(e.data);
      mr.onstop = () => {
        setUrl(URL.createObjectURL(new Blob(chunks.current, { type: mr.mimeType })));
        stream.getTracks().forEach((t) => t.stop());
        setState("done");
      };
      mr.start();
      rec.current = mr;
      setSecs(0);
      setScore(null);
      setState("rec");
      timer.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    } catch {
      setErr("无法访问麦克风（需要 https 或 localhost，并允许权限）");
    }
  }
  function stop() {
    rec.current?.stop();
    if (timer.current) clearInterval(timer.current);
  }
  async function evaluate() {
    setScore("loading");
    setScore(await scoreSpeaking(secs));
  }
  return (
    <div className="rec">
      {state !== "rec" ? <button className="btn sm" onClick={start}>🎙 {label}</button> : <button className="btn sm primary" onClick={stop}><span className="dot" /> 停止（{secs}s）</button>}
      {url && <audio controls src={url} style={{ height: 30 }} />}
      {state === "done" && <button className="btn sm" onClick={evaluate}>✨ 模拟评分</button>}
      {score && score !== "loading" && <span className="small">流利 {score.fluency} · 词汇 {score.lexical} · 语法 {score.grammar} · 发音 {score.pronunciation} → <b style={{ color: "var(--brand)" }}>{score.overall}</b>　<span className="muted">{score.comment}</span></span>}
      {score === "loading" && <span className="small muted">评分中…</span>}
      {err && <span className="small" style={{ color: "var(--err)" }}>{err}</span>}
    </div>
  );
}
