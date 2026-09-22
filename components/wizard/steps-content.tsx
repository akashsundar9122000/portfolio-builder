"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Loader2, Sparkles, Trash2, Upload } from "lucide-react";
import { Chips, Field, TextArea, TextInput, Toggle } from "@/components/form/fields";
import { Repeater } from "@/components/form/repeater";
import { blobUrl, mutate, putBlob, update, useDraft } from "@/lib/builder/store";
import { uid } from "@/lib/builder/defaults";
import { SOCIAL_KINDS, type AwardItem, type EducationItem, type ExperienceItem, type ProjectItem, type SkillGroupItem } from "@/lib/builder/schema";
import { aiWrite, summarize } from "@/lib/builder/ai-client";
import { dataUrlToBlob, downscale } from "@/lib/media/image";
import { generateResumePdf, missingForResume } from "@/lib/builder/resume-pdf";
import { runGeneration, statusLabel, type UiStatus } from "@/lib/imagegen/client";
import { useBuilderFeatures } from "./features";

const grid2 = "grid gap-5 sm:grid-cols-2";

export function StepBasics() {
  const d = useDraft();
  return (
    <div className="flex flex-col gap-6">
      <div className={grid2}>
        <TextInput path="identity.name" label="Full name" placeholder="Priya Raman" max={60} autoComplete="name" />
        <TextInput path="identity.location" label="Location" placeholder="Chennai, India" max={80} />
        <TextInput path="identity.email" label="Public email" type="email" placeholder="you@gmail.com" max={120} autoComplete="email" hint="Shown on your site so people can contact you." />
        <TextInput path="identity.phone" label="Phone (optional)" type="tel" placeholder="+91 98765 43210" max={30} autoComplete="tel" />
      </div>
      <Chips path="identity.roles" label="What you do" hint="Up to 4, e.g. Full-Stack Developer, UI Designer, ML Engineer." max={4} />
      <Field label="Links" hint="GitHub, LinkedIn, a personal site — whatever you want people to find.">
        <div className="flex flex-col gap-2">
          {d.identity.socials.map((s, i) => (
            <div key={i} className="flex gap-2">
              <select
                className="input w-40 shrink-0"
                aria-label="Link type"
                value={s.kind}
                onChange={(e) => mutate((x) => { x.identity.socials[i].kind = e.target.value as typeof s.kind; })}
              >
                {SOCIAL_KINDS.map((k) => <option key={k} value={k}>{k === "x" ? "X / Twitter" : k[0].toUpperCase() + k.slice(1)}</option>)}
              </select>
              <input className="input" aria-label={`${s.kind} URL`} placeholder="github.com/you" value={s.url} maxLength={300} onChange={(e) => mutate((x) => { x.identity.socials[i].url = e.target.value; })} />
              <button type="button" className="btn size-11 shrink-0 px-0" aria-label="Remove link" onClick={() => mutate((x) => { x.identity.socials.splice(i, 1); })}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          {d.identity.socials.length < 10 && (
            <button type="button" className="btn self-start" onClick={() => mutate((x) => { x.identity.socials.push({ kind: x.identity.socials.length ? "linkedin" : "github", url: "" }); })}>
              + Add a link
            </button>
          )}
        </div>
      </Field>
    </div>
  );
}

export function StepAbout() {
  return (
    <div className="flex flex-col gap-6">
      <Field label="Hero headline" hint="Three short lines. The first is plain, the last two glow in your theme’s colour.">
        <div className="grid gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <HeadlineInput key={i} i={i} />)}
        </div>
      </Field>
      <TextArea path="identity.bioShort" label="One-line intro" hint="Sits under the headline." max={240} rows={2} ai="bioShort" />
      <TextArea path="identity.bioLong" label="About you" hint="Two short paragraphs. Leave a blank line between them." max={1600} rows={7} ai="bioLong" />
      <div className={grid2}>
        <TextInput path="identity.creed.0" label="Creed, line 1" placeholder="Code is the craft." max={48} />
        <TextInput path="identity.creed.1" label="Creed, line 2" placeholder="Shipping is the point." max={48} />
      </div>
      <TextInput path="identity.signature" label="Signature" hint="Written in script beside your creed — usually your first name." placeholder="Priya" max={30} />
    </div>
  );
}

function HeadlineInput({ i }: { i: number }) {
  const d = useDraft();
  return (
    <input className="input font-semibold" aria-label={`Headline line ${i + 1}`} maxLength={24} value={d.identity.headline[i]}
      onChange={(e) => mutate((x) => { x.identity.headline[i] = e.target.value; })} />
  );
}

function BulletsField({ base }: { base: string }) {
  const d = useDraft();
  const idx = Number(base.split(".")[1]);
  const item = d.experience[idx];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const text = item.highlights.join("\n");
  return (
    <Field label="Highlights" hint="One per line. Numbers help: “Cut page load by 40%”." counter={`${item.highlights.length}/8`}>
      <textarea className="input" rows={4} value={text} placeholder={"Built the payments flow used by 2M users\nMentored 4 engineers"}
        onChange={(e) => mutate((x) => { x.experience[idx].highlights = e.target.value.split("\n").slice(0, 8).map((l) => l.slice(0, 240)); })} />
      <div className="flex items-center gap-2">
        <button type="button" className="btn" disabled={busy || !text.trim()} onClick={async () => {
          setBusy(true); setErr("");
          try {
            const out = await aiWrite("experience", summarize(d), `${item.role} at ${item.company}:\n${text}`);
            if (out.text) mutate((x) => { x.experience[idx].highlights = out.text!.split("\n").map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean).slice(0, 8); });
          } catch (e) { setErr(e instanceof Error ? e.message : "AI error"); } finally { setBusy(false); }
        }}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Sharpen with AI
        </button>
        {err && <span role="alert" className="text-danger text-sm">{err}</span>}
      </div>
    </Field>
  );
}

export function StepExperience() {
  return (
    <Repeater<ExperienceItem>
      path="experience" noun="role" max={12}
      create={() => ({ id: uid("e"), role: "", company: "", companyUrl: "", location: "", start: "", end: "", description: "", highlights: [], tech: [] })}
      title={(e) => [e.role, e.company].filter(Boolean).join(" · ")}
    >
      {(base) => (
        <>
          <div className={grid2}>
            <TextInput path={`${base}.role`} label="Role" placeholder="Software Engineer" max={80} />
            <TextInput path={`${base}.company`} label="Company" placeholder="Zoho" max={80} />
            <TextInput path={`${base}.start`} label="Started" placeholder="May 2022" max={20} />
            <TextInput path={`${base}.end`} label="Ended" placeholder="Leave blank if current" max={20} />
            <TextInput path={`${base}.companyUrl`} label="Company website (optional)" placeholder="zoho.com" max={300} />
            <TextInput path={`${base}.location`} label="Location (optional)" placeholder="Chennai" max={80} />
          </div>
          <TextArea path={`${base}.description`} label="What you work on" max={600} rows={3} ai="polish" aiPolish={false} />
          <BulletsField base={base} />
          <Chips path={`${base}.tech`} label="Tech used" max={16} />
        </>
      )}
    </Repeater>
  );
}

export function StepEducation() {
  return (
    <Repeater<EducationItem>
      path="education" noun="degree" max={6}
      create={() => ({ id: uid("ed"), degree: "", institution: "", start: "", end: "", grade: "", note: "" })}
      title={(e) => [e.degree, e.institution].filter(Boolean).join(" · ")}
    >
      {(base) => (
        <div className={grid2}>
          <TextInput path={`${base}.degree`} label="Degree" placeholder="B.E. Computer Science" max={120} />
          <TextInput path={`${base}.institution`} label="Institution" placeholder="Anna University" max={120} />
          <TextInput path={`${base}.start`} label="From" placeholder="2018" max={20} />
          <TextInput path={`${base}.end`} label="To" placeholder="2022" max={20} />
          <TextInput path={`${base}.grade`} label="Grade (optional)" placeholder="CGPA 8.9 / 10" max={40} />
          <TextInput path={`${base}.note`} label="Note (optional)" placeholder="Gold medal" max={240} />
        </div>
      )}
    </Repeater>
  );
}

/** The project's cover as it will appear on the card (16:10), or its placeholder. */
function CoverThumb({ refId, title, busy }: { refId: string | null; title: string; busy: boolean }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let live = true;
    if (refId) void blobUrl(refId).then((u) => live && setSrc(u));
    return () => { live = false; };
  }, [refId]);
  const initials = title.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "•";
  return (
    <div className="border-hair bg-sunken relative aspect-[16/10] w-full max-w-md overflow-hidden rounded-xl border">
      {refId && src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${title || "Project"} cover`} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-end p-4" style={{ background: "radial-gradient(90% 90% at 80% 10%, var(--spot), transparent 60%), linear-gradient(135deg, var(--surface-raised), var(--bg-sunken))" }}>
          <span className="display grad text-5xl" aria-hidden>{initials}</span>
          <span className="label absolute right-3 top-3">Designed cover</span>
        </div>
      )}
      {busy && (
        <div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[2px]">
          <Loader2 className="text-accent size-6 animate-spin" aria-hidden />
        </div>
      )}
    </div>
  );
}

function CoverField({ index }: { index: number }) {
  const d = useDraft();
  const features = useBuilderFeatures();
  const p = d.projects[index];
  const has = Boolean(p.cover);
  const [phase, setPhase] = useState<{ s: UiStatus | "IDLE"; ms: number }>({ s: "IDLE", ms: 0 });
  const [err, setErr] = useState("");
  const busy = phase.s !== "IDLE";

  async function generate() {
    setErr("");
    setPhase({ s: "PENDING", ms: 0 });
    try {
      const prompt = `A clean, modern hero illustration for a software product called "${p.title}"${p.tagline ? `: ${p.tagline}` : ""}. Abstract interface shapes, soft lighting, rich depth, no text, no letters, no logos.`;
      const url = await runGeneration(
        () => fetch("/api/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, model: "ILLUSTRATION", width: 1280, height: 800 }) }),
        { onStatus: (s, ms) => setPhase({ s, ms }) },
      );
      const ref = await putBlob(await downscale(await dataUrlToBlob(url), 1600, "image/webp", 0.85));
      mutate((x) => { x.projects[index].cover = ref; });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Image generation failed. Please try again.");
    } finally {
      setPhase({ s: "IDLE", ms: 0 });
    }
  }

  return (
    <Field label="Cover image (optional)" hint="Upload a screenshot, or generate an illustration. Without either, a designed cover with the project’s initials is used.">
      <CoverThumb refId={p.cover} title={p.title} busy={busy} />
      <div className="flex flex-wrap items-center gap-2">
        {features.generate && (
          <button type="button" className="btn" disabled={busy || !p.title.trim()} onClick={generate} title={p.title.trim() ? undefined : "Name the project first"}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} {has ? "Generate another" : "Generate a cover"}
          </button>
        )}
        <label className="btn cursor-pointer">
          <Upload className="size-4" aria-hidden /> {has ? "Replace screenshot" : "Upload screenshot"}
          <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const ref = await putBlob(await downscale(f, 1600, "image/webp", 0.85));
            mutate((x) => { x.projects[index].cover = ref; });
          }} />
        </label>
        {has && <button type="button" className="btn" disabled={busy} onClick={() => mutate((x) => { x.projects[index].cover = null; })}>Remove</button>}
      </div>
      {busy && <p role="status" className="text-text-2 text-sm">{statusLabel(phase.s, phase.ms)}</p>}
      {err && <p role="alert" className="text-danger text-sm">{err}</p>}
    </Field>
  );
}

export function StepProjects() {
  return (
    <Repeater<ProjectItem>
      path="projects" noun="project" max={12}
      create={() => ({ id: uid("p"), title: "", tagline: "", description: "", liveUrl: "", repoUrl: "", tech: [], metrics: [], cover: null, featured: false })}
      title={(p) => p.title}
    >
      {(base, p, i) => (
        <>
          <div className={grid2}>
            <TextInput path={`${base}.title`} label="Project name" max={80} />
            <TextInput path={`${base}.tagline`} label="Tagline" placeholder="Team planning, calmly." max={140} />
            <TextInput path={`${base}.liveUrl`} label="Live link (optional)" placeholder="myapp.vercel.app" max={300} />
            <TextInput path={`${base}.repoUrl`} label="Code link (optional)" placeholder="github.com/you/app" max={300} />
          </div>
          <TextArea path={`${base}.description`} label="What it is" max={900} rows={4} ai="project" />
          <Chips path={`${base}.tech`} label="Built with" max={16} />
          <MetricsField index={i} />
          <CoverField index={i} />
          <Toggle checked={p.featured} onChange={(v) => mutate((x) => { x.projects[i].featured = v; })} label="Highlight this project" description="Gets a glowing border." />
        </>
      )}
    </Repeater>
  );
}

function MetricsField({ index }: { index: number }) {
  const d = useDraft();
  const ms = d.projects[index].metrics;
  return (
    <Field label="Key numbers (optional)" hint="Up to 5 facts, e.g. Users · 2,000 or Screens · 31.">
      <div className="flex flex-col gap-2">
        {ms.map((m, j) => (
          <div key={j} className="flex gap-2">
            <input className="input" aria-label="Label" placeholder="Users" maxLength={40} value={m.label} onChange={(e) => mutate((x) => { x.projects[index].metrics[j].label = e.target.value; })} />
            <input className="input" aria-label="Value" placeholder="2,000" maxLength={60} value={m.value} onChange={(e) => mutate((x) => { x.projects[index].metrics[j].value = e.target.value; })} />
            <button type="button" className="btn size-11 shrink-0 px-0" aria-label="Remove number" onClick={() => mutate((x) => { x.projects[index].metrics.splice(j, 1); })}><Trash2 className="size-4" aria-hidden /></button>
          </div>
        ))}
        {ms.length < 5 && <button type="button" className="btn self-start" onClick={() => mutate((x) => { x.projects[index].metrics.push({ label: "", value: "" }); })}>+ Add a number</button>}
      </div>
    </Field>
  );
}

export function StepSkills() {
  return (
    <Repeater<SkillGroupItem>
      path="skillGroups" noun="skill group" max={8}
      create={() => ({ id: uid("g"), label: "", skills: [] })}
      title={(g) => g.label}
    >
      {(base) => (
        <>
          <TextInput path={`${base}.label`} label="Group name" placeholder="Languages" max={40} />
          <Chips path={`${base}.skills`} label="Skills" max={24} />
        </>
      )}
    </Repeater>
  );
}

export function StepStats() {
  const d = useDraft();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-2">Big numbers across the page, like <em>5+ years building</em>. Only use numbers you can stand behind — leave this empty to hide the row.</p>
      {d.stats.map((s, i) => (
        <div key={s.id} className="grid grid-cols-[7rem_1fr_auto] gap-2">
          <input className="input font-semibold" aria-label="Number" placeholder="5+" maxLength={12} value={s.value} onChange={(e) => mutate((x) => { x.stats[i].value = e.target.value; })} />
          <input className="input" aria-label="What it counts" placeholder="Years building" maxLength={40} value={s.label} onChange={(e) => mutate((x) => { x.stats[i].label = e.target.value; })} />
          <button type="button" className="btn size-11 px-0" aria-label="Remove number" onClick={() => mutate((x) => { x.stats.splice(i, 1); })}><Trash2 className="size-4" aria-hidden /></button>
        </div>
      ))}
      {d.stats.length < 4 && <button type="button" className="btn self-start" onClick={() => mutate((x) => { x.stats.push({ id: uid("s"), value: "", label: "" }); })}>+ Add a number</button>}
    </div>
  );
}

export function StepAwards() {
  return (
    <Repeater<AwardItem>
      path="awards" noun="award or certificate" max={12}
      create={() => ({ id: uid("a"), title: "", issuer: "", year: "", url: "", note: "" })}
      title={(a) => a.title}
    >
      {(base) => (
        <div className={grid2}>
          <TextInput path={`${base}.title`} label="Title" placeholder="AWS Solutions Architect" max={120} />
          <TextInput path={`${base}.issuer`} label="Issued by" placeholder="Amazon Web Services" max={80} />
          <TextInput path={`${base}.year`} label="Year" placeholder="2025" max={12} />
          <TextInput path={`${base}.url`} label="Verify link (optional)" max={300} />
          <div className="sm:col-span-2"><TextInput path={`${base}.note`} label="Note (optional)" max={240} /></div>
        </div>
      )}
    </Repeater>
  );
}

export function StepResume() {
  const d = useDraft();
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // the object URL is remembered with the file it belongs to, so a stale one is never shown
  const [link, setLink] = useState<{ ref: string; url: string }>();
  const url = link && link.ref === d.resume.file ? link.url : undefined;
  const missing = missingForResume(d);

  useEffect(() => {
    let live = true;
    const ref = d.resume.file;
    if (ref) void blobUrl(ref).then((u) => live && u && setLink({ ref, url: u }));
    return () => { live = false; };
  }, [d.resume.file]);

  async function generate() {
    setErr("");
    setNote("");
    setBusy(true);
    try {
      const r = await generateResumePdf(d);
      const ref = await putBlob(r.pdf);
      update("resume.file", ref);
      setNote(
        `Generated a ${r.pages}-page resume from your details.` +
          (r.droppedCharacters ? " Some characters (e.g. non-Latin script or emoji) couldn’t be included in the PDF font and were left out." : "") +
          " If you change your details later, generate it again.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t generate the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex flex-col gap-4 p-5 sm:p-6">
        <div>
          <p className="font-medium">Generate from my details</p>
          <p className="text-text-3 mt-1 text-sm leading-relaxed">
            A clean, one-column resume built from everything you’ve entered — experience, projects, skills, education and awards. Real, selectable text that
            applicant-tracking systems can read.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" disabled={busy || missing.length > 0} onClick={generate}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
            {d.resume.file ? "Regenerate from my details" : "Generate from my details"}
          </button>
          {missing.length > 0 && <span className="text-text-3 text-sm">Add {missing.join(" and ")} first.</span>}
        </div>
        {note && <p role="status" className="text-text-2 text-sm">{note}</p>}
      </div>

      <Field label="Or upload your own PDF" hint="Adds a “Download resume” section. PDF only, up to 5 MB.">
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn cursor-pointer">
            <FileText className="size-4" aria-hidden /> {d.resume.file ? "Replace with my PDF" : "Upload PDF"}
            <input type="file" accept="application/pdf" className="sr-only" onChange={async (e) => {
              const f = e.target.files?.[0];
              setErr("");
              setNote("");
              if (!f) return;
              if (f.type !== "application/pdf") return setErr("Please choose a PDF.");
              if (f.size > 5 * 1024 * 1024) return setErr("That PDF is over 5 MB.");
              const ref = await putBlob(f);
              update("resume.file", ref);
            }} />
          </label>
          {err && <span role="alert" className="text-danger text-sm">{err}</span>}
        </div>
      </Field>

      {d.resume.file && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="text-ok flex items-center gap-2 text-sm"><FileText className="size-4" aria-hidden /> Resume attached</span>
          <div className="flex gap-2">
            {url && <a className="btn" href={url} target="_blank" rel="noopener">View PDF</a>}
            <button type="button" className="btn" onClick={() => { update("resume.file", null); setNote(""); }}>Remove</button>
          </div>
        </div>
      )}

      <TextInput path="resume.label" label="Button text" max={40} />
    </div>
  );
}

const SECTION_NAMES: Record<string, string> = { about: "About", stats: "Numbers", projects: "Projects", experience: "Experience & education", skills: "Skills", awards: "Awards", resume: "Resume", contact: "Contact" };

export function StepFinish() {
  const d = useDraft();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="flex flex-col gap-8">
      <Field label="Sections" hint="Show, hide and reorder. Empty sections hide themselves automatically.">
        <ol className="flex flex-col gap-2">
          {d.meta.sections.map((s, i) => (
            <li key={s.id} className="card flex items-center justify-between gap-2 px-4 py-1">
              <Toggle checked={s.visible} onChange={(v) => mutate((x) => { x.meta.sections[i].visible = v; })} label={SECTION_NAMES[s.id]} />
              <div className="flex gap-1">
                <button type="button" className="btn size-11 px-0" aria-label={`Move ${SECTION_NAMES[s.id]} up`} disabled={i === 0} onClick={() => mutate((x) => { x.meta.sections.splice(i - 1, 0, ...x.meta.sections.splice(i, 1)); })}><ArrowUp className="size-4" aria-hidden /></button>
                <button type="button" className="btn size-11 px-0" aria-label={`Move ${SECTION_NAMES[s.id]} down`} disabled={i === d.meta.sections.length - 1} onClick={() => mutate((x) => { x.meta.sections.splice(i + 1, 0, ...x.meta.sections.splice(i, 1)); })}><ArrowDown className="size-4" aria-hidden /></button>
              </div>
            </li>
          ))}
        </ol>
      </Field>
      <Field label="Motion">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Motion">
          {(["full", "subtle", "none"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={d.meta.motion === m} className={`btn ${d.meta.motion === m ? "btn-primary" : ""}`} onClick={() => update("meta.motion", m)}>
              {m === "full" ? "Cinematic" : m === "subtle" ? "Subtle" : "None"}
            </button>
          ))}
        </div>
      </Field>
      <div className="flex flex-col gap-5">
        <TextInput path="seo.title" label="Browser tab title" placeholder={`${d.identity.name || "Your name"} — ${d.identity.roles[0] || "Developer"}`} max={70} />
        <TextInput path="seo.description" label="Search description" max={160} />
        <div className="flex items-center gap-2">
          <button type="button" className="btn" disabled={busy} onClick={async () => {
            setBusy(true); setErr("");
            try { const o = await aiWrite("seo", summarize(d)); mutate((x) => { x.seo.title = o.title ?? x.seo.title; x.seo.description = o.description ?? x.seo.description; }); }
            catch (e) { setErr(e instanceof Error ? e.message : "AI error"); } finally { setBusy(false); }
          }}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />} Suggest both
          </button>
          {err && <span role="alert" className="text-danger text-sm">{err}</span>}
        </div>
      </div>
    </div>
  );
}
