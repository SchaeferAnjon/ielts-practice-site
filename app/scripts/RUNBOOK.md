# 批量数字化运行手册（给接手的会话）

状态看板：`dispatch` 任务 task-che。已上线的套数看 `public/data/index.json`。

## 每套题的循环

1. 起子 Agent（Sonnet 5；写作范文必须按 AGENT_TASK.md 第 6b 条分段抄，否则整份 JSON 一次输出会被内容过滤拦截），prompt 固定为：
   「请严格按照 /Users/macbook14/Projects/雅思刷题网站/app/scripts/AGENT_TASK.md 的说明完成任务。占位符取值：{BOOK}=剑桥雅思N，{N}=N，{T}=T。…（OCR 书加：注意最后一节"扫描件（OCR）书的额外要求"，答案页必须用 Read 打开 drafts/cN/pages/p-<页码>.png 逐题核对；答案页是左右两栏）」
   同时最多跑 4 个。
2. 子 Agent 回报后：
   ```bash
   cd /Users/macbook14/Projects/雅思刷题网站/app
   for m in listening reading writing; do python3 scripts/validate_paper.py $m public/data/$m/cNtT.json; done
   node scripts/check_answers.mjs cNtT          # 答案回环 + 选项一致性，必须通过
   python3 scripts/optimize_images.py cNtT      # Task 1 图表 PNG → WebP（只处理这一套，别处理制作中的）
   # 听力时间戳（ASR 结果在 scratchpad/asr/cN/tTp1-4_volc.json；没有就先跑 asr_volc.py，见 README）
   python3 scripts/align_transcript.py public/data/listening/cNtT.json --asr-dir <asr 目录>/cN
   python3 scripts/build_index.py --audio-manifest ../audio/manifest.json --audio-base https://schaeferanjon.github.io/ielts-audio --exclude <仍在制作中的 id，逗号分隔>
   cd .. && git add -A -- . ':!app/public/data/*/<制作中 id>.json' ':!app/public/img/<制作中 id>*' && git commit -m "feat: 剑N Test T 上线" && git push
   ```
   推送后 GitHub Actions 自动部署到 https://schaeferanjon.github.io/ielts-practice-site/ 。

## 素材状态

- 文字层书（drafts/cN/book.txt 已生成）：21、17、15、14、13、12、11、10、8、7、6、5、4
- OCR 书（drafts/cN/book.txt + pages/*.png）：19、18、16、9。剑20 只有 Test1-3 的单套扫描 PDF（`剑20完整/剑20-TestN.pdf`），要先 `dump_book.py --ocr`。
- 音频：`../audio/manifest.json`（完整四段的 31 套），已托管在 https://schaeferanjon.github.io/ielts-audio/ 。
- ASR：豆包（VOLC_ASR_KEY 环境变量），脚本 `~/.claude/skills/video-to-notes/scripts/asr_volc.py`。

## 顺序建议

新书优先：19 → 18 → 16 → 15 → 14 → 13 → 12 → 11 → 10 → 9 → 8 → 7 → 6 → 5 → 4 → 20。
