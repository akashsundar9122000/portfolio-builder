import { Suspense } from "react";
import { Camera, Download, Mic, Palette, ShieldCheck, Sparkles } from "lucide-react";
import { InviteForm } from "@/components/landing/invite-form";

const STEPS = [
  { icon: Camera, title: "Your photo", body: "Upload a portrait. It’s cut out and staged under a spotlight — dressed in a professional look where AI outfits are enabled." },
  { icon: Mic, title: "Your voice", body: "Read a short intro in your own voice. Noise is removed in your browser and captions are timed automatically." },
  { icon: Palette, title: "Your theme", body: "Pick one of ten designed themes, then fill in your work, skills and story — with AI help for every paragraph." },
  { icon: Download, title: "Your website", body: "Preview it live, ask the assistant for changes, and download the finished site as a ZIP or a single HTML file." },
];

export default function Home() {
  return (
    <main className="spot-bg min-h-svh">
      <div className="mx-auto w-[min(1180px,100%-2.5rem)] py-[clamp(3rem,9vh,7rem)]">
        <p className="label text-accent">Portfolio Builder · by Akash Sundar</p>
        <h1 className="display mt-6 text-[clamp(2.75rem,8vw,6.5rem)]">
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

        <div className="relative mt-10">
          <Suspense>
            <InviteForm />
          </Suspense>
          <p className="text-text-3 mt-3 text-sm">Invite only for now — ask Akash for a code.</p>
        </div>

        <ol className="mt-[clamp(4rem,10vh,7rem)] grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card p-6">
              <div className="flex items-center justify-between">
                <s.icon className="text-accent size-5" aria-hidden />
                <span className="label">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h2 className="mt-5 text-lg font-semibold">{s.title}</h2>
              <p className="text-text-2 mt-2 text-[15px] leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="card mt-6 flex flex-col gap-3 p-6 sm:flex-row sm:items-start sm:gap-5">
          <ShieldCheck className="text-ok size-5 shrink-0" aria-hidden />
          <p className="text-text-2 text-[15px] leading-relaxed">
            <strong className="text-text">Your data stays with you.</strong> Your draft, photo and voice are kept in your own browser, not on a server, and
            are deleted automatically after 7 days. A photo is only sent out when you ask for an AI outfit, and it isn’t stored. Your voice is never cloned.
          </p>
        </div>
        <p className="text-text-3 mt-10 flex items-center gap-2 text-sm">
          <Sparkles className="size-4" aria-hidden /> Free to use. No account needed.
        </p>
      </div>
    </main>
  );
}
