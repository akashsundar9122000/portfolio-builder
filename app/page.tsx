import { Suspense } from "react";
import { Camera, Download, Mic, Palette, ShieldCheck, Sparkles } from "lucide-react";
import { Access } from "@/components/landing/access";
import { CodeRules } from "@/components/landing/code-rules";
import { Samples } from "@/components/landing/samples";
import { SAMPLES } from "@/lib/builder/samples";
import { UiThemeToggle } from "@/components/ui-theme";
import { HeroShowcase } from "@/components/landing/hero-showcase";

const STEPS = [
  { icon: Camera, title: "Your photo", body: "Upload a portrait. It’s cut out and staged under a spotlight — dressed in a professional look where AI outfits are enabled." },
  { icon: Mic, title: "Your voice", body: "Read a short intro in your own voice. Noise is removed in your browser and captions are timed automatically." },
  { icon: Palette, title: "Your theme", body: "Pick one of ten designed themes, then fill in your work, skills and story — with AI help for every paragraph." },
  { icon: Download, title: "Your website", body: "Preview it live, ask the assistant for changes, and download the finished site as a ZIP or a single HTML file." },
];

// only what the cards show — the sample drafts themselves render on the server
const CARDS = SAMPLES.map(({ id, name, role, themeName, blurb }) => ({ id, name, role, themeName, blurb }));

function SectionHead({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 max-w-[60ch]">
      <p className="label text-accent">{eyebrow}</p>
      <h2 id={id} className="display mt-4 text-[clamp(2rem,5vw,3.25rem)]">{title}</h2>
      {children && <p className="text-text-2 mt-4 text-lg leading-relaxed">{children}</p>}
    </div>
  );
}

export default function Home() {
  return (
    <main className="spot-bg min-h-svh overflow-x-clip">
      <div className="mx-auto w-[min(1180px,100%-2.5rem)] py-[clamp(3rem,9vh,7rem)]">
        <div className="flex items-center justify-between gap-4">
          <p className="label text-accent">FolioForge · by Akash Sundar</p>
          <UiThemeToggle />
        </div>
        <div className="mt-6 grid items-center gap-x-12 gap-y-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div>
            <h1 className="display text-[clamp(2.75rem,8vw,6.5rem)] lg:text-[clamp(3rem,5.4vw,5.25rem)]">
              <span className="block">A portfolio</span>
              <span className="grad block">that sounds</span>
              <span className="grad block">like you</span>
            </h1>
            <p className="text-text-2 mt-7 max-w-[48ch] text-lg leading-relaxed">
              The cinematic portfolio from{" "}
              <a className="text-text underline decoration-[var(--accent)] underline-offset-4" href="https://akashsundar-portfolio.vercel.app" target="_blank" rel="noopener">
                akashsundar-portfolio.vercel.app
              </a>
              , made yours: your photo in the spotlight, your own voice introducing you, your work laid out properly.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#samples" className="btn">See examples</a>
              <a href="#access" className="btn btn-primary">Create yours</a>
            </div>
          </div>
          <HeroShowcase />
        </div>

        <section id="samples" aria-labelledby="samples-title" className="mt-[clamp(4rem,10vh,7rem)] scroll-mt-8">
          <SectionHead id="samples-title" eyebrow="Examples" title="Three people, three portfolios">
            A developer, a marketer and a fresh graduate — each on a different theme. Open one to explore the full site on desktop, tablet or phone.
          </SectionHead>
          <Samples samples={CARDS} />
        </section>

        <section aria-labelledby="how-title" className="mt-[clamp(4rem,10vh,7rem)]">
          <SectionHead id="how-title" eyebrow="How it works" title="Four steps to yours" />
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card p-6">
                <div className="flex items-center justify-between">
                  <s.icon className="text-accent size-5" aria-hidden />
                  <span className="label">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{s.title}</h3>
                <p className="text-text-2 mt-2 text-[15px] leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="access" aria-labelledby="access-title" className="mt-[clamp(4rem,10vh,7rem)] scroll-mt-8">
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.1fr]">
            <div>
              <p className="label text-accent">Access</p>
              <h2 id="access-title" className="display mt-4 text-[clamp(2rem,5vw,3.25rem)]">Want to create <span className="grad">yours?</span></h2>
              <p className="text-text-2 mt-4 max-w-[46ch] text-lg leading-relaxed">
                FolioForge is free, with a personal access code for each portfolio. Ask for one below — it comes to your inbox. Already have one? Sign in with the email it was sent to.
              </p>
            </div>
            <Suspense>
              <Access />
            </Suspense>
          </div>
        </section>

        <section aria-labelledby="rules-title" className="mt-[clamp(4rem,10vh,7rem)]">
          <p className="label text-accent">Good to know</p>
          <h2 id="rules-title" className="display mt-4 mb-8 text-[clamp(2rem,5vw,3.25rem)]">How access codes work</h2>
          <CodeRules />
        </section>

        <div className="card mt-10 flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:gap-5">
          <ShieldCheck className="text-ok size-5 shrink-0" aria-hidden />
          <p className="text-text-2 text-[15px] leading-relaxed">
            <strong className="text-text">Your data stays with you.</strong> Your draft, photo and voice are kept in your own browser, not on a server, and
            are deleted automatically after 7 days. A photo is only sent out when you ask for an AI outfit, and it isn’t stored. Your voice is never cloned.
            We keep only your name, email and code, to send and check it.
          </p>
        </div>
        <p className="text-text-3 mt-10 flex items-center gap-2 text-sm">
          <Sparkles className="size-4" aria-hidden /> Free to use. No account needed — just your emailed code.
        </p>
      </div>
    </main>
  );
}
