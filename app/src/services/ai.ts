/**
 * AI 适配层。
 * - 没有 VITE_AI_API_KEY：走本地模拟（基于题目 JSON 的解析 / 原文定位 / 规则化写作分析 / 真实口语参考答案），带 600-1200ms 延迟。
 * - 有 Key：走 OpenAI 兼容的 chat/completions（VITE_AI_ENDPOINT、VITE_AI_MODEL 可配），要求模型返回 JSON。
 */
import type { ReadingPaper, SpeakingTopic, TranscriptLine, WritingTask } from "../data/types";
import { countWords } from "./scoring";

const API_KEY = import.meta.env.VITE_AI_API_KEY as string | undefined;
const ENDPOINT = (import.meta.env.VITE_AI_ENDPOINT as string | undefined) || "https://api.openai.com/v1/chat/completions";
const MODEL = (import.meta.env.VITE_AI_MODEL as string | undefined) || "gpt-4o-mini";

export const aiMode: "mock" | "live" = API_KEY ? "live" : "mock";

const delay = (ms = 600 + Math.random() * 600) => new Promise((r) => setTimeout(r, ms));

async function chatJson<T>(system: string, user: string): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI 调用失败 ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(text) as T;
}

// ---------------- 阅读错因分析 ----------------
export type ReadingAnalysis = {
  n: number;
  userAnswer: string;
  correctAnswer: string;
  location: string;
  keySentence: string;
  reason: string;
  paraphrase: string;
  tip: string;
};

export async function analyzeReadingError(paper: ReadingPaper, n: number, userAnswer: string): Promise<ReadingAnalysis> {
  const correct = paper.answers[String(n)]?.join(" / ") ?? "";
  const ex = paper.explain?.[String(n)];
  if (aiMode === "live") {
    const passage = paper.passages.find((p) => p.groups.some((g) => n >= g.range[0] && n <= g.range[1]));
    const text = passage?.paragraphs.map((p) => (p.label ? `[${p.label}] ` : "") + p.text).join("\n\n") ?? "";
    return chatJson<ReadingAnalysis>(
      "你是雅思阅读老师。根据文章和题目，用中文分析考生为什么答错。只输出 JSON：{location, keySentence, reason, paraphrase, tip}。location 是段落编号或标签，keySentence 是原文定位句（英文原句），reason 解释错因，paraphrase 列出题干与原文的同义替换，tip 一句方法建议。",
      `文章：\n${text}\n\n题号 ${n}，考生答案「${userAnswer || "（未作答）"}」，正确答案「${correct}」。`,
    ).then((r) => ({ ...r, n, userAnswer, correctAnswer: correct }));
  }
  await delay();
  const paraphrase = ex?.why.match(/[A-Za-z][^，。；]*=\s*[^，。；]*/g)?.join("；") ?? "见定位句中加粗的同义替换";
  return {
    n,
    userAnswer: userAnswer || "（未作答）",
    correctAnswer: correct,
    location: ex ? `段落 ${ex.loc}` : "—",
    keySentence: ex?.key ?? "",
    reason: ex?.why ?? "先找题干关键词在原文的同义替换，再比对逻辑关系。",
    paraphrase,
    tip: userAnswer ? "错因通常是只匹配了关键词，没有核对句子的逻辑（是否/对比/否定）。回到定位句逐词比对题干。" : "空题：先做定位再判断，宁可猜也不要留空（客观题不倒扣分）。",
  };
}

// ---------------- 听力原文定位 ----------------
export type ListeningLocate = { n: number; lines: { idx: number; time: number; end?: number; text: string; s: string }[]; hint: string; precise: boolean };

/** 每句的开始时间：优先用 ASR 对齐出的精确值（start 字段），否则按台词长度估算 */
export function lineTimes(transcript: TranscriptLine[], duration: number): { times: number[]; precise: boolean } {
  if (transcript.length && transcript.every((l) => typeof l.start === "number")) {
    return { times: transcript.map((l) => l.start as number), precise: true };
  }
  return { times: estimateTimes(transcript, duration), precise: false };
}

