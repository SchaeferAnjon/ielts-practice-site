#!/usr/bin/env python3
"""
把一本剑桥雅思真题 PDF 拆成带页码标记的文本，供后续（人或子 Agent）按页抽题。

  python3 scripts/dump_book.py "<书.pdf>" --out drafts/c17            # 有文字层
  python3 scripts/dump_book.py "<书.pdf>" --out drafts/c19 --ocr      # 扫描件（tesseract，慢）

产出：
  <out>/book.txt    全书文本，每页以 "######## PAGE n ########" 开头
  <out>/pages.txt   页索引：每页前两行非空文本，用来定位 Test / Listening / Reading / Audioscripts / answer keys
  <out>/source.txt  原 PDF 路径（后续渲染图表用）
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def text_pages(pdf: str) -> list[str]:
    return run(["pdftotext", "-layout", pdf, "-"]).split("\f")


def ocr_pages(pdf: str, out: Path, dpi: int = 250) -> list[str]:
    img_dir = out / "pages"
    img_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(["pdftoppm", "-r", str(dpi), "-png", pdf, str(img_dir / "p")], check=True)
    pngs = sorted(img_dir.glob("p-*.png"))
    pages = []
    for i, png in enumerate(pngs, 1):
        txt = run(["tesseract", str(png), "-", "--psm", "6", "-l", "eng"])
        pages.append(txt)
        print(f"  ocr {i}/{len(pngs)}", end="\r", file=sys.stderr)
    print(file=sys.stderr)
    return pages


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--out", required=True)
    ap.add_argument("--ocr", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    pages = ocr_pages(args.pdf, out) if args.ocr else text_pages(args.pdf)
    with open(out / "book.txt", "w") as f, open(out / "pages.txt", "w") as idx:
        for i, p in enumerate(pages, 1):
            f.write(f"\n######## PAGE {i} ########\n{p}")
            first = [l.strip() for l in p.splitlines() if l.strip()][:2]
            idx.write(f"{i:4d} | {' / '.join(first)[:100]}\n")
    (out / "source.txt").write_text(str(Path(args.pdf).resolve()))
    total = sum(len(p) for p in pages)
    print(f"{len(pages)} pages, {total} chars → {out}/book.txt", file=sys.stderr)
    if total < 200 * len(pages):
        print("⚠ 文本量很少，这本可能是扫描件，请加 --ocr 重跑", file=sys.stderr)
    # 关键页提示
    for i, p in enumerate(pages, 1):
        head = " ".join(l.strip() for l in p.splitlines() if l.strip())[:80]
        if re.search(r"^(Test\s*\d|Audioscripts|Listening and Reading answer keys|Sample Writing answers|Answer key|Tapescripts?)", head, re.I):
            print(f"  p{i}: {head[:60]}", file=sys.stderr)


if __name__ == "__main__":
    main()
