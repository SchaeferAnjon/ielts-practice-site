#!/usr/bin/env node
// 冒烟测试：起 vite preview，用 Playwright 逐套打开听力 / 阅读 / 写作页，检查页面渲染出题目、没有 JS 报错。
//   npm run build && node scripts/smoke.mjs [c14t1]      # 可选前缀只测某几套
// 依赖 playwright（默认从 ~/.hermes/hermes-agent/node_modules 找，也可 NODE_PATH 指定）。
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(`${homedir()}/.hermes/hermes-agent/node_modules/playwright`)); }

const prefix = process.argv[2] ?? "";
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
      const expect = mod === "writing" ? "textarea" : "input, select, .drop, .qnum, [data-q]";
      await page.waitForSelector(expect, { timeout: 8000 });
      const inputs = await page.locator(mod === "writing" ? "textarea" : "input[type=text], select").count();
      const body = await page.locator("body").innerText();
      const problems = [...errors];
      if (mod !== "writing" && inputs < 10) problems.push(`只渲染出 ${inputs} 个作答控件`);
      if (mod === "writing" && !/Task 2/.test(body)) problems.push("没找到 Task 2");
      if (/页面不存在|加载失败|undefined/.test(body)) problems.push("页面出现 加载失败/undefined 文案");
      if (mod === "writing") { const broken = await page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src)); if (broken.length) problems.push(`图片加载失败 ${broken.join(",")}`); }
      if (problems.length) { fail++; console.log(`✗ ${mod}/${p.id}\n  ` + problems.join("\n  ")); }
    } catch (e) { fail++; console.log(`✗ ${mod}/${p.id}: ${e.message.split("\n")[0]}`); }
  }
}
console.log(`${papers.length} 套 × 三科，失败 ${fail}`);
await browser.close();
server.kill();
process.exit(fail ? 1 : 0);
