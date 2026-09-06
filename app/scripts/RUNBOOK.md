# 批量数字化运行手册（给接手的会话）

状态看板：`dispatch` 任务 task-che。已上线的套数看 `public/data/index.json`。

## 每套题的循环

1. 起子 Agent（Sonnet 5；写作范文必须按 AGENT_TASK.md 第 6b 条分段抄，否则整份 JSON 一次输出会被内容过滤拦截），prompt 固定为：
   「请严格按照 /Users/macbook14/Projects/雅思刷题网站/app/scripts/AGENT_TASK.md 的说明完成任务。占位符取值：{BOOK}=剑桥雅思N，{N}=N，{T}=T。…（OCR 书加：注意最后一节"扫描件（OCR）书的额外要求"，答案页必须用 Read 打开 drafts/cN/pages/p-<页码>.png 逐题核对；答案页是左右两栏）」
   同时最多跑 4 个。
2. 子 Agent 回报后（一条命令做完校验、答案回环、图片转 WebP、听力对齐、清单、冒烟测试，任何一步失败都会退出非 0）：
   ```bash
   cd /Users/macbook14/Projects/雅思刷题网站/app
   scripts/publish.sh cNtT --exclude <仍在制作中的 id，逗号分隔> --asr <scratchpad>/asr
   cd .. && git add -A -- . ':!app/public/data/*/<制作中 id>.json' ':!app/public/img/<制作中 id>*' && git commit -m "feat: 剑N Test T 上线" && git push
   ```
   推送后 GitHub Actions 自动部署到 https://schaeferanjon.github.io/ielts-practice-site/ 。

## 素材状态

- 文字层书（drafts/cN/book.txt 已生成）：21、17、15、14、13、12、11、10、7、6、5、4（剑10 有字母间空格、剑11/13 划线答案词乱码，用 book_text.py 切后修补）
- OCR 书（drafts/cN/book.txt + pages/*.png，book_text.py 加 --book）：19、18、16、9、8（剑8 文字层没有空格，已重 OCR）。剑20 只有 Test1-3 的单套扫描 PDF（`剑20完整/剑20-TestN.pdf`），要先 `dump_book.py --ocr`。
- 音频：`../audio/manifest.json`（完整四段的 31 套），已托管在 https://schaeferanjon.github.io/ielts-audio/ 。
- ASR：豆包（VOLC_ASR_KEY 环境变量），脚本 `~/.claude/skills/video-to-notes/scripts/asr_volc.py`。

## 老书（剑4-8）注意

听力叫 SECTION，原文叫 Tapescripts / Audio Scripts（剑4 从 p131、剑5 p129、剑6 p128、剑7 p134、剑8 p129 起），答案页叫 Answer Key，书末有 General Training 试卷（不做），范文在 Model and Sample Answers（每套常只给一题）。剑9/10 没有音频。

## 现状（2026-09-06）

剑4-21 共 71 套全部上线（剑20 只有 Test 1-3 的精简版资料，T2/T3 无听力）。剩余缺口只在音频：34 套四段齐全，20 套缺一到三段，15 套（剑9、剑10、剑4、剑17 T3、剑7 T3/T4）完全没有音频——资料里没有，补齐只能靠用户另找官方音频后跑 `audio_ingest.py`。

## 顺序建议（已完成，留作参考）

新书优先：19 → 18 → 16 → 15 → 14 → 13 → 12 → 11 → 10 → 9 → 8 → 7 → 6 → 5 → 4 → 20。
