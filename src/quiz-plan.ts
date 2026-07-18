import { z } from "zod";
import type { ReviewSession } from "./review-session";

const flowNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(48),
  detail: z.string().min(1).max(120),
}).strict();

const flowPrimitiveSchema = z.object({
  type: z.literal("flow"),
  nodes: z.array(flowNodeSchema).min(2).max(6),
}).strict();

const diagramPrimitiveSchema = z.object({
  type: z.literal("diagram"),
  title: z.string().min(1).max(80),
  nodes: z.array(flowNodeSchema).min(2).max(8),
  edges: z.array(z.object({
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().max(48).optional(),
  }).strict()).min(1).max(12),
}).strict().superRefine((diagram, context) => {
  const ids = new Set(diagram.nodes.map((node) => node.id));
  for (const edge of diagram.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      context.addIssue({ code: "custom", message: "Diagram edges must reference existing node ids" });
    }
  }
});

const changeFrameSchema = z.object({
  sha: z.string().min(1).max(12),
  title: z.string().min(1).max(120),
  author: z.string().min(1).max(80),
  flow: z.array(flowNodeSchema).min(1).max(8),
  behavioralDiff: z.array(z.object({
    before: z.string().min(1).max(160),
    after: z.string().min(1).max(160),
  }).strict()).max(6),
}).strict();

const changesPrimitiveSchema = z.object({
  type: z.literal("changes"),
  frames: z.array(changeFrameSchema).min(1).max(9),
}).strict();

const servicesPrimitiveSchema = z.object({
  type: z.literal("services"),
  cards: z.array(z.object({
    name: z.string().min(1).max(64),
    path: z.string().min(1).max(160),
    responsibility: z.string().min(1).max(200),
  }).strict()).min(2).max(9),
}).strict();

const draftPrimitiveSchema = z.object({
  type: z.literal("draft"),
  sections: z.array(z.string().min(1).max(80)).min(1).max(6),
  criteria: z.array(z.string().min(1).max(160)).min(1).max(6),
}).strict();

export const quizPrimitiveSchema = z.discriminatedUnion("type", [
  flowPrimitiveSchema,
  diagramPrimitiveSchema,
  changesPrimitiveSchema,
  servicesPrimitiveSchema,
  draftPrimitiveSchema,
]);

export const quizPlanSchema = z.object({
  shouldQuiz: z.boolean(),
  reason: z.string().max(240),
  primitives: z.array(quizPrimitiveSchema).max(5),
}).strict().superRefine((plan, context) => {
  if (plan.shouldQuiz !== (plan.primitives.length > 0)) {
    context.addIssue({ code: "custom", message: "shouldQuiz must match whether primitives are present" });
  }
  const types = plan.primitives.map((primitive) => primitive.type);
  if (new Set(types).size !== types.length) {
    context.addIssue({ code: "custom", message: "Each primitive type may appear at most once" });
  }
});

export type QuizPrimitive = z.infer<typeof quizPrimitiveSchema>;
export type QuizPlan = z.infer<typeof quizPlanSchema>;

const noQuiz: QuizPlan = {
  shouldQuiz: false,
  reason: "Quiz generation was unavailable; continuing without a checkpoint.",
  primitives: [],
};

function structuredOutputSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(structuredOutputSchema);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "$schema") continue;
    result[key === "oneOf" ? "anyOf" : key] = structuredOutputSchema(child);
  }
  return result;
}

function outputText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const response = payload as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  return response.output_text
    ?? response.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
}

export async function generateQuizPlan(session: ReviewSession): Promise<QuizPlan> {
  if (!process.env.XAI_API_KEY) return noQuiz;
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.XAI_MODEL ?? "grok-4.5",
      store: false,
      instructions: [
        "Decide whether this pushed diff merits a short learning checkpoint for its author.",
        "Teach the high-level product and system mental model, not implementation trivia.",
        "Prefer questions such as what experience a route opens, which major technology or subsystem owns it, what the user can do, and how the main pieces connect.",
        "Mention a file or code-level detail only when it genuinely helps the author navigate the system; avoid identifiers, helper internals, and line-level recall.",
        "Choose only the primitives that teach a concrete mental model; an empty plan is valid for trivial changes.",
        "For a flow, choose the number of cards that best expresses the real sequence (2 to 6); do not pad it to a fixed count.",
        "Use a diagram when relationships are more useful than an ordered recall exercise.",
        "All content must be grounded in the supplied diff. Never invent services, paths, behavior, or control flow.",
        "Order primitives from broad orientation toward synthesis. Keep labels concise and details semantic.",
      ].join(" "),
      input: JSON.stringify({
        branch: session.branch,
        commits: session.commits,
        changedFiles: session.changedFiles,
        diff: session.diff,
      }),
      text: {
        format: {
          type: "json_schema",
          name: "quiz_plan",
          strict: true,
          schema: structuredOutputSchema(z.toJSONSchema(quizPlanSchema)),
        },
      },
    }),
  });
  if (!response.ok) return noQuiz;
  const text = outputText(await response.json());
  if (!text) return noQuiz;
  const parsed = quizPlanSchema.safeParse(JSON.parse(text));
  return parsed.success ? parsed.data : noQuiz;
}
