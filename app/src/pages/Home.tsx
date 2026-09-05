import { Link } from "react-router-dom";
import { paperUrl, useIndex, useJson } from "../services/data";
import type { SpeakingBank } from "../data/types";
import { storage } from "../services/storage";

const FEATURES = (first: string) => [
  { to: `/listening/${first}`, icon: "🎧", color: "#3794ff", title: "听力", desc: "剑桥真题原声 MP3 + 机考播放器，填空 / 选择 / 配对拖拽，提交即判分。", ai: "AI 原文定位：错题一键跳到对应台词与时间点" },
  { to: `/reading/${first}`, icon: "📖", color: "#ff4b40", title: "阅读", desc: "左文右题分屏，Highlight / Notes / Review 全套机考工具，划词查词。", ai: "AI 错因分析：定位句 + 同义替换 + 为什么错" },
  { to: `/writing/${first}`, icon: "✍️", color: "#766ea5", title: "写作", desc: "Task 1 图表 + Task 2 议论文，实时字数与倒计时，官方范文与考官评语。", ai: "AI 批改：四维分项分 + 逐条问题 + 改写建议" },
  { to: "/speaking", icon: "🎤", color: "#67c23b", title: "口语", desc: "2026 年 5-8 月最新题库，Part 1/2/3 三级筛选，新题 / 保留题 / 高频分类。", ai: "AI 参考答案 + 高分短语 + 浏览器录音回放" },
];

export default function Home() {
  const { data: bank } = useJson<SpeakingBank>(paperUrl.speaking());
  const idx = useIndex();
  const PAPERS = idx?.papers ?? [];
  const attempts = storage.attempts();
  const errors = storage.errors();
  const books = [...new Set(PAPERS.map((p) => p.bookShort))];
  const first = PAPERS.find((p) => p.modules.length)?.id ?? "c21t1";
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>雅思<span>机考</span>真题练习平台</h1>
          <p>按官方机考界面 1:1 复刻的本地刷题站。听说读写四科、自动判分与 9 分制换算、错题本，四类 AI 辅助帮你把每道错题吃透。</p>
          <div style={{ display: "flex", gap: 12 }}>
            <Link className="btn cta grad" to={`/listening/${first}`}>开始一套完整模考</Link>
            <Link className="btn cta" to="/speaking">看本季口语题库</Link>
          </div>
          <div className="stats">
            <div><b>{PAPERS.filter((p) => p.modules.length).length}</b><span>套完整真题已数字化</span></div>
            <div><b>{bank?.topics.length ?? "—"}</b><span>个口语话题（2026 年 5-8 月）</span></div>
            <div><b>{attempts.length}</b><span>次练习记录</span></div>
            <div><b>{errors.length}</b><span>道错题待复习</span></div>
          </div>
        </div>
      </section>

      <section className="section wrap">
        <h2>四科练习 <small>每科都带 AI 辅助，未填 Key 时用本地模拟数据演示</small></h2>
        <div className="feature-grid">
          {FEATURES(first).map((f) => (
            <Link key={f.title} to={f.to} className="card feature">
              <div className="ic" style={{ background: f.color }}>{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
              <div className="ai">✨ {f.ai}</div>
              <div><span className="btn sm primary">进入练习</span></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section wrap">
        <h2>题库分类 <small>剑桥雅思官方真题集 · 学术类（A 类）。灰色为尚未数字化，见 README 用管线扩充。</small></h2>
        <div className="book-grid">
          {books.map((b) => (
            <div key={b} className="card book" id={`book-${b}`}>
              <div className="head a">{b} 学术类 <small>A 类</small></div>
              <div className="tests">
                {PAPERS.filter((p) => p.bookShort === b).map((p) => (
                  <div key={p.id} className="test">
                    <span>Test {p.test}{p.modules.includes("listening") && p.audioParts.length < 4 ? <span className="small muted" title={`音频只有 Part ${p.audioParts.join("/") || "无"}`}> · 音频不全</span> : null}</span>
                    <span className="links">
                      <Link to={`/listening/${p.id}`} className={p.modules.includes("listening") ? "" : "dis"}>听力</Link>
                      <Link to={`/reading/${p.id}`} className={p.modules.includes("reading") ? "" : "dis"}>阅读</Link>
                      <Link to={`/writing/${p.id}`} className={p.modules.includes("writing") ? "" : "dis"}>写作</Link>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {attempts.length > 0 && (
        <section className="section wrap">
          <h2>最近练习</h2>
          <div className="card report-list" style={{ marginTop: 0 }}>
            <div className="row head"><span>#</span><span>科目 / 试卷</span><span>得分</span><span>Band</span><span>时间</span></div>
            {attempts.slice(0, 8).map((a, i) => (
              <Link key={a.id} to={`/report/${a.id}`} className="row">
                <span>{i + 1}</span>
                <span>{({ listening: "听力", reading: "阅读", writing: "写作", speaking: "口语" })[a.module]} · {a.paperTitle}</span>
                <span>{a.score} / {a.total}</span>
                <span style={{ color: "var(--brand)", fontWeight: 700 }}>{a.band}</span>
                <span className="muted small">{new Date(a.at).toLocaleString()}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
