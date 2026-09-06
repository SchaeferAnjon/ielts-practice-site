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
| 听力 | 每套 4 Part、40 题、答案、逐句原文（题号标记 + ASR 精确时间戳）、MP3 | 剑桥真题 PDF + 官方音频，已上线的套数见 `public/data/index.json` |
| 阅读 | 每套 3 篇、40 题、答案、每题定位句 + 中文解析 | 同上 |
| 写作 | 每套 Task 1（图表图片 + 可读出的数据表）+ Task 2，官方范文与考官评语 | 同上 |
| 口语 | 2026 年 5-8 月题库 101 个话题 / 554 题，其中 108 题 + 9 张 Part 2 卡片带真实参考答案（英 + 中） | `scripts/extract_speaking.py` 从文字版 PDF 全量抽取 |

## AI 辅助

四类：阅读错因分析、听力原文定位、写作四维批改、口语参考答案（+ 划词查词、口语录音模拟评分）。

- **不填 Key**：本地模拟。阅读用 JSON 里的人工解析；听力用原文题号标记；写作是规则化分析（字数 / 段落 / overview / 连接词 / 词汇多样性 / 复杂句比例等，给出四维分和逐条问题）；口语优先用题库自带的真实答案，没有的用模板。
- **填 Key**：复制 `.env.example` 为 `.env`，填 `VITE_AI_API_KEY`（任何 OpenAI 兼容接口，`VITE_AI_ENDPOINT` / `VITE_AI_MODEL` 可改），重启 dev。接口在 `src/services/ai.ts`，返回结构与模拟完全一致。

划词查词：先查内置小词典（本篇生词），查不到走 dictionaryapi.dev（免费、无需 Key，离线时给占位）。

## 扩充更多真题（批量流水线）

题库清单由 `public/data/index.json` 驱动（`scripts/build_index.py` 生成），首页和导航按它显示，不需要改代码。完整的接手手册见 `scripts/RUNBOOK.md`，每套题的流程：

1. **拆书**：`python3 scripts/dump_book.py "<书.pdf>" --out drafts/cN`（扫描件加 `--ocr`，会同时渲染每页 PNG 供核对），得到带页码标记的 `book.txt` 和页索引 `pages.txt`。
2. **抽题**：起一个子 Agent，按 `scripts/AGENT_TASK.md` 把某一套的听力 / 阅读 / 写作抄成 JSON（结构照 `c21t1.json`，类型见 `src/data/types.ts`），写作范文按段落分次抄进 `drafts/cN/samples/` 再用 `scripts/fill_samples.py` 拼进 JSON。
3. **校验**：`python3 scripts/validate_paper.py <listening|reading|writing> <json>` 查结构；`node scripts/check_answers.mjs cNtT` 把标准答案喂给判分函数做回环，必须 40/40。
4. **听力时间戳**：豆包 ASR 转写音频后 `python3 scripts/align_transcript.py <听力 json> --asr-dir <asr 目录>` 逐词对齐。
5. **图片**：`python3 scripts/optimize_images.py cNtT` 把 Task 1 图表转成 WebP。
6. **发布**：`python3 scripts/build_index.py --audio-manifest ../audio/manifest.json --audio-base <音频站>` 更新清单，commit + push，GitHub Actions 自动部署。

音频不在本仓库：`scripts/audio_ingest.py` 把资料里的 MP3 统一转码归档到独立仓库 ielts-audio（GitHub Pages 托管），`manifest.json` 记录每套有哪些 Part；缺音频的套数前端会标"音频不全"。

**口语题库换季**：

```bash
python3 scripts/extract_speaking.py \
  --bank "新季题库.pdf" \
  --answers "保留题（含答案）.pdf" "新题+答案.pdf" \
  --out public/data/speaking.json
```

脚本识别「N P1 话题」「N P2 中文标题 + Describe…」「P3」「万年老题」这些版式，答案按问题文本模糊匹配（阈值 0.82）。

## 目录

```
app/
  public/data/index.json                               题库清单（build_index.py 生成）
  public/data/{listening,reading,writing}/cNtT.json    题目数据
  public/data/speaking.json                            口语题库
  public/img/cNtT-task1.webp                           写作图表
  scripts/RUNBOOK.md + AGENT_TASK.md                   批量数字化手册 / 子 Agent 任务书
  scripts/{dump_book,validate_paper,align_transcript,build_index,optimize_images,fill_samples}.py
  scripts/check_answers.mjs                            答案回环检查
  scripts/audio_ingest.py                              音频归档转码
  scripts/extract_speaking.py                          口语题库抽取
  src/styles/tokens.css                                设计令牌（调研所得色值 / 圆角 / 阴影）
  src/services/{scoring,storage,ai,data}.ts            判分 / 存储 / AI 适配 / 数据加载
  src/components/QuestionGroup.tsx                     所有题型渲染
  src/pages/{Home,Listening,Reading,Writing,Speaking,Report,ErrorBook}.tsx
```

## 说明

- 判分换算表是雅思官方公布的 A 类近似区间。
- 听力原文时间戳：有音频的套数都用豆包 ASR（火山引擎 Seed-ASR）逐词对齐过（`start` / `end` 字段）；没有对齐时前端按台词长度估算。对齐命令：

  ```bash
  VOLC_ASR_KEY=xxx python3 ~/.claude/skills/video-to-notes/scripts/asr_volc.py --audio-dir public/audio/c21 --out-dir /tmp/asr
  python3 scripts/align_transcript.py public/data/listening/c21t1.json --asr-dir /tmp/asr
  ```
- 数据存 localStorage（练习记录、错题本、草稿、高亮与便签），换浏览器不会同步。
