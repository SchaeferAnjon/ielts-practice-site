#!/usr/bin/env python3
"""
口语题库抽取（第二种版式）：解析「雅思哥」风格的口语题库 PDF，
其特点是：
  - Part 1 话题标题为「English 中文」一行（如 "Art 艺术"），或纯英文（如 "Food"）
  - 问题是以 "?" 结尾的独立行（有时带 "N. " 编号前缀）
  - 答案版里问题后紧跟英文答案段落，再跟若干以 PUA 项目符号（）开头的
    「短语 中文释义」高分短语行（本脚本忽略这些短语，只保留正文答案）
  - Part 2 话题标题是纯中文（如 "经营家族企业的人"），下面是
    "Describe ..." 题卡 + "You should say:" 要点，再是 "Part3"/"Part 3" + 问题
  - 章节用「新题 N 个」「保留题 N 个」「【人物题】」「地点类」等中文小标题分隔

用法：
  python3 scripts/extract_speaking_qa.py \
      --bank "<题库 PDF（无答案，含新题）>" \
      --answers "<含答案 PDF 1>" "<含答案 PDF 2>" ... \
      --season "2026年1-4月" \
      --out public/data/speaking-2026-1-4.json

--bank 用来确定“新题”话题及问题的权威顺序；--answers 里同时传：
  1) 新题的答案版 PDF（与 --bank 话题一致，只用作答案匹配池）
  2) 保留题（老题沿用）PDF——这类文件本身就是"标题+问题+答案"三位一体，
     其中出现的、--bank 里没有的话题会被当作新增话题直接纳入（category=retained）。
"""
import argparse
import difflib
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_speaking import theme_of, parse_bank as parse_bank_old, TOPIC_RE as OLD_TOPIC_RE  # noqa: E402


def pdf_text(path: str) -> str:
    return subprocess.run(
        ["pdftotext", "-layout", path, "-"], check=True, capture_output=True, text=True
    ).stdout


def norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[’‘]", "'", s)
    s = re.sub(r"[^a-z0-9' ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


FOOTER_RE = re.compile(r"雅思官方合作伙伴|机构代码")
PAGE_NO_RE = re.compile(r"^\d{1,4}$")
PHRASE_RE = re.compile(r"^[•●]\s*")
PHRASE_HDR_RE = re.compile(r"^(词组|短语|高频短语|好词好句)[:：]?$")
NUM_PREFIX_RE = re.compile(r"^\d+\s*[\.\)、]\s*")
FOLLOWUP_RE = re.compile(r"^follow-?up\s*[:：]\s*(.*)$", re.I)
DESCRIBE_RE = re.compile(r"^describe\b", re.I)
YOUSHOULDSAY_RE = re.compile(r"^you should say", re.I)
ANDEXPLAIN_RE = re.compile(r"^(and\s+)?explain\b", re.I)
ANSWER_HDR_RE = re.compile(r"^answer\s*[:：]?\s*$", re.I)
SECTION1_RE = re.compile(r"^(PART\s*1|Part\s*1|Part1)\s*$", re.I)
SECTION2_RE = re.compile(r"^(PART\s*2(?:\s*(&|\+)\s*3)?|Part\s*2(?:\s*(&|\+)\s*3)?|Part2(&|\+)3|Part2\+Part3)\s*$", re.I)
PART3_RE = re.compile(r"^p(?:art)?\s*3\b", re.I)
CATEGORY_HDR_RE = re.compile(
    r"^【[^】]*】\s*\d*\s*个?$"
    r"|^(人物题|人物类|地点题|地点类|物品题|物品类|事件题|事件类)$"
    r"|^(新题|保留题)\s*\d+\s*个$"
)
CJK_RE = re.compile(r"[一-鿿]")


_END_PUNCT = tuple(".,;:：!'\"“”‘’、，。！？—-")
_LATIN_RE = re.compile(r"[A-Za-z]")


def looks_like_title(line: str, require_cjk: bool = False) -> bool:
    """判断一行"看起来像新话题标题"，而不是被翻页断开的答案段落续行。
    标题一般很短、无句末标点、首字符大写或为中文；段落续行常常首字母小写
    （因为在句子中间被 -layout 折行），或很长、或以句末标点/引号结尾。
    require_cjk=True 用于 Part2 中文标题场景：本题库的 P2 标题永远是纯中文，
    不含拉丁字母，用来排除英文答案段落里恰好很短、首字母大写/带引号的行。"""
    s = line.strip()
    if not s:
        return False
    if require_cjk:
        return bool(CJK_RE.search(s)) and not _LATIN_RE.search(s) and len(s) <= 40
    first = s[0]
    if first.isalpha() and first.islower():
        return False
    if len(s) > 50:
        return False
    if s.rstrip().endswith(_END_PUNCT):
        return False
    return True


def clean_lines(text: str):
    out = []
    for raw in text.split("\n"):
        l = raw.replace("\x0c", "").strip()
        if not l:
            out.append("")
            continue
        if FOOTER_RE.search(l):
            continue
        if PAGE_NO_RE.match(l):
            continue
        out.append(l)
    return out


def split_en_zh(line: str):
    """把 "Art 艺术" 拆成 ("Art", "艺术")；纯英文 "Food" 返回 ("Food", None)。"""
    m = CJK_RE.search(line)
    if not m:
        return line.strip(), None
    en = line[: m.start()].strip()
    zh = line[m.start():].strip()
    return (en or None), (zh or None)


def category_hint(s: str):
    if "人物" in s:
        return "people"
    if "地点" in s:
        return "place"
    if "事件" in s:
        return "event"
    if "物品" in s:
        return "thing"
    return None


def new_topic_p1():
    return {"part": 1, "title": None, "titleZh": None, "questions": [], "cue": None, "part3": []}


def new_topic_p2():
    return {"part": 2, "title": None, "titleZh": None, "questions": [],
            "cue": {"title": "", "points": []}, "part3": [], "answer": None}


def parse_v2(text: str, theme_hint_default=None):
    """解析「另一种版式」的口语题库/答案 PDF，返回话题列表。
    每个话题：part/title/titleZh/questions[{text,answer}]/cue{title,points}/
    part3[{text,answer}]/answer(P2 范文，可能为 None)。
    """
    lines = clean_lines(text)
    topics = []
    section = None  # 1 | 2
    state = None
    cur = None
    cur_theme_hint = theme_hint_default

    def wraps_into_short_question(i, cur_line):
        """判断当前行（cur_line）是不是被翻页/折行截断的问题开头：
        (a) 当前行本身不能像一句完整的话那样以句末标点收尾——真正的答案
            段落最后一行几乎总有 . ! 之类的收尾，而被截断的问题开头往往
            半句就断了，没有标点；
        (b) 紧接着的下一个非空行很快就以 ? 结尾（问题在下一行说完了）。
        两个条件都满足才当作折行问题，避免把普通答案段落的最后一行误判。"""
        if cur_line.rstrip().endswith(_END_PUNCT):
            return False
        for j in range(i, min(i + 3, len(lines))):
            nl = lines[j]
            if nl == "":
                continue
            return nl.rstrip().endswith(("?", "？"))
        return False
    blank_seen = False
    answer_buf = []
    q_buf = []
    bullets_seen = False  # 本题的答案是否已经出现过高分短语（说明这题的答案已经写完）

    def flush_answer_to_last(lst):
        if lst and answer_buf:
            lst[-1]["answer"] = " ".join(x.strip() for x in answer_buf if x.strip()) or None
        answer_buf.clear()

    def flush_topic():
        nonlocal cur
        if cur is None:
            return
        if cur["part"] == 1:
            flush_answer_to_last(cur["questions"])
            cur["questions"] = [q for q in cur["questions"] if q["text"].strip()]
            if cur["title"] or cur["titleZh"]:
                if cur["questions"]:
                    topics.append(cur)
        else:
            if state == "part3_collect":
                flush_answer_to_last(cur["part3"])
            elif state == "expect_essay":
                cur["answer"] = " ".join(x.strip() for x in answer_buf if x.strip()) or None
                answer_buf.clear()
            cur["part3"] = [q for q in cur["part3"] if q["text"].strip()]
            if cur["titleZh"] and cur["cue"]["title"]:
                topics.append(cur)
        cur = None

    i = 0
    n = len(lines)
    while i < n:
        l = lines[i]
        i += 1
        if l == "":
            blank_seen = True
            continue
        if PHRASE_HDR_RE.match(l):
            bullets_seen = True
            continue
        has_bullet = bool(PHRASE_RE.match(l))
        if has_bullet:
            # 项目符号在不同来源里含义不同：在"已经在收集答案"的场景里，它总是
            # 引出「英文短语 中文释义」高分短语（可以丢弃）；但有些无答案题库
            # 用同一个符号给 Part1 话题标题打点（"• Food"），那时候符号只是
            # 装饰，剥掉符号后这一行本身还是要当标题/问题正常处理的。
            l = PHRASE_RE.sub("", l).strip()
            if not l:
                continue
            if state in ("collect_answer", "part3_collect", "expect_essay") and CJK_RE.search(l):
                bullets_seen = True
                blank_seen = False
                continue
        if SECTION1_RE.match(l):
            if section != 1:
                flush_topic()
                section = 1
                state = "expect_title"
            blank_seen = False
            continue
        if SECTION2_RE.match(l):
            if section != 2:
                flush_topic()
                section = 2
                state = "expect_title"
            # 话题内部重复出现的 "Part 2" 视为噪声，忽略
            blank_seen = False
            continue

        if state == "expect_title":
            if CATEGORY_HDR_RE.match(l):
                h = category_hint(l)
                if h:
                    cur_theme_hint = h
                blank_seen = False
                continue
            flush_topic()
            bullets_seen = False
            if section == 1:
                cur = new_topic_p1()
                en, zh = split_en_zh(l)
                cur["title"], cur["titleZh"] = en, zh
                state = "expect_question"
            else:
                cur = new_topic_p2()
                cur["titleZh"] = l
                cur["_theme_hint"] = cur_theme_hint
                state = "expect_describe"
            blank_seen = False
            continue

        if section == 1:
            if state == "expect_question":
                m = FOLLOWUP_RE.match(l)
                s = m.group(1) if m else NUM_PREFIX_RE.sub("", l)
                if s.rstrip().endswith(("?", "？")):
                    cur["questions"].append({"text": s, "answer": None})
                    state = "collect_answer"
                    bullets_seen = False
                else:
                    # 问题在这一行没有结束（折行），继续拼到问题结束为止
                    q_buf.clear()
                    q_buf.append(s)
                    state = "question_continue"
                blank_seen = False
                continue
            if state == "question_continue":
                q_buf.append(l)
                if l.rstrip().endswith(("?", "？")):
                    cur["questions"].append({"text": " ".join(q_buf), "answer": None})
                    q_buf.clear()
                    state = "collect_answer"
                    bullets_seen = False
                blank_seen = False
                continue
            if state == "collect_answer":
                m = FOLLOWUP_RE.match(l)
                s = m.group(1) if m else NUM_PREFIX_RE.sub("", l)
                if s.rstrip().endswith(("?", "？")):
                    flush_answer_to_last(cur["questions"])
                    cur["questions"].append({"text": s, "answer": None})
                    blank_seen = False
                    bullets_seen = False
                    continue
                if NUM_PREFIX_RE.match(l) and not m:
                    # 编号问题折行：这一行没有以 ? 结尾，但带编号前缀，说明是新问题的开头
                    flush_answer_to_last(cur["questions"])
                    q_buf.clear()
                    q_buf.append(s)
                    state = "question_continue"
                    blank_seen = False
                    continue
                if (blank_seen or bullets_seen) and looks_like_title(l):
                    flush_answer_to_last(cur["questions"])
                    state = "expect_title"
                    i -= 1  # 回退，交给 expect_title 重新处理这一行
                    continue
                if bullets_seen or wraps_into_short_question(i, l):
                    # 上一题的高分短语已经出现过，或者往后一两行很快就冒出一个
                    # 很短的 "?" 结尾行——说明上一题答案写完了，这一行其实是
                    # 下一题折行的开头（常见于翻页导致的断行，无编号可判断）。
                    flush_answer_to_last(cur["questions"])
                    q_buf.clear()
                    q_buf.append(s)
                    state = "question_continue"
                    blank_seen = False
                    continue
                answer_buf.append(l)
                blank_seen = False
                continue
            continue

        # section == 2
        if state == "expect_describe":
            if DESCRIBE_RE.match(l):
                cur["cue"]["title"] = l
                cur["title"] = l
                state = "expect_you_should_say"
            else:
                # 罕见的折行题卡续行
                if cur["cue"]["title"]:
                    cur["cue"]["title"] += " " + l
                    cur["title"] = cur["cue"]["title"]
            blank_seen = False
            continue
        if state == "expect_you_should_say":
            if YOUSHOULDSAY_RE.match(l):
                state = "collect_points"
            blank_seen = False
            continue
        if state == "collect_points":
            if PART3_RE.match(l):
                # 有些无答案题库里 "and explain..." 那行缺失/措辞不同，
                # 用 Part3 标记兜底结束要点收集，避免要点列表一路吞到下一话题。
                state = "expect_essay"
                answer_buf.clear()
                i -= 1  # 交给 expect_essay 重新处理这一行（它自己认识 PART3_RE）
                blank_seen = False
                continue
            cur["cue"]["points"].append(l)
            if ANDEXPLAIN_RE.match(l):
                state = "expect_essay"
                answer_buf.clear()
            blank_seen = False
            continue
        if state == "expect_essay":
            m = FOLLOWUP_RE.match(l)
            if m:
                cur["part3"].append({"text": m.group(1), "answer": None})
                blank_seen = False
                continue
            if ANSWER_HDR_RE.match(l):
                blank_seen = False
                continue
            if PART3_RE.match(l):
                cur["answer"] = " ".join(x.strip() for x in answer_buf if x.strip()) or None
                answer_buf.clear()
                state = "part3_collect"
                bullets_seen = False
                blank_seen = False
                continue
            answer_buf.append(l)
            blank_seen = False
            continue
        if state == "part3_collect":
            if CATEGORY_HDR_RE.match(l):
                h = category_hint(l)
                if h:
                    cur_theme_hint = h
                flush_answer_to_last(cur["part3"])
                state = "expect_title"
                blank_seen = False
                continue
            if PART3_RE.match(l):
                blank_seen = False
                continue
            m = FOLLOWUP_RE.match(l)
            s = m.group(1) if m else NUM_PREFIX_RE.sub("", l)
            if s.rstrip().endswith(("?", "？")):
                flush_answer_to_last(cur["part3"])
                cur["part3"].append({"text": s, "answer": None})
                blank_seen = False
                bullets_seen = False
                continue
            if not cur["part3"] and not answer_buf:
                # Part3 的第一个问题折行了（没有编号前缀可用来判断）
                q_buf.clear()
                q_buf.append(s)
                state = "part3_question_continue"
                blank_seen = False
                continue
            if NUM_PREFIX_RE.match(l) and not m:
                # 编号问题折行：这一行没有以 ? 结尾，但带编号前缀，说明是新问题的开头
                flush_answer_to_last(cur["part3"])
                q_buf.clear()
                q_buf.append(s)
                state = "part3_question_continue"
                blank_seen = False
                continue
            if (blank_seen or bullets_seen) and looks_like_title(l, require_cjk=(section == 2)):
                flush_answer_to_last(cur["part3"])
                state = "expect_title"
                i -= 1
                continue
            if bullets_seen or wraps_into_short_question(i, l):
                # 上一题的高分短语已经出现过，或者往后一两行很快就冒出一个很短的
                # "?" 结尾行——说明上一题答案写完了，这一行其实是下一题折行的开头
                # （常见于翻页断行）。
                flush_answer_to_last(cur["part3"])
                q_buf.clear()
                q_buf.append(s)
                state = "part3_question_continue"
                blank_seen = False
                continue
            answer_buf.append(l)
            blank_seen = False
            continue
        if state == "part3_question_continue":
            q_buf.append(l)
            if l.rstrip().endswith(("?", "？")):
                cur["part3"].append({"text": " ".join(q_buf), "answer": None})
                q_buf.clear()
                state = "part3_collect"
                bullets_seen = False
            blank_seen = False
            continue

    flush_topic()
    return topics


BIKAOTI_HDR_RE = re.compile(r"^必考题$")
DASH_HDR_RE = re.compile(r".+[–—-].+")


def extract_compulsory_pool(text: str):
    """部分「新题」答案 PDF 在 Part 1 之前还有一段「必考题」（Study or work /
    Accommodation / Hometown 等），本质就是万年老题的另一种排版（三级标题：
    大类 – 子类 – 具体分组），懒得为它单独建模三级话题结构，
    这里只把里面的「问题?→答案」拍平进答案池，用于匹配 --bank 里的 evergreen 话题。"""
    lines = clean_lines(text)
    q_pool = {}
    in_section = False
    cur_q = None
    buf = []

    def commit():
        nonlocal cur_q, buf
        if cur_q and buf:
            q_pool[norm(cur_q)] = " ".join(x.strip() for x in buf if x.strip())
        cur_q, buf = None, []

    for l in lines:
        if BIKAOTI_HDR_RE.match(l):
            in_section = True
            continue
        if not in_section:
            continue
        if SECTION1_RE.match(l):
            break
        if not l or PHRASE_RE.match(l) or PHRASE_HDR_RE.match(l):
            continue
        if DASH_HDR_RE.match(l) and not l.rstrip().endswith(("?", "？")):
            commit()
            continue
        if l.rstrip().endswith(("?", "？")):
            commit()
            cur_q = l
            continue
        if cur_q:
            buf.append(l)
    commit()
    return q_pool


def build_pool(topics):
    """把已解析出的话题拍平成 {norm(question): answer} / {norm(cue标题): answer}"""
    q_pool = {}
    cue_pool = {}
    for t in topics:
        for q in t["questions"]:
            if q.get("answer"):
                q_pool[norm(q["text"])] = q["answer"]
        for q in t["part3"]:
            if q.get("answer"):
                q_pool[norm(q["text"])] = q["answer"]
        if t["part"] == 2 and t.get("answer") and t["cue"]["title"]:
            cue_pool[norm(t["cue"]["title"])] = t["answer"]
    return q_pool, cue_pool


def best_match(key: str, pool: dict, cutoff=0.82):
    if key in pool:
        return pool[key]
    cands = difflib.get_close_matches(key, list(pool.keys()), n=1, cutoff=cutoff)
    return pool[cands[0]] if cands else None


def adapt_old_topics(old_topics):
    """把 extract_speaking.parse_bank() 输出的旧版式话题（题目是纯字符串列表）
    转成本脚本使用的 dict 结构 {text, answer}，answer 一律为 None（待匹配）。"""
    out = []
    for t in old_topics:
        out.append({
            "part": t["part"],
            "title": t["title"] or None,
            "titleZh": t["titleZh"],
            "questions": [{"text": q, "answer": None} for q in t["questions"]],
            "cue": t["cue"],
            "part3": [{"text": q, "answer": None} for q in t["part3"]],
            "category": t["category"],
            "region": t["region"],
            "answer": None,
            "_theme_hint": None,
        })
    return out


def theme_for(t):
    hint = t.get("_theme_hint")
    if hint:
        return hint
    return theme_of(t["cue"]["title"] or t["titleZh"] or "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--bank", required=True, nargs="+",
                     help="新题题库 PDF（无答案）。可传多个：主用来对齐答案版的话题/问题措辞，"
                          "其余（如老版式「1 P1 Food」全集）用来补充万年老题/非大陆等主 bank 没有的话题")
    ap.add_argument("--answers", nargs="*", default=[], help="含答案 PDF（新题答案版 + 保留题）")
    ap.add_argument("--season", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    # 合并多个来源的话题：同一话题可能在 bank / 答案版 / 保留题 里以不同措辞的
    # 标题重复出现（比如 "经营家族企业的人" vs "在家族企业工作的人"）。用模糊匹配
    # 去重，但去重时保留“更丰富”的那一份（问答/范文更全），避免把答案版里已经
    # 配好答案的话题，被 bank 里同名但没有答案的占位话题顶掉。
    all_topics = []
    known_p1_keys, known_p1_idx = [], {}
    known_p2_keys, known_p2_idx = [], {}

    def richness(t):
        return (
            sum(1 for q in t["questions"] if q.get("answer"))
            + sum(1 for q in t["part3"] if q.get("answer"))
            + (1 if t.get("answer") else 0)
            + 0.1 * (len(t["questions"]) + len(t["part3"]))
        )

    def ingest(t):
        if t["part"] == 1:
            k = norm(t["title"] or t["titleZh"] or "")
            keys, idx_map, cutoff = known_p1_keys, known_p1_idx, 0.82
        else:
            k = (t["titleZh"] or "").strip()
            # 中文短标题（4-8 字）经常是同一话题的不同措辞（"社媒趣事" vs "社交媒体趣事"、
            # "钦佩的运动员" vs "敬佩的成功运动员"），difflib 在字符级别上对短串本来就偏低，
            # 用更宽松的阈值；真正不同的话题经验上 ratio 都在 0.4 以下，安全边际足够。
            keys, idx_map, cutoff = known_p2_keys, known_p2_idx, 0.70
        if not k:
            return  # 无标题的残片，丢弃
        idx = idx_map.get(k)
        if idx is None:
            m = difflib.get_close_matches(k, keys, n=1, cutoff=cutoff)
            if m:
                idx = idx_map[m[0]]
        if idx is None:
            idx_map[k] = len(all_topics)
            keys.append(k)
            all_topics.append(t)
        elif richness(t) > richness(all_topics[idx]):
            t["category"] = all_topics[idx]["category"]
            t["region"] = all_topics[idx]["region"]
            all_topics[idx] = t

    for bi, b in enumerate(args.bank):
        bank_text = pdf_text(b)
        old_style_hits = sum(1 for l in bank_text.split("\n") if OLD_TOPIC_RE.match(l.strip()))
        if old_style_hits >= 5:
            # 老版式题库（如「1 P1 Food」「1 P2 想见的名人」），直接复用现成解析器，
            # 它已经能从「一/二/三、...」章节标题里识别 category/region（含万年老题/非大陆）。
            btopics = adapt_old_topics(parse_bank_old(bank_text))
            print(f"bank[{bi}] {Path(b).name}: parsed with legacy parser (old-style numbered titles), {len(btopics)} topics", file=sys.stderr)
        else:
            btopics = parse_v2(bank_text)
            for t in btopics:
                t["category"] = "new"
                t["region"] = "mainland"
            print(f"bank[{bi}] {Path(b).name}: parsed with v2 parser, {len(btopics)} topics", file=sys.stderr)
        for t in btopics:
            ingest(t)

    bank_topic_count = len(all_topics)
    q_pool, cue_pool = {}, {}
    for a in args.answers:
        atext = pdf_text(a)
        atopics = parse_v2(atext)
        aq, acue = build_pool(atopics)
        q_pool.update(aq)
        cue_pool.update(acue)
        q_pool.update(extract_compulsory_pool(atext))
        is_retained_src = ("保留" in Path(a).name) or ("老题" in Path(a).name)
        for t in atopics:
            t["category"] = "retained" if is_retained_src else "new"
            t["region"] = "mainland"
            ingest(t)

    matched = 0
    total_q = 0
    out = []
    p1_count = p2_count = 0
    for i, t in enumerate(all_topics):
        if t["part"] == 1:
            p1_count += 1
            tid = f"p1-{p1_count:03d}"
        else:
            p2_count += 1
            tid = f"p2-{p2_count:03d}"

        qs = []
        for q in t["questions"]:
            total_q += 1
            ans = q.get("answer")
            if not ans:
                ans = best_match(norm(q["text"]), q_pool)
                if ans:
                    matched += 1
            elif ans:
                matched += 1
            qs.append({"text": q["text"], "answer": ans, "answerZh": None})

        p3 = []
        for q in t["part3"]:
            total_q += 1
            ans = q.get("answer")
            if not ans:
                ans = best_match(norm(q["text"]), q_pool)
                if ans:
                    matched += 1
            elif ans:
                matched += 1
            p3.append({"text": q["text"], "answer": ans, "answerZh": None})

        cue_ans = None
        if t["part"] == 2:
            cue_ans = t.get("answer")
            if not cue_ans and t["cue"]["title"]:
                cue_ans = best_match(norm(t["cue"]["title"]), cue_pool, 0.86)

        out.append({
            "id": tid,
            "part": t["part"],
            "title": t["title"] or t["titleZh"],
            "titleZh": t["titleZh"],
            "category": t["category"],
            "region": t["region"],
            "theme": theme_for(t) if t["part"] == 2 else "other",
            "questions": qs,
            "cue": t["cue"] if t["part"] == 2 else None,
            "part3": p3,
            "answer": cue_ans,
            "answerZh": None,
        })

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    meta = {
        "source": Path(args.bank[0]).name,
        "answerSources": [Path(a).name for a in args.answers],
        "season": args.season,
        "topics": len(out),
        "questions": total_q,
        "answered": matched,
    }
    if len(args.bank) > 1:
        meta["extraSources"] = [Path(b).name for b in args.bank[1:]]
    json.dump({"meta": meta, "topics": out}, open(args.out, "w"), ensure_ascii=False, indent=1)
    print(
        f"bank topics={bank_topic_count} extra(retained/new from answers)={len(all_topics) - bank_topic_count} "
        f"total={len(out)} (P1={p1_count}, P2/3={p2_count}) "
        f"questions={total_q} matched={matched} cue answers={sum(1 for t in out if t['answer'])}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
