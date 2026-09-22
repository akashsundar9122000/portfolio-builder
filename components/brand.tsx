/** The FolioForge mark (public/brand/folioforge-mark.svg) with the "Folio·Forge" wordmark. */
export function BrandLogo({ size = 36, byline = false }: { size?: number; byline?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static SVG; next/image adds nothing */}
      <img src="/brand/folioforge-mark.svg" alt="" width={size} height={size} className="shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-medium tracking-[0.16em]">
          <span className="text-text">Folio</span><span className="text-accent">Forge</span>
        </span>
        {byline && <span className="label mt-1.5 text-[10px]">by Akash Sundar</span>}
      </span>
    </span>
  );
}
