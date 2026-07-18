"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { QuizPlan, QuizPrimitive } from "../src/quiz-plan";
import type { ReviewSession } from "../src/review-session";

type ClientSession = Omit<ReviewSession, "diff" | "quizPlan"> & { quizPlan: QuizPlan };
type Feedback = { ready: boolean; score: number; feedback: string; missing: string[]; suggestedDraft: string };

function prUrl(session: ClientSession, draft: string): string {
  const root = session.remoteUrl?.includes("github.com") ? `https://github.com/${session.repo}` : "https://github.com";
  const title = session.commits.at(-1)?.title ?? session.branch;
  return `${root}/compare/${encodeURIComponent(session.baseBranch)}...${encodeURIComponent(session.branch)}?expand=1&draft=1&title=${encodeURIComponent(title)}&body=${encodeURIComponent(draft)}`;
}

export default function ReviewRoom() {
  const [session, setSession] = useState<ClientSession>();
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [primitiveIndex, setPrimitiveIndex] = useState(0);
  const [flowOrder, setFlowOrder] = useState<string[]>([]);
  const [changeIndex, setChangeIndex] = useState(0);
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

  useEffect(() => {
    if (session) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setLoadingSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [session]);

  const primitive = session?.quizPlan.primitives[primitiveIndex];
  const shuffledFlow = useMemo(() => {
    if (primitive?.type !== "flow") return [];
    return primitive.nodes.length > 2
      ? [...primitive.nodes.slice(2), ...primitive.nodes.slice(0, 2)]
      : [...primitive.nodes].reverse();
  }, [primitive]);

  const finish = useCallback(async (status: "approved" | "cancelled") => {
    if (!session) return;
    const id = new URLSearchParams(window.location.search).get("session");
    if (id) {
      await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    }
    if (status === "approved") window.open(prUrl(session, feedback?.suggestedDraft || draft), "_blank", "noopener,noreferrer");
  }, [draft, feedback, session]);

  useEffect(() => {
    if (!session || session.quizPlan.primitives.length > 0) return;
    const id = new URLSearchParams(window.location.search).get("session");
    if (id) void fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "approved" }),
    });
  }, [session]);

  const nextPrimitive = useCallback(() => {
    if (!session) return;
    if (primitiveIndex === session.quizPlan.primitives.length - 1) void finish("approved");
    else setPrimitiveIndex((value) => value + 1);
  }, [finish, primitiveIndex, session]);

  const addFlow = useCallback((id: string) => {
    setFlowOrder((current) => current.includes(id) ? current : [...current, id]);
  }, []);

  const judgeDraft = useCallback(async () => {
    if (!draft.trim() || judging || !session) return;
    setJudging(true);
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft, revision: revision + 1, session }),
    });
    const result = await response.json() as Feedback;
    setRevision((value) => value + 1);
    setFeedback(result);
    setJudging(false);
  }, [draft, judging, revision, session]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const editing = (event.target as HTMLElement).matches("textarea, input");
      if (editing) {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void judgeDraft();
        return;
      }
      if (event.key === "Escape") void finish("cancelled");
      const number = Number(event.key) - 1;
      if (number >= 0 && primitive) {
        if (primitive.type === "flow") {
          const node = shuffledFlow[number];
          if (node) addFlow(node.id);
        }
        if (primitive.type === "changes" && number < primitive.frames.length) setChangeIndex(number);
        if (primitive.type === "services" && number < primitive.cards.length) {
          setServiceIndex(number);
          setServiceReveal(false);
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (primitive?.type === "flow") setFlowOrder((value) => value.slice(0, -1));
        if (primitive?.type === "changes") setChangeIndex((value) => Math.max(0, value - 1));
        if (primitive?.type === "services") {
          if (serviceReveal) setServiceReveal(false);
          else setServiceIndex((value) => Math.max(0, value - 1));
        }
      }
      if (event.key === " " && primitive?.type === "services") {
        event.preventDefault();
        setServiceReveal((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addFlow, finish, judgeDraft, primitive, serviceReveal, shuffledFlow]);

  if (!session) return <LoadingScreen seconds={loadingSeconds} />;
  if (!primitive) return <main className="loading"><p>Nothing substantial to quiz — continuing…</p></main>;

  return (
    <main className="shell">
      <button className="cancel" aria-label="Cancel review" title="Cancel (Esc)" onClick={() => void finish("cancelled")}>×</button>

      {primitive.type === "flow" && <FlowPrimitive
        primitive={primitive}
        shuffled={shuffledFlow}
        order={flowOrder}
        add={addFlow}
        undo={(index) => setFlowOrder(flowOrder.slice(0, index))}
        advance={nextPrimitive}
      />}

      {primitive.type === "changes" && <ChangesPrimitive
        primitive={primitive}
        index={changeIndex}
        select={setChangeIndex}
        advance={() => changeIndex === primitive.frames.length - 1 ? nextPrimitive() : setChangeIndex((value) => value + 1)}
      />}

      {primitive.type === "diagram" && <DiagramPrimitive primitive={primitive} advance={nextPrimitive} />}

      {primitive.type === "services" && <ServicesPrimitive
        primitive={primitive}
        index={serviceIndex}
        reveal={serviceReveal}
        flip={() => setServiceReveal((value) => !value)}
        select={(index) => { setServiceIndex(index); setServiceReveal(false); }}
        advance={() => {
          if (serviceIndex === primitive.cards.length - 1) nextPrimitive();
          else { setServiceIndex((value) => value + 1); setServiceReveal(false); }
        }}
      />}

      {primitive.type === "draft" && <DraftPrimitive
        primitive={primitive}
        draft={draft}
        setDraft={setDraft}
        feedback={feedback}
        judging={judging}
        judge={() => void judgeDraft()}
        finish={() => void finish("approved")}
      />}
    </main>
  );
}

function LoadingScreen({ seconds }: { seconds: number }) {
  const stages = [
    "Reading the pushed change",
    "Mapping the user-visible behavior",
    "Choosing useful recall prompts",
    "Building the learning flow",
  ];
  const active = Math.floor(seconds / 2) % stages.length;
  return <main className="loading">
    <div className="loading-panel" aria-live="polite">
      <div className="loading-heading"><span className="spinner">◇</span><strong>Generating your review</strong><time>{seconds}s</time></div>
      <div className="loading-trace">{stages.map((stage, index) => <p key={stage} className={index === active ? "active" : "pending"}><span>{index === active ? "→" : "·"}</span>{stage}</p>)}</div>
      <small>Generation time depends on the size of the change.</small>
    </div>
  </main>;
}

function Advance({ disabled, onClick }: { disabled?: boolean; onClick: () => void }) {
  return <button className="advance" aria-label="Continue" disabled={disabled} onClick={onClick}>→</button>;
}

function FlowPrimitive({ primitive, shuffled, order, add, undo, advance }: {
  primitive: Extract<QuizPrimitive, { type: "flow" }>;
  shuffled: Extract<QuizPrimitive, { type: "flow" }>["nodes"];
  order: string[];
  add: (id: string) => void;
  undo: (index: number) => void;
  advance: () => void;
}) {
  const correct = order.length === primitive.nodes.length && order.every((id, index) => id === primitive.nodes[index]?.id);
  const attempted = order.length === primitive.nodes.length;
  return <section className="primitive flow-primitive">
    <header className="primitive-heading"><div><small>ORDER THE FLOW</small><h1>What happens, from start to finish?</h1></div><p>Select the cards in order. Build steps <b>1–{primitive.nodes.length}</b>, then check your result.</p></header>
    <div className="flow-row">{primitive.nodes.map((_, index) => {
      const node = primitive.nodes.find((item) => item.id === order[index]);
      return <button aria-label={`Flow position ${index + 1}`} key={index} className={node ? "flow-slot filled" : "flow-slot"} onClick={() => node && undo(index)}><i>{index + 1}</i>{node && <><strong>{node.label}</strong><span>{node.detail}</span></>}</button>;
    })}</div>
    <div className="tray">{shuffled.map((node, index) => <button key={node.id} disabled={order.includes(node.id)} onClick={() => add(node.id)}><kbd>{index + 1}</kbd><strong>{node.label}</strong><span>{node.detail}</span></button>)}</div>
    <div className={`flow-result ${attempted ? correct ? "correct" : "incorrect" : ""}`} role="status">{attempted ? correct ? "✓ Correct — that’s the flow." : "× Not quite. Click a placed card to retry from that step." : `${order.length} of ${primitive.nodes.length} steps placed`}</div>
    <Advance disabled={!correct} onClick={advance} />
  </section>;
}

function DiagramPrimitive({ primitive, advance }: {
  primitive: Extract<QuizPrimitive, { type: "diagram" }>;
  advance: () => void;
}) {
  return <section className="primitive diagram-primitive">
    <header className="primitive-heading"><div><small>SYSTEM MAP</small><h1>{primitive.title}</h1></div><p>A high-level map of the parts and relationships in this change.</p></header>
    <div className="diagram-grid">{primitive.nodes.map((node, index) => <article key={node.id} style={{ gridColumn: `${index % 3 + 1}`, gridRow: `${Math.floor(index / 3) * 2 + 1}` }}><small>{node.id}</small><strong>{node.label}</strong><span>{node.detail}</span></article>)}</div>
    <div className="diagram-edges">{primitive.edges.map((edge, index) => <div key={`${edge.from}:${edge.to}:${index}`}><b>{edge.from}</b><span>→</span>{edge.label && <em>{edge.label}</em>}<b>{edge.to}</b></div>)}</div>
    <Advance onClick={advance} />
  </section>;
}

function ChangesPrimitive({ primitive, index, select, advance }: {
  primitive: Extract<QuizPrimitive, { type: "changes" }>;
  index: number;
  select: (index: number) => void;
  advance: () => void;
}) {
  const frame = primitive.frames[index] ?? primitive.frames[0]!;
  return <section className="primitive changes-primitive">
    <div className="commit"><kbd>{index + 1}</kbd><span>{frame.sha}</span><strong>{frame.title}</strong><em>{frame.author}</em></div>
    <div className="system-flow">{frame.flow.map((node) => <div key={node.id}><small>{node.id}</small><strong>{node.label}</strong><span>{node.detail}</span></div>)}</div>
    <div className="semantic">{frame.behavioralDiff.map((row) => <div key={`${row.before}:${row.after}`}><p><b>−</b>{row.before}</p><p><b>+</b>{row.after}</p></div>)}</div>
    <div className="commit-index">{primitive.frames.map((item, itemIndex) => <button key={`${item.sha}:${itemIndex}`} className={itemIndex === index ? "active" : ""} onClick={() => select(itemIndex)}><kbd>{itemIndex + 1}</kbd>{item.sha}</button>)}</div>
    <Advance onClick={advance} />
  </section>;
}

function ServicesPrimitive({ primitive, index, reveal, flip, select, advance }: {
  primitive: Extract<QuizPrimitive, { type: "services" }>;
  index: number;
  reveal: boolean;
  flip: () => void;
  select: (index: number) => void;
  advance: () => void;
}) {
  const card = primitive.cards[index] ?? primitive.cards[0]!;
  return <section className="primitive services-primitive">
    <button className={reveal ? "service-card flipped" : "service-card"} onClick={flip}>
      <span className="service-front"><kbd>{index + 1}</kbd><strong>{card.name}</strong><code>{card.path}</code></span>
      <span className="service-back">{card.responsibility}</span>
    </button>
    <div className="service-index">{primitive.cards.map((item, itemIndex) => <button key={`${item.name}:${itemIndex}`} className={itemIndex === index ? "active" : ""} onClick={() => select(itemIndex)}><kbd>{itemIndex + 1}</kbd>{item.name}</button>)}</div>
    <Advance onClick={advance} />
  </section>;
}

function DraftPrimitive({ primitive, draft, setDraft, feedback, judging, judge, finish }: {
  primitive: Extract<QuizPrimitive, { type: "draft" }>;
  draft: string;
  setDraft: (draft: string) => void;
  feedback?: Feedback;
  judging: boolean;
  judge: () => void;
  finish: () => void;
}) {
  const placeholder = primitive.sections.map((section) => `## ${section}`).join("\n\n");
  return <section className="primitive draft-primitive">
    <textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} />
    <aside className="judge">
      {feedback && <><div className="score"><strong>{feedback.score}</strong><small>/4</small><em>{feedback.ready ? "READY" : "REVISE"}</em></div><p>{feedback.feedback}</p>{feedback.missing.map((item) => <li key={item}>→ {item}</li>)}</>}
      <button disabled={!draft.trim() || judging} onClick={judge}>{judging ? "…" : "judge"}</button>
      <button className="build" disabled={!feedback?.ready} onClick={finish}>open pr ↗</button>
    </aside>
  </section>;
}
