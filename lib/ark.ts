// Embedding API clients
// 火山方舟 Doubao:
// - Text models  (doubao-embedding-text-*)   → /api/v3/embeddings, batched array input
// - Vision/multimodal models                 → /api/v3/embeddings/multimodal, one call per input
// Docs: https://www.volcengine.com/docs/82379/1099475
// Gemini:
// - Multimodal model gemini-embedding-2       → /v1beta/models/{model}:embedContent

const TEXT_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/embeddings";
const MM_ENDPOINT =
  "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal";
const GEMINI_ENDPOINT_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface TextResponse {
  data: { embedding: number[]; index: number }[];
}

interface GeminiEmbeddingResponse {
  embedding?: { values?: number[] };
  embeddings?: { values?: number[] }[];
}

export type EmbedInput =
  | { type: "text"; text: string }
  | { type: "image"; imageDataUrl: string }
  | { type: "video"; videoDataUrl: string };

export type EmbeddingProvider = "ark" | "gemini";

export interface EmbedOptions {
  provider?: EmbeddingProvider;
}

export interface EmbeddingConfig {
  provider: EmbeddingProvider;
  model: string;
  cacheKey: string;
}

// Multimodal endpoint may return data as either an object or a single-element array.
type MultimodalResponse =
  | { data: { embedding: number[] } }
  | { data: { embedding: number[] }[] };

function isMultimodalModel(model: string): boolean {
  return /vision|multimodal|mm/i.test(model);
}

function supportsArkInstructions(model: string): boolean {
  return /251215|26\d{4}|27\d{4}/.test(model);
}

export function normalizeEmbeddingProvider(
  provider: unknown,
): EmbeddingProvider {
  return provider === "gemini" ? "gemini" : "ark";
}

export function getEmbeddingConfig(
  provider: EmbeddingProvider = "ark",
): EmbeddingConfig {
  if (provider === "gemini") {
    const model = normalizeGeminiModelName(
      process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-2",
    );
    return { provider, model, cacheKey: `${provider}:${model}` };
  }

  const model =
    process.env.ARK_EMBEDDING_MODEL || "doubao-embedding-vision-251215";
  return { provider, model, cacheKey: `${provider}:${model}` };
}

function normalizeGeminiModelName(model: string): string {
  return model.replace(/^models\//, "");
}

async function embedText(
  apiKey: string,
  model: string,
  inputs: string[],
): Promise<number[][]> {
  const res = await fetch(TEXT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: inputs,
      encoding_format: "float",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ARK embedding failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as TextResponse;
  return json.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

async function embedMultimodalOne(
  apiKey: string,
  model: string,
  input: EmbedInput,
): Promise<number[]> {
  const multimodalInput =
    input.type === "text"
      ? [{ type: "text", text: input.text }]
      : input.type === "image"
        ? [{ type: "image_url", image_url: { url: input.imageDataUrl } }]
        : [{ type: "video_url", video_url: { url: input.videoDataUrl } }];

  const body: Record<string, unknown> = {
    model,
    input: multimodalInput,
    encoding_format: "float",
  };
  if (supportsArkInstructions(model)) {
    body.instructions =
      "Target_modality: text/image/video.\nInstruction:Retrieve semantically similar sensory impressions across text, image and video\nQuery:";
  }

  const res = await fetch(MM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ARK multimodal embedding failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as MultimodalResponse;
  const data = (json as any)?.data;
  const embedding = Array.isArray(data) ? data[0]?.embedding : data?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error(
      `ARK multimodal response missing embedding: ${JSON.stringify(json).slice(0, 240)}`,
    );
  }
  return embedding;
}

// Multimodal API embeds one fused input per call. Anchor warm-up sends ~45
// inputs at once, so cap concurrency to avoid hammering the endpoint (429s).
const MULTIMODAL_CONCURRENCY = 6;

async function embedMultimodal(
  apiKey: string,
  model: string,
  inputs: EmbedInput[],
): Promise<number[][]> {
  return runWithConcurrency(inputs, MULTIMODAL_CONCURRENCY, (input) =>
    embedMultimodalOne(apiKey, model, input),
  );
}

function dataUrlToGeminiPart(dataUrl: string) {
  const match = dataUrl.match(
    /^data:((?:image\/(?:png|jpe?g|webp))|(?:video\/(?:mp4|quicktime)));base64,(.+)$/i,
  );
  if (!match) {
    throw new Error("Gemini 输入需要 PNG/JPG 图片或 MP4/MOV 视频。");
  }

  const [, mimeType, data] = match;
  const normalizedMimeType = mimeType.toLowerCase() === "image/jpg"
    ? "image/jpeg"
    : mimeType.toLowerCase();

  if (normalizedMimeType === "image/webp") {
    throw new Error("Gemini Embedding 2 图片输入当前支持 PNG/JPG，请换一张图片。");
  }

  return {
    inline_data: {
      mime_type: normalizedMimeType,
      data,
    },
  };
}

function geminiParts(input: EmbedInput) {
  if (input.type === "text") {
    return [{ text: input.text }];
  }
  return [
    dataUrlToGeminiPart(
      input.type === "image" ? input.imageDataUrl : input.videoDataUrl,
    ),
  ];
}

async function embedGeminiOne(
  apiKey: string,
  model: string,
  input: EmbedInput,
): Promise<number[]> {
  const res = await fetch(
    `${GEMINI_ENDPOINT_BASE}/models/${model}:embedContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: `models/${model}`,
        content: {
          parts: geminiParts(input),
        },
      }),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini embedding failed (${res.status}): ${body}`);
  }
  const json = (await res.json()) as GeminiEmbeddingResponse;
  const values = json.embedding?.values ?? json.embeddings?.[0]?.values;
  if (!Array.isArray(values)) {
    throw new Error(
      `Gemini embedding response missing values: ${JSON.stringify(json).slice(0, 240)}`,
    );
  }
  return values;
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function embedGemini(
  apiKey: string,
  model: string,
  inputs: EmbedInput[],
): Promise<number[][]> {
  return runWithConcurrency(inputs, 6, (input) => embedGeminiOne(apiKey, model, input));
}

export async function embed(
  inputs: string[],
  options: EmbedOptions = {},
): Promise<number[][]> {
  return embedInputs(
    inputs.map((text) => ({ type: "text", text })),
    options,
  );
}

export async function embedInputs(
  inputs: EmbedInput[],
  options: EmbedOptions = {},
): Promise<number[][]> {
  const config = getEmbeddingConfig(options.provider);
  if (config.provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Gemini API Key 未配置。请在 .env.local 中设置 GEMINI_API_KEY。",
      );
    }
    return embedGemini(apiKey, config.model, inputs);
  }

  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "火山引擎 API Key 未配置。请在 .env.local 中设置 ARK_API_KEY。",
    );
  }
  const model = config.model;

  if (isMultimodalModel(model)) {
    return embedMultimodal(apiKey, model, inputs);
  }

  const mediaInput = inputs.find((input) => input.type !== "text");
  if (mediaInput) {
    throw new Error(
      "图片/视频联觉需要把 ARK_EMBEDDING_MODEL 设置为多模态 embedding 模型，例如 doubao-embedding-vision-251215。",
    );
  }

  const textInputs = inputs.filter(
    (input): input is Extract<EmbedInput, { type: "text" }> =>
      input.type === "text",
  );

  return embedText(
    apiKey,
    model,
    textInputs.map((input) => input.text),
  );
}
