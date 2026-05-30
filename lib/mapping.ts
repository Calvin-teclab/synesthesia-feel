import {
  embed,
  embedInputs,
  EmbedInput,
  EmbeddingProvider,
  getEmbeddingConfig,
} from "./ark";
import {
  BodyAnchor,
  EarAnchor,
  EyeAnchor,
  MindAnchor,
  NoseAnchor,
  allAnchors,
  flatAnchorList,
  Sense,
  TongueAnchor,
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

type AnchorEmbedding = { sense: Sense; index: number; text: string; vec: number[] };

/** In-process cache for anchor embeddings. Keyed by provider/model vector space. */
const anchorCache = new Map<string, Promise<AnchorEmbedding[]>>();

export async function getAnchorEmbeddings(provider: EmbeddingProvider = "ark") {
  const config = getEmbeddingConfig(provider);
  const cached = anchorCache.get(config.cacheKey);
  if (cached) return cached;
  const flat = flatAnchorList();
  const pending = embed(
    flat.map((a) => a.text),
    { provider: config.provider },
  )
    .then((vecs) => flat.map((a, i) => ({ ...a, vec: vecs[i] })))
    .catch((error) => {
      anchorCache.delete(config.cacheKey);
      throw error;
    });
  anchorCache.set(config.cacheKey, pending);
  return pending;
}

export interface SenseHit<TAnchor = unknown> {
  sense: Sense;
  index: number;
  text: string;
  similarity: number;
  /** softmax-normalized score across this sense's anchors (0-1) */
  weight: number;
  /** Weighted blend of nearest anchors, used for richer rendering. */
  blend: TAnchor;
  anchor: TAnchor;
  /** Top-3 candidates within this sense, for richer UI */
  candidates: { text: string; similarity: number; weight: number }[];
}

export interface SynesthesiaResult {
  input: string;
  inputType: EmbedInput["type"];
  provider: EmbeddingProvider;
  model: string;
  /** ~64 dims of the user's embedding, normalized to [-1, 1], for shader use. */
  signature: number[];
  /** Folded projection of the full embedding for particle geometry. */
  profile: number[];
  /** Real embedding stats and a visible slice for the vector inspector UI. */
  vector: {
    dimensions: number;
    shownDimensions: number;
    l2Norm: number;
    meanAbs: number;
    min: number;
    max: number;
    sample: { index: number; value: number; normalized: number }[];
    strongest: { index: number; value: number; normalized: number }[];
  };
  map: {
    method: "anchor-pca";
    points: {
      id: string;
      type: "anchor" | "input";
      sense?: Sense;
      label: string;
      x: number;
      y: number;
      similarity?: number;
      rank?: number;
    }[];
  };
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function weightedAverage(entries: { value: number; weight: number }[]): number {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  return entries.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / total;
}

function weightedCategory<T extends string>(
  entries: { value: T; weight: number }[],
): T {
  const totals = new Map<T, number>();
  entries.forEach(({ value, weight }) => {
    totals.set(value, (totals.get(value) ?? 0) + weight);
  });
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function weightedHue(entries: { value: number; weight: number }[]): number {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0) || 1;
  const x =
    entries.reduce(
      (sum, entry) => sum + Math.cos((entry.value * Math.PI) / 180) * entry.weight,
      0,
    ) / total;
  const y =
    entries.reduce(
      (sum, entry) => sum + Math.sin((entry.value * Math.PI) / 180) * entry.weight,
      0,
    ) / total;
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function signatureNudge(signature: number[], offset: number, scale: number): number {
  if (signature.length === 0) return 0;
  let sum = 0;
  let weight = 0;
  for (let i = offset; i < signature.length; i += 6) {
    const w = 0.7 + ((i * 11) % 13) / 20;
    sum += signature[i] * w;
    weight += w;
  }
  return clamp((sum / Math.max(1e-6, weight)) * scale, -scale, scale);
}

function embeddingProfile(vec: number[], norm: number, bins = 128): number[] {
  const sums = Array.from({ length: bins }, () => 0);
  const weights = Array.from({ length: bins }, () => 0);

  vec.forEach((raw, index) => {
    const value = raw / Math.max(1e-9, norm);
    const weight = 0.72 + ((index * 17) % 29) / 41;
    const primary = index % bins;
    const secondary = (index * 37 + 17) % bins;
    sums[primary] += value * weight;
    weights[primary] += weight;
    sums[secondary] += value * weight * 0.42;
    weights[secondary] += weight * 0.42;
  });

  const folded = sums.map((sum, index) => sum / Math.max(1e-9, weights[index]));
  const maxAbs = Math.max(1e-9, ...folded.map((value) => Math.abs(value)));
  return folded.map((value) => clamp(value / maxAbs, -1, 1));
}

function dot(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += a[i] * b[i];
  return total;
}

function normalize(vec: number[]): number[] {
  const len = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  if (len < 1e-9) return vec.map(() => 0);
  return vec.map((value) => value / len);
}

function centerRows(rows: number[][]) {
  const dims = rows[0]?.length ?? 0;
  const mean = Array.from({ length: dims }, () => 0);
  rows.forEach((row) => {
    for (let i = 0; i < dims; i++) mean[i] += row[i];
  });
  for (let i = 0; i < dims; i++) mean[i] /= Math.max(1, rows.length);
  const centered = rows.map((row) => row.map((value, index) => value - mean[index]));
  return { mean, centered };
}

function principalComponent(rows: number[][], previous?: number[]): number[] {
  const dims = rows[0]?.length ?? 0;
  let component = normalize(
    Array.from({ length: dims }, (_, index) => Math.sin(index * 12.9898 + 78.233)),
  );

  for (let iter = 0; iter < 32; iter++) {
    const next = Array.from({ length: dims }, () => 0);
    rows.forEach((row) => {
      const projection = dot(row, component);
      for (let i = 0; i < dims; i++) next[i] += row[i] * projection;
    });

    if (previous) {
      const overlap = dot(next, previous);
      for (let i = 0; i < dims; i++) next[i] -= previous[i] * overlap;
    }

    component = normalize(next);
  }

  return component;
}

type MapBasis = {
  mean: number[];
  pc1: number[];
  pc2: number[];
  scale: number;
  anchorPoints: {
    id: string;
    type: "anchor";
    sense: Sense;
    label: string;
    x: number;
      y: number;
    }[];
};

const mapBasisCache = new Map<string, MapBasis>();

function getMapBasis(
  anchors: AnchorEmbedding[],
  cacheKey: string,
) {
  const cached = mapBasisCache.get(cacheKey);
  if (cached) return cached;

  const { mean, centered } = centerRows(anchors.map((anchor) => anchor.vec));
  const pc1 = principalComponent(centered);
  const pc2 = principalComponent(centered, pc1);
  const rawPoints = anchors.map((anchor, index) => {
    const row = centered[index];
    return {
      id: `${anchor.sense}-${anchor.index}`,
      type: "anchor" as const,
      sense: anchor.sense,
      label: anchor.text,
      x: dot(row, pc1),
      y: dot(row, pc2),
    };
  });
  const scale =
    Math.max(
      1e-9,
      ...rawPoints.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]),
    ) * 1.08;

  const basis = {
    mean,
    pc1,
    pc2,
    scale,
    anchorPoints: rawPoints.map((point) => ({
      ...point,
      x: clamp(point.x / scale, -1.2, 1.2),
      y: clamp(point.y / scale, -1.2, 1.2),
    })),
  };
  mapBasisCache.set(cacheKey, basis);
  return basis;
}

function buildEmbeddingMap(
  userVec: number[],
  anchors: AnchorEmbedding[],
  cacheKey: string,
) {
  const basis = getMapBasis(anchors, cacheKey);
  const centeredInput = userVec.map((value, index) => value - basis.mean[index]);
  const inputPoint = {
    id: "input",
    type: "input" as const,
    label: "当前输入",
    x: clamp(dot(centeredInput, basis.pc1) / basis.scale, -1.2, 1.2),
    y: clamp(dot(centeredInput, basis.pc2) / basis.scale, -1.2, 1.2),
  };

  const ranked = anchors
    .map((anchor) => ({
      id: `${anchor.sense}-${anchor.index}`,
      similarity: cosine(userVec, anchor.vec),
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const rankById = new Map(
    ranked.map((item, index) => [
      item.id,
      { rank: index + 1, similarity: item.similarity },
    ]),
  );

  return {
    method: "anchor-pca" as const,
    points: [
      ...basis.anchorPoints.map((point) => ({
        ...point,
        ...rankById.get(point.id),
      })),
      inputPoint,
    ],
  };
}

type WeightedSenseCandidate = {
  index: number;
  text: string;
  sim: number;
  blendWeight: number;
};

function blendSenseAnchor(
  sense: Sense,
  list: WeightedSenseCandidate[],
  signature: number[],
) {
  if (sense === "eye") {
    const anchors = list.map((item) => ({
      anchor: allAnchors.eye[item.index],
      weight: item.blendWeight,
    }));
    return {
      text: list[0].text,
      hue:
        weightedHue(
          anchors.map(({ anchor, weight }) => ({ value: anchor.hue, weight })),
        ) + signatureNudge(signature, 0, 18),
      sat: clamp(
        weightedAverage(
          anchors.map(({ anchor, weight }) => ({ value: anchor.sat, weight })),
        ) + signatureNudge(signature, 1, 8),
        8,
        100,
      ),
      light: clamp(
        weightedAverage(
          anchors.map(({ anchor, weight }) => ({ value: anchor.light, weight })),
        ) + signatureNudge(signature, 2, 7),
        18,
        86,
      ),
      form: weightedCategory(
        anchors.map(({ anchor, weight }) => ({ value: anchor.form, weight })),
      ),
    } satisfies EyeAnchor;
  }

  if (sense === "ear") {
    const anchors = list.map((item) => ({
      anchor: allAnchors.ear[item.index],
      weight: item.blendWeight,
    }));
    return {
      text: list[0].text,
      freq: clamp(
        weightedAverage(
          anchors.map(({ anchor, weight }) => ({ value: anchor.freq, weight })),
        ) * (1 + signatureNudge(signature, 3, 0.08)),
        55,
        1800,
      ),
      harmonic: clamp(
        weightedAverage(
          anchors.map(({ anchor, weight }) => ({ value: anchor.harmonic, weight })),
        ),
        0.5,
        4,
      ),
      waveform: weightedCategory(
        anchors.map(({ anchor, weight }) => ({ value: anchor.waveform, weight })),
      ),
      attack: clamp(
        weightedAverage(
          anchors.map(({ anchor, weight }) => ({ value: anchor.attack, weight })),
        ),
        0.004,
        0.8,
      ),
      release: clamp(
        weightedAverage(
          anchors.map(({ anchor, weight }) => ({ value: anchor.release, weight })),
        ),
        0.18,
        5.5,
      ),
      filter: clamp(
        weightedAverage(
          anchors.map(({ anchor, weight }) => ({ value: anchor.filter, weight })),
        ),
        400,
        6500,
      ),
    } satisfies EarAnchor;
  }

  if (sense === "nose") {
    const anchors = list.map((item) => ({
      anchor: allAnchors.nose[item.index],
      weight: item.blendWeight,
    }));
    return {
      text: list[0].text,
      motion: weightedCategory(
        anchors.map(({ anchor, weight }) => ({ value: anchor.motion, weight })),
      ),
      density: clamp(
        weightedAverage(
          anchors.map(({ anchor, weight }) => ({ value: anchor.density, weight })),
        ) + signatureNudge(signature, 4, 0.12),
        0.15,
        0.9,
      ),
    } satisfies NoseAnchor;
  }

  if (sense === "tongue") {
    const anchors = list.map((item) => ({
      anchor: allAnchors.tongue[item.index],
      weight: item.blendWeight,
    }));
    return {
      text: list[0].text,
      temperature: clamp(
        weightedAverage(
          anchors.map(({ anchor, weight }) => ({
            value: anchor.temperature,
            weight,
          })),
        ) + signatureNudge(signature, 5, 0.18),
        -1,
        1,
      ),
      edge: clamp(
        weightedAverage(
          anchors.map(({ anchor, weight }) => ({ value: anchor.edge, weight })),
        ) + signatureNudge(signature, 0, 0.14),
        0,
        1,
      ),
    } satisfies TongueAnchor;
  }

  if (sense === "body") {
    const anchors = list.map((item) => ({
      anchor: allAnchors.body[item.index],
      weight: item.blendWeight,
    }));
    return {
      text: list[0].text,
      tremor: clamp(
        weightedAverage(
          anchors.map(({ anchor, weight }) => ({ value: anchor.tremor, weight })),
        ) * (1 + signatureNudge(signature, 1, 0.18)),
        0.2,
        12,
      ),
      gravity: clamp(
        weightedAverage(
          anchors.map(({ anchor, weight }) => ({ value: anchor.gravity, weight })),
        ) + signatureNudge(signature, 2, 0.12),
        0,
        1,
      ),
    } satisfies BodyAnchor;
  }

  const anchors = list.map((item) => ({
    anchor: allAnchors.mind[item.index],
    weight: item.blendWeight,
  }));
  return {
    text: list[0].text,
    turbulence: clamp(
      weightedAverage(
        anchors.map(({ anchor, weight }) => ({ value: anchor.turbulence, weight })),
      ) + signatureNudge(signature, 3, 0.16),
      0,
      1,
    ),
    scale: clamp(
      weightedAverage(
        anchors.map(({ anchor, weight }) => ({ value: anchor.scale, weight })),
      ) + signatureNudge(signature, 4, 0.18),
      -1,
      1,
    ),
  } satisfies MindAnchor;
}

export async function synesthesize(
  input: string | EmbedInput,
  options: { provider?: EmbeddingProvider } = {},
): Promise<SynesthesiaResult> {
  const config = getEmbeddingConfig(options.provider);
  const userInput =
    typeof input === "string" ? { type: "text" as const, text: input.trim() } : input;

  if (userInput.type === "text" && !userInput.text.trim()) {
    throw new Error("Empty input.");
  }

  const [userVec] = await embedInputs([userInput], { provider: config.provider });
  const anchors = await getAnchorEmbeddings(config.provider);

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

  // Reduce user embedding to a compact signature for shader uniforms.
  // We L2-normalize first so the magnitude is stable, then take first 64 dims.
  const norm = Math.sqrt(userVec.reduce((s, v) => s + v * v, 0)) || 1;
  const sig = userVec.slice(0, 64).map((v) => v / norm);
  // Stretch to nicer [-1, 1] visual range.
  const sigMax = Math.max(1e-6, ...sig.map((v) => Math.abs(v)));
  const signature = sig.map((v) => v / sigMax);
  const profile = embeddingProfile(userVec, norm);

  const hits = {} as Record<Sense, SenseHit>;
  (Object.keys(bySense) as Sense[]).forEach((sense) => {
    const list = bySense[sense].sort((a, b) => b.sim - a.sim);
    const weights = softmax(list.map((l) => l.sim));
    const blendList = list.slice(0, 4);
    const blendWeights = softmax(
      blendList.map((l) => l.sim),
      0.035,
    );
    const weightedBlendList = blendList.map((item, index) => ({
      ...item,
      blendWeight: blendWeights[index],
    }));
    const top = list[0];
    hits[sense] = {
      sense,
      index: top.index,
      text: top.text,
      similarity: top.sim,
      weight: weights[0],
      blend: blendSenseAnchor(sense, weightedBlendList, signature),
      anchor: (allAnchors[sense] as any[])[top.index],
      candidates: list.slice(0, 3).map((c) => ({
        text: c.text,
        similarity: c.sim,
        weight:
          blendWeights[blendList.findIndex((item) => item.index === c.index)] ?? 0,
      })),
    };
  });

  const sampleValues = userVec.slice(0, 64);
  const sampleMaxAbs = Math.max(1e-9, ...sampleValues.map((v) => Math.abs(v)));
  const globalMaxAbs = Math.max(1e-9, ...userVec.map((v) => Math.abs(v)));
  const vector = {
    dimensions: userVec.length,
    shownDimensions: sampleValues.length,
    l2Norm: norm,
    meanAbs: userVec.reduce((sum, v) => sum + Math.abs(v), 0) / userVec.length,
    min: Math.min(...userVec),
    max: Math.max(...userVec),
    sample: sampleValues.map((value, index) => ({
      index,
      value,
      normalized: value / sampleMaxAbs,
    })),
    strongest: userVec
      .map((value, index) => ({ index, value }))
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 6)
      .map(({ index, value }) => ({
        index,
        value,
        normalized: value / globalMaxAbs,
      })),
  };

  const inputLabel =
    userInput.type === "text"
      ? userInput.text.trim()
      : userInput.type === "image"
        ? "上传的图片"
        : "上传的视频";

  return {
    input: inputLabel,
    inputType: userInput.type,
    provider: config.provider,
    model: config.model,
    signature,
    profile,
    vector,
    map: buildEmbeddingMap(userVec, anchors, config.cacheKey),
    hits,
  };
}
