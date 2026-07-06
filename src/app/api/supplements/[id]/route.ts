import { NextResponse } from "next/server";
import { deleteSupplement } from "@/lib/supplements";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const date = new URL(req.url).searchParams.get("date") ?? undefined;
  await deleteSupplement(id, date);
  return NextResponse.json({ ok: true });
}
