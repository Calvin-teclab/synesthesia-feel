import { NextResponse } from "next/server";
import { runEmbeddingEvaluation } from "@/lib/evaluation";
import {
  normalizeCalibrationMode,
  normalizeEmbeddingProvider,
} from "@/lib/ark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const provider = normalizeEmbeddingProvider(searchParams.get("provider"));
    const calibrationMode = normalizeCalibrationMode(
      searchParams.get("calibrationMode"),
    );
    const result = await runEmbeddingEvaluation(provider, calibrationMode);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[embedding-eval] error:", e);
    return NextResponse.json(
      { error: e?.message || "评测运行失败" },
      { status: 500 },
    );
  }
}
