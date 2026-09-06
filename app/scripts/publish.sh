#!/usr/bin/env bash
# 一套题的发布前检查 + 清单更新：全部通过才退出 0。
#   scripts/publish.sh c9t4 [--exclude c7t1,c7t2] [--asr <asr目录>]
# 之后在仓库根目录 git add / commit / push（注意排除制作中的试卷）。
set -euo pipefail
cd "$(dirname "$0")/.."
id="$1"; shift
exclude=""; asr=""
while [ $# -gt 0 ]; do case "$1" in --exclude) exclude="$2"; shift 2;; --asr) asr="$2"; shift 2;; *) echo "unknown $1"; exit 2;; esac; done
n=$(echo "$id" | sed -E 's/c([0-9]+)t[0-9]+/\1/')
for m in listening reading writing; do python3 scripts/validate_paper.py $m public/data/$m/$id.json | tail -1; done
node scripts/check_answers.mjs "$id" | tail -1
python3 scripts/optimize_images.py "$id" | tail -1
if [ -n "$asr" ] && [ -d "$asr/c$n" ]; then python3 scripts/align_transcript.py public/data/listening/$id.json --asr-dir "$asr/c$n" 2>&1 | tail -1; fi
python3 scripts/build_index.py --audio-manifest ../audio/manifest.json --audio-base https://schaeferanjon.github.io/ielts-audio ${exclude:+--exclude "$exclude"} | tail -1
node scripts/smoke.mjs "$id"
