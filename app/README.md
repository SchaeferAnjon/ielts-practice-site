# 同桌雅思 · 本地复刻版

按官方机考界面（ielts.itongzhuo.com / 同桌英语）复刻的雅思刷题站。纯前端（Vite + React + TypeScript），本地跑，数据全在 `public/`，不依赖任何服务器。

## 运行

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm run build      # 产出 dist/，任意静态服务器可托管
```

首次进入会弹「纸笔考 / 机考 / 旧机考」三选一，存 localStorage，顶部可随时切换。

## 已有内容

| 科目 | 内容 | 来源 |
| --- | --- | --- |
| 听力 | 剑21 Test 1 全 4 Part、40 题、答案、逐句原文（带题号标记与估算时间戳）、真实 MP3 | 剑21 A 类 PDF 文字层 + 官方音频 |
| 阅读 | 剑21 Test 1 全 3 篇、40 题、答案、每题定位句 + 中文解析 | 同上，人工校对 |
| 写作 | 剑21 Test 1 Task 1（曲线图，含图片与数据表）+ Task 2，官方范文与考官评语 | 同上 |
| 口语 | 2026 年 5-8 月题库 101 个话题 / 554 题，其中 108 题 + 9 张 Part 2 卡片带真实参考答案（英 + 中） | `scripts/extract_speaking.py` 从文字版 PDF 全量抽取 |

## AI 辅助

四类：阅读错因分析、听力原文定位、写作四维批改、口语参考答案（+ 划词查词、口语录音模拟评分）。

- **不填 Key**：本地模拟。阅读用 JSON 里的人工解析；听力用原文题号标记；写作是规则化分析（字数 / 段落 / overview / 连接词 / 词汇多样性 / 复杂句比例等，给出四维分和逐条问题）；口语优先用题库自带的真实答案，没有的用模板。
- **填 Key**：复制 `.env.example` 为 `.env`，填 `VITE_AI_API_KEY`（任何 OpenAI 兼容接口，`VITE_AI_ENDPOINT` / `VITE_AI_MODEL` 可改），重启 dev。接口在 `src/services/ai.ts`，返回结构与模拟完全一致。

划词查词：先查内置小词典（本篇生词），查不到走 dictionaryapi.dev（免费、无需 Key，离线时给占位）。

## 扩充更多真题

### 1. 登记试卷

`src/services/data.ts` 的 `PAPERS` 里把对应 test 的 `modules` 填上（如 `["listening","reading","writing"]`），首页与导航自动出现。

### 2. 准备数据文件

放到 `public/data/<module>/<id>.json`，音频放 `public/audio/<book>/`。结构直接照抄 `c21t1.json`：

- 听力：`parts[]`（`audio`、`duration`、`groups[]`、`transcript[]`）+ `answers`。
- 阅读：`passages[]`（`paragraphs[]`、`groups[]`）+ `answers` + `explain`（每题 `loc` 段落 id、`key` 定位句、`why` 中文解析，用于错因分析）。
- 写作：`tasks[]`（`prompt[]`、`image`、`data`、`sample`）。

题组 `type` 支持：`table` / `notes` / `summary`（文本中用 `{{n}}` 表示填空）、`summary-select`（选词填空）、`mc`、`mc-multi`、`matching`（拖拽或下拉）、`section-match`、`people-match`、`tfng` / `ynng`。答案 `answers` 每题是数组，多个可接受答案都写上（判分会归一化大小写 / 空格 / 连字符 / 数字英文）。

### 3. 从 PDF 抽取

**有文字层的 PDF（剑21 这种）**：`pdftotext -layout 书.pdf 书.txt`，按页复制到 JSON。本项目就是这么做的。

**扫描版 PDF（剑20 等）**：

```bash
python3 scripts/ocr_paper.py "剑20-Test1.pdf" --out drafts/c20t1 --pages 2-34
```

得到 `drafts/c20t1/ocr.txt`（逐页文本）、`ocr.json`（每页置信度、低置信度行、识别到的题号）和 `pages/*.png`。校对流程：

1. 看 `ocr.json` 里 `avg_conf < 80` 的页和 `low_conf_lines`，对照 `pages/p-xxx.png` 改正。
2. 题干、选项按 `c21t1.json` 的结构整理；填空用 `{{n}}`。
3. 答案从书末 answer key 页抄；听力原文从 audioscripts 页抄，每句加 `q` 标记哪些题的答案在这句。
4. `npm run dev` 打开对应页面走一遍：填答案 → 提交 → 每题判分正确即可。

**口语题库换季**：

```bash
python3 scripts/extract_speaking.py \
  --bank "新季题库.pdf" \
  --answers "保留题（含答案）.pdf" "新题+答案.pdf" \
  --out public/data/speaking.json
```

脚本识别「N P1 话题」「N P2 中文标题 + Describe…」「P3」「万年老题」这些版式，答案按问题文本模糊匹配（阈值 0.82）。跑完看 stderr 的统计。

## 目录

```
app/
  public/data/{listening,reading,writing}/c21t1.json   题目数据
  public/data/speaking.json                            口语题库
  public/audio/c21/t1p1-4.mp3                          听力音频
  public/img/c21t1-task1.png                           写作图表
  scripts/extract_speaking.py                          口语题库抽取
  scripts/ocr_paper.py                                 扫描版 OCR 草稿管线
  src/styles/tokens.css                                设计令牌（调研所得色值 / 圆角 / 阴影）
  src/services/{scoring,storage,ai,data}.ts            判分 / 存储 / AI 适配 / 数据加载
  src/components/QuestionGroup.tsx                     所有题型渲染
  src/pages/{Home,Listening,Reading,Writing,Speaking,Report,ErrorBook}.tsx
```

## 说明

- 判分换算表是雅思官方公布的 A 类近似区间。
- 听力原文的时间戳按台词长度估算（误差约 ±15 秒），点击可跳转播放；要精确时间戳需要用 whisper 之类对齐一次，可在 transcript 里加 `t` 字段。
- 数据存 localStorage（练习记录、错题本、草稿、高亮与便签），换浏览器不会同步。
