import { NextRequest, NextResponse } from "next/server";
import { synesthesize } from "@/lib/mapping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "请填入想要体验的文字" },
        { status: 400 },
      );
    }
    if (text.length > 500) {
      return NextResponse.json(
        { error: "文字太长了, 请控制在 500 字以内" },
        { status: 400 },
      );
    }
    const result = await synesthesize(text);
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[synesthesia] error:", e);
    return NextResponse.json(
      { error: e?.message || "服务器开小差了" },
      { status: 500 },
    );
  }
}
