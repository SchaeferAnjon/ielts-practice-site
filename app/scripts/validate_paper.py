#!/usr/bin/env python3
"""
校验一套题的 JSON 是否符合前端约定（结构见 public/data/*/c21t1.json）。

  python3 scripts/validate_paper.py listening public/data/listening/c17t1.json
  python3 scripts/validate_paper.py reading   public/data/reading/c17t1.json
  python3 scripts/validate_paper.py writing   public/data/writing/c17t1.json

退出码 0 = 通过；否则打印所有问题。
"""
import json
import re
import sys
from pathlib import Path

GAP = re.compile(r"\{\{(\d+)\}\}")
TYPES = {"table", "notes", "summary", "summary-select", "mc", "mc-multi", "matching", "section-match", "people-match", "tfng", "ynng"}


def group_numbers(g: dict) -> set[int]:
    """题组实际覆盖的题号"""
    t = g["type"]
    if t in ("table",):
        text = "\n".join(c for row in g["table"]["rows"] for c in row) + "\n".join(g["table"]["head"])
        return {int(x) for x in GAP.findall(text)}
    if t == "notes":
        return {int(x) for x in GAP.findall("\n".join(g["lines"]))}
    if t in ("summary", "summary-select"):
        return {int(x) for x in GAP.findall(g["text"])}
    if t in ("mc", "section-match", "people-match", "tfng", "ynng"):
        return {q["n"] for q in g["questions"]}
    if t == "matching":
        return {it["n"] for it in g["items"]}
    if t == "mc-multi":
        return set(range(g["range"][0], g["range"][1] + 1))
    return set()


def check_groups(groups: list, errors: list, where: str) -> set[int]:
    covered: set[int] = set()
    for g in groups:
        if g.get("type") not in TYPES:
            errors.append(f"{where}: 未知题型 {g.get('type')}")
            continue
        r = g.get("range")
        if not (isinstance(r, list) and len(r) == 2):
            errors.append(f"{where}: range 缺失 {g.get('type')}")
            continue
        want = set(range(r[0], r[1] + 1))
        try:
            got = group_numbers(g)
        except KeyError as e:
            errors.append(f"{where} {r}: 缺字段 {e}")
            continue
        if got != want:
            errors.append(f"{where} {r} {g['type']}: 题号不匹配，声明 {sorted(want)} 实际 {sorted(got)}")
        if g["type"] in ("mc",):
            for q in g["questions"]:
                if not q.get("options") or len(q["options"]) < 3:
                    errors.append(f"{where} Q{q.get('n')}: 选项不足")
        if g["type"] in ("matching", "people-match", "summary-select", "mc-multi") and not g.get("options"):
            errors.append(f"{where} {r}: 缺 options")
        if g["type"] in ("tfng", "ynng") and not g.get("legend"):
            errors.append(f"{where} {r}: 缺 legend")
        covered |= got
    return covered


def check_answers(ans: dict, errors: list, n: int = 40) -> None:
    keys = {int(k) for k in ans.keys()}
    missing = set(range(1, n + 1)) - keys
    if missing:
        errors.append(f"answers 缺题号 {sorted(missing)}")
    for k, v in ans.items():
        if not isinstance(v, list) or not v or not all(isinstance(x, str) and x.strip() for x in v):
            errors.append(f"answers[{k}] 必须是非空字符串数组")


def option_keys(opts) -> set[str]:
    return {o if isinstance(o, str) else str(o.get("k", "")) for o in (opts or [])}


def check_answer_groups(groups: list, ans: dict, errors: list, where: str) -> None:
    """答案要和题组一致：多选题每个题号写同样的一组字母且个数等于 count；选择/配对题答案字母必须在选项里；判断题格式固定。"""
    for g in groups:
        t = g.get("type")
        r = g.get("range") or [0, -1]
        nums = range(r[0], r[1] + 1)
        if t == "mc-multi":
            sets = [tuple(ans.get(str(n), [])) for n in nums]
            if len(set(sets)) != 1 or len(sets[0]) != g.get("count", 2):
                errors.append(f"{where} {r} mc-multi: 每个题号的 answers 必须是同样的 {g.get('count', 2)} 个字母，实际 {sets}")
            for a in sets[0]:
                if a not in option_keys(g.get("options")):
                    errors.append(f"{where} {r} mc-multi: 答案 {a} 不在选项里")
        elif t == "mc":
            for q in g.get("questions", []):
                for a in ans.get(str(q.get("n")), []):
                    if a not in option_keys(q.get("options")):
                        errors.append(f"{where} Q{q.get('n')}: 答案 {a} 不在选项里")
        elif t in ("matching", "people-match", "summary-select", "section-match"):
            keys = option_keys(g.get("options"))
            for n in nums:
                for a in ans.get(str(n), []):
                    if a not in keys:
                        errors.append(f"{where} Q{n}: 答案 {a} 不在 {t} 选项里")
        elif t in ("tfng", "ynng"):
            ok = {"TRUE", "FALSE", "NOT GIVEN"} if t == "tfng" else {"YES", "NO", "NOT GIVEN"}
            for n in nums:
                for a in ans.get(str(n), []):
                    if a not in ok:
                        errors.append(f"{where} Q{n}: {t} 答案 \"{a}\" 必须是 {sorted(ok)} 之一")


