import { NextResponse } from "next/server";
import { runEmbeddingEvaluation } from "@/lib/evaluation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runEmbeddingEvaluation();
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[embedding-eval] error:", e);
    return NextResponse.json(
      { error: e?.message || "评测运行失败" },
      { status: 500 },
    );
  }
}
