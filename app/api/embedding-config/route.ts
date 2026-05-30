import { NextResponse } from "next/server";
import { getEmbeddingConfig } from "@/lib/ark";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    providers: {
      ark: getEmbeddingConfig("ark").model,
      gemini: getEmbeddingConfig("gemini").model,
    },
  });
}