def validate_listening(d: dict, errors: list) -> None:
    parts = d.get("parts", [])
    if len(parts) != 4:
        errors.append(f"parts 应为 4 个，实际 {len(parts)}")
    covered: set[int] = set()
    for p in parts:
        w = f"Part {p.get('part')}"
        for k in ("audio", "duration", "groups", "transcript"):
            if k not in p:
                errors.append(f"{w}: 缺 {k}")
        covered |= check_groups(p.get("groups", []), errors, w)
        check_answer_groups(p.get("groups", []), d.get("answers", {}), errors, w)
        tr = p.get("transcript", [])
        if len(tr) < 5:
            errors.append(f"{w}: transcript 只有 {len(tr)} 句")
        for l in tr:
            if not isinstance(l.get("t"), str) or "s" not in l:
                errors.append(f"{w}: transcript 行缺 s/t")
                break
        qs = {q for l in tr for q in l.get("q", [])}
        rng = set()
        for g in p.get("groups", []):
            rng |= set(range(g["range"][0], g["range"][1] + 1))
        if rng - qs:
            errors.append(f"{w}: transcript 未标注题号 {sorted(rng - qs)}（定位原文会失效）")
    if covered != set(range(1, 41)):
        errors.append(f"题号覆盖不是 1-40：缺 {sorted(set(range(1, 41)) - covered)} 多 {sorted(covered - set(range(1, 41)))}")
    check_answers(d.get("answers", {}), errors)


def validate_reading(d: dict, errors: list) -> None:
    ps = d.get("passages", [])
    if len(ps) != 3:
        errors.append(f"passages 应为 3 篇，实际 {len(ps)}")
    covered: set[int] = set()
    for p in ps:
        w = f"Passage {p.get('n')}"
        if not p.get("title"):
            errors.append(f"{w}: 缺 title")
        paras = p.get("paragraphs", [])
        words = sum(len(x.get("text", "").split()) for x in paras)
        if words < 500:
            errors.append(f"{w}: 正文只有 {words} 词，疑似不完整")
        ids = [x.get("id") for x in paras]
        if len(ids) != len(set(ids)):
            errors.append(f"{w}: paragraphs id 重复")
        covered |= check_groups(p.get("groups", []), errors, w)
        check_answer_groups(p.get("groups", []), d.get("answers", {}), errors, w)
        for g in p.get("groups", []):
            if g["type"] == "section-match":
                labels = {x.get("label") for x in paras if x.get("label")}
                if not labels:
                    errors.append(f"{w}: section-match 需要 paragraphs 带 label（A-G）")
    if covered != set(range(1, 41)):
        errors.append(f"题号覆盖不是 1-40：缺 {sorted(set(range(1, 41)) - covered)} 多 {sorted(covered - set(range(1, 41)))}")
    check_answers(d.get("answers", {}), errors)
    ex = d.get("explain", {})
    miss = [n for n in range(1, 41) if str(n) not in ex or not ex[str(n)].get("why")]
    if miss:
        errors.append(f"explain 缺 {miss}")
    pids = {x["id"] for p in ps for x in p.get("paragraphs", [])}
    bad = [n for n, e in ex.items() if e.get("loc") not in pids]
    if bad:
        errors.append(f"explain.loc 不是已有段落 id: 题 {bad}")


def validate_writing(d: dict, errors: list) -> None:
    ts = d.get("tasks", [])
    if [t.get("task") for t in ts] != [1, 2]:
        errors.append("tasks 应为 task 1 和 2")
    for t in ts:
        for k in ("kind", "kindZh", "minutes", "minWords", "prompt", "sample"):
            if k not in t:
                errors.append(f"Task {t.get('task')}: 缺 {k}")
        if t.get("task") == 1 and not t.get("image"):
            errors.append("Task 1: 缺 image（图表页渲染）")
        s = t.get("sample", {})
        if not s.get("text") or not s.get("comment"):
            errors.append(f"Task {t.get('task')}: sample 需要 text + comment")


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    module, path = sys.argv[1], Path(sys.argv[2])
    try:
        d = json.load(open(path))
    except Exception as e:  # noqa: BLE001
        sys.exit(f"JSON 解析失败: {e}")
    errors: list[str] = []
    for k in ("id", "book", "test", "title"):
        if k not in d:
            errors.append(f"缺顶层字段 {k}")
    {"listening": validate_listening, "reading": validate_reading, "writing": validate_writing}[module](d, errors)
    if module == "writing":
        for t in d.get("tasks", []):
            img = t.get("image")
            if img and not (path.parents[2] / img.lstrip("/")).exists():
                errors.append(f"image 文件不存在: {img}")
    if errors:
        print(f"✗ {path}: {len(errors)} 个问题")
        for e in errors:
            print("  -", e)
        sys.exit(1)
    print(f"✓ {path} 通过")


if __name__ == "__main__":
    main()
