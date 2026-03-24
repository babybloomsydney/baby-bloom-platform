import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 4) {
    return NextResponse.json([]);
  }

  const res = await fetch(
    `https://api.addressr.io/addresses?q=${encodeURIComponent(q)}`
  );

  if (!res.ok) {
    return NextResponse.json([], { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
