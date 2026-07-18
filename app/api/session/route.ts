import { NextRequest, NextResponse } from "next/server";
import { demoSession } from "../../../src/review-session";
import { readSession, setSessionStatus } from "../../../src/session-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const session = id ? await readSession(id) : demoSession();
  return session
    ? NextResponse.json(session)
    : NextResponse.json({ error: "Session not found" }, { status: 404 });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { id?: string; status?: "approved" | "cancelled" };
  if (!body.id || !body.status || !["approved", "cancelled"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid session result" }, { status: 400 });
  }
  const session = await setSessionStatus(body.id, body.status);
  return session
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Session not found" }, { status: 404 });
}
