import { NextResponse } from "next/server";
import { deleteSupplement } from "@/lib/supplements";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteSupplement(id);
  return NextResponse.json({ ok: true });
}
