import { embed } from "./ark";
import {
  allAnchors,
  flatAnchorList,
  Sense,
} from "./anchors";

/** Cosine similarity between two equal-length numeric vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

/** In-process cache for anchor embeddings. Survives across requests in dev/prod. */
let anchorCache: { sense: Sense; index: number; text: string; vec: number[] }[] | null =
  null;

async function getAnchorEmbeddings() {
  if (anchorCache) return anchorCache;
  const flat = flatAnchorList();
  const vecs = await embed(flat.map((a) => a.text));
  anchorCache = flat.map((a, i) => ({ ...a, vec: vecs[i] }));
  return anchorCache;
}

export interface SenseHit<TAnchor = unknown> {
  sense: Sense;
  index: number;
  text: string;
  similarity: number;
  /** softmax-normalized score across this sense's anchors (0-1) */
  weight: number;
  anchor: TAnchor;
  /** Top-3 candidates within this sense, for richer UI */
  candidates: { text: string; similarity: number }[];
}

export interface SynesthesiaResult {
  input: string;
  /** ~64 dims of the user's embedding, normalized to [-1, 1], for shader use. */
  signature: number[];
  hits: Record<Sense, SenseHit>;
}

function softmax(xs: number[], temperature = 0.05): number[] {
  // Sharper temperature => more peaked distribution.
  const scaled = xs.map((x) => x / temperature);
  const m = Math.max(...scaled);
  const exps = scaled.map((x) => Math.exp(x - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export async function synesthesize(input: string): Promise<SynesthesiaResult> {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Empty input.");

  const [userVec] = await embed([trimmed]);
  const anchors = await getAnchorEmbeddings();

  // Group anchors by sense, compute similarity per anchor.
  const bySense: Record<Sense, { index: number; text: string; sim: number }[]> = {
    eye: [],
    ear: [],
    nose: [],
    tongue: [],
    body: [],
    mind: [],
  };

  for (const a of anchors) {
    bySense[a.sense].push({
      index: a.index,
      text: a.text,
      sim: cosine(userVec, a.vec),
    });
  }

  const hits = {} as Record<Sense, SenseHit>;
  (Object.keys(bySense) as Sense[]).forEach((sense) => {
    const list = bySense[sense].sort((a, b) => b.sim - a.sim);
    const weights = softmax(list.map((l) => l.sim));
    const top = list[0];
    hits[sense] = {
      sense,
      index: top.index,
      text: top.text,
      similarity: top.sim,
      weight: weights[0],
      anchor: (allAnchors[sense] as any[])[top.index],
      candidates: list.slice(0, 3).map((c) => ({
        text: c.text,
        similarity: c.sim,
      })),
    };
  });

  // Reduce user embedding to a compact signature for shader uniforms.
  // We L2-normalize first so the magnitude is stable, then take first 64 dims.
  const norm = Math.sqrt(userVec.reduce((s, v) => s + v * v, 0)) || 1;
  const sig = userVec.slice(0, 64).map((v) => v / norm);
  // Stretch to nicer [-1, 1] visual range.
  const sigMax = Math.max(1e-6, ...sig.map((v) => Math.abs(v)));
  const signature = sig.map((v) => v / sigMax);

  return { input: trimmed, signature, hits };
}
