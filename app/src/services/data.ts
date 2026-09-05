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

/** 题库目录：加新真题只需在这里登记 + 放 JSON / 音频 */
export type PaperMeta = { id: string; book: string; bookShort: string; test: number; type: "A" | "G"; modules: ("listening" | "reading" | "writing")[] };

export const PAPERS: PaperMeta[] = [
  { id: "c21t1", book: "剑桥雅思21", bookShort: "剑21", test: 1, type: "A", modules: ["listening", "reading", "writing"] },
  { id: "c21t2", book: "剑桥雅思21", bookShort: "剑21", test: 2, type: "A", modules: [] },
  { id: "c21t3", book: "剑桥雅思21", bookShort: "剑21", test: 3, type: "A", modules: [] },
  { id: "c21t4", book: "剑桥雅思21", bookShort: "剑21", test: 4, type: "A", modules: [] },
  { id: "c20t1", book: "剑桥雅思20", bookShort: "剑20", test: 1, type: "A", modules: [] },
  { id: "c20t2", book: "剑桥雅思20", bookShort: "剑20", test: 2, type: "A", modules: [] },
  { id: "c20t3", book: "剑桥雅思20", bookShort: "剑20", test: 3, type: "A", modules: [] },
  { id: "c20t4", book: "剑桥雅思20", bookShort: "剑20", test: 4, type: "A", modules: [] },
  { id: "c19t1", book: "剑桥雅思19", bookShort: "剑19", test: 1, type: "A", modules: [] },
  { id: "c19t2", book: "剑桥雅思19", bookShort: "剑19", test: 2, type: "A", modules: [] },
  { id: "c19t3", book: "剑桥雅思19", bookShort: "剑19", test: 3, type: "A", modules: [] },
  { id: "c19t4", book: "剑桥雅思19", bookShort: "剑19", test: 4, type: "A", modules: [] },
  { id: "c18t1", book: "剑桥雅思18", bookShort: "剑18", test: 1, type: "A", modules: [] },
  { id: "c18t2", book: "剑桥雅思18", bookShort: "剑18", test: 2, type: "A", modules: [] },
  { id: "c18t3", book: "剑桥雅思18", bookShort: "剑18", test: 3, type: "A", modules: [] },
  { id: "c18t4", book: "剑桥雅思18", bookShort: "剑18", test: 4, type: "A", modules: [] },
];

/** 把 JSON 里的绝对路径（/audio/..、/img/..、/data/..）加上部署子路径前缀 */
export const withBase = (p: string) => (p.startsWith("/") ? import.meta.env.BASE_URL.replace(/\/$/, "") + p : p);

export const paperUrl = {
  listening: (id: string) => withBase(`/data/listening/${id}.json`),
  reading: (id: string) => withBase(`/data/reading/${id}.json`),
  writing: (id: string) => withBase(`/data/writing/${id}.json`),
  speaking: () => withBase(`/data/speaking.json`),
};

export type { ListeningPaper, ReadingPaper, WritingPaper, SpeakingBank };
