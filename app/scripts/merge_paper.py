#!/usr/bin/env python3
"""
把分块写好的试卷片段合并成最终 JSON（避免一次输出整份含原文/文章的大文件）。

  python3 scripts/merge_paper.py listening 13 1
      读 drafts/c13/parts/l-t1-meta.json   （顶层字段 + answers，不含 parts）
         drafts/c13/parts/l-t1-part1.json … l-t1-part4.json（每个是一个 Part 对象）
      写 public/data/listening/c13t1.json

  python3 scripts/merge_paper.py reading 13 1
      读 drafts/c13/parts/r-t1-meta.json   （顶层字段 + answers + explain，不含 passages）
         drafts/c13/parts/r-t1-passage1.json … passage3.json（每个是一个 Passage 对象）
      写 public/data/reading/c13t1.json

meta 里也可以不放 answers/explain，而是单独放 l-t1-answers.json / r-t1-answers.json / r-t1-explain.json，脚本会一起合并。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(p: Path):
    return json.loads(p.read_text(encoding="utf-8"))


def main() -> None:
    mod, n, t = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    d = ROOT / "drafts" / f"c{n}" / "parts"
    pre = ("l" if mod == "listening" else "r") + f"-t{t}"
    out = load(d / f"{pre}-meta.json")
    for extra in ("answers", "explain"):
        f = d / f"{pre}-{extra}.json"
        if f.exists():
            out[extra] = load(f)
    if mod == "listening":
        out["parts"] = [load(d / f"{pre}-part{k}.json") for k in range(1, 5)]
    else:
        out["passages"] = [load(d / f"{pre}-passage{k}.json") for k in range(1, 4)]
    dst = ROOT / "public" / "data" / mod / f"c{n}t{t}.json"
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"merged → {dst.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
