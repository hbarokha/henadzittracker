import { NextRequest, NextResponse } from "next/server";
import { FOODS } from "@/lib/foods";

export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? "";
  const results = q ? FOODS.filter((f) => f.name.toLowerCase().includes(q)) : FOODS;
  return NextResponse.json(results);
}
