import { NavLink, Link } from "react-router-dom";
import { PAPERS } from "../services/data";
import type { ExamMode } from "../data/types";

const MODE_LABEL: Record<ExamMode, string> = { paper: "纸笔考", cbt: "机考", "cbt-old": "旧机考" };

export default function TopNav({ mode, onChangeMode }: { mode: ExamMode | null; onChangeMode: () => void }) {
  const first = PAPERS.find((p) => p.modules.length);
  const books = [...new Set(PAPERS.map((p) => p.bookShort))];
  return (
    <header className="topnav">
      <div className="wrap row1">
        <Link to="/" className="logo">
          <span className="mark">同</span>
          <span>
            同桌雅思 <small>IELTS Mate · 本地复刻版</small>
          </span>
        </Link>
        <div className="actions">
          <button className="mode-chip" onClick={onChangeMode}>
            当前模式：<b>{mode ? MODE_LABEL[mode] : "未选择"}</b> ▾
          </button>
          <Link className="btn sm" to="/errors">错题本</Link>
        </div>
      </div>
      <div className="row2">
        <nav className="wrap menu">
          <NavLink to="/" end>首页</NavLink>
          <NavLink to={`/listening/${first?.id ?? "c21t1"}`}>听力</NavLink>
          <NavLink to={`/reading/${first?.id ?? "c21t1"}`}>阅读</NavLink>
          <NavLink to={`/writing/${first?.id ?? "c21t1"}`}>写作</NavLink>
          <NavLink to="/speaking">口语</NavLink>
          <div className="dropdown">
            <a>题库分类 ▾</a>
            <div className="panel">
              {books.map((b) => (
                <Link key={b} to={`/#book-${b}`}>{b} 学术类</Link>
              ))}
              <Link to="/speaking">2026 年 5-8 月口语题库</Link>
            </div>
          </div>
          <NavLink to="/errors">错题本</NavLink>
        </nav>
      </div>
    </header>
  );
}
