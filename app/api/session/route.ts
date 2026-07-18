import { NextRequest, NextResponse } from "next/server";
import { demoSession } from "../../../src/review-session";
import { generateQuizPlan } from "../../../src/quiz-plan";
import { readSession, setSessionQuizPlan, setSessionStatus } from "../../../src/session-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  let session = id ? await readSession(id) : demoSession();
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (!session.quizPlan) {
    const quizPlan = await generateQuizPlan(session).catch(() => ({
      shouldQuiz: false as const,
      reason: "Quiz generation failed; continuing without a checkpoint.",
      primitives: [],
    }));
    session = id ? await setSessionQuizPlan(id, quizPlan) ?? session : { ...session, quizPlan };
  }
  const { diff: _diff, ...clientSession } = session;
  return NextResponse.json(clientSession);
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