export function estimateTimes(transcript: TranscriptLine[], duration: number): number[] {
  const total = transcript.reduce((s, l) => s + l.t.length, 0) || 1;
  const usable = Math.max(duration - 40, 30); // 扣掉开头的题目朗读与结尾静音
  let acc = 0;
  return transcript.map((l) => {
    const t = 28 + (acc / total) * usable;
    acc += l.t.length;
    return Math.floor(t);
  });
}

export async function locateListeningSentence(transcript: TranscriptLine[], duration: number, n: number): Promise<ListeningLocate> {
  await delay(400 + Math.random() * 400);
  const { times, precise } = lineTimes(transcript, duration);
  const lines = transcript
    .map((l, idx) => ({ l, idx }))
    .filter(({ l }) => l.q?.includes(n))
    .map(({ l, idx }) => ({ idx, time: times[idx], end: l.end, text: l.t, s: l.s }));
  const hint = !lines.length ? "该题未在原文中标注定位。" : precise ? "答案就在高亮句里，注意说话人是否先给了干扰项再纠正。时间戳由豆包 ASR 逐词对齐，点击可精确回放。" : "答案就在高亮句里。时间点为按台词长度估算，误差约 ±15 秒。";
  return { n, lines, hint, precise };
}

// ---------------- 写作批改 ----------------
export type WritingGrade = {
  overall: number;
  dims: { key: string; label: string; band: number; comment: string }[];
  issues: { kind: string; quote: string; fix: string }[];
  rewrite: string;
  summary: string;
  mode: "mock" | "live";
};

const LINKERS = ["however", "moreover", "furthermore", "in addition", "on the other hand", "for example", "for instance", "therefore", "as a result", "in conclusion", "firstly", "secondly", "finally", "although", "whereas", "while", "in contrast", "overall", "to sum up", "besides", "nevertheless", "consequently"];
const INFORMAL = [/\bcan't\b/gi, /\bdon't\b/gi, /\bisn't\b/gi, /\bwon't\b/gi, /\bit's\b/gi, /\bI'm\b/g, /\bgonna\b/gi, /\bwanna\b/gi, /\ba lot of\b/gi, /\bkids\b/gi, /\bstuff\b/gi, /\bthing[s]?\b/gi];
const VAGUE = [/\bvery\b/gi, /\breally\b/gi, /\bgood\b/gi, /\bbad\b/gi, /\bbig\b/gi, /\bmany\b/gi];

function bandRound(x: number) {
  return Math.max(4, Math.min(9, Math.round(x * 2) / 2));
}

