#!/usr/bin/env node
// 冒烟测试：起 vite preview，用 Playwright 逐套打开听力 / 阅读 / 写作页，检查页面渲染出题目、没有 JS 报错。
//   node scripts/smoke.mjs [c14t1] [--no-build]      # 默认先 vite build；可选前缀只测某几套
// 依赖 playwright（默认从 ~/.hermes/hermes-agent/node_modules 找，也可 NODE_PATH 指定）。
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(`${homedir()}/.hermes/hermes-agent/node_modules/playwright`)); }

const prefix = process.argv.find((a) => !a.startsWith("--") && !a.includes("/")) ?? "";
if (!process.argv.includes("--no-build")) { const { execSync } = await import("node:child_process"); execSync("npx vite build", { stdio: "ignore" }); }
const PORT = 4173 + Math.floor(Math.random() * 500);
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const base = `http://localhost:${PORT}`;
const idx = JSON.parse(readFileSync(new URL("../public/data/index.json", import.meta.url), "utf8"));
const papers = idx.papers.filter((p) => p.modules.length && p.id.startsWith(prefix));

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/favicon|net::ERR|404/.test(m.text())) errors.push(`console: ${m.text()}`); });
try { await page.goto(base + "/"); await page.evaluate(() => localStorage.setItem("ielts.examMode", JSON.stringify("cbt"))); } catch {}

let fail = 0;
for (const p of papers) {
  for (const mod of p.modules) {
    errors.length = 0;
    const url = `${base}/${mod}/${p.id}`;
    try {
      await page.goto(url, { waitUntil: "networkidle" });
      const problems = [];
      if (mod === "writing") {
        await page.waitForSelector("textarea", { timeout: 8000 });
        const body = await page.locator("body").innerText();
        if (!/TASK 2/i.test(body)) problems.push("没找到 Task 2");
        const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
        if (broken.length) problems.push(`图片加载失败 ${broken.join(",")}`);
      } else {
        // 听力按 Part、阅读按 Passage 分页显示：逐个 Tab 点开，每页都要渲染出作答控件
        const tabs = page.locator("button", { hasText: mod === "listening" ? /^Part \d$/ : /^Passage \d$/ });
        const n = await tabs.count();
        if (n !== (mod === "listening" ? 4 : 3)) problems.push(`只有 ${n} 个 Tab`);
        let total = 0;
        for (let i = 0; i < n; i++) {
          await tabs.nth(i).click();
          await page.waitForTimeout(150);
          const c = await page.locator("input:not([type=hidden]), select, textarea, .drop, [contenteditable]").count();
          if (c < 5) problems.push(`Tab ${i + 1} 只有 ${c} 个作答控件`);
          total += c;
        }
        if (total < 40) problems.push(`全卷作答控件只有 ${total} 个`);
      }
      const body = await page.locator("body").innerText();
      if (/页面不存在|加载失败|undefined|\[object Object\]|NaN/.test(body)) problems.push("页面出现 加载失败/undefined/NaN 文案");
      problems.push(...errors);
      if (problems.length) { fail++; console.log(`✗ ${mod}/${p.id}\n  ` + problems.join("\n  ")); }
    } catch (e) { fail++; console.log(`✗ ${mod}/${p.id}: ${e.message.split("\n")[0]}`); }
  }
}
console.log(`${papers.length} 套 × 三科，失败 ${fail}`);
await browser.close();
server.kill();
process.exit(fail ? 1 : 0);
