#!/usr/bin/env python3
"""
扫描版真题 OCR 管线：PDF → 逐页 PNG → tesseract OCR → 草稿 JSON（含每页文本、题号候选、低置信度标记）。

产出的是"草稿"，需要人工校对后再整理成 public/data/{listening,reading,writing}/<id>.json
（结构见 README 的「数据格式」一节，或直接参考 c21t1.json）。

依赖：poppler（pdftoppm）、tesseract（含 eng 语言包）。
  brew install poppler tesseract

用法：
  python3 scripts/ocr_paper.py "<真题 PDF>" --out drafts/c20t1 [--dpi 300] [--pages 1-34]

输出：
  drafts/c20t1/pages/p-001.png ...    渲染的页图（校对时对照看）
  drafts/c20t1/ocr.json               每页 {page, text, avg_conf, low_conf_lines[], question_numbers[]}
  drafts/c20t1/ocr.txt                纯文本拼接（方便直接复制到 JSON）
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def render_pages(pdf: str, out: Path, dpi: int, first: int | None, last: int | None) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    cmd = ["pdftoppm", "-r", str(dpi), "-png"]
    if first:
        cmd += ["-f", str(first)]
    if last:
        cmd += ["-l", str(last)]
    cmd += [pdf, str(out / "p")]
    subprocess.run(cmd, check=True)
    return sorted(out.glob("p-*.png"))


def ocr_page(png: Path) -> dict:
    """tesseract TSV 输出 → 文本 + 逐行置信度。"""
    tsv = run(["tesseract", str(png), "-", "--psm", "6", "-l", "eng", "tsv"])
    lines: dict[tuple, list] = {}
    confs: list[float] = []
    for row in tsv.splitlines()[1:]:
        cols = row.split("\t")
        if len(cols) < 12 or not cols[11].strip():
            continue
        key = (cols[1], cols[2], cols[3], cols[4])  # page, block, par, line
        conf = float(cols[10])
        lines.setdefault(key, []).append((cols[11], conf))
        if conf >= 0:
            confs.append(conf)
    text_lines = []
    low = []
    for words in lines.values():
        t = " ".join(w for w, _ in words)
        c = sum(c for _, c in words if c >= 0) / max(1, len([1 for _, c in words if c >= 0]))
        text_lines.append(t)
        if c < 70:
            low.append({"text": t, "conf": round(c, 1)})
    text = "\n".join(text_lines)
    qnums = sorted({int(m) for m in re.findall(r"(?m)^\s*(\d{1,2})[\s.)]", text) if 1 <= int(m) <= 40})
    return {
        "text": text,
        "avg_conf": round(sum(confs) / max(1, len(confs)), 1),
        "low_conf_lines": low,
        "question_numbers": qnums,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--out", required=True)
    ap.add_argument("--dpi", type=int, default=300)
    ap.add_argument("--pages", help="如 3-20")
    args = ap.parse_args()

    first = last = None
    if args.pages:
        a, _, b = args.pages.partition("-")
        first, last = int(a), int(b or a)

    out = Path(args.out)
    pngs = render_pages(args.pdf, out / "pages", args.dpi, first, last)
    print(f"rendered {len(pngs)} pages", file=sys.stderr)

    pages = []
    for i, png in enumerate(pngs, 1):
        r = ocr_page(png)
        r["page"] = int(png.stem.split("-")[-1])
        r["image"] = str(png)
        pages.append(r)
        flag = " ⚠ low" if r["avg_conf"] < 80 else ""
        print(f"[{i}/{len(pngs)}] page {r['page']} conf={r['avg_conf']} q={r['question_numbers']}{flag}", file=sys.stderr)

    json.dump({"source": Path(args.pdf).name, "dpi": args.dpi, "pages": pages}, open(out / "ocr.json", "w"), ensure_ascii=False, indent=1)
    with open(out / "ocr.txt", "w") as f:
        for p in pages:
            f.write(f"\n\n######## PAGE {p['page']} (conf {p['avg_conf']}) ########\n")
            f.write(p["text"])
    print(f"done → {out}/ocr.json, {out}/ocr.txt", file=sys.stderr)


if __name__ == "__main__":
    main()
