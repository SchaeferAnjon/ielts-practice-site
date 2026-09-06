#!/usr/bin/env python3
"""
把写作 JSON 里 sample.text / sample.comment / prompt 中形如 "@file:<路径>" 的占位替换成文件内容。
用途：范文（尤其是手写体扫描）按段落分次抄进 drafts/cN/samples/*.txt，再一次性拼进 JSON，
避免在一次输出里复现整篇文章。

  python3 scripts/fill_samples.py public/data/writing/c15t3.json

文件内容按原段落分段（空行分隔），首尾空白去掉，段内换行合并成空格。路径相对 app 目录。
"""
import json
import re
import sys
from pathlib import Path


def load(path: str) -> str:
    raw = Path(path).read_text(encoding="utf-8").strip()
    paras = [re.sub(r"\s*\n\s*", " ", p.strip()) for p in re.split(r"\n\s*\n", raw) if p.strip()]
    return "\n\n".join(paras)


def walk(o):
    if isinstance(o, dict):
        return {k: walk(v) for k, v in o.items()}
    if isinstance(o, list):
        return [walk(v) for v in o]
    if isinstance(o, str) and o.startswith("@file:"):
        return load(o[6:].strip())
    return o


def main() -> None:
    p = Path(sys.argv[1])
    d = json.loads(p.read_text(encoding="utf-8"))
    d = walk(d)
    p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    left = re.findall(r"@file:[^\"]+", p.read_text(encoding="utf-8"))
    print(f"filled {p}" + (f"，仍有未替换占位: {left}" if left else ""))


if __name__ == "__main__":
    main()
