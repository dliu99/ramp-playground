export const ZERO_SHA = "0000000000000000000000000000000000000000";

export interface RefUpdate {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
}

export interface ParseResult {
  updates: RefUpdate[];
  errors: string[];
}

export function parseRefUpdates(input: string): ParseResult {
  const updates: RefUpdate[] = [];
  const errors: string[] = [];

  for (const [index, rawLine] of input.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    const fields = line.split(/\s+/);
    if (fields.length !== 4) {
      errors.push(`line ${index + 1}: expected 4 fields, received ${fields.length}`);
      continue;
    }

    const [localRef, localSha, remoteRef, remoteSha] = fields;
    if (!localRef || !localSha || !remoteRef || !remoteSha) {
      errors.push(`line ${index + 1}: contains an empty field`);
      continue;
    }

    updates.push({ localRef, localSha, remoteRef, remoteSha });
  }

  return { updates, errors };
}

export function isDeletion(update: RefUpdate): boolean {
  return update.localSha === ZERO_SHA || update.localRef === "(delete)";
}

export function shortSha(sha: string): string {
  return sha === ZERO_SHA ? "(none)" : sha.slice(0, 8);
}

export function displayRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "tag:");
}
