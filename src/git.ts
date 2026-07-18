import { ZERO_SHA, type RefUpdate } from "./refs";

export interface GitRunner {
  run(args: string[]): { exitCode: number; stdout: string };
}

export interface PushSummary {
  commitCount?: number;
  changedFiles?: number;
  stat?: string;
}

export const systemGit: GitRunner = {
  run(args) {
    const result = Bun.spawnSync(["git", ...args], {
      stdout: "pipe",
      stderr: "ignore",
    });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString().trim(),
    };
  },
};

function successful(runner: GitRunner, args: string[]): string | undefined {
  const result = runner.run(args);
  return result.exitCode === 0 && result.stdout ? result.stdout : undefined;
}

export function findDiffBase(update: RefUpdate, runner: GitRunner): string | undefined {
  if (update.remoteSha !== ZERO_SHA) return update.remoteSha;
  return successful(runner, ["merge-base", update.localSha, "origin/main"]);
}

export function summarizePush(update: RefUpdate, runner: GitRunner = systemGit): PushSummary {
  const base = findDiffBase(update, runner);
  if (!base) return {};

  const range = `${base}..${update.localSha}`;
  const countText = successful(runner, ["rev-list", "--count", range]);
  const names = successful(runner, ["diff", "--name-only", base, update.localSha]);
  const stat = successful(runner, ["diff", "--shortstat", base, update.localSha]);

  return {
    commitCount: countText === undefined ? undefined : Number.parseInt(countText, 10),
    changedFiles: names === undefined ? undefined : names.split("\n").filter(Boolean).length,
    stat,
  };
}
