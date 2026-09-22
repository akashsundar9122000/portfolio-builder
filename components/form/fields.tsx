"use client";

import { useId, useState, type ReactNode } from "react";
import { Loader2, Sparkles, Wand2, X } from "lucide-react";
import { update, useDraft } from "@/lib/builder/store";
import { getAt } from "@/lib/builder/path";
import { aiWrite, summarize, type WriteTask } from "@/lib/builder/ai-client";

export function Field({ label, hint, htmlFor, children, counter }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode; counter?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[15px] font-medium">{label}</label>
        {counter && <span className="label tabular-nums">{counter}</span>}
      </div>
      {children}
      {hint && <p className="text-text-3 text-sm leading-relaxed">{hint}</p>}
    </div>
  );
}

export function TextInput({ path, label, hint, placeholder, max = 120, type = "text", autoComplete }: { path: string; label: string; hint?: ReactNode; placeholder?: string; max?: number; type?: string; autoComplete?: string }) {
  const d = useDraft();
  const id = useId();
  const value = String(getAt(d, path) ?? "");
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input id={id} className="input" type={type} value={value} maxLength={max} placeholder={placeholder} autoComplete={autoComplete} onChange={(e) => update(path, e.target.value)} />
    </Field>
  );
}

/** A textarea with optional AI help: "Write it for me" when empty, "Polish" when filled. */
export function TextArea({ path, label, hint, placeholder, max = 600, rows = 4, ai, aiPolish = true }: { path: string; label: string; hint?: ReactNode; placeholder?: string; max?: number; rows?: number; ai?: WriteTask; aiPolish?: boolean }) {
  const d = useDraft();
  const id = useId();
  const value = String(getAt(d, path) ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run(task: WriteTask) {
    setBusy(true);
    setErr("");
    try {
      const out = await aiWrite(task, summarize(d), value);
      if (out.text) update(path, out.text.slice(0, max));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "AI error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label={label} hint={hint} htmlFor={id} counter={`${value.length}/${max}`}>
      <textarea id={id} className="input resize-y" rows={rows} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => update(path, e.target.value)} />
      {ai && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn" disabled={busy} onClick={() => run(ai)}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {value ? "Rewrite with AI" : "Write it for me"}
          </button>
          {aiPolish && value && (
            <button type="button" className="btn" disabled={busy} onClick={() => run("polish")}>
              <Wand2 className="size-4" aria-hidden /> Polish
            </button>
          )}
          {err && <span role="alert" className="text-danger text-sm">{err}</span>}
        </div>
      )}
    </Field>
  );
}

/** Tag-style list: type and press Enter or comma. */
export function Chips({ path, label, hint, placeholder = "Type and press Enter", max = 16 }: { path: string; label: string; hint?: ReactNode; placeholder?: string; max?: number }) {
  const d = useDraft();
  const id = useId();
  const items = (getAt(d, path) as string[] | undefined) ?? [];
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const v = raw.trim().replace(/,$/, "").slice(0, 40);
    if (!v || items.includes(v) || items.length >= max) return;
    update(path, [...items, v]);
    setText("");
  };
  return (
    <Field label={label} hint={hint} htmlFor={id} counter={`${items.length}/${max}`}>
      <div className="input flex flex-wrap items-center gap-2 py-2">
        {items.map((it) => (
          <span key={it} className="chip text-text">
            {it}
            <button type="button" className="-mr-1 grid size-6 place-items-center rounded-full hover:text-accent" aria-label={`Remove ${it}`} onClick={() => update(path, items.filter((x) => x !== it))}>
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          className="min-w-[10ch] flex-1 bg-transparent py-1 text-base outline-none"
          value={text}
          placeholder={items.length ? "" : placeholder}
          onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(text); }
            if (e.key === "Backspace" && !text && items.length) update(path, items.slice(0, -1));
          }}
          onBlur={() => add(text)}
        />
      </div>
    </Field>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3">
      <input id={id} type="checkbox" className="accent-[var(--accent)] mt-1 size-5 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="font-medium">{label}</span>
        {description && <span className="text-text-3 block text-sm">{description}</span>}
      </span>
    </label>
  );
}