export async function gradeWriting(task: WritingTask, essay: string): Promise<WritingGrade> {
  if (aiMode === "live") {
    const r = await chatJson<Omit<WritingGrade, "mode">>(
      "你是雅思写作考官。按 Task Achievement/Response、Coherence & Cohesion、Lexical Resource、Grammatical Range & Accuracy 四维打分（0.5 步进），指出逐句问题并给改写建议。只输出 JSON：{overall, dims:[{key,label,band,comment}], issues:[{kind,quote,fix}], rewrite, summary}，评语用中文。",
      `题目（Task ${task.task}）：\n${task.prompt.join("\n")}\n\n考生作文：\n${essay}`,
    );
    return { ...r, mode: "live" };
  }
  await delay(900 + Math.random() * 600);
  const words = countWords(essay);
  const sentences = essay.split(/[.!?]+\s/).filter((s) => s.trim().length > 2);
  const paragraphs = essay.split(/\n\s*\n/).filter((p) => p.trim());
  const avgLen = sentences.length ? words / sentences.length : 0;
  const lower = essay.toLowerCase();
  const linkersUsed = LINKERS.filter((l) => lower.includes(l));
  const uniq = new Set(lower.match(/[a-z']+/g) ?? []).size;
  const ttr = words ? uniq / words : 0;
  const longSent = sentences.filter((s) => countWords(s) > 22).length;
  const complex = sentences.filter((s) => /\b(which|that|because|although|while|whereas|if|when|unless|so that|in order to)\b/i.test(s)).length;
  const issues: WritingGrade["issues"] = [];

  // 任务完成度
  let ta = 6;
  if (words < task.minWords) { ta -= 1; issues.push({ kind: "字数", quote: `${words} 词`, fix: `低于最低 ${task.minWords} 词，Task ${task.task} 会被扣分。补足内容而不是重复。` }); }
  if (paragraphs.length < 3) { ta -= 0.5; issues.push({ kind: "结构", quote: `${paragraphs.length} 段`, fix: task.task === 1 ? "建议：引言改写 + overview + 2 段细节。" : "建议：引言 + 2-3 段主体 + 结论，每段一个中心。" }); }
  if (task.task === 1 && !/\b(overall|in general|it is clear|it can be seen|to sum up)\b/i.test(essay)) { ta -= 0.5; issues.push({ kind: "Overview", quote: "缺少总览句", fix: "Task 1 必须有一句 overview 概括主要趋势/最大值最小值，常用 Overall, …" }); }
  if (task.task === 2 && !/\b(I (agree|disagree|believe|think)|in my (opinion|view)|my view)\b/i.test(essay)) { ta -= 0.5; issues.push({ kind: "立场", quote: "未明确表态", fix: "是否同意类题目要在引言和结论明确写出自己的立场，例如 I completely agree that…" }); }
  if (task.task === 1 && task.data) {
    const mentionedNums = (essay.match(/\b\d+(\.\d+)?\b/g) ?? []).length;
    if (mentionedNums < 3) { ta -= 0.5; issues.push({ kind: "数据", quote: `只引用了 ${mentionedNums} 个数字`, fix: "Task 1 需要引用关键数据支撑描述（起点、峰值、终点、交叉点）。" }); }
  }

  // 连贯与衔接
  let cc = 6;
  if (linkersUsed.length < 3) { cc -= 0.5; issues.push({ kind: "衔接", quote: linkersUsed.join(", ") || "无", fix: "增加逻辑连接词：However / Moreover / For instance / As a result / In contrast。" }); }
  if (linkersUsed.length > 10) { cc -= 0.5; issues.push({ kind: "衔接", quote: "连接词过多", fix: "连接词堆砌会被视为 mechanical，用指代（this trend / such a policy）替换部分连接词。" }); }
  if (paragraphs.length >= 3) cc += 0.5;

  // 词汇
  let lr = 5.5 + Math.min(1.5, (ttr - 0.4) * 5);
  const informalHits = INFORMAL.flatMap((re) => essay.match(re) ?? []);
  if (informalHits.length) { lr -= 0.5; issues.push({ kind: "词汇", quote: [...new Set(informalHits)].slice(0, 5).join(", "), fix: "学术写作避免缩写与口语词：can't → cannot；a lot of → a great deal of / numerous；kids → children。" }); }
  const vagueHits = VAGUE.flatMap((re) => essay.match(re) ?? []);
  if (vagueHits.length > 4) { lr -= 0.5; issues.push({ kind: "词汇", quote: [...new Set(vagueHits.map((x) => x.toLowerCase()))].join(", "), fix: "替换空泛形容词：very important → crucial / vital；good → beneficial / advantageous；big → substantial / considerable。" }); }

  // 语法
  let gra = 5.5;
  if (complex / Math.max(1, sentences.length) > 0.35) gra += 1;
  else issues.push({ kind: "句式", quote: `复杂句占比 ${Math.round((complex / Math.max(1, sentences.length)) * 100)}%`, fix: "增加从句与非谓语结构：定语从句 which…、条件句 If…、分词短语 Having…" });
  if (avgLen > 30 || longSent > sentences.length * 0.5) { gra -= 0.5; issues.push({ kind: "句长", quote: `平均 ${avgLen.toFixed(0)} 词/句`, fix: "过长的句子容易失控，长短句交替（15-25 词为宜）。" }); }
  if (avgLen && avgLen < 10) { gra -= 0.5; issues.push({ kind: "句长", quote: `平均 ${avgLen.toFixed(0)} 词/句`, fix: "句子过短显得单一，尝试用连词或从句合并相关短句。" }); }
  const lowerI = (essay.match(/(^|[.!?]\s+)i\s/g) ?? []).length;
  if (lowerI) issues.push({ kind: "语法", quote: "句首小写的 i", fix: "第一人称 I 必须大写。" });
  const doubleSpace = /[^\s]\s{2,}\S/.test(essay.replace(/\s*\n\s*/g, "\n"));
  if (doubleSpace) issues.push({ kind: "格式", quote: "连续空格", fix: "检查标点后的空格数。" });

  const dims = [
    { key: "TA", label: task.task === 1 ? "Task Achievement" : "Task Response", band: bandRound(ta), comment: task.task === 1 ? "是否覆盖主要特征、有 overview、引用数据准确。" : "是否回应所有问题、立场清晰、论点有展开与例证。" },
    { key: "CC", label: "Coherence & Cohesion", band: bandRound(cc), comment: `分段 ${paragraphs.length}，使用连接词 ${linkersUsed.length} 种（${linkersUsed.slice(0, 5).join(", ") || "无"}）。` },
    { key: "LR", label: "Lexical Resource", band: bandRound(lr), comment: `词汇多样性 ${(ttr * 100).toFixed(0)}%（不同词 / 总词数）。` },
    { key: "GRA", label: "Grammatical Range & Accuracy", band: bandRound(gra), comment: `${sentences.length} 句，平均 ${avgLen.toFixed(1)} 词/句，复杂句 ${complex} 句。` },
  ];
  const overall = bandRound(dims.reduce((s, d) => s + d.band, 0) / 4);
  const rewrite = task.task === 1
    ? (task.sample.exampleOverview ?? "Overall, …")
    : "Some argue that …; however, I firmly believe that … because … For instance, … Consequently, …";
  return {
    overall,
    dims,
    issues,
    rewrite,
    summary: `本地规则化分析（未接入真实模型）：字数 ${words}，${paragraphs.length} 段，${sentences.length} 句。先修复上面标红的问题，再对照官方范文（Band ${task.sample.band}）看考官评语里强调的点。`,
    mode: "mock",
  };
}

// ---------------- 口语参考答案 ----------------
export type SpeakingAnswer = { answer: string; answerZh?: string; phrases: string[]; structure: string[]; source: "bank" | "template" | "live" };

const P1_TEMPLATES = [
  (q: string) => `Well, to be honest, ${q.replace(/\?$/, "")} isn't something I think about every day, but I'd say yes, definitely. Mainly because it fits into my routine quite naturally. For example, just last week I … , and it made me realise how much I enjoy it.`,
  (q: string) => `That's an interesting question. Personally, I'd say it depends. When it comes to ${q.replace(/^(do|does|did|are|is|have|what|why|how|where|when)\s+(you\s+)?/i, "").replace(/\?$/, "")}, I tend to … , mainly because … Having said that, there are times when I prefer the opposite.`,
];

export async function generateSpeakingAnswer(topic: SpeakingTopic, question?: string, keywords?: string): Promise<SpeakingAnswer> {
  const q = question ? [...topic.questions, ...topic.part3].find((x) => x.text === question) : undefined;
  if (aiMode === "live") {
    const r = await chatJson<{ answer: string; answerZh: string; phrases: string[]; structure: string[] }>(
      "你是雅思口语老师。为题目生成 Band 7 水平的参考答案（自然口语、120-180 词，Part 2 约 220 词），给中文翻译、5 个高分短语、答题结构要点。只输出 JSON：{answer, answerZh, phrases, structure}。",
      `Part ${topic.part} 话题：${topic.title}\n${question ? `问题：${question}` : `Cue card：${topic.cue?.title}\n${topic.cue?.points.join("\n")}`}\n${keywords ? `请围绕关键词：${keywords}` : ""}`,
    );
    return { ...r, source: "live" };
  }
  await delay();
  const structure = topic.part === 2 || !question
    ? ["开头 1 句点题（I'd like to talk about…）", "按 cue card 的 3 个要点各展开 2-3 句，加细节（时间/地点/感受）", "最后 explain 部分给 2 个理由 + 1 个具体例子", "结尾 1 句总结感受"]
    : ["直接回答（Yes/No/It depends）", "给出 1 个原因（because / the main reason is）", "举 1 个具体例子（for instance, last week…）", "可选：对比过去或补充一句感受"];
  const phrases = ["to be honest", "what I really enjoy about … is …", "it's not just … but also …", "looking back", "I'd say it depends on", "which is why", "as far as I'm concerned", "a real eye-opener"];
  if (q?.answer || (!question && topic.answer)) {
    return { answer: (question ? q?.answer : topic.answer) ?? "", answerZh: (question ? q?.answerZh : topic.answerZh) ?? undefined, phrases, structure, source: "bank" };
  }
  const base = question ? P1_TEMPLATES[question.length % 2](question) : `I'd like to talk about ${topic.cue?.title.replace(/^Describe\s+/i, "") ?? topic.title}. ${topic.cue?.points.map((p) => `Regarding ${p.replace(/^(and\s+)?(explain\s+)?/i, "").toLowerCase()}, …`).join(" ") ?? ""} All in all, this is something I'll always remember because …`;
  const kw = keywords ? `\n\n（素材关键词：${keywords} —— 把它们放进"例子"那一句里最自然。）` : "";
  return { answer: base + kw, phrases, structure, source: "template" };
}

export type SpeakingScore = { fluency: number; lexical: number; grammar: number; pronunciation: number; overall: number; comment: string };
export async function scoreSpeaking(seconds: number): Promise<SpeakingScore> {
  await delay();
  const base = seconds < 20 ? 5 : seconds < 60 ? 6 : 6.5;
  return { fluency: base, lexical: base, grammar: base, pronunciation: base, overall: base, comment: `录音时长 ${seconds}s。当前为模拟评分（未接入语音识别）：Part 2 目标 1.5-2 分钟，Part 1 每题 20-40 秒。` };
}

// ---------------- 划词查词 ----------------
export type WordEntry = { word: string; phonetic?: string; defs: { pos: string; def: string; zh?: string }[]; example?: string };

const MINI_DICT: Record<string, WordEntry> = {
  amassed: { word: "amass", phonetic: "/əˈmæs/", defs: [{ pos: "v.", def: "to collect a large amount of something over time", zh: "积累，积聚" }], example: "They amassed one of the largest collections in Britain." },
  inheritance: { word: "inheritance", phonetic: "/ɪnˈherɪtəns/", defs: [{ pos: "n.", def: "money or property received from someone after they die", zh: "遗产" }] },
  philanthropic: { word: "philanthropic", phonetic: "/ˌfɪlənˈθrɒpɪk/", defs: [{ pos: "adj.", def: "helping people, especially by giving money to those who need it", zh: "慈善的" }] },
  governess: { word: "governess", phonetic: "/ˈɡʌvənəs/", defs: [{ pos: "n.", def: "a woman employed to teach children in their home", zh: "家庭女教师" }] },
  canteen: { word: "canteen", phonetic: "/kænˈtiːn/", defs: [{ pos: "n.", def: "a place where food is served in a factory, school or army camp", zh: "食堂" }] },
  tedious: { word: "tedious", phonetic: "/ˈtiːdiəs/", defs: [{ pos: "adj.", def: "boring and lasting a long time", zh: "冗长乏味的" }] },
  upheaval: { word: "upheaval", phonetic: "/ʌpˈhiːvl/", defs: [{ pos: "n.", def: "a great change causing confusion or trouble", zh: "剧变，动荡" }] },
  attuned: { word: "attuned", phonetic: "/əˈtjuːnd/", defs: [{ pos: "adj.", def: "able to notice and understand something", zh: "熟悉的，适应的" }] },
  cardiovascular: { word: "cardiovascular", phonetic: "/ˌkɑːdiəʊˈvæskjələ/", defs: [{ pos: "adj.", def: "relating to the heart and blood vessels", zh: "心血管的" }] },
  muffles: { word: "muffle", phonetic: "/ˈmʌfl/", defs: [{ pos: "v.", def: "to make a sound quieter", zh: "使（声音）减弱" }] },
  benign: { word: "benign", phonetic: "/bɪˈnaɪn/", defs: [{ pos: "adj.", def: "harmless; not dangerous", zh: "无害的；良性的" }] },
  deprivation: { word: "deprivation", phonetic: "/ˌdeprɪˈveɪʃn/", defs: [{ pos: "n.", def: "the state of not having something that people need", zh: "剥夺；匮乏" }] },
  volition: { word: "volition", phonetic: "/vəˈlɪʃn/", defs: [{ pos: "n.", def: "the power to choose or decide by yourself", zh: "意志，自愿" }] },
  concedes: { word: "concede", phonetic: "/kənˈsiːd/", defs: [{ pos: "v.", def: "to admit that something is true, often unwillingly", zh: "承认" }] },
  attainable: { word: "attainable", phonetic: "/əˈteɪnəbl/", defs: [{ pos: "adj.", def: "possible to achieve", zh: "可达到的" }] },
  subsidised: { word: "subsidise", phonetic: "/ˈsʌbsɪdaɪz/", defs: [{ pos: "v.", def: "to give money to reduce the cost of something", zh: "补贴" }] },
  livelihood: { word: "livelihood", phonetic: "/ˈlaɪvlihʊd/", defs: [{ pos: "n.", def: "the way someone earns money to live", zh: "生计" }] },
  abolition: { word: "abolition", phonetic: "/ˌæbəˈlɪʃn/", defs: [{ pos: "n.", def: "the official ending of a law or system", zh: "废除" }] },
  bourgeoisie: { word: "bourgeoisie", phonetic: "/ˌbʊəʒwɑːˈziː/", defs: [{ pos: "n.", def: "the middle class, especially owners of businesses", zh: "资产阶级" }] },
  ubiquitous: { word: "ubiquitous", phonetic: "/juːˈbɪkwɪtəs/", defs: [{ pos: "adj.", def: "seeming to be everywhere", zh: "无处不在的" }] },
  appalling: { word: "appalling", phonetic: "/əˈpɔːlɪŋ/", defs: [{ pos: "adj.", def: "shocking; extremely bad", zh: "骇人的，极坏的" }] },
  obstruction: { word: "obstruction", phonetic: "/əbˈstrʌkʃn/", defs: [{ pos: "n.", def: "the act of blocking or preventing progress", zh: "阻挠" }] },
  refinement: { word: "refinement", phonetic: "/rɪˈfaɪnmənt/", defs: [{ pos: "n.", def: "the process of making a substance pure", zh: "提炼，精炼" }] },
  diffusion: { word: "diffusion", phonetic: "/dɪˈfjuːʒn/", defs: [{ pos: "n.", def: "the spreading of something more widely", zh: "扩散，传播" }] },
  subtlety: { word: "subtlety", phonetic: "/ˈsʌtlti/", defs: [{ pos: "n.", def: "the quality of being not obvious; fine detail", zh: "微妙；细腻" }] },
};

export async function lookupWord(raw: string): Promise<WordEntry> {
  const w = raw.toLowerCase().replace(/[^a-z'-]/g, "");
  const hit = MINI_DICT[w] ?? MINI_DICT[w.replace(/s$/, "")] ?? MINI_DICT[w.replace(/ed$/, "")] ?? MINI_DICT[w.replace(/ing$/, "")];
  if (hit) {
    await delay(150);
    return hit;
  }
  // 免费开放词典（无需 Key）；失败则返回占位
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const e = data[0];
      const defs = (e.meanings ?? []).slice(0, 3).map((m: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }) => ({ pos: m.partOfSpeech, def: m.definitions[0]?.definition ?? "" }));
      const example = (e.meanings ?? []).flatMap((m: { definitions: { example?: string }[] }) => m.definitions).find((d: { example?: string }) => d.example)?.example;
      return { word: e.word, phonetic: e.phonetic, defs, example };
    }
  } catch {
    /* offline */
  }
  return { word: w, defs: [{ pos: "", def: "本地词库未收录，且在线词典不可用（离线）。" }] };
}
