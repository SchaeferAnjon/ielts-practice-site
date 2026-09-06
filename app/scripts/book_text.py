#!/usr/bin/env python3
"""
从书的 PDF 文字层直接切出听力原文 / 阅读文章，输出成网站 JSON 需要的片段，
让子 Agent 不必逐字重打原文（只需修补个别乱码词）。

  # 听力原文：按页取 -raw 文本，切成说话人 + 句子，识别行尾的 Q11 / 011 / Example 题号标记
  python3 scripts/book_text.py transcript drafts/c11 103-104 --out drafts/c11/parts/l-t1-p2.lines.json
  # 阅读文章：按页取 -layout 文本，自动按空白列切开双栏，输出段落数组
  python3 scripts/book_text.py passage drafts/c11 17-18 --out drafts/c11/parts/r-t1-p1.paras.json
  # 说话人标签和台词被 -raw 模式拆成两块（剑7 这种排版）时，transcript 加 --layout
  # 扫描件（剑9/16/18/19/20）加 --book，从 OCR 结果 book.txt 取页
  python3 scripts/book_text.py transcript drafts/c9 120-121 --book --from "SECTION 1" --to "SECTION 2"
  # 只看清洗后的纯文本
  python3 scripts/book_text.py text drafts/c11 17-18

--from / --to 用一小段独一无二的文字进一步截取起止（例如 --from "SECTION 2" --to "SECTION 3"）。
清洗规则：「『→r，φ 之类杂符删除，「’ s」→「's」，跨行的所有格拼回去，页眉「Audioscripts / Test N」删掉。
输出后仍可能有乱码词（多为划线的答案词），由子 Agent 用 python 替换表修补。
"""
import argparse
import json
import re
import subprocess
from collections import Counter
from pathlib import Path

HEADER_RE = re.compile(r"^\s*(Audioscripts?|Tapescripts?|Test \d|Listening|Reading|READING PASSAGE \d|lml.*|\W{0,3})\s*$")
SPEAKER_RE = re.compile(r"^\s*([A-Z][A-Za-z]{0,2}\s?[A-Z][A-Z]{1,14}(?: [A-Z]{1,12})?)\s*[:：]\s*(.*)$")
QMARK_RE = re.compile(r"\s*(?:\b(?:Q|0)\s?(\d{1,2})|\b(Example))\s*$")


def pdf_text(pdf: str, a: int, b: int, layout: bool) -> str:
    cmd = ["pdftotext", "-layout" if layout else "-raw", "-f", str(a), "-l", str(b), pdf, "-"]
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def ocr_columns(draft: str, a: int, b: int) -> str:
    """扫描件的双栏文章：整页 OCR 会把左右栏串读，所以把页面图按最白的竖直带切成两半分别 OCR。"""
    from PIL import Image

    out = []
    for i in range(a, b + 1):
        png = Path(draft, "pages", f"p-{i:03d}.png")
        if not png.exists():
            png = next(Path(draft, "pages").glob(f"p-*{i}.png"), None)
        if not png:
            out.append("")
            continue
        im = Image.open(png).convert("L")
        w, h = im.size
        # 在中间 35%-65% 找最白的一列（只看正文区域，去掉页眉页脚）
        body = im.crop((0, int(h * 0.12), w, int(h * 0.9)))
        cols = [sum(body.getpixel((x, y)) for y in range(0, body.height, 4)) for x in range(int(w * 0.35), int(w * 0.65))]
        split = int(w * 0.35) + max(range(len(cols)), key=lambda k: cols[k])
        white = cols[split - int(w * 0.35)] / (body.height / 4) / 255
        parts = [im] if white < 0.985 else [im.crop((0, 0, split, h)), im.crop((split, 0, w, h))]
        texts = []
        import tempfile

        with tempfile.TemporaryDirectory(dir=Path(draft)) as td:
            for k, part in enumerate(parts):
                tmp = Path(td) / f"bt_{i}_{k}.png"
                part.save(tmp)
                r = subprocess.run(["tesseract", str(tmp), "-", "--psm", "6", "-l", "eng"], capture_output=True)
                texts.append(r.stdout.decode("utf-8", "ignore"))
        out.append("\n\n".join(texts))
    return "\f".join(out)


