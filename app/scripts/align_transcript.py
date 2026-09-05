#!/usr/bin/env python3
"""
把豆包 ASR（火山引擎 Seed-ASR，含 words 级时间戳）的结果对齐到听力 JSON 的 transcript 上，
给每句写入精确的 start（开始秒）和 end（结束秒），替换前端按台词长度估算的时间。

流程：
  1. 用 ~/.claude/skills/video-to-notes/scripts/asr_volc.py 转写 public/audio/<book>/*.mp3 → *_volc.json
  2. python3 scripts/align_transcript.py public/data/listening/c21t1.json --asr-dir <存 _volc.json 的目录>

对齐算法：两边都切成归一化的词序列，difflib.SequenceMatcher 做全局对齐，
transcript 每句取其首/尾词对应的 ASR 词时间；没匹配上的词向邻近匹配点回退。
"""
import argparse
import difflib
import json
import re
import sys
from pathlib import Path


def tokens(text: str) -> list[str]:
    text = text.lower().replace("’", "'")
    text = re.sub(r"£(\d+)", r"\1 pounds", text)
    return re.findall(r"[a-z0-9']+", text)


def align_part(part: dict, asr: dict) -> dict:
    words = [w for u in asr["utterances"] for w in u.get("words", []) if w.get("start_time", -1) >= 0 and w["text"].strip()]
    a_tok: list[str] = []
    a_idx: list[int] = []  # token -> word index
    for i, w in enumerate(words):
        for t in tokens(w["text"]):
            a_tok.append(t)
            a_idx.append(i)

    b_tok: list[str] = []
    b_line: list[int] = []
    for li, line in enumerate(part["transcript"]):
        for t in tokens(line["t"]):
            b_tok.append(t)
            b_line.append(li)

    sm = difflib.SequenceMatcher(None, a_tok, b_tok, autojunk=False)
    b2a: dict[int, int] = {}
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            b2a[blk.b + k] = blk.a + k

    matched = len(b2a)
    n_lines = len(part["transcript"])
    stats = {"tokens": len(b_tok), "matched": matched, "lines": n_lines, "unaligned": 0}

    # 每句的 token 范围
    ranges: dict[int, list[int]] = {}
    for bi, li in enumerate(b_line):
        ranges.setdefault(li, [bi, bi])[1] = bi

    prev_end = 0.0
    for li, line in enumerate(part["transcript"]):
        if li not in ranges:
            continue
        b0, b1 = ranges[li]
        hits = [b2a[b] for b in range(b0, b1 + 1) if b in b2a]
        if not hits:
            stats["unaligned"] += 1
            line["start"] = round(prev_end, 2)
            line["end"] = round(prev_end, 2)
            line["estimated"] = True
            continue
        start = words[a_idx[min(hits)]]["start_time"] / 1000
        end = words[a_idx[max(hits)]]["end_time"] / 1000
        line["start"] = round(max(start, 0), 2)
        line["end"] = round(max(end, start), 2)
        line.pop("estimated", None)
        prev_end = line["end"]
    return stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("paper_json")
    ap.add_argument("--asr-dir", required=True)
    args = ap.parse_args()

    paper = json.load(open(args.paper_json))
    for part in paper["parts"]:
        stem = Path(part["audio"]).stem
        asr_path = Path(args.asr_dir) / f"{stem}_volc.json"
        if not asr_path.exists():
            print(f"Part {part['part']}: 没有 {asr_path}，跳过", file=sys.stderr)
            continue
        asr = json.load(open(asr_path))
        st = align_part(part, asr)
        if asr.get("duration_ms"):
            part["duration"] = round(asr["duration_ms"] / 1000)
        print(f"Part {part['part']}: {st['matched']}/{st['tokens']} 词对齐，{st['lines']} 句中 {st['unaligned']} 句未对齐（沿用上一句结束时间）", file=sys.stderr)
    json.dump(paper, open(args.paper_json, "w"), ensure_ascii=False, indent=2)
    print(f"written {args.paper_json}", file=sys.stderr)


if __name__ == "__main__":
    main()
