import { useEffect, useState } from "react";
import type { ListeningPaper, ReadingPaper, SpeakingBank, WritingPaper } from "../data/types";

const cache = new Map<string, unknown>();

export async function loadJson<T>(url: string): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`加载失败 ${url}: ${res.status}`);
  const data = (await res.json()) as T;
  cache.set(url, data);
  return data;
}

export function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setData(null);
    loadJson<T>(url)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [url]);
  return { data, error };
}

/** 题库清单：由 scripts/build_index.py 生成到 public/data/index.json */
export type PaperMeta = { id: string; book: string; bookShort: string; bookNo: number; test: number; type: "A" | "G"; modules: ("listening" | "reading" | "writing")[]; audioParts: number[] };
export type PaperIndex = { audioBase: string; papers: PaperMeta[] };

let indexCache: PaperIndex | null = null;
export async function loadIndex(): Promise<PaperIndex> {
  if (indexCache) return indexCache;
  indexCache = await loadJson<PaperIndex>(withBase("/data/index.json"));
  return indexCache;
}
export function useIndex(): PaperIndex | null {
  const [idx, setIdx] = useState<PaperIndex | null>(indexCache);
  useEffect(() => {
    if (!idx) loadIndex().then(setIdx).catch(() => setIdx({ audioBase: "", papers: [] }));
  }, [idx]);
  return idx;
}

/** 音频地址：优先音频仓库（audioBase），否则本地 public/audio */
export function audioUrl(path: string, idx: PaperIndex | null): string {
  if (idx?.audioBase && path.startsWith("/audio/")) return idx.audioBase + path.slice("/audio".length);
  return withBase(path);
}

/** 把 JSON 里的绝对路径（/audio/..、/img/..、/data/..）加上部署子路径前缀 */
export const withBase = (p: string) => (p.startsWith("/") ? import.meta.env.BASE_URL.replace(/\/$/, "") + p : p);

export const paperUrl = {
  listening: (id: string) => withBase(`/data/listening/${id}.json`),
  reading: (id: string) => withBase(`/data/reading/${id}.json`),
  writing: (id: string) => withBase(`/data/writing/${id}.json`),
  speaking: (file = "speaking.json") => withBase(`/data/${file}`),
  speakingSeasons: () => withBase(`/data/speaking-seasons.json`),
};

export type { ListeningPaper, ReadingPaper, WritingPaper, SpeakingBank };
