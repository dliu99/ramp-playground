import { spawnSync } from "node:child_process";
import { displayRef, shortSha, ZERO_SHA, type RefUpdate } from "./refs";

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
  flow: Array<{ id: string; label: string; detail: string }>;
  services: Array<{ name: string; path: string; responsibility: string }>;
  behavioralDiff: Array<{ before: string; after: string }>;
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
    flow: [
      { id: "admin", label: "Admin UI", detail: "opens one employee card" },
      { id: "cards", label: "Cards API", detail: "validates category input" },
      { id: "store", label: "Card rules", detail: "stores rule with card ID" },
      { id: "policy", label: "Policy engine", detail: "checks card + category" },
    ],
    services: [
      { name: "Admin UI", path: "apps/admin", responsibility: "Chooses a card and merchant categories" },
      { name: "Cards API", path: "services/cards", responsibility: "Validates and persists card-scoped rules" },
      { name: "Card rules", path: "card_category_rules", responsibility: "Keys category policy by card ID" },
      { name: "Policy engine", path: "services/policy", responsibility: "Evaluates card and category together" },
    ],
    behavioralDiff: [
      { before: "Admin creates a category rule", after: "Admin opens one employee card" },
      { before: "Rule applies to the company card program", after: "Rule is stored with that card's ID" },
      { before: "Policy engine checks category", after: "Policy engine checks card + category" },
    ],
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
