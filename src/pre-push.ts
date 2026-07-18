import { createReviewSession } from "./review-session";
import { readSession, saveSession } from "./session-store";
import { isDeletion, parseRefUpdates } from "./refs";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function openReview(url: string): Promise<void> {
  Bun.spawn(["open", url], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
}

async function waitUntilReady(url: string): Promise<boolean> {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {}
    await delay(250);
  }
  return false;
}

async function main(): Promise<number> {
  if (process.env.PR_QUIZ_BYPASS === "1") return 0;
  const parsed = parseRefUpdates(await Bun.stdin.text());
  if (parsed.errors.length || !parsed.updates.length) {
    console.error("PR review: push context unavailable; allowing push.");
    return 0;
  }
  const candidate = parsed.updates.find((update) => !isDeletion(update));
  if (!candidate) return 0;

  const session = createReviewSession(candidate);
  await saveSession(session);
  const port = Number(process.env.PR_REVIEW_PORT ?? process.env.CONDUCTOR_PORT ?? 3217);
  const server = Bun.spawn(["bun", "run", "dev", "--", "--port", String(port)], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
    env: process.env,
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  if (!(await waitUntilReady(`${baseUrl}/api/session?id=${session.id}`))) {
    server.kill();
    console.error("PR review: web session could not start; allowing push.");
    return 0;
  }

  await openReview(`${baseUrl}/?session=${session.id}`);
  console.error(`PR review opened in your browser: ${baseUrl}/?session=${session.id}`);
  try {
    for (let elapsed = 0; elapsed < 30 * 60; elapsed++) {
      const current = await readSession(session.id);
      if (current?.status === "approved") return 0;
      if (current?.status === "cancelled") return 1;
      await delay(1000);
    }
    console.error("PR review: session timed out; allowing push.");
    return 0;
  } finally {
    server.kill();
  }
}

process.exitCode = await main().catch((error) => {
  console.error(`PR review: ${error instanceof Error ? error.message : "unexpected failure"}; allowing push.`);
  return 0;
});
