"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReviewSession } from "../src/review-session";

type Step = "flow" | "changes" | "services" | "draft";
type Feedback = { ready: boolean; score: number; feedback: string; missing: string[]; suggestedDraft: string; source: string };

const steps: Array<{ id: Step; label: string; key: string }> = [
  { id: "flow", label: "flow fixer", key: "1" },
  { id: "changes", label: "before / after", key: "2" },
  { id: "services", label: "service shuffle", key: "3" },
  { id: "draft", label: "write the pr", key: "4" },
];

function prUrl(session: ReviewSession, draft: string): string {
  const root = session.remoteUrl?.includes("github.com") ? `https://github.com/${session.repo}` : "https://github.com";
  const title = session.commits.at(-1)?.title ?? session.branch;
  return `${root}/compare/${encodeURIComponent(session.baseBranch)}...${encodeURIComponent(session.branch)}?expand=1&draft=1&title=${encodeURIComponent(title)}&body=${encodeURIComponent(draft)}`;
}

export default function ReviewRoom() {
  const [session, setSession] = useState<ReviewSession>();
  const [step, setStep] = useState<Step>("flow");
  const [complete, setComplete] = useState<Set<Step>>(new Set());
  const [flowOrder, setFlowOrder] = useState<string[]>([]);
  const [commitIndex, setCommitIndex] = useState(0);
  const [serviceIndex, setServiceIndex] = useState(0);
  const [serviceReveal, setServiceReveal] = useState(false);
  const [draft, setDraft] = useState("");
  const [revision, setRevision] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>();
  const [judging, setJudging] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("session");
    fetch(`/api/session${id ? `?id=${encodeURIComponent(id)}` : ""}`)
      .then((response) => response.json())
      .then(setSession);
  }, []);

  const markComplete = useCallback((value: Step) => {
    setComplete((current) => new Set([...current, value]));
  }, []);

  const go = useCallback((direction: number) => {
    const index = steps.findIndex((item) => item.id === step);
    setStep(steps[Math.max(0, Math.min(steps.length - 1, index + direction))]!.id);
  }, [step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches("textarea, input")) {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void judgeDraft();
        return;
      }
      const direct = steps.find((item) => item.key === event.key);
      if (direct) setStep(direct.id);
      if (event.key === "Escape") void finish("cancelled");
      if (event.key === "r" && step === "flow") resetFlow();
      if (event.key === "ArrowLeft") {
        if (step === "changes") setCommitIndex((value) => Math.max(0, value - 1));
        else if (step === "services") { setServiceIndex((value) => Math.max(0, value - 1)); setServiceReveal(false); }
        else go(-1);
      }
      if (event.key === "ArrowRight") {
        if (step === "changes") setCommitIndex((value) => Math.min(Math.max(0, (session?.commits.length ?? 1) - 1), value + 1));
        else if (step === "services") { setServiceIndex((value) => Math.min((session?.services.length ?? 1) - 1, value + 1)); setServiceReveal(false); }
        else go(1);
      }
      if (event.key === " " && step === "services") {
        event.preventDefault();
        setServiceReveal((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const shuffledFlow = useMemo(() => session ? [session.flow[2], session.flow[0], session.flow[3], session.flow[1]].filter(Boolean) : [], [session]);
  if (!session) return <main className="loading">opening review room<span>_</span></main>;

  function addFlow(id: string) {
    if (flowOrder.includes(id)) return;
    const next = [...flowOrder, id];
    setFlowOrder(next);
    if (next.length === session!.flow.length && next.every((value, index) => value === session!.flow[index]!.id)) markComplete("flow");
  }

  function resetFlow() {
    setFlowOrder([]);
  }

  async function judgeDraft() {
    if (!draft.trim() || judging) return;
    setJudging(true);
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft, revision: revision + 1, session }),
    });
    const result = await response.json() as Feedback;
    setRevision((value) => value + 1);
    setFeedback(result);
    if (result.ready) markComplete("draft");
    setJudging(false);
  }

  async function finish(status: "approved" | "cancelled") {
    const id = new URLSearchParams(window.location.search).get("session");
    if (id) {
      await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    }
    if (status === "approved") window.open(prUrl(session!, feedback?.suggestedDraft || draft), "_blank", "noopener,noreferrer");
  }

  const lastCommit = Math.max(0, session.commits.length - 1);
  const shownCommit = session.commits[commitIndex] ?? session.commits[0]!;
  const shownService = session.services[serviceIndex]!;

  return (
    <main className="shell">
      <header>
        <div className="identity"><span>PR REVIEW</span><strong>{session.repo}</strong><i>/</i><strong>{session.branch}</strong></div>
        <div className="meta"><span>{session.commits.length} commits</span><span>{session.changedFiles.length} files</span><button onClick={() => void finish("cancelled")}>[esc cancel]</button></div>
      </header>

      <nav aria-label="Review steps">
        {steps.map((item, index) => <button key={item.id} className={step === item.id ? "active" : ""} onClick={() => setStep(item.id)}><kbd>{item.key}</kbd>{item.label}<em>{complete.has(item.id) ? "✓" : String(index + 1).padStart(2, "0")}</em></button>)}
      </nav>

      <section className="stage">
        {step === "flow" && <div className="panel flow-panel">
          <div className="prompt"><span>01 / FLOW FIXER</span><h1>Put the write path in order.</h1><p>click cards or use drag order · click placed cards to undo</p></div>
          <div className="flow-row">
            {session.flow.map((_, index) => {
              const id = flowOrder[index];
              const node = session.flow.find((item) => item.id === id);
              return <button key={index} className={node ? "flow-slot filled" : "flow-slot"} onClick={() => node && setFlowOrder(flowOrder.slice(0, index))}><small>0{index + 1}</small>{node ? <><strong>{node.label}</strong><span>{node.detail}</span></> : <em>empty</em>}</button>;
            })}
          </div>
          <div className="tray">{shuffledFlow.map((node) => <button key={node.id} disabled={flowOrder.includes(node.id)} onClick={() => addFlow(node.id)}><strong>{node.label}</strong><span>{node.detail}</span></button>)}</div>
          <div className="statusline"><span>{complete.has("flow") ? "+ REQUEST PATH RESTORED" : `${flowOrder.length}/${session.flow.length} placed`}</span><button onClick={resetFlow}>[r reset]</button><button disabled={!complete.has("flow")} onClick={() => setStep("changes")}>[→ next]</button></div>
        </div>}

        {step === "changes" && <div className="panel change-panel">
          <div className="prompt"><span>02 / BEFORE + AFTER</span><h1>Replay the behavioral change.</h1><p>one commit at a time · use ← →</p></div>
          <div className="commit"><span>{shownCommit.sha}</span><strong>{shownCommit.title}</strong><em>{shownCommit.author} · {commitIndex + 1}/{session.commits.length}</em></div>
          <div className="system-flow">{session.flow.map((node, index) => <div key={node.id} className={commitIndex >= Math.min(index, lastCommit) ? "lit" : ""}><small>{node.id}</small><strong>{node.label}</strong><span>{commitIndex === lastCommit ? node.detail : index === 0 ? "creates company category rule" : index === 3 ? "checks category" : "unchanged"}</span></div>)}</div>
          {commitIndex === lastCommit && <div className="semantic"><span>BEHAVIORAL / SEMANTIC DIFF</span>{session.behavioralDiff.map((row) => <div key={row.before}><p><b>− BEFORE</b>{row.before}</p><p><b>+ AFTER</b>{row.after}</p></div>)}</div>}
          <div className="statusline"><button disabled={commitIndex === 0} onClick={() => setCommitIndex((value) => value - 1)}>[← previous]</button><span>{"·".repeat(commitIndex + 1)}{"○".repeat(lastCommit - commitIndex)}</span><button onClick={() => { if (commitIndex === lastCommit) { markComplete("changes"); setStep("services"); } else setCommitIndex((value) => value + 1); }}>{commitIndex === lastCommit ? "[understood →]" : "[next commit →]"}</button></div>
        </div>}

        {step === "services" && <div className="panel service-panel">
          <div className="prompt"><span>03 / SERVICE SHUFFLE</span><h1>Know who owns what.</h1><p>space flips · arrows move</p></div>
          <div className={serviceReveal ? "service-card flipped" : "service-card"} onClick={() => setServiceReveal(!serviceReveal)}>
            <div className="service-front"><small>SERVICE {serviceIndex + 1}/{session.services.length}</small><h2>{shownService.name}</h2><code>{shownService.path}</code><span>[space to reveal]</span></div>
            <div className="service-back"><small>RESPONSIBILITY</small><p>{shownService.responsibility}</p><span>in this change</span></div>
          </div>
          <div className="service-index">{session.services.map((service, index) => <button key={service.name} className={index === serviceIndex ? "active" : ""} onClick={() => { setServiceIndex(index); setServiceReveal(false); }}><b>0{index + 1}</b>{service.name}</button>)}</div>
          <div className="statusline"><span>{serviceIndex + 1}/{session.services.length} services</span><button onClick={() => { const next = (serviceIndex + 1) % session.services.length; setServiceIndex(next); setServiceReveal(false); if (next === 0) markComplete("services"); }}>[next card →]</button><button disabled={!complete.has("services")} onClick={() => setStep("draft")}>[write pr →]</button></div>
        </div>}

        {step === "draft" && <div className="panel draft-panel">
          <div className="prompt"><span>04 / TEACH IT BACK</span><h1>Describe the flow in your own words.</h1><p>what changed · where it travels · how you know it works</p></div>
          <div className="editor">
            <div className="gutter">{String(revision + 1).padStart(2, "0")}</div>
            <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={"## What changed\n\n## System flow\n\n## Verification / risk"} />
            <div className="editor-meta"><span>{draft.length} chars</span><span>⌘↵ judge revision</span></div>
          </div>
          <aside className="judge">
            <span>LLM REVIEW · REV {revision || "—"}</span>
            {!feedback ? <p className="muted">Submit a draft. Feedback checks behavior, repo context, flow, and verification.</p> : <><div className="score"><strong>{feedback.score}</strong><small>/4</small><em>{feedback.ready ? "READY" : "REVISE"}</em></div><p>{feedback.feedback}</p>{feedback.missing.map((item) => <li key={item}>→ {item}</li>)}<small>{feedback.source === "grok" ? "Grok 4.5 review" : "local rubric · set XAI_API_KEY for Grok review"}</small></>}
            <button disabled={!draft.trim() || judging} onClick={() => void judgeDraft()}>[{judging ? "judging…" : revision ? "judge revision" : "judge draft"}]</button>
            <button className="build" disabled={!feedback?.ready} onClick={() => void finish("approved")}>[build draft pr ↗]</button>
          </aside>
        </div>}
      </section>

      <footer><span>← → navigate</span><span>1—4 jump</span><span>everything stays local until draft review</span></footer>
    </main>
  );
}
