# PR Understanding Quiz Hook

A minimal local pre-push checkpoint built with Bun. It summarizes the refs being pushed and asks the author to confirm before Git sends them to the remote.

This scaffold intentionally contains no AI, quiz, scoring, game, or web logic yet.

## Prerequisite

Install [Bun](https://bun.sh/) and verify it is available as `bun` in your shell.

## Install

```sh
bun install
bun run hooks:install
```

Installation sets this checkout's `core.hooksPath` to `.githooks`. Git will invoke the checkpoint on subsequent pushes from this worktree.

## Use

Push normally:

```sh
git push
```

The hook shows the pushed branch, SHAs, commit count, and changed-file summary, then asks:

```text
Continue push? [Y/n]
```

Press Enter or answer `y` to continue. Any other answer or Ctrl-C cancels the push.

To exercise the CLI without pushing, provide a pre-push ref line on stdin:

```sh
printf 'refs/heads/example <local-sha> refs/heads/example <remote-sha>\n' | bun run quiz
```

Piped input is non-interactive, so the CLI prints its summary and safely allows the operation instead of waiting for an answer.

## Bypass

Local Git hooks are advisory and can always be bypassed. This project makes the escape hatch explicit:

```sh
PR_QUIZ_BYPASS=1 git push
```

Malformed hook input, unavailable Git summary information, or a non-interactive environment also fail open with a warning.

## Uninstall

```sh
bun run hooks:uninstall
```

The command removes `core.hooksPath` only if it still equals `.githooks`, preserving any later user configuration.

## Development

```sh
bun run typecheck
```
