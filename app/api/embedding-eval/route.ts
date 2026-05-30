import { NextResponse } from "next/server";
import { runEmbeddingEvaluation } from "@/lib/evaluation";
import { normalizeEmbeddingProvider } from "@/lib/ark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const provider = normalizeEmbeddingProvider(searchParams.get("provider"));
    const result = await runEmbeddingEvaluation(provider);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[embedding-eval] error:", e);
    return NextResponse.json(
      { error: e?.message || "评测运行失败" },
      { status: 500 },
    );
  }
}