def book_pages(draft: str, a: int, b: int) -> str:
    """扫描件（OCR）书没有文字层：从 drafts/cN/book.txt 取 tesseract 结果，页之间用 \f 分隔。"""
    text = Path(draft, "book.txt").read_text(encoding="utf-8")
    pages = re.split(r"\n######## PAGE (\d+) ########\n", text)
    d = {int(pages[i]): pages[i + 1] for i in range(1, len(pages), 2)}
    return "\f".join(d.get(i, "") for i in range(a, b + 1))


def clean(s: str, collapse: bool = True) -> str:
    s = s.replace("「", "r").replace("『", "r").replace("φ", "")
    if collapse:
        s = s.replace("\f", "\n")
    s = re.sub(r"[’‘]\s*\n\s*(s|re|ll|ve|d|m|t|S|II|H)\b", lambda m: "'" + {"II": "ll", "H": "ll", "S": "s"}.get(m.group(1), m.group(1)), s)
    s = re.sub(r"[’‘]\s+(s|re|ll|ve|d|m|t)\b", r"'\1", s)
    s = re.sub(r"[’‘]\s*(II|H)\b", "'ll", s)
    s = re.sub(r"[’‘]", "'", s)
    s = re.sub(r"(?<=\s)\|(?=\s)", "I", s)  # OCR 把 I 认成竖线
    s = re.sub(r"([.!?])(?=[A-Z][a-z])", r"\1 ", s)  # 句号后丢了空格
    if collapse:
        s = re.sub(r"[ \t]+", " ", s)
    return s


def slice_text(text: str, frm: str | None, to: str | None) -> str:
    if frm:
        i = text.find(frm)
        if i >= 0:
            text = text[i:]
    if to:
        j = text.find(to, 1)
        if j >= 0:
            text = text[:j]
    return text


SENT_RE = re.compile(r"(?<=[.!?…])\s+(?=[A-Z\"'(])")


def transcript(text: str) -> list[dict]:
    """切成说话人 + 句子。Q 标记按它所在行的位置落到对应的句子上（独白也不会全堆到最后一句）。"""
    turns: list[list] = []  # [speaker, text, marks]  marks: [(char_offset, q)]
    speaker = "SPEAKER"
    for raw in text.split("\n"):
        line = raw.strip()
        if not line or HEADER_RE.match(line) or re.match(r"^SECTION\s*\d", line) or re.match(r"^PART\s*\d", line) or re.match(r"^\d{1,3}$", line):
            continue
        line = re.sub(r"^\d{2,3}\s+(?=[A-Z])", "", line)  # 行首页码
        qs: list[int] = []
        while True:
            m = QMARK_RE.search(line)
            if not m:
                break
            if m.group(1):
                qs.append(int(m.group(1)))
            line = line[: m.start()].rstrip()
        m = SPEAKER_RE.match(line)
        if m:
            speaker = re.sub(r"\s+", "", m.group(1)).upper()
            line = m.group(2)
            turns.append([speaker, "", []])
        elif not turns or turns[-1][0] != speaker:
            turns.append([speaker, "", []])
        t = turns[-1]
        t[1] = (t[1] + " " + line).strip()
        for q in qs:
            t[2].append((max(0, len(t[1]) - 1), q))
    out = []
    for sp, t, marks in turns:
        sents = []
        pos = 0
        for piece in SENT_RE.split(t):
            piece = piece.strip()
            if not piece:
                continue
            i = t.find(piece, pos)
            sents.append((i, i + len(piece), piece))
            pos = i + len(piece)
        if not sents:
            continue
        for a, b, sent in sents:
            d = {"s": sp, "t": sent}
            qq = sorted({q for off, q in marks if a <= off <= b})
            if qq:
                d["q"] = qq
            out.append(d)
        leftover = sorted({q for off, q in marks if not any(a <= off <= b for a, b, _ in sents)})
        if leftover:
            out[-1].setdefault("q", [])
            out[-1]["q"] = sorted(set(out[-1]["q"]) | set(leftover))
    return out


