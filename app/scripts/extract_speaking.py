#!/usr/bin/env python3
"""
口语题库抽取：把「雅思哥 / 先行版」文字版口语题库 PDF 解析成结构化 speaking.json，
并把「保留题（含答案）」「新题+答案」PDF 里的参考答案（英文 + 中文翻译）匹配到对应题目上。

依赖：poppler 的 pdftotext（brew install poppler）。

用法：
  python3 scripts/extract_speaking.py \
      --bank  "<题库 PDF>" \
      --answers "<含答案 PDF 1>" "<含答案 PDF 2>" ... \
      --out public/data/speaking.json
"""
import argparse
import difflib
import json
import re
import subprocess
import sys
from pathlib import Path


def pdf_text(path: str) -> str:
    return subprocess.run(
        ["pdftotext", "-layout", path, "-"], check=True, capture_output=True, text=True
    ).stdout


def norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[’‘]", "'", s)
    s = re.sub(r"[^a-z0-9' ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


PAGE_NO = re.compile(r"^\s*\d{1,3}\s*$")
TOPIC_RE = re.compile(r"^\s*(\d+)\s+P([12])\s+(.+?)\s*$")
EVERGREEN_RE = re.compile(r"^\s*万年老题\s+(.+?)\s*$")
SKIP_RE = re.compile(r"[（(]?\s*(小问)?待补充\s*[）)]?|^\s*P3\s*$|^\s*Part\s*3\s*$")


def theme_of(text: str) -> str:
    t = text.lower()
    if re.search(r"\b(person|people|friend|someone|child|family member|celebrity|neighbou?r|teacher|colleague|who)\b", t):
        return "people"
    if re.search(r"\b(place|city|country|town|building|room|house|shop|park|garden|area|restaurant|cafe|library|street|village)\b", t):
        return "place"
    if re.search(r"\b(time|occasion|experience|event|day|moment|activity|trip|journey|situation|when you)\b", t):
        return "event"
    return "thing"


def parse_bank(text: str):
    """解析题库正文，返回 topic 列表。"""
    lines = text.split("\n")
    # 跳过目录：正文从第一个「一、」章节标题（非目录行，即不含省略号）开始
    start = 0
    for i, l in enumerate(lines):
        if re.match(r"^\s*一、\s*大陆", l) and "..." not in l:
            start = i
            break
    lines = lines[start:]

    topics = []
    cur = None
    region = "mainland"
    category = "new"
    mode = None  # 'q' | 'cue' | 'p3'

    def flush():
        nonlocal cur
        if cur:
            for k in ("questions", "part3"):
                cur[k] = [q for q in cur[k] if q.strip()]
            if cur["part"] == 2 and not cur["cue"]["title"]:
                cur = None
                return
            topics.append(cur)
        cur = None

    def new_topic(part, title, cat=None):
        nonlocal cur, mode
        flush()
        cur = {
            "part": part,
            "title": title.strip(),
            "titleZh": None,
            "category": cat or category,
            "region": region,
            "questions": [],
            "cue": {"title": "", "points": []},
            "part3": [],
        }
        mode = "q" if part == 1 else "cue"

    for raw in lines:
        l = raw.rstrip()
        if not l.strip() or PAGE_NO.match(l):
            continue
        s = l.strip()
        # 章节 / 类别标题
        if re.match(r"^[一二三四五六]、", s):
            region = "overseas" if "非大陆" in s else "mainland"
            category = "retained" if ("老题" in s or "沿用" in s) else "new"
            flush()
            continue
        if re.match(r"^Part\s*[12]", s, re.I) and ("道" in s or "题" in s):
            category = "retained" if ("老题" in s or "沿用" in s) else "new"
            flush()
            continue
        m = EVERGREEN_RE.match(s)
        if m:
            new_topic(1, m.group(1), "evergreen")
            continue
        m = TOPIC_RE.match(s)
        if m:
            part = int(m.group(2))
            title = m.group(3)
            new_topic(part, title)
            if part == 2:
                cur["titleZh"] = title
                cur["title"] = ""
            continue
        if cur is None:
            continue
        if SKIP_RE.search(s):
            if re.match(r"^\s*(P3|Part\s*3)\s*$", s):
                mode = "p3"
            continue
        if cur["part"] == 2:
            if mode == "cue":
                if s.lower().startswith("describe") and not cur["cue"]["title"]:
                    cur["cue"]["title"] = s
                    cur["title"] = s
                elif re.match(r"^you should say", s, re.I):
                    continue
                elif not cur["cue"]["title"]:
                    continue
                else:
                    # 续行（题干折行）
                    if cur["cue"]["points"] == [] and not re.match(r"^(what|who|when|where|how|why|and |whether|which)", s, re.I) and len(cur["cue"]["title"]) < 120:
                        cur["cue"]["title"] += " " + s
                        cur["title"] = cur["cue"]["title"]
                    else:
                        cur["cue"]["points"].append(s)
            else:
                _append_q(cur["part3"], s)
        else:
            _append_q(cur["questions"], s)
    flush()
    return topics


def _append_q(lst, s):
    """把折行的问题合并回上一条。"""
    if lst and not re.search(r"[?？.!]$", lst[-1]) and (s[:1].islower() or not re.match(r"^(what|who|when|where|how|why|do|does|did|is|are|would|have|has|can|should|will|which|in|on|at|are)\b", s, re.I)):
        lst[-1] = lst[-1] + " " + s
    else:
        lst.append(s)


ANS_Q_RE = re.compile(r"^\s*(\d+)\s*[\.\、]\s*(.+?)\s*$")
EN_RE = re.compile(r"^\s*英\s*文\s*[:：]\s*(.*)$")
ZH_RE = re.compile(r"^\s*翻\s*译\s*[:：]\s*(.*)$")


def parse_answers(text: str):
    """从含答案 PDF 中抽出 {norm(question): {en, zh}} 与 Part2 {norm(cue): {en, zh, part3:[...]}}"""
    lines = [l.rstrip() for l in text.split("\n")]
    q_answers = {}
    cue_answers = {}
    cur_q = None
    cur_cue = None
    field = None
    buf_en, buf_zh = [], []
    in_part2_block = False

    def commit():
        nonlocal cur_q, cur_cue, buf_en, buf_zh, field
        en = " ".join(x.strip() for x in buf_en if x.strip())
        zh = "".join(x.strip() for x in buf_zh if x.strip())
        if cur_q and en:
            q_answers[norm(cur_q)] = {"en": en, "zh": zh}
        elif cur_cue and en and in_part2_block:
            cue_answers[norm(cur_cue)] = {"en": en, "zh": zh}
        buf_en, buf_zh, field = [], [], None

    for l in lines:
        s = l.strip()
        if not s or PAGE_NO.match(s):
            continue
        if re.match(r"^PART\s*2\b", s, re.I):
            commit(); cur_q = None; in_part2_block = True; continue
        if re.match(r"^PART\s*3\b", s, re.I):
            commit(); cur_q = None; in_part2_block = False; continue
        if s.lower().startswith("describe"):
            commit(); cur_cue = s; cur_q = None; in_part2_block = True; continue
        if re.match(r"^Answer\s*\(", s, re.I):
            field = "en"; buf_en, buf_zh = [], []; continue
        m = ANS_Q_RE.match(s)
        if m and len(m.group(2)) > 8:
            commit()
            cur_q = m.group(2)
            continue
        m = EN_RE.match(s)
        if m:
            field = "en"; buf_en = [m.group(1)]; buf_zh = []; continue
        m = ZH_RE.match(s)
        if m:
            field = "zh"; buf_zh = [m.group(1)]; continue
        if field == "en":
            # 折行的问题标题（问题跨两行）
            if cur_q and not buf_en and not re.search(r"[.!?]$", cur_q) and s[:1].islower():
                cur_q += " " + s
            else:
                buf_en.append(s)
        elif field == "zh":
            buf_zh.append(s)
        elif cur_q and not re.search(r"[?？]$", cur_q) and len(s) < 80 and re.match(r"^[a-z]", s):
            cur_q += " " + s
    commit()
    return q_answers, cue_answers


def best_match(key: str, pool: dict, cutoff=0.82):
    if key in pool:
        return pool[key]
    cands = difflib.get_close_matches(key, list(pool.keys()), n=1, cutoff=cutoff)
    return pool[cands[0]] if cands else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bank", required=True)
    ap.add_argument("--answers", nargs="*", default=[])
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    topics = parse_bank(pdf_text(args.bank))
    q_pool, cue_pool = {}, {}
    for a in args.answers:
        q, c = parse_answers(pdf_text(a))
        q_pool.update(q)
        cue_pool.update(c)

    print(f"answer pool: questions={len(q_pool)} cues={len(cue_pool)}", file=sys.stderr)
    matched = 0
    total_q = 0
    out = []
    for i, t in enumerate(topics):
        tid = f"p{t['part']}-{i+1:03d}"
        qs = []
        for q in t["questions"]:
            total_q += 1
            a = best_match(norm(q), q_pool)
            if a:
                matched += 1
            qs.append({"text": q, "answer": a["en"] if a else None, "answerZh": a["zh"] if a else None})
        p3 = []
        for q in t["part3"]:
            total_q += 1
            a = best_match(norm(q), q_pool)
            if a:
                matched += 1
            p3.append({"text": q, "answer": a["en"] if a else None, "answerZh": a["zh"] if a else None})
        cue_ans = best_match(norm(t["cue"]["title"]), cue_pool, 0.86) if t["part"] == 2 else None
        out.append({
            "id": tid,
            "part": t["part"],
            "title": t["title"] or t["titleZh"],
            "titleZh": t["titleZh"],
            "category": t["category"],
            "region": t["region"],
            "theme": theme_of(t["cue"]["title"] or t["title"]) if t["part"] == 2 else "other",
            "questions": qs,
            "cue": t["cue"] if t["part"] == 2 else None,
            "part3": p3,
            "answer": cue_ans["en"] if cue_ans else None,
            "answerZh": cue_ans["zh"] if cue_ans else None,
        })

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    meta = {
        "source": Path(args.bank).name,
        "answerSources": [Path(a).name for a in args.answers],
        "season": "2026年5-8月",
        "topics": len(out),
        "questions": total_q,
        "answered": matched,
    }
    json.dump({"meta": meta, "topics": out}, open(args.out, "w"), ensure_ascii=False, indent=1)
    p1 = sum(1 for t in out if t["part"] == 1)
    print(f"topics={len(out)} (P1={p1}, P2/3={len(out)-p1}) questions={total_q} answers matched={matched} cue answers={sum(1 for t in out if t['answer'])}", file=sys.stderr)


if __name__ == "__main__":
    main()
