import Image from "next/image";

/**
 * The landing hero's right side: real renders of the three sample
 * portfolios (captured from /samples/*) layered as a browser window, a
 * phone and a card behind — three people, three themes, one glance.
 */

function Chip({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`bg-raised/90 border-hair-strong text-text-2 absolute z-20 rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] shadow-lg backdrop-blur ${className}`}>
      {children}
    </span>
  );
}

export function HeroShowcase() {
  return (
    <div className="relative mx-auto aspect-[8/7] w-full max-w-[36rem] select-none lg:max-w-none">
      <div className="bg-accent/15 absolute inset-[12%] rounded-full blur-3xl" aria-hidden />

      {/* behind: the graduate, light theme */}
      <div className="border-hair-strong absolute right-0 top-0 w-[70%] rotate-[5deg] overflow-hidden rounded-xl border opacity-90 shadow-2xl">
        <Image src="/hero/student-desktop.jpg" alt="Rahul Das’s portfolio on the Paper & Ink theme" width={2560} height={1600} sizes="(min-width: 1024px) 380px, 65vw" className="block h-auto w-full" />
      </div>
      <Chip className="right-[-2%] top-[6%]">Paper &amp; Ink</Chip>

      {/* front: the developer, in a browser window */}
      <div className="absolute left-0 top-[17%] z-10 w-[84%]">
      <div className="bg-raised border-hair-strong overflow-hidden rounded-xl border shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]">
        <div className="border-hair flex h-7 items-center gap-1.5 border-b px-3" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="bg-sunken text-text-3 mx-auto rounded-md px-3 py-0.5 font-mono text-[10px]">arjunmehta.dev</span>
        </div>
        <Image src="/hero/developer-desktop.jpg" alt="Arjun Mehta’s portfolio on the Midnight Indigo theme" width={2560} height={1600} sizes="(min-width: 1024px) 480px, 80vw" loading="eager" className="block h-auto w-full" />
      </div>
      <Chip className="-bottom-3.5 left-5">Midnight Indigo</Chip>
      </div>

      {/* the marketer, on a phone */}
      <div className="absolute bottom-0 right-[3%] z-20 w-[25%]">
        <div className="overflow-hidden rounded-[1.6rem] border-[5px] border-[#1c1c20] bg-black shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)]">
          <Image src="/hero/marketer-phone.jpg" alt="Priya Nair’s portfolio on the Sunset Coral theme, on a phone" width={780} height={1688} sizes="(min-width: 1024px) 150px, 25vw" className="block h-auto w-full" />
        </div>
        <Chip className="-left-6 bottom-[14%] whitespace-nowrap">Sunset Coral</Chip>
      </div>
    </div>
  );
}
