// 火山方舟 Doubao Embedding API client
// - Text models  (doubao-embedding-text-*)   → /api/v3/embeddings, batched array input
// - Vision/multimodal models                 → /api/v3/embeddings/multimodal, one call per input
// Docs: https://www.volcengine.com/docs/82379/1099475

const TEXT_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/embeddings";
const MM_ENDPOINT =
  "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal";

interface TextResponse {
  data: { embedding: number[]; index: number }[];
}

export type EmbedInput =
  | { type: "text"; text: string }
  | { type: "image"; imageDataUrl: string };

// Multimodal endpoint may return data as either an object or a single-element array.
type MultimodalResponse =
  | { data: { embedding: number[] } }
  | { data: { embedding: number[] }[] };

function isMultimodalModel(model: string): boolean {
  return /vision|multimodal|mm/i.test(model);
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
      : [{ type: "image_url", image_url: { url: input.imageDataUrl } }];

  const res = await fetch(MM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: multimodalInput,
      encoding_format: "float",
    }),
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

async function embedMultimodal(
  apiKey: string,
  model: string,
  inputs: EmbedInput[],
): Promise<number[][]> {
  // Multimodal API embeds one fused input per call → run them in parallel.
  return Promise.all(inputs.map((input) => embedMultimodalOne(apiKey, model, input)));
}

export async function embed(inputs: string[]): Promise<number[][]> {
  return embedInputs(inputs.map((text) => ({ type: "text", text })));
}

export async function embedInputs(inputs: EmbedInput[]): Promise<number[][]> {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ARK_API_KEY is not set. Add it to .env.local (see .env.example).",
    );
  }
  const model =
    process.env.ARK_EMBEDDING_MODEL || "doubao-embedding-text-240715";

  if (isMultimodalModel(model)) {
    return embedMultimodal(apiKey, model, inputs);
  }

  const imageInput = inputs.find((input) => input.type === "image");
  if (imageInput) {
    throw new Error(
      "图片联觉需要把 ARK_EMBEDDING_MODEL 设置为多模态 embedding 模型，例如 doubao-embedding-vision-251215。",
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
