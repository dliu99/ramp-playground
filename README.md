# PR Review Room

A local, web-only pre-push checkpoint for understanding a change before opening its pull request. The Git hook opens a minimal Next.js quiz; there is no terminal quiz.

The pushed diff is sent to Grok 4.5. The model decides whether the change merits a quiz, selects only the useful primitives, and supplies their content through a Zod-validated Structured Output. Available primitives are:

1. Reorder a changed system flow.
2. Replay behavioral changes across commits.
3. Recall component or service ownership with cards.
4. Teach the change back in a PR draft.

The model may return any subset in any order. Trivial changes and generation failures return no primitives and allow the push to continue. The raw diff is used server-side for generation and is not returned to the browser.

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

## Grok 4.5 feedback

Set `XAI_API_KEY` to generate quizzes and judge PR-description revisions with Grok 4.5 through xAI's Responses API. Quiz generation receives the pushed diff; draft review receives the validated quiz plan and submitted draft. Requests set `store: false`.

```sh
XAI_API_KEY=... bun run dev
```

The default model is `grok-4.5`; use `XAI_MODEL` to override it. Without a key, quiz generation is unavailable and the hook fails open.

## Keyboard

- number keys: choose a card, commit, or service in the active primitive
- `Ctrl` / `⌘` + `Z`: undo or move back within the active primitive
- `space`: flip the active service card
- `⌘` + `enter`: judge a PR-description revision

## Validate

```sh
bun run typecheck
bun run build
```
