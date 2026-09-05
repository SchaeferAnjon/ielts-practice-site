#!/usr/bin/env python3
"""
扫描 public/data/{listening,reading,writing}/*.json 和音频仓库的 manifest.json，
生成前端用的题库清单 public/data/index.json：

{
  "audioBase": "https://schaeferanjon.github.io/ielts-audio",   # 音频仓库 Pages 地址
  "papers": [{"id":"c21t1","book":"剑桥雅思21","bookShort":"剑21","test":1,"type":"A",
              "modules":["listening","reading","writing"],"audioParts":[1,2,3,4]}, ...]
}

用法：python3 scripts/build_index.py --audio-manifest ../audio/manifest.json --audio-base https://schaeferanjon.github.io/ielts-audio
"""
import argparse
import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "public" / "data"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio-manifest", default=None)
    ap.add_argument("--audio-base", default="")
    ap.add_argument("--exclude", default="", help="逗号分隔的试卷 id，正在制作中的不进清单")
    args = ap.parse_args()
    audio = json.load(open(args.audio_manifest))["books"] if args.audio_manifest else {}

    exclude = {x.strip() for x in args.exclude.split(",") if x.strip()}
    papers: dict[str, dict] = {}
    for module in ("listening", "reading", "writing"):
        for f in sorted((DATA / module).glob("c*t*.json")):
            if f.stem in exclude:
                continue
            d = json.load(open(f))
            m = re.match(r"c(\d+)t(\d+)", f.stem)
            if not m:
                continue
            n, t = int(m.group(1)), int(m.group(2))
            p = papers.setdefault(f.stem, {"id": f.stem, "book": d.get("book", f"剑桥雅思{n}"), "bookShort": f"剑{n}", "bookNo": n, "test": t, "type": "A", "modules": [], "audioParts": []})
            p["modules"].append(module)
    for p in papers.values():
        parts = audio.get(f"c{p['bookNo']}", {}).get(f"t{p['test']}", {}).get("parts", [])
        p["audioParts"] = parts
        # 听力没有完整音频时仍保留 JSON，但前端按 audioParts 提示缺失
    ordered = sorted(papers.values(), key=lambda p: (-p["bookNo"], p["test"]))
    # 补上还没数字化的套数占位（首页灰显）
    books = sorted({p["bookNo"] for p in ordered} | set(range(4, 22)), reverse=True)
    full = []
    for n in books:
        for t in (1, 2, 3, 4):
            pid = f"c{n}t{t}"
            full.append(papers.get(pid) or {"id": pid, "book": f"剑桥雅思{n}", "bookShort": f"剑{n}", "bookNo": n, "test": t, "type": "A", "modules": [], "audioParts": audio.get(f"c{n}", {}).get(f"t{t}", {}).get("parts", [])})
    out = {"audioBase": args.audio_base.rstrip("/"), "papers": full}
    json.dump(out, open(DATA / "index.json", "w"), ensure_ascii=False, indent=1)
    done = [p["id"] for p in full if p["modules"]]
    print(f"index.json: {len(done)} 套已数字化 → {' '.join(done)}")


if __name__ == "__main__":
    main()
