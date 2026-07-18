import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReviewSession, SessionStatus } from "./review-session";

const sessionDirectory = path.join(process.cwd(), ".context", "pr-sessions");

function safeId(id: string): string {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Invalid session id");
  return id;
}

export async function saveSession(session: ReviewSession): Promise<void> {
  await mkdir(sessionDirectory, { recursive: true });
  await writeFile(path.join(sessionDirectory, `${safeId(session.id)}.json`), JSON.stringify(session, null, 2));
}

export async function readSession(id: string): Promise<ReviewSession | undefined> {
  try {
    return JSON.parse(await readFile(path.join(sessionDirectory, `${safeId(id)}.json`), "utf8")) as ReviewSession;
  } catch {
    return undefined;
  }
}

export async function setSessionStatus(id: string, status: SessionStatus): Promise<ReviewSession | undefined> {
  const session = await readSession(id);
  if (!session) return undefined;
  session.status = status;
  await saveSession(session);
  return session;
}
