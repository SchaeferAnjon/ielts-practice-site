#!/usr/bin/env python3
"""
把资料里五花八门命名的听力 MP3 统一归档并转码（单声道 48 kbps，体积约为原来的 1/3），
输出到音频仓库目录：<out>/c<book>/t<test>p<part>.mp3，并生成 <out>/manifest.json
（每本书每套题有哪些 Part 的音频，缺的列出来）。

  python3 scripts/audio_ingest.py "<剑雅真题根目录>" --out ../audio [--dry-run]

识别的文件名模式（不区分大小写；"(1)" 结尾的重复下载会跳过）：
  Test1-Part1 / Test 1 Part 1 / Test1_Section1 / Test2-s3 / Test I Section 1
  T1S1 / C14T1S1 / IELTS15_test1_audio1 / ELT_IELTS17_t1_audio1 / IELTS 12 Test 5_S1（剑12 的 Test 5-8 = 1-4）
其余（如剑13 的 CD Track、剑7 的 AudioTrack）无法从文件名判断 Test/Part，会列在 manifest 的 unmapped 里。
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

# 文件名里没有 Test/Part 信息的，用 ASR 转写和书里 audioscript 比对后人工确认的映射（文件名 → (书, test, part)）
MANUAL = {
    "IELTS 13 - Tests 1-4 CD 1 Track_01.mp3": (13, 1, 1), "IELTS 13 - Tests 1-4 CD 1 Track_02.mp3": (13, 1, 2),
    "IELTS 13 - Tests 1-4 CD 1 Track_03.mp3": (13, 1, 3), "IELTS 13 - Tests 1-4 CD 1 Track_07.mp3": (13, 2, 3),
    "IELTS 13 - Tests 1-4 CD 1 Track_08.mp3": (13, 2, 4), "IELTS 13 - Tests 1-4 CD 2 Track_01.mp3": (13, 3, 1),
    "IELTS 13 - Tests 1-4 CD 2 Track_02.mp3": (13, 3, 2), "IELTS 13 - Tests 1-4 CD 2 Track_03.mp3": (13, 3, 3),
    "IELTS 13 - Tests 1-4 CD 2 Track_04.mp3": (13, 3, 4), "IELTS 13 - Tests 1-4 CD 2 Track_05.mp3": (13, 4, 1),
    "IELTS 13 - Tests 1-4 CD 2 Track_06.mp3": (13, 4, 2), "IELTS 13 - Tests 1-4 CD 2 Track_07.mp3": (13, 4, 3),
    "02-AudioTrack 02.mp3": (7, 1, 2), "04-AudioTrack 04.mp3": (7, 1, 4),
    "07-AudioTrack 07.mp3": (7, 2, 3), "08-AudioTrack 08.mp3": (7, 2, 4),
}

PATTERNS = [
    re.compile(r"test\s*(\d|I)\s*[-_ ，,]*\s*(?:part|section|audio|s|p)\s*(\d)", re.I),
    re.compile(r"(?:\b|_)t\s*(\d)\s*(?:s|p|_audio)\s*(\d)", re.I),
    re.compile(r"C\d+T(\d)S(\d)", re.I),
]


def parse(name: str) -> tuple[int, int] | None:
    for pat in PATTERNS:
        m = pat.search(name)
        if m:
            t = 1 if m.group(1).upper() == "I" else int(m.group(1))
            return t, int(m.group(2))
    return None


def book_of(path: Path) -> int | None:
    for part in path.parts[::-1]:
        m = re.search(r"真题\s*(\d+)|剑\s*(\d+)|IELTS\s*(\d+)|C(\d+)T", part, re.I)
        if m:
            return int(next(g for g in m.groups() if g))
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("--out", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--bitrate", default="48k")
    args = ap.parse_args()
    out = Path(args.out)
    files = sorted(p for p in Path(args.root).rglob("*.mp3") if "(1)" not in p.name and not p.name.startswith("."))
    manifest: dict = {"books": {}, "unmapped": []}
    plan: dict[tuple[int, int, int], Path] = {}
    for f in files:
        if f.name in MANUAL:
            book, *tp = MANUAL[f.name]
            tp = tuple(tp)
        else:
            book = book_of(f)
            tp = parse(f.name)
        if not book or not tp:
            manifest["unmapped"].append(str(f.relative_to(args.root)))
            continue
        test, part = tp
        if book == 12 and test >= 5:  # 剑12 的 Test 5-8
            test -= 4
        key = (book, test, part)
        if key in plan:
            continue
        plan[key] = f
    print(f"{len(files)} 个文件，可映射 {len(plan)}，无法映射 {len(manifest['unmapped'])}", file=sys.stderr)
    for i, ((book, test, part), src) in enumerate(sorted(plan.items()), 1):
        dst = out / f"c{book}" / f"t{test}p{part}.mp3"
        manifest["books"].setdefault(f"c{book}", {}).setdefault(f"t{test}", []).append(part)
        if args.dry_run or dst.exists():
            continue
        dst.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-ac", "1", "-b:a", args.bitrate, "-map_metadata", "-1", str(dst)], check=True)
        print(f"[{i}/{len(plan)}] {src.name} → {dst.relative_to(out)}", file=sys.stderr)
    # 完整性
    for b, tests in manifest["books"].items():
        for t, parts in tests.items():
            parts.sort()
            tests[t] = {"parts": parts, "complete": parts == [1, 2, 3, 4]}
    out.mkdir(parents=True, exist_ok=True)
    json.dump(manifest, open(out / "manifest.json", "w"), ensure_ascii=False, indent=1)
    complete = [(b, t) for b, ts in manifest["books"].items() for t, v in ts.items() if v["complete"]]
    print(f"完整套数 {len(complete)}: {' '.join(f'{b}{t}' for b, t in complete)}", file=sys.stderr)
    incomplete = [(b, t, v["parts"]) for b, ts in manifest["books"].items() for t, v in ts.items() if not v["complete"]]
    if incomplete:
        print("不完整: " + " ".join(f"{b}{t}{v}" for b, t, v in incomplete), file=sys.stderr)


if __name__ == "__main__":
    main()
