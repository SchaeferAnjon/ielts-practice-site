#!/usr/bin/env python3
"""
书里没有听力原文（剑20 精简版）时，用 ASR 转写生成 transcript：
每条 utterance 一句（s 固定 SPEAKER，带 start/end 秒），并把填空类答案能在句中找到的题号自动标上 q；
找不到的（选择题字母、多词答案）打印出来，由子 Agent 对照题目手动补 q。

  python3 scripts/asr_transcript.py public/data/listening/c20t1.json --asr-dir <asr>/c20
"""
import argparse
import json
import re
from pathlib import Path


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", s.lower().replace("’", "'")).strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("paper_json")
    ap.add_argument("--asr-dir", required=True)
    args = ap.parse_args()
    p = Path(args.paper_json)
    d = json.loads(p.read_text(encoding="utf-8"))
    t = d["test"]
    missing_all = []
    for part in d["parts"]:
        k = part["part"]
        f = Path(args.asr_dir) / f"t{t}p{k}_volc.json"
        if not f.exists():
            print(f"Part {k}: 没有 {f}，跳过（transcript 保持原样）")
            continue
        asr = json.loads(f.read_text(encoding="utf-8"))
        lines = []
        for u in asr["utterances"]:
            txt = u["text"].strip()
            if not txt:
                continue
            lines.append({"s": "SPEAKER", "t": txt, "start": round(u["start_time"] / 1000, 2), "end": round(u["end_time"] / 1000, 2)})
        # 自动标 q：答案（非单字母）出现在哪句
        rng = set()
        for g in part["groups"]:
            rng |= set(range(g["range"][0], g["range"][1] + 1))
        found = set()
        for n in sorted(rng):
            cands = [norm(a) for a in d["answers"].get(str(n), []) if len(a) > 1 and not re.fullmatch(r"[A-Z]", a)]
            for ln in lines:
                lt = norm(ln["t"])
                if any(c and re.search(r"\b" + re.escape(c) + r"\b", lt) for c in cands):
                    ln.setdefault("q", [])
                    if n not in ln["q"]:
                        ln["q"].append(n)
                    found.add(n)
                    break
        missing = sorted(rng - found)
        missing_all += missing
        part["transcript"] = lines
        part["duration"] = round(asr.get("duration_ms", 0) / 1000)
        print(f"Part {k}: {len(lines)} 句，自动标到 {len(found)} 题，待手动标 q: {missing}")
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"written {p}；待手动标注题号 {missing_all}")


if __name__ == "__main__":
    main()
