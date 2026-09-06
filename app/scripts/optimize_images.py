#!/usr/bin/env python3
"""
把 public/img 里的 PNG 图表转成 WebP（最宽 1200px，质量 82），删掉 PNG，并把写作 JSON 里的
`image` 路径从 .png 改成 .webp。体积约为原来的 1/5，前端不用改。

  python3 scripts/optimize_images.py            # 处理全部
  python3 scripts/optimize_images.py c14t1      # 只处理某套（前缀匹配）
"""
import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "public" / "img"
WRITING = ROOT / "public" / "data" / "writing"
MAX_W = 1200


def convert(png: Path) -> Path:
    webp = png.with_suffix(".webp")
    im = Image.open(png).convert("RGB")
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    im.save(webp, "WEBP", quality=82, method=6)
    png.unlink()
    return webp


def main() -> None:
    prefix = sys.argv[1] if len(sys.argv) > 1 else ""
    before = after = 0
    for png in sorted(IMG.glob(f"{prefix}*.png")):
        before += png.stat().st_size
        webp = convert(png)
        after += webp.stat().st_size
        print(f"{png.name} → {webp.name} {webp.stat().st_size // 1024}KB")
    for js in sorted(WRITING.glob(f"{prefix}*.json")):
        s = js.read_text(encoding="utf-8")
        s2 = s.replace('.png"', '.webp"')
        if s2 != s:
            js.write_text(s2, encoding="utf-8")
            print(f"updated {js.name}")
    if before:
        print(f"{before // 1024}KB → {after // 1024}KB")


if __name__ == "__main__":
    main()
