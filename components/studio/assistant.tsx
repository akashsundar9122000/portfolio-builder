"use client";

import { useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { applyAssistantOps, getDraft } from "@/lib/builder/store";
import { draftForAssistant } from "@/lib/builder/ai-client";
import type { Op } from "@/lib/builder/patch";

interface Msg { role: "user" | "assistant"; content: string; error?: boolean }

const SUGGESTIONS = [
  "Make my bio punchier",
  "Switch to a light theme",
  "Put projects before experience",
  "Shorten my project descriptions",
  "Suggest a stronger hero headline",
  "Use subtle motion",
];

export function Assistant({ available }: { available: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", content: "Hi! Tell me what to change — wording, order, theme, anything. I’ll edit your portfolio and you’ll see it update on the left. You can always undo." },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  async function send(content: string) {
    if (!content.trim() || busy) return;
    const history = [...msgs, { role: "user" as const, content }];
    setMsgs(history);
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: draftForAssistant(getDraft()), messages: history.filter((m) => !m.error).slice(-12).map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "The assistant couldn’t respond.");
      let reply: string = data.reply;
      const ops = (data.ops ?? []) as Op[];
      if (ops.length) {
        try {
          applyAssistantOps(ops);
        } catch (e) {
          reply = `I tried, but that change didn’t fit: ${e instanceof Error ? e.message : "invalid edit"}. Could you rephrase?`;
        }
      }
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: e instanceof Error ? e.message : "Something went wrong.", error: true }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listRef.current?.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" }));
    }
  }

  if (!available) {
    return <p className="text-text-2 p-5 text-sm">The AI assistant isn’t configured for this builder. You can still edit everything from the “Edit” button.</p>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ol ref={listRef} tabIndex={0} aria-label="Conversation with the assistant" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        {msgs.map((m, i) => (
          <li key={i} className={`max-w-[92%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${m.role === "user" ? "bg-accent text-accent-ink self-end" : m.error ? "border-danger/40 text-danger border" : "bg-raised self-start"}`}>
            {m.content}
          </li>
        ))}
        {busy && <li className="text-text-3 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden /> Working on it…</li>}
      </ol>
      <div className="border-hair flex flex-wrap gap-2 border-t px-4 pt-3">
        {SUGGESTIONS.map((s) => <button key={s} type="button" className="chip hover:border-accent hover:text-accent" onClick={() => send(s)} disabled={busy}><Sparkles className="size-3" aria-hidden />{s}</button>)}
      </div>
      <form className="flex gap-2 p-4" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <label htmlFor="assist-input" className="sr-only">Ask the assistant</label>
        <input id="assist-input" className="input" placeholder="e.g. Make the headline about data engineering" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn btn-primary size-11 shrink-0 px-0" disabled={busy || !text.trim()} aria-label="Send"><Send className="size-4" aria-hidden /></button>
      </form>
    </div>
  );
}
