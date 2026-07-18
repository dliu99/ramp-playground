import { createInterface } from "node:readline/promises";
import { createReadStream, createWriteStream, openSync } from "node:fs";
import { requestConfirmation, type ConfirmationIO } from "./confirmation";
import { summarizePush } from "./git";
import { displayRef, isDeletion, parseRefUpdates, shortSha } from "./refs";

export interface QuizCliOptions {
  refInput: string;
  bypass?: boolean;
  io: ConfirmationIO;
  summarize?: typeof summarizePush;
}

export async function runQuizCli(options: QuizCliOptions): Promise<number> {
  if (options.bypass) {
    options.io.write("PR quiz: bypassed with PR_QUIZ_BYPASS=1.\n");
    return 0;
  }

  const parsed = parseRefUpdates(options.refInput);
  if (parsed.errors.length > 0) {
    options.io.write(`PR quiz: could not parse push refs (${parsed.errors.join("; ")}); allowing push.\n`);
    return 0;
  }

  if (parsed.updates.length === 0) {
    options.io.write("PR quiz: no ref updates found; allowing push.\n");
    return 0;
  }

  const quizCandidates = parsed.updates.filter((update) => !isDeletion(update));
  for (const update of parsed.updates) {
    if (isDeletion(update)) {
      options.io.write(`PR quiz: deleting ${displayRef(update.remoteRef)}; no confirmation required.\n`);
      continue;
    }

    options.io.write(`\nPushing ${displayRef(update.localRef)} -> ${displayRef(update.remoteRef)}\n`);
    options.io.write(`  ${shortSha(update.remoteSha)} -> ${shortSha(update.localSha)}\n`);
    const summary = (options.summarize ?? summarizePush)(update);
    if (summary.commitCount !== undefined) options.io.write(`  Commits: ${summary.commitCount}\n`);
    if (summary.changedFiles !== undefined) options.io.write(`  Changed files: ${summary.changedFiles}\n`);
    if (summary.stat) options.io.write(`  ${summary.stat}\n`);
  }

  if (quizCandidates.length === 0) return 0;
  const result = await requestConfirmation(options.io);
  if (result === "cancel") {
    options.io.write("PR quiz: push cancelled.\n");
    return 1;
  }
  return 0;
}

async function main(): Promise<void> {
  const refInput = await Bun.stdin.text();
  let ttyFd: number | undefined;
  try {
    ttyFd = openSync("/dev/tty", "r+");
  } catch {
    // CI, IDE automation, and other non-interactive callers may have no TTY.
  }

  const ttyInput = ttyFd === undefined ? undefined : createReadStream("", { fd: ttyFd, autoClose: false });
  const ttyOutput = ttyFd === undefined ? undefined : createWriteStream("", { fd: ttyFd, autoClose: false });
  const readline = ttyInput && ttyOutput ? createInterface({ input: ttyInput, output: ttyOutput, terminal: true }) : undefined;
  const io: ConfirmationIO = {
    interactive: readline !== undefined,
    write: (message) => process.stderr.write(message),
    ask: async (prompt) => {
      if (!readline) throw new Error("No controlling terminal");
      return readline.question(prompt);
    },
  };

  try {
    process.exitCode = await runQuizCli({
      refInput,
      bypass: process.env.PR_QUIZ_BYPASS === "1",
      io,
    });
  } finally {
    readline?.close();
    ttyInput?.destroy();
    ttyOutput?.destroy();
  }
}

if (import.meta.main) await main();
