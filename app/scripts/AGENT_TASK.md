# 子 Agent 任务：把一套剑桥雅思真题数字化成网站 JSON

你要处理的是 **{BOOK}（剑{N}）Test {T}**，产出三个文件：

- `public/data/listening/c{N}t{T}.json`
- `public/data/reading/c{N}t{T}.json`
- `public/data/writing/c{N}t{T}.json`（Task 1 图表另存 `public/img/c{N}t{T}-task1.png`）

工作目录：`/Users/macbook14/Projects/雅思刷题网站/app`。所有路径相对它。

## 素材

- `drafts/c{N}/book.txt`：整本书文本，每页以 `######## PAGE n ########` 开头。
- `drafts/c{N}/pages.txt`：页索引（每页前两行）。先看它定位你这套题的页码范围：`Test {T}` 的 Listening / Reading / Writing 页、书末 `Audioscripts`（或 Tapescripts）里 Test {T} 的部分、`Listening and Reading answer keys` 里 Test {T} 的部分、`Sample Writing answers` 里 Test {T} 的两篇（老书可能叫 Model and sample answers for Writing tasks）。
- `drafts/c{N}/source.txt`：原 PDF 路径，渲染 Task 1 图表用。
- **结构样板**：`public/data/listening/c21t1.json`、`public/data/reading/c21t1.json`、`public/data/writing/c21t1.json`。三个文件先各读一遍，输出必须与它们同构。类型定义在 `src/data/types.ts`。

用 `sed -n '/######## PAGE 11 ########/,/######## PAGE 17 ########/p' drafts/c{N}/book.txt` 这类命令按页取文本，不要把整本书读进上下文。

## 硬性要求

1. **内容必须逐字来自书里**，不许编题、不许编答案、不许缩写文章。阅读文章要完整（每篇 700-1000 词），段落按原文分段；有 A-G 段标的（section-match 题型需要）给 `label`。
2. 题型映射（`type` 只能用这些）：
   - 填表 → `table`（`table.head` + `rows`，格内用 `{{n}}` 占位，多行用 `\n`）
   - 填空/笔记/流程图/句子填空 → `notes`（`lines`，小标题行以 `## ` 开头，占位 `{{n}}`）
   - 摘要填空（从文中选词）→ `summary`（`text` 里 `{{n}}`）
   - 摘要选词（给了 A-I 词表）→ `summary-select`（`text` + `options`）
   - 单选 → `mc`（`questions[].options`，A/B/C/D）
   - 多选（Choose TWO letters）→ `mc-multi`（`range` 覆盖两个题号，`count: 2`，answers 里两个题号都写同样的两个字母）
   - 配对（人物/观点/地点/地图标注等，给一个选项表）→ `matching`（`options` + `items`）
   - 段落信息匹配（Which paragraph contains…）→ `section-match`（`options: ["A",...]`）
   - 观点归属（列表 List of People）→ `people-match`
   - TRUE/FALSE/NOT GIVEN → `tfng`；YES/NO/NOT GIVEN → `ynng`（都要 `legend`）
   - 地图/图表标注题如果书里是图片，无法文字化：改成 `matching`，`items` 写题号 + 位置描述，并在 `instruction` 注明"原题为地图标注，见原书"。
3. `answers`：每题一个数组；斜线/括号表示的可接受写法都拆开写，例如答案 `10/ten` → `["10","ten"]`，`(the) weather` → `["weather","the weather"]`，`cafe/café` → `["cafe","café"]`。判断题写 `TRUE`/`FALSE`/`NOT GIVEN` 或 `YES`/`NO`/`NOT GIVEN` 全大写。多选题两个题号各写一份 `["B","D"]`。
4. 听力 `transcript`：把 Audioscript 逐句拆成 `{s, t, q?}`。`s` 是说话人（对话按脚本里的名字，独白用 `SPEAKER`），`t` 是原句。**每道题答案所在的那句加 `q: [n]`**（书里脚本旁边有 Q1、Q2 标记，照它标；两道多选题标 `q: [21, 22]`）。40 题都要标到。不要加时间戳字段（后面脚本统一对齐）。`audio` 填 `/audio/c{N}/t{T}p{k}.mp3`，`duration` 先填 0。
5. 阅读 `explain`：40 题每题 `{loc, key, why}`。`loc` 是段落 `id`（必须是 paragraphs 里存在的 id），`key` 是原文定位句（英文原句），`why` 用中文写为什么是这个答案、题干和原文的同义替换（写法参考 c21t1.json，每条 1-2 句）。这是你唯一需要"写"的东西，其余全是抄。
6. 写作：`prompt` 逐句抄题干；`kind`/`kindZh` 按题型（line-graph 曲线图 / bar-chart 柱状图 / pie-chart 饼图 / table 表格 / process 流程图 / map 地图 / mixed 混合；Task 2：agree-disagree 是否同意 / discuss-both 双边讨论 / advantage-disadvantage 利弊 / problem-solution 问题解决 / two-part 双问题）。`sample` 抄书末该题的考生范文和考官评语（`band` 是评语里给的分）；如果书里这套题只有一篇范文，另一题的 `sample` 写 `{"band": 0, "text": "本书未提供此题范文。", "comment": ""}`。Task 1 的 `data` 字段：如果图表数据能从图上读出就填，读不出就省略。
6b. **范文和评语的抄录方式（必须这样做）**：不要把整篇范文直接写进 JSON。先建 `drafts/c{N}/samples/` 目录，把每篇范文按原文段落**逐段**追加到 `drafts/c{N}/samples/t{T}-task1.txt` / `t{T}-task2.txt`（每段一次单独的 Bash `cat >> 文件 <<'EOF'` 追加，段与段之间空一行；考官评语同样逐段追加到 `t{T}-task1-comment.txt` / `t{T}-task2-comment.txt`）。手写体范文文本层是乱码时，用 `pdftoppm -r 110 -png -f <页> -l <页> "$(cat drafts/c{N}/source.txt)" <输出前缀>` 渲染后用 Read 看图逐段抄。JSON 里 `sample.text` 写 `"@file:drafts/c{N}/samples/t{T}-task1.txt"`，`sample.comment` 写 `"@file:drafts/c{N}/samples/t{T}-task1-comment.txt"`，写完 JSON 后运行 `python3 scripts/fill_samples.py public/data/writing/c{N}t{T}.json` 把占位替换成文件内容，再跑校验。每次输出的内容要短（一段范文），这是为了绕开长文本一次性输出的限制。
7. Task 1 图表：找到 Writing Task 1 那一页的页码，运行
   `python3 scripts/page_image.py "$(cat drafts/c{N}/source.txt)" <页码> public/img/c{N}t{T}-task1.png --crop 0,0.35,1,0.95`
   然后用 Read 工具看一眼生成的 PNG，确认图表完整、没有把题干截掉一半；不合适就调 `--crop` 的四个比例再跑。`image` 字段填 `/img/c{N}t{T}-task1.png`。
