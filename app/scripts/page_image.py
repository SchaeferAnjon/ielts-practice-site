#!/usr/bin/env python3
"""
把 PDF 的某一页渲染成 PNG 并裁掉四周空白（用于写作 Task 1 的图表）。

  python3 scripts/page_image.py "<书.pdf>" 30 public/img/c17t1-task1.png [--dpi 170] [--crop x0,y0,x1,y1]

--crop 用 0-1 的比例坐标（相对整页）先裁一刀，再自动去白边；不给就整页去白边。
"""
import argparse
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageChops


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("page", type=int)
    ap.add_argument("out")
    ap.add_argument("--dpi", type=int, default=170)
    ap.add_argument("--crop", help="x0,y0,x1,y1 比例坐标")
    args = ap.parse_args()
    with tempfile.TemporaryDirectory() as td:
        subprocess.run(["pdftoppm", "-r", str(args.dpi), "-png", "-f", str(args.page), "-l", str(args.page), args.pdf, f"{td}/p"], check=True)
        png = next(Path(td).glob("p*.png"))
        im = Image.open(png).convert("RGB")
        if args.crop:
            x0, y0, x1, y1 = [float(v) for v in args.crop.split(",")]
            w, h = im.size
            im = im.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
        bg = Image.new("RGB", im.size, (255, 255, 255))
        diff = ImageChops.difference(im, bg).convert("L").point(lambda p: 255 if p > 40 else 0)
        box = diff.getbbox()
        if box:
            pad = 12
            im = im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad)))
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        im.save(args.out, optimize=True)
        print(f"{args.out} {im.size}")


if __name__ == "__main__":
    main()
