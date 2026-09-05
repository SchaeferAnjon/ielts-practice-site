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
7. Task 1 图表：找到 Writing Task 1 那一页的页码，运行
   `python3 scripts/page_image.py "$(cat drafts/c{N}/source.txt)" <页码> public/img/c{N}t{T}-task1.png --crop 0,0.35,1,0.95`
   然后用 Read 工具看一眼生成的 PNG，确认图表完整、没有把题干截掉一半；不合适就调 `--crop` 的四个比例再跑。`image` 字段填 `/img/c{N}t{T}-task1.png`。
8. 顶层字段：`id: "c{N}t{T}"`，`book: "剑桥雅思{N}"`，`test: {T}`，`title: "剑{N} Test {T} · Listening"`（阅读/写作同理）。阅读加 `minutes: 60`。

## 校验（必须通过才算完成）

```bash
python3 scripts/validate_paper.py listening public/data/listening/c{N}t{T}.json
python3 scripts/validate_paper.py reading   public/data/reading/c{N}t{T}.json
python3 scripts/validate_paper.py writing   public/data/writing/c{N}t{T}.json
```

三个都打印 `✓` 才算完成。报错就改到通过。**只允许创建/修改上面 4 个产出文件**，不要改脚本、不要改其它试卷、不要 git 操作。

## 最后汇报（简短）

一段话：三个文件是否通过校验；每科用了哪些页；有没有无法文字化的题（地图题等）和你的处理；答案里有没有拿不准的地方。不要贴 JSON 内容。
