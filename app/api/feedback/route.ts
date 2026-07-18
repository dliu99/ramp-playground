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
  source: "grok" | "local";
}

function localFeedback(draft: string): DraftFeedback {
  return {
    ready: true,
    score: 0,
    feedback: "Model review is unavailable. Continue without blocking the push.",
    missing: [],
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

function parseModelFeedback(output: string): Omit<DraftFeedback, "source"> | undefined {
  try {
    const parsed = JSON.parse(output.replace(/^```json\s*|\s*```$/g, "")) as Partial<Omit<DraftFeedback, "source">>;
    const score = parsed.score;
    if (
      typeof parsed.ready !== "boolean" ||
      typeof score !== "number" ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > 4 ||
      typeof parsed.feedback !== "string" ||
      !Array.isArray(parsed.missing) ||
      !parsed.missing.every((item) => typeof item === "string") ||
      typeof parsed.suggestedDraft !== "string"
    ) return undefined;
    return parsed as Omit<DraftFeedback, "source">;
  } catch {
    return undefined;
  }
}

async function modelFeedback(body: FeedbackRequest): Promise<DraftFeedback | undefined> {
  if (!process.env.XAI_API_KEY || !body.session || !body.draft) return undefined;
  const prompt = {
    branch: body.session.branch,
    commits: body.session.commits,
    changedFiles: body.session.changedFiles,
    quizPlan: body.session.quizPlan,
    authorDraft: body.draft,
    revision: body.revision ?? 1,
  };
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.XAI_MODEL ?? "grok-4.5",
      instructions: "Judge whether a PR author understands the behavioral change and its wider system flow. Return only JSON with keys ready (boolean), score (integer 0-4), feedback (concise string), missing (string array), suggestedDraft (lightly edited markdown). Never invent implementation details.",
      input: JSON.stringify(prompt),
      store: false,
      prompt_cache_key: body.session.id,
    }),
  });
  if (!response.ok) return undefined;
  const output = extractOutputText(await response.json());
  if (!output) return undefined;
  const parsed = parseModelFeedback(output);
  return parsed ? { ...parsed, source: "grok" } : undefined;
}

export async function POST(request: Request) {
  const body = (await request.json()) as FeedbackRequest;
  const draft = body.draft?.trim() ?? "";
  if (!draft) return NextResponse.json({ error: "Write a draft first" }, { status: 400 });
  const feedback = await modelFeedback(body).catch(() => undefined) ?? localFeedback(draft);
  return NextResponse.json(feedback);
}