8. 顶层字段：`id: "c{N}t{T}"`，`book: "剑桥雅思{N}"`，`test: {T}`，`title: "剑{N} Test {T} · Listening"`（阅读/写作同理）。阅读加 `minutes: 60`。

## 输出必须分块（硬性要求）

一次输出太长的文件会被拦截，所以**不要一次 Write 整份听力或阅读 JSON**：

- 听力：先写 `drafts/c{N}/parts/l-t{T}-meta.json`（id/book/test/title 等顶层字段 + `answers`，不含 parts），再分别写 `l-t{T}-part1.json` … `part4.json`（每个文件就是一个 Part 对象，含 groups 和 transcript），然后 `python3 scripts/merge_paper.py listening {N} {T}` 合并。单个 Part 的 transcript 太长（超过 80 句）时，可以先写不含 transcript 的 Part，再用 Bash 的 python 分两三次把 transcript 句子追加进去。
- 阅读：`r-t{T}-meta.json`（顶层字段 + `answers`）、`r-t{T}-explain.json`（40 题 explain）、`r-t{T}-passage1.json` … `passage3.json`（每个是一个 Passage 对象），然后 `python3 scripts/merge_paper.py reading {N} {T}`。
- 写作：范文按第 6b 条逐段抄。

合并后再跑校验。这些中间文件放 `drafts/`，不会提交。

## 校验（必须通过才算完成）

```bash
python3 scripts/validate_paper.py listening public/data/listening/c{N}t{T}.json
python3 scripts/validate_paper.py reading   public/data/reading/c{N}t{T}.json
python3 scripts/validate_paper.py writing   public/data/writing/c{N}t{T}.json
```

三个都打印 `✓` 才算完成。报错就改到通过。**只允许创建/修改上面 4 个产出文件和 `drafts/c{N}/samples/`、`drafts/c{N}/parts/` 下的中间文件**，不要改脚本、不要改其它试卷、不要 git 操作。

## 最后汇报（简短）

一段话：三个文件是否通过校验；每科用了哪些页；有没有无法文字化的题（地图题等）和你的处理；答案里有没有拿不准的地方。不要贴 JSON 内容。

## 扫描件（OCR）书的额外要求

剑9、16、18、19、20 的 `drafts/c{N}/book.txt` 是 tesseract OCR 的结果，正文可靠，但：

- **答案页是双栏排版，OCR 会把左右两栏交错、把 C 认成 Cc、D 认成 OD、31 认成 3)、I 认成 i"**。所以答案不能只信文本：`drafts/c{N}/pages/p-<页码>.png` 是每页的渲染图，用 Read 工具打开 Test {T} 的听力、阅读答案页图片，逐题对照后再写 `answers`。80 个答案每一个都要和图片核对。
- Audioscript 里标题号的 `Q1`、`Q2` 小字可能丢失或错位；用答案词在脚本里的位置判断 `q` 标到哪一句。
- 题干里的 `…………` 空格线可能被识别成乱码，按题号补 `{{n}}`。
- 阅读文章里偶发的 OCR 错字（如 `tbe` → `the`、`1ong` → `long`）可以修正；但不要改写句子。
- 写作 Task 1 的图表同样用 `page_image.py` 渲染（`source.txt` 里是原 PDF 路径）。
