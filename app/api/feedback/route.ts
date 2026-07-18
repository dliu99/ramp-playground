import { NextResponse } from "next/server";
import type { ReviewSession } from "../../../src/review-session";

interface FeedbackRequest {
  draft?: string;
  revision?: number;
  session?: ReviewSession;
}

interface DraftFeedback {
  ready: boolean;
  score: number;
  feedback: string;
  missing: string[];
  suggestedDraft: string;
  source: "openai" | "local";
}

function localFeedback(draft: string): DraftFeedback {
  const checks = [
    { ok: /card|employee/i.test(draft), label: "name the user-visible behavior" },
    { ok: /api|persist|store|rule/i.test(draft), label: "trace how the rule is stored" },
    { ok: /policy|evaluat|category/i.test(draft), label: "explain the authorization path" },
    { ok: /test|risk|verify|edge/i.test(draft), label: "state verification or remaining risk" },
  ];
  const missing = checks.filter((check) => !check.ok).map((check) => check.label);
  const score = checks.length - missing.length;
  return {
    ready: score >= 4 && draft.trim().length >= 180,
    score,
    feedback: missing.length
      ? `Good skeleton. Next revision: ${missing.join("; ")}.`
      : draft.trim().length < 180
        ? "The flow is accurate. Add one concrete example or verification detail before shipping."
        : "Ready. The description covers behavior, system flow, and verification without narrating implementation trivia.",
    missing,
    suggestedDraft: draft.trim(),
    source: "local",
  };
}

function extractOutputText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const response = payload as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (response.output_text) return response.output_text;
  return response.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
}

async function modelFeedback(body: FeedbackRequest): Promise<DraftFeedback | undefined> {
  if (!process.env.OPENAI_API_KEY || !body.session || !body.draft) return undefined;
  const prompt = {
    branch: body.session.branch,
    commits: body.session.commits,
    changedFiles: body.session.changedFiles,
    behavioralDiff: body.session.behavioralDiff,
    systemFlow: body.session.flow,
    authorDraft: body.draft,
    revision: body.revision ?? 1,
  };
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
      instructions: "Judge whether a PR author understands the behavioral change and its wider system flow. Return only JSON with keys ready (boolean), score (integer 0-4), feedback (concise string), missing (string array), suggestedDraft (lightly edited markdown). Never invent implementation details.",
      input: JSON.stringify(prompt),
    }),
  });
  if (!response.ok) return undefined;
  const output = extractOutputText(await response.json());
  if (!output) return undefined;
  try {
    const parsed = JSON.parse(output.replace(/^```json\s*|\s*```$/g, "")) as Omit<DraftFeedback, "source">;
    return { ...parsed, source: "openai" };
  } catch {
    return undefined;
  }
}

export async function POST(request: Request) {
  const body = (await request.json()) as FeedbackRequest;
  const draft = body.draft?.trim() ?? "";
  if (!draft) return NextResponse.json({ error: "Write a draft first" }, { status: 400 });
  const feedback = await modelFeedback(body).catch(() => undefined) ?? localFeedback(draft);
  return NextResponse.json(feedback);
}
