#!/usr/bin/env node
// 答案回环检查：把每套听力/阅读的标准答案当作用户作答喂给前端判分函数，必须 40/40。
// 能抓到：答案格式和判分归一化不兼容、多选题 range/answers 不一致、答案缺题号。
//   node scripts/check_answers.mjs            # 全部
//   node scripts/check_answers.mjs c14t1      # 只查某套
import { readdirSync, readFileSync } from "node:fs";
import { grade } from "../src/services/scoring.ts";

const prefix = process.argv[2] ?? "";
let bad = 0, total = 0;
for (const mod of ["listening", "reading"]) {
  const dir = new URL(`../public/data/${mod}/`, import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && x.startsWith(prefix)).sort()) {
    const paper = JSON.parse(readFileSync(new URL(f, dir), "utf8"));
    const units = mod === "listening" ? paper.parts : paper.passages;
    const groups = units.flatMap((u) => u.groups);
    const multi = groups.filter((g) => g.type === "mc-multi").map((g) => g.range);
    const key = paper.answers;
    const problems = [];
    for (let n = 1; n <= 40; n++) if (!key[n] || !key[n].length) problems.push(`Q${n} 无答案`);
    // 每个题号必须被且只被一个题组覆盖
    const cover = new Map();
    for (const g of groups) for (let n = g.range[0]; n <= g.range[1]; n++) cover.set(n, (cover.get(n) ?? 0) + 1);
    for (let n = 1; n <= 40; n++) if ((cover.get(n) ?? 0) !== 1) problems.push(`Q${n} 被 ${cover.get(n) ?? 0} 个题组覆盖`);
    // 用标准答案作答
    const answers = {};
    for (const [a, b] of multi) answers[a] = (key[a] ?? []).join(",");
    for (let n = 1; n <= 40; n++) if (!(n in answers) && !multi.some(([a, b]) => n >= a && n <= b)) answers[n] = key[n]?.[0] ?? "";
    for (const r of grade(answers, key, multi)) if (!r.ok) problems.push(`Q${r.n} 标准答案 ${JSON.stringify(r.correct)} 自判不通过（作答 "${r.user}"）`);
    // 选择题答案字母要在选项里
    for (const g of groups) {
      const keys = (opts) => (opts ?? []).map((o) => (typeof o === "string" ? o : o.k));
      if (g.type === "mc") for (const q of g.questions) for (const a of key[q.n] ?? []) if (!keys(q.options).includes(a)) problems.push(`Q${q.n} 答案 ${a} 不在选项里`);
      if (g.type === "mc-multi" || g.type === "matching" || g.type === "section-match" || g.type === "people-match" || g.type === "summary-select")
        for (let n = g.range[0]; n <= g.range[1]; n++) for (const a of key[n] ?? []) if (!keys(g.options).includes(a)) problems.push(`Q${n} 答案 ${a} 不在 ${g.type} 选项里`);
      if (g.type === "tfng" || g.type === "ynng") for (let n = g.range[0]; n <= g.range[1]; n++) for (const a of key[n] ?? []) if (!/^(TRUE|FALSE|NOT GIVEN|YES|NO)$/.test(a)) problems.push(`Q${n} 判断题答案 "${a}" 格式不对`);
    }
    total++;
    if (problems.length) { bad++; console.log(`✗ ${mod}/${f}\n  ` + problems.join("\n  ")); }
  }
}
console.log(`${total - bad}/${total} 套通过`);
process.exit(bad ? 1 : 0);
