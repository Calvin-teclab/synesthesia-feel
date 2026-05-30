import { NextRequest, NextResponse } from "next/server";
import { synesthesize } from "@/lib/mapping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|webp);base64,/i;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body?.mode === "image" ? "image" : "text";

    if (mode === "image") {
      const imageDataUrl = body?.imageDataUrl;
      if (typeof imageDataUrl !== "string" || !IMAGE_DATA_URL_RE.test(imageDataUrl)) {
        return NextResponse.json(
          { error: "请上传 PNG、JPG 或 WebP 图片" },
          { status: 400 },
        );
      }
      const [, base64 = ""] = imageDataUrl.split(",", 2);
      if (Buffer.byteLength(base64, "base64") > MAX_IMAGE_BYTES) {
        return NextResponse.json(
          { error: "图片太大了, 请控制在 4MB 以内" },
          { status: 400 },
        );
      }
      const result = await synesthesize({ type: "image", imageDataUrl });
      return NextResponse.json(result);
    }

    const { text } = body;
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
