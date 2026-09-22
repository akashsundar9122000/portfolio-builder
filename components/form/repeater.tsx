"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { mutate, useDraft } from "@/lib/builder/store";
import { getAt } from "@/lib/builder/path";

/**
 * A list of structured items (jobs, projects, awards…): add, remove,
 * reorder. Each item’s fields bind to `${path}.${index}.field`.
 */
export function Repeater<T extends { id: string }>({
  path,
  noun,
  max,
  create,
  title,
  children,
}: {
  path: string;
  noun: string;
  max: number;
  create: () => T;
  title: (item: T, i: number) => string;
  children: (base: string, item: T, i: number) => ReactNode;
}) {
  const d = useDraft();
  const items = (getAt(d, path) as T[] | undefined) ?? [];
  const edit = (fn: (list: T[]) => void) =>
    mutate((draft) => {
      fn(getAt(draft, path) as T[]);
    });

  return (
    <div className="flex flex-col gap-4">
      {items.map((item, i) => (
        <fieldset key={item.id} className="card flex flex-col gap-5 p-5 sm:p-6">
          <legend className="sr-only">{title(item, i)}</legend>
          <div className="flex items-center justify-between gap-3">
            <p className="label"><span className="text-accent">{String(i + 1).padStart(2, "0")}</span> · {title(item, i) || `New ${noun}`}</p>
            <div className="flex gap-1">
              <button type="button" className="btn size-11 px-0" aria-label={`Move ${noun} up`} disabled={i === 0} onClick={() => edit((l) => l.splice(i - 1, 0, ...l.splice(i, 1)))}>
                <ArrowUp className="size-4" aria-hidden />
              </button>
              <button type="button" className="btn size-11 px-0" aria-label={`Move ${noun} down`} disabled={i === items.length - 1} onClick={() => edit((l) => l.splice(i + 1, 0, ...l.splice(i, 1)))}>
                <ArrowDown className="size-4" aria-hidden />
              </button>
              <button type="button" className="btn size-11 px-0 hover:text-danger" aria-label={`Remove ${noun}`} onClick={() => edit((l) => l.splice(i, 1))}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          {children(`${path}.${i}`, item, i)}
        </fieldset>
      ))}
      {items.length < max && (
        <button type="button" className="btn self-start" onClick={() => edit((l) => l.push(create()))}>
          <Plus className="size-4" aria-hidden /> Add {items.length ? "another" : "a"} {noun}
        </button>
      )}
    </div>
  );
}
