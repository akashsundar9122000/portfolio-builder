"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, Loader2 } from "lucide-react";
import { useDraft } from "@/lib/builder/store";
import type { Draft } from "@/lib/builder/schema";
import { useBuilderSession } from "./use-session";
import { StepAbout, StepAwards, StepBasics, StepEducation, StepExperience, StepFinish, StepProjects, StepResume, StepSkills, StepStats } from "./steps-content";
import { StepOutfit, StepPhoto, StepTheme } from "./steps-media";
import { StepVoice } from "./step-voice";

interface Step { id: string; title: string; lead: string; done: (d: Draft) => boolean }

export const STEPS: Step[] = [
  { id: "basics", title: "You", lead: "Your name, what you do, and where people can find you.", done: (d) => Boolean(d.identity.name && d.identity.email) },
  { id: "photo", title: "Photo", lead: "The portrait that stands in your spotlight.", done: (d) => Boolean(d.portrait.photo && d.portrait.consent) },
  { id: "outfit", title: "Outfit", lead: "Choose a professional look.", done: (d) => Boolean(d.portrait.cutout || d.portrait.chosen) },
  { id: "theme", title: "Theme", lead: "Ten designed looks. You can switch any time.", done: () => true },
  { id: "voice", title: "Intro", lead: "Introduce yourself in your own voice — or as captions.", done: (d) => d.intro.captions.length > 0 },
  { id: "about", title: "About", lead: "Your headline and your story.", done: (d) => Boolean(d.identity.bioLong) },
  { id: "experience", title: "Experience", lead: "Where you’ve worked, newest first.", done: (d) => d.experience.length > 0 },
  { id: "education", title: "Education", lead: "Degrees and courses.", done: (d) => d.education.length > 0 },
  { id: "projects", title: "Projects", lead: "The work you want people to see first.", done: (d) => d.projects.length > 0 },
  { id: "skills", title: "Skills", lead: "Group your tools the way you think about them.", done: (d) => d.skillGroups.some((g) => g.skills.length) },
  { id: "stats", title: "Numbers", lead: "Optional headline numbers.", done: (d) => d.stats.length > 0 },
  { id: "awards", title: "Awards", lead: "Certifications, prizes, publications.", done: (d) => d.awards.length > 0 },
  { id: "resume", title: "Resume", lead: "A downloadable PDF, if you want one.", done: (d) => Boolean(d.resume.file) },
  { id: "finish", title: "Finish", lead: "Sections, motion and how you appear in search.", done: () => true },
];

export function Wizard() {
  const { ready, features } = useBuilderSession();
  const d = useDraft();
  const router = useRouter();
  const params = useSearchParams();
  const index = Math.max(0, STEPS.findIndex((s) => s.id === params.get("step")));
  const step = STEPS[index];
  const go = (i: number) => {
    router.push(`/build?step=${STEPS[i].id}`, { scroll: false });
    window.scrollTo({ top: 0 });
  };

  if (!ready) {
    return <div className="grid min-h-svh place-items-center"><Loader2 className="text-accent size-6 animate-spin" aria-label="Loading your draft" /></div>;
  }

  const body = (() => {
    switch (step.id) {
      case "basics": return <StepBasics />;
      case "photo": return <StepPhoto />;
      case "outfit": return <StepOutfit imageAvailable={features.image} />;
      case "theme": return <StepTheme />;
      case "voice": return <StepVoice />;
      case "about": return <StepAbout />;
      case "experience": return <StepExperience />;
      case "education": return <StepEducation />;
      case "projects": return <StepProjects />;
      case "skills": return <StepSkills />;
      case "stats": return <StepStats />;
      case "awards": return <StepAwards />;
      case "resume": return <StepResume />;
      default: return <StepFinish />;
    }
  })();

  return (
    <div className="spot-bg min-h-svh">
      <header className="border-hair sticky top-0 z-20 border-b bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur">
        <div className="mx-auto flex w-[min(1240px,100%-2rem)] items-center justify-between gap-3 py-2">
          <Link href="/" className="label text-text tap flex min-h-11 items-center">FolioForge</Link>
          <Link href="/studio" className="btn btn-primary"><Eye className="size-4" aria-hidden /> Preview</Link>
        </div>
        <div className="h-0.5 bg-[var(--hair)] lg:hidden" aria-hidden>
          <div className="bg-accent h-full transition-[width]" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
        </div>
      </header>

      <div className="mx-auto grid w-[min(1240px,100%-2rem)] gap-10 py-8 lg:grid-cols-[14rem_1fr] lg:py-12">
        <nav aria-label="Steps" className="hidden lg:block">
          <ol className="sticky top-24 flex flex-col">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button type="button" onClick={() => go(i)} aria-current={i === index ? "step" : undefined}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors ${i === index ? "bg-surface text-text" : "text-text-2 hover:text-text"}`}>
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[11px] ${s.done(d) ? "border-accent bg-accent text-accent-ink" : i === index ? "border-accent text-accent" : "border-hair-strong text-text-3"}`}>{i + 1}</span>
                  {s.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <main className="min-w-0">
          <p className="label"><span className="text-accent">{String(index + 1).padStart(2, "0")}</span> / {String(STEPS.length).padStart(2, "0")}</p>
          <h1 className="display mt-3 text-[clamp(2.2rem,5vw,3.6rem)]">{step.title}</h1>
          <p className="text-text-2 mt-3 text-lg">{step.lead}</p>
          <div className="mt-8">{body}</div>

          <div className="border-hair mt-12 flex items-center justify-between gap-3 border-t pt-6">
            <button type="button" className="btn" disabled={index === 0} onClick={() => go(index - 1)}><ArrowLeft className="size-4" aria-hidden /> Back</button>
            {index < STEPS.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => go(index + 1)}>Next: {STEPS[index + 1].title} <ArrowRight className="size-4" aria-hidden /></button>
            ) : (
              <Link href="/studio" className="btn btn-primary">See my portfolio <ArrowRight className="size-4" aria-hidden /></Link>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
