export type Option = { k: string; text: string };

export type Group =
  | { range: [number, number]; type: "table"; instruction: string; limit?: string; title?: string; table: { head: string[]; rows: string[][] } }
  | { range: [number, number]; type: "notes"; instruction: string; limit?: string; title?: string; lines: string[] }
  | { range: [number, number]; type: "summary"; instruction: string; limit?: string; title?: string; text: string }
  | { range: [number, number]; type: "summary-select"; instruction: string; limit?: string; title?: string; text: string; options: Option[] }
  | { range: [number, number]; type: "mc"; instruction: string; title?: string; questions: { n: number; text: string; options: Option[] }[] }
  | { range: [number, number]; type: "mc-multi"; instruction: string; text: string; count: number; options: Option[] }
  | { range: [number, number]; type: "matching"; instruction: string; limit?: string; optionsTitle?: string; options: Option[]; itemsTitle?: string; items: { n: number; text: string }[] }
  | { range: [number, number]; type: "section-match"; instruction: string; limit?: string; options: string[]; questions: { n: number; text: string }[] }
  | { range: [number, number]; type: "people-match"; instruction: string; limit?: string; optionsTitle?: string; options: Option[]; questions: { n: number; text: string }[] }
  | { range: [number, number]; type: "tfng" | "ynng"; instruction: string; legend: [string, string][]; questions: { n: number; text: string }[] };

export type TranscriptLine = { s: string; t: string; q?: number[]; start?: number; end?: number; estimated?: boolean };

export type ListeningPart = {
  part: number;
  audio: string;
  duration: number;
  title: string;
  groups: Group[];
  transcript: TranscriptLine[];
  /** 资料里既没有音频也没有原文（剑20 精简版），只保留题目 */
  noTranscript?: boolean;
};

export type ListeningPaper = {
  id: string;
  book: string;
  test: number;
  title: string;
  source?: string;
  parts: ListeningPart[];
  answers: Record<string, string[]>;
};

export type Paragraph = { id: string; label?: string; text: string };

export type Passage = {
  n: number;
  title: string;
  subtitle?: string;
  intro: string;
  paragraphs: Paragraph[];
  footnotes?: string[];
  groups: Group[];
};

export type ReadingPaper = {
  id: string;
  book: string;
  test: number;
  title: string;
  minutes: number;
  passages: Passage[];
  answers: Record<string, string[]>;
  explain: Record<string, { loc: string; key: string; why: string }>;
};

export type WritingTask = {
  task: 1 | 2;
  kind: string;
  kindZh: string;
  minutes: number;
  minWords: number;
  prompt: string[];
  image?: string;
  imageCaption?: string;
  data?: { unit: string; years: number[]; series: Record<string, number[]> };
  sample: { band: number; text: string; comment: string; exampleOverview?: string };
};

export type WritingPaper = { id: string; book: string; test: number; title: string; tasks: WritingTask[] };

export type SpeakingQuestion = { text: string; answer: string | null; answerZh: string | null };
export type SpeakingTopic = {
  id: string;
  part: 1 | 2;
  title: string;
  titleZh: string | null;
  category: "new" | "retained" | "evergreen";
  region: "mainland" | "overseas";
  theme: "people" | "place" | "event" | "thing" | "other";
  questions: SpeakingQuestion[];
  cue: { title: string; points: string[] } | null;
  part3: SpeakingQuestion[];
  answer: string | null;
  answerZh: string | null;
};
export type SpeakingBank = { meta: Record<string, unknown>; topics: SpeakingTopic[] };

export type Answers = Record<number, string>;

export type QuestionResult = { n: number; user: string; correct: string[]; ok: boolean };

export type Attempt = {
  id: string;
  module: "listening" | "reading" | "writing" | "speaking";
  paperId: string;
  paperTitle: string;
  at: number;
  score: number;
  total: number;
  band: number;
  results: QuestionResult[];
  extra?: unknown;
};

export type ErrorItem = {
  id: string;
  module: Attempt["module"];
  paperId: string;
  paperTitle: string;
  n: number;
  qtype: string;
  text: string;
  user: string;
  correct: string[];
  note: string;
  at: number;
};

export type Issue = {
  id: string;
  module: Attempt["module"];
  paperId: string;
  paperTitle: string;
  n: number;
  text: string;
  correct: string[];
  note: string;
  at: number;
};

export type ExamMode = "paper" | "cbt" | "cbt-old";
