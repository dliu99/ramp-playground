# PR Review Room

A local, web-only pre-push checkpoint for understanding a change before opening its pull request. The Git hook opens a minimal Next.js review room; there is no terminal quiz.

The flow has four steps:

1. Rebuild the changed system path in **Flow Fixer**.
2. Replay commits and inspect the final behavioral/semantic diff in **Before / After**.
3. Learn service ownership in **Service Shuffle**.
4. Write the PR description and revise it against model feedback until it is ready.

## Setup

Install [Bun](https://bun.sh/), then:

```sh
bun install
bun run hooks:install
```

Run the review room without pushing:

```sh
bun run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Without a session token the page uses the current branch as a demo session.

## Pre-push flow

Push normally. The hook collects the pushed refs and read-only Git metadata, creates a file under `.context/pr-sessions`, starts the local Next.js app, and opens the session in the browser. The push waits for **build draft PR** or **cancel** in the page.

Operational failures and a 30-minute timeout fail open so the hook cannot strand the developer. An explicit cancel fails closed. The intentional escape hatch remains:

```sh
PR_QUIZ_BYPASS=1 git push
```

## Model feedback

Set `OPENAI_API_KEY` to judge PR-description revisions with the OpenAI Responses API. The model receives only the session summary (commits, changed-file paths, system flow, semantic diff) and the submitted draft—not full repository contents.

```sh
OPENAI_API_KEY=... bun run dev
```

Use `OPENAI_MODEL` to override the default `gpt-5-mini`. Without a key, the same endpoint uses a small local rubric so the complete interaction remains testable.

## Keyboard

- `1`—`4`: jump between steps
- `←` / `→`: move between steps or commits
- `space`: flip a service card
- `⌘` + `enter`: judge a PR-description revision

## Validate

```sh
bun run typecheck
bun run build
```