def split_columns(lines: list[str]) -> list[str]:
    """两栏排版：找一条几乎每行都是空白的竖直分割列，把左右栏拆开后先左后右拼接。"""
    body = [l for l in lines if len(l.strip()) > 40]
    if len(body) < 8:
        return lines
    width = max(len(l) for l in body)
    best, best_score = None, 0.0
    for col in range(int(width * 0.3), int(width * 0.7)):
        hits = sum(1 for l in body if len(l) <= col or l[col] == " ")
        score = hits / len(body)
        if score > best_score:
            best, best_score = col, score
    if best is None or best_score < 0.92:
        return lines
    # 只有真的两栏（右侧有内容的行要够多）才切
    right_lines = sum(1 for l in body if len(l) > best + 3 and l[best + 1 :].strip())
    if right_lines < len(body) * 0.5:
        return lines
    left = [l[:best].rstrip() for l in lines]
    right = [l[best:].rstrip() for l in lines]
    return left + [""] + right


def passage(text: str) -> list[str]:
    paras: list[str] = []
    for page in text.split("\f"):
        lines = split_columns(page.split("\n"))
        buf: list[str] = []
        for raw in lines:
            line = raw.rstrip()
            s = line.strip()
            if not s or HEADER_RE.match(s) or re.match(r"^\d{1,3}$", s):
                if buf:
                    paras.append(" ".join(buf))
                    buf = []
                continue
            s = re.sub(r"^[:;jI|l!]\s+(?=[A-Za-z])", "", s)  # 扫描线噪点
            indent = len(line) - len(line.lstrip())
            if buf and indent >= 3 and not buf[-1].endswith(("-", ",")) and re.match(r"^[A-Z]", s):
                paras.append(" ".join(buf))
                buf = []
            buf.append(s)
        if buf:
            paras.append(" ".join(buf))
    # 跨页/跨栏被切断的段落：上一段不以句号结尾且下一段以小写开头就拼回去
    merged: list[str] = []
    for p in paras:
        p = re.sub(r"[ \t]+", " ", re.sub(r"(\w)- (\w)", r"\1\2", p))
        if merged and not re.search(r"[.!?”\"')]$", merged[-1]) and re.match(r"^[a-z]", p):
            merged[-1] += " " + p
        else:
            merged.append(p)
    return [p for p in merged if len(p) > 2]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["transcript", "passage", "text"])
    ap.add_argument("draft", help="drafts/cN 目录（读 source.txt）")
    ap.add_argument("pages", help="起-止 页码，如 103-104")
    ap.add_argument("--from", dest="frm")
    ap.add_argument("--to", dest="to")
    ap.add_argument("--out")
    ap.add_argument("--book", action="store_true", help="扫描件：从 drafts/cN/book.txt（OCR 结果）取文本，而不是 PDF 文字层")
    ap.add_argument("--layout", action="store_true", help="transcript 模式改用 pdftotext -layout（说话人标签和台词被 -raw 拆成两块时用）")
    args = ap.parse_args()
    pdf = Path(args.draft, "source.txt").read_text().strip()
    a, _, b = args.pages.partition("-")
    a, b = int(a), int(b or a)
    layout = args.mode != "transcript" or args.layout
    if args.book:
        raw = ocr_columns(args.draft, a, b) if args.mode == "passage" else book_pages(args.draft, a, b)
    else:
        raw = pdf_text(pdf, a, b, layout)
    text = slice_text(clean(raw, collapse=args.mode != "passage"), args.frm, args.to)
    if args.mode == "transcript":
        result = transcript(text)
    elif args.mode == "passage":
        result = passage(text)
    else:
        result = text
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=1) if not isinstance(result, str) else result, encoding="utf-8")
        n = len(result) if not isinstance(result, str) else len(result.split())
        print(f"written {args.out} ({n} {'lines' if args.mode == 'transcript' else 'paragraphs' if args.mode == 'passage' else 'words'})")
    else:
        print(json.dumps(result, ensure_ascii=False, indent=1) if not isinstance(result, str) else result)


if __name__ == "__main__":
    main()
