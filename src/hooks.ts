type Action = "install" | "uninstall";

function gitConfig(args: string[]): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(["git", "config", "--local", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
}

export function installHooks(): number {
  const result = gitConfig(["core.hooksPath", ".githooks"]);
  if (result.exitCode !== 0) {
    console.error(result.stderr?.toString().trim() || "Unable to configure Git hooks.");
    return 1;
  }
  console.log("Installed pre-push hook via core.hooksPath=.githooks");
  return 0;
}

export function uninstallHooks(): number {
  const current = gitConfig(["--get", "core.hooksPath"]);
  const configuredPath = current.stdout?.toString().trim() ?? "";
  if (configuredPath !== ".githooks") {
    console.log(`Hooks unchanged: core.hooksPath is ${configuredPath || "not configured"}.`);
    return 0;
  }

  const result = gitConfig(["--unset", "core.hooksPath"]);
  if (result.exitCode !== 0) {
    console.error(result.stderr?.toString().trim() || "Unable to remove Git hooks configuration.");
    return 1;
  }
  console.log("Uninstalled pre-push hook.");
  return 0;
}

if (import.meta.main) {
  const action = process.argv[2] as Action | undefined;
  if (action === "install") process.exitCode = installHooks();
  else if (action === "uninstall") process.exitCode = uninstallHooks();
  else {
    console.error("Usage: bun run src/hooks.ts <install|uninstall>");
    process.exitCode = 1;
  }
}
