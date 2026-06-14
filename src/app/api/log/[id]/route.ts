import { NextRequest, NextResponse } from "next/server";
import { deleteLogEntry } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ok = await deleteLogEntry(id);
  return ok
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: "Not found" }, { status: 404 });
}
