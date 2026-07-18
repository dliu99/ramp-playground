import { spawnSync } from "node:child_process";
import { displayRef, shortSha, ZERO_SHA, type RefUpdate } from "./refs";
import type { QuizPlan } from "./quiz-plan";

export type SessionStatus = "pending" | "approved" | "cancelled";

export interface ReviewCommit {
  sha: string;
  title: string;
  author: string;
}

export interface ReviewSession {
  id: string;
  status: SessionStatus;
  branch: string;
  baseBranch: string;
  repo: string;
  remoteUrl?: string;
  commits: ReviewCommit[];
  changedFiles: string[];
  diff?: string;
  quizPlan?: QuizPlan;
  createdAt: string;
}

function git(args: string[]): string | undefined {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const output = result.stdout.trim();
  return result.status === 0 && output ? output : undefined;
}

function rangeFor(update: RefUpdate): { base: string; range: string } {
  const base = update.remoteSha !== ZERO_SHA
    ? update.remoteSha
    : git(["merge-base", update.localSha, "origin/main"]) ?? "origin/main";
  return { base, range: `${base}..${update.localSha}` };
}

function parseRemoteRepo(remote?: string): string {
  if (!remote) return "local/repository";
  return remote.replace(/^git@github\.com:/, "").replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "");
}

export function createReviewSession(update: RefUpdate): ReviewSession {
  const { base, range } = rangeFor(update);
  const commitLines = git(["log", "--reverse", "--format=%H%x1f%s%x1f%an", range])?.split("\n") ?? [];
  const commits = commitLines.filter(Boolean).map((line) => {
    const [sha = "", title = "Untitled commit", author = "unknown"] = line.split("\x1f");
    return { sha: shortSha(sha), title, author };
  });
  const changedFiles = git(["diff", "--name-only", base, update.localSha])?.split("\n").filter(Boolean) ?? [];
  const remoteUrl = git(["remote", "get-url", "origin"]);
  const branch = displayRef(update.localRef);

  return {
    id: crypto.randomUUID(),
    status: "pending",
    branch,
    baseBranch: "main",
    repo: parseRemoteRepo(remoteUrl),
    remoteUrl,
    commits: commits.length ? commits : [{ sha: shortSha(update.localSha), title: "Working branch", author: "you" }],
    changedFiles,
    diff: git(["diff", "--unified=3", base, update.localSha])?.slice(0, 40_000),
    createdAt: new Date().toISOString(),
  };
}

export function demoSession(): ReviewSession {
  return createReviewSession({
    localRef: `refs/heads/${git(["branch", "--show-current"]) ?? "feature/card-controls"}`,
    localSha: git(["rev-parse", "HEAD"]) ?? "6304b4bf3cf130470694a14ba8c48ca2a8930e82",
    remoteRef: "refs/heads/feature/card-controls",
    remoteSha: ZERO_SHA,
  });
}
