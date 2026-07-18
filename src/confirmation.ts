export interface ConfirmationIO {
  interactive: boolean;
  write(message: string): void;
  ask(prompt: string): Promise<string>;
}

export type ConfirmationResult = "continue" | "cancel" | "unavailable";

export async function requestConfirmation(io: ConfirmationIO): Promise<ConfirmationResult> {
  if (!io.interactive) {
    io.write("PR quiz: non-interactive input detected; allowing push.\n");
    return "unavailable";
  }

  try {
    const answer = (await io.ask("Continue push? [Y/n] ")).trim().toLowerCase();
    return answer === "" || answer === "y" || answer === "yes" ? "continue" : "cancel";
  } catch {
    io.write("\nPR quiz: confirmation cancelled.\n");
    return "cancel";
  }
}
