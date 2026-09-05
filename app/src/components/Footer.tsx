export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <span>同桌雅思 · 本地复刻版 —— 界面参考 ielts.itongzhuo.com，题目来自剑桥雅思官方真题集，仅供个人备考使用。</span>
        <span>AI 辅助：未填 Key 时为本地模拟；在 .env 中设置 VITE_AI_API_KEY 即切换真实模型。</span>
      </div>
    </footer>
  );
}
