#!/usr/bin/env python3
"""
阅读 explain 的 key（原文定位句）不用模型逐字抄：模型在 explain 里给 `keyHint`（该句里 3-6 个有辨识度的词），
本脚本在 loc 指向的段落（找不到就全文）里找包含这些词最多的句子，写进 `key`，并删掉 keyHint。

  python3 scripts/fill_keys.py public/data/reading/c11t1.json
"""
import json
import re
import sys
from pathlib import Path

SENT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'(])")


def sentences(text: str) -> list[str]:
    return [s.strip() for s in SENT_RE.split(text) if s.strip()]


def main() -> None:
    p = Path(sys.argv[1])
    d = json.loads(p.read_text(encoding="utf-8"))
    # 段落 id 可能在不同 passage 里重复（都叫 p1…），按题号先定位到所属 passage 再找段落
    def passage_for(n: int):
        for ps in d["passages"]:
            for g in ps.get("groups", []):
                if g["range"][0] <= n <= g["range"][1]:
                    return ps
        return None

    filled = unresolved = 0
    for n, ex in d.get("explain", {}).items():
        hint = ex.pop("keyHint", None)
        if not hint or ex.get("key"):
            continue
        words = [w.lower()[:5] for w in re.findall(r"[A-Za-z0-9']+", hint) if len(w) > 2]
        ps = passage_for(int(n))
        paras = {x["id"]: x["text"] for x in (ps["paragraphs"] if ps else [])}
        pools = []
        if ex.get("loc") in paras:
            pools.append(paras[ex["loc"]])
        if ps:
            pools.append(" ".join(x["text"] for x in ps["paragraphs"]))
        pools.append(" ".join(x["text"] for p2 in d["passages"] for x in p2["paragraphs"]))
        best, best_score = "", 0
        for pool in pools:
            for s in sentences(pool):
                sw = {x[:5] for x in re.findall(r"[a-z0-9']+", s.lower())}
                score = sum(1 for w in words if w in sw)
                if score > best_score:
                    best, best_score = s, score
            if best_score >= max(2, len(words) - 1):
                break
        if best_score >= 2:
            ex["key"] = best
            filled += 1
        else:
            ex["key"] = hint
            unresolved += 1
            print(f"  Q{n}: 没找到匹配句，keyHint 原样写入: {hint}")
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"filled {filled} keys, unresolved {unresolved} → {p}")


if __name__ == "__main__":
    main()
