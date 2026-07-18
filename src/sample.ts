import type { QuizPlan } from "./quiz-plan";
import type { ReviewSession } from "./review-session";
import { saveSession } from "./session-store";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const defaultRepo = "try-caddy/caddy";
const defaultPull = "3000";

interface PullRequestMetadata {
  title: string;
  url: string;
  author: { login: string };
  headRefName: string;
  baseRefName: string;
  commits: Array<{
    oid: string;
    messageHeadline: string;
    authors: Array<{ login?: string; name?: string }>;
  }>;
  files: Array<{ path: string }>;
}

const defaultQuizPlan = {
  shouldQuiz: true,
  reason: "The change fixes how mid-turn follow-ups cross unified-agent result boundaries.",
  primitives: [
    {
      type: "flow",
      nodes: [
        { id: "active", label: "A turn is active", detail: "The unified agent is still producing the current result." },
        { id: "follow-up", label: "A follow-up arrives", detail: "The new message is accepted but remains fenced from the active result." },
        { id: "boundary", label: "The result completes", detail: "The active turn reaches its own result boundary first." },
        { id: "deliver", label: "The follow-up starts", detail: "The queued input is delivered and owns the next result boundary." },
      ],
    },
    {
      type: "diagram",
      title: "Unified-agent follow-up boundaries",
      nodes: [
        { id: "message", label: "Incoming follow-up", detail: "A correction or new request arrives during an active turn." },
        { id: "queue", label: "Streaming input queue", detail: "Accepts the message and waits until delivery is safe." },
        { id: "sdk", label: "Agent SDK query", detail: "Finishes the active result before consuming the follow-up." },
      ],
      edges: [
        { from: "message", to: "queue", label: "accepted" },
        { from: "queue", to: "sdk", label: "after boundary" },
        { from: "sdk", to: "queue", label: "result complete" },
      ],
    },
    {
      type: "services",
      cards: [
        { name: "Agent-side controller", path: "apps/agent/src/unified-agent-streaming-input.ts", responsibility: "Applies the same result-boundary fence inside the remote agent runtime." },
        { name: "API-side controller", path: "apps/api/src/services/imessage/unified-agent-streaming-input.ts", responsibility: "Queues iMessage follow-ups until the active agent result finishes." },
        { name: "Orchestration contract", path: "apps/api/src/orchestration/types.ts", responsibility: "Documents that every follow-up owns its own result boundary." },
      ],
    },
    {
      type: "draft",
      sections: ["Problem", "Behavioral fix", "System impact"],
      criteria: [
        "Explains why a follow-up must not be delivered during an active result",
        "Describes the result-boundary fence at a system level",
        "Mentions that the agent-side and API-side controllers stay aligned",
      ],
    },
  ],
} satisfies QuizPlan;

function gh(args: string[]): string {
  const result = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.toString().trim() || "GitHub CLI command failed");
  }
  return result.stdout.toString().trim();
}

function pullRequestSession(repo: string, pull: string): ReviewSession {
  const metadata = JSON.parse(gh([
    "pr", "view", pull,
    "--repo", repo,
    "--json", "title,url,author,headRefName,baseRefName,commits,files",
  ])) as PullRequestMetadata;
  const diff = gh(["pr", "diff", pull, "--repo", repo]).slice(0, 40_000);
  const usesBuiltInPlan = !process.env.XAI_API_KEY && repo === defaultRepo && pull === defaultPull;

  return {
    id: crypto.randomUUID(),
    status: "pending",
    branch: metadata.headRefName,
    baseBranch: metadata.baseRefName,
    repo,
    remoteUrl: `https://github.com/${repo}.git`,
    commits: metadata.commits.map((commit) => ({
      sha: commit.oid.slice(0, 7),
      title: commit.messageHeadline,
      author: commit.authors[0]?.login ?? commit.authors[0]?.name ?? metadata.author.login,
    })),
    changedFiles: metadata.files.map((file) => file.path),
    diff,
    quizPlan: usesBuiltInPlan ? defaultQuizPlan : undefined,
    createdAt: new Date().toISOString(),
  };
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

async function isReady(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const repo = process.env.SAMPLE_REPO ?? defaultRepo;
  const pull = process.argv[2] ?? process.env.SAMPLE_PR ?? defaultPull;
  if (!/^\d+$/.test(pull)) throw new Error("PR number must be numeric");

  console.log(`Loading ${repo}#${pull} from GitHub…`);
  const session = pullRequestSession(repo, pull);
  await saveSession(session);

  const port = Number(process.env.PR_REVIEW_PORT ?? process.env.CONDUCTOR_PORT ?? 3217);
  const baseUrl = `http://127.0.0.1:${port}`;
  const sessionUrl = `${baseUrl}/?session=${session.id}`;
  const apiUrl = `${baseUrl}/api/session?id=${session.id}`;
  const server = await isReady(apiUrl) ? undefined : Bun.spawn(
    ["bun", "run", "dev", "--", "--port", String(port)],
    { stdin: "inherit", stdout: "inherit", stderr: "inherit", env: process.env },
  );

  const stop = () => server?.kill();
  if (server) {
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }

  try {
    if (!(await waitUntilReady(apiUrl))) {
      throw new Error(`Sample server did not become ready on port ${port}`);
    }
    if (process.env.SAMPLE_NO_OPEN !== "1") {
      Bun.spawn(["open", sessionUrl], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    }
    console.log(`\nSample review opened for ${repo}#${pull}: ${sessionUrl}`);
    console.log(session.quizPlan
      ? "XAI_API_KEY is not set; using the built-in quiz for Caddy PR #3000."
      : "Generating the quiz from the live PR diff.");
    console.log(server ? "Press Ctrl+C to stop the sample server.\n" : "Using the review server already running in this workspace.\n");
    if (server) await server.exited;
  } finally {
    server?.kill();
  }
}

await main().catch((error) => {
  console.error(`Unable to start sample: ${error instanceof Error ? error.message : "unexpected failure"}`);
  process.exitCode = 1;
});
