import { NextResponse } from "next/server";
import { getRecentFoods } from "@/lib/db";

export async function GET() {
  return NextResponse.json(await getRecentFoods());
}
