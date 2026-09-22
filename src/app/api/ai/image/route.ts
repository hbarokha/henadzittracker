import { NextRequest, NextResponse } from "next/server";
import { analyzeImageMeal } from "@/lib/gemini";
import { heartbeatJson } from "@/lib/heartbeat";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("image") as File | null;
  if (!file) {
    return NextResponse.json({ error: "image field is required" }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type "${file.type}". Use JPEG, PNG, WebP, GIF, or HEIC.` },
      { status: 415 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.` },
      { status: 413 }
    );
  }

  // Read the upload before streaming starts — a malformed body should still be a real
  // 4xx, not an in-body error on a 200.
  let base64: string;
  try {
    base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  } catch {
    return NextResponse.json({ error: "Could not read the uploaded image" }, { status: 400 });
  }
  const mimeType = file.type;

  // Heartbeat-streamed: a 10 MB photo plus a Gemini retry can outlast Azure SWA's ~45s
  // idle kill. Status is always 200 and failures arrive as {"error": …} in the body —
  // callers MUST check data.error, not resp.ok.
  return heartbeatJson(async () => {
    const result = await analyzeImageMeal(base64, mimeType);
    return result as unknown as Record<string, unknown>;
  });
}
