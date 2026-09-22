import Image from "next/image";

/**
 * The landing hero's right side: the real FolioForge studio, mid-edit —
 * someone asks the assistant for a light theme and the live preview has
 * already switched. Captured from /studio with the developer sample.
 */
export function HeroShowcase() {
  return (
    <div className="relative lg:w-[calc(100%+6rem)]">
      <div className="bg-accent/20 absolute -inset-x-6 inset-y-8 rounded-[2.5rem] blur-3xl" aria-hidden />
      <div className="bg-raised border-hair-strong relative overflow-hidden rounded-2xl border shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)]">
        <div className="border-hair flex h-8 items-center gap-1.5 border-b px-3.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="text-text-3 mx-auto pr-10 font-mono text-[11px]">folioforge · studio</span>
        </div>
        <Image
          src="/hero/studio.jpg"
          alt="The FolioForge studio: the AI assistant was asked to switch to a light theme, and the live preview of Arjun Mehta’s portfolio now shows the Paper & Ink theme"
          width={2560}
          height={1600}
          sizes="(min-width: 1280px) 720px, (min-width: 1024px) 60vw, 100vw"
          loading="eager"
          className="block h-auto w-full"
        />
      </div>
    </div>
  );
}
