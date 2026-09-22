import type { Theme } from "@/lib/builder/themes";

/**
 * The stylesheet of every generated site.
 *
 * One fixed design system — the same language as Akash's own portfolio:
 * a spotlit hero stage, a gradient display headline, hairline-bounded
 * cards, a timeline rail, mono labels. A theme only swaps the variables
 * at the top, so every combination of theme and content stays designed.
 */

export function themeVars(t: Theme): string {
  const c = t.colors;
  const f = t.fonts;
  return `:root{
--bg:${c.bg};--bg-sunken:${c.bgSunken};--surface:${c.surface};--surface-raised:${c.surfaceRaised};
--text:${c.text};--text-2:${c.textSecondary};--text-3:${c.textTertiary};
--accent:${c.accent};--accent-contrast:${c.accentContrast};
--grad-from:${c.gradientFrom};--grad-to:${c.gradientTo};--glow:${c.glow};
--hair:${c.hairline};--hair-strong:${c.hairlineStrong};--stage:${c.stage};--spot:${c.stageSpot};
--f-display:"${f.display}",ui-sans-serif,system-ui,sans-serif;
--f-sans:"${f.sans}",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
--f-mono:"${f.mono}",ui-monospace,SFMono-Regular,Menlo,monospace;
--f-script:"${f.script}","Snell Roundhand",cursive;
--display-weight:${f.displayWeight};--display-case:${f.displayUpper ? "uppercase" : "none"};
color-scheme:${t.mode};
}`;
}

export const BASE_CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;-webkit-tap-highlight-color:transparent}
body{margin:0;background:var(--bg);color:var(--text);font:400 17px/1.6 var(--f-sans);-webkit-font-smoothing:antialiased;overflow-x:clip}
img,video{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:4px}
.skip{position:absolute;left:-9999px}.skip:focus{left:16px;top:16px;z-index:100;background:var(--surface);padding:8px 12px}
.shell{width:min(1240px,100% - 2*var(--gutter));margin-inline:auto}
:root{--gutter:clamp(1.25rem,4vw,4rem)}
.label{font:500 12px/1.4 var(--f-mono);letter-spacing:.16em;text-transform:uppercase;color:var(--text-3)}
.label.accent{color:var(--accent)}
.display{font-family:var(--f-display);font-weight:var(--display-weight);text-transform:var(--display-case);letter-spacing:-.02em;line-height:.95;margin:0;font-stretch:88%}
.grad{background:linear-gradient(100deg,var(--grad-from),var(--grad-to));-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 28px var(--glow))}
.script{font-family:var(--f-script);font-size:clamp(28px,3vw,40px);line-height:1;background:linear-gradient(100deg,var(--grad-from),var(--grad-to));-webkit-background-clip:text;background-clip:text;color:transparent}
.rule{border-top:1px solid var(--hair)}
.tap{min-height:44px;display:inline-flex;align-items:center;gap:.4em}

/* nav */
.nav{position:fixed;inset:12px 0 auto;z-index:50;pointer-events:none}
.nav .bar{pointer-events:auto;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:6px 16px;border:1px solid var(--hair);border-radius:14px;background:color-mix(in srgb,var(--bg) 72%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.brand{display:inline-flex;align-items:center;gap:10px;font:600 13px/1 var(--f-mono);letter-spacing:.14em;text-transform:uppercase}
.mono-mark{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,var(--grad-from),var(--grad-to));color:var(--accent-contrast);font:800 12px/1 var(--f-sans);letter-spacing:0}
.nav ul{display:flex;gap:26px;list-style:none;margin:0;padding:0}
.nav ul a{font:500 12px/1 var(--f-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--text-2)}
.nav ul a:hover{color:var(--accent)}
@media (max-width:760px){.nav ul{display:none}}

/* hero */
.hero{position:relative;min-height:100svh;display:grid;align-items:center;padding:120px 0 72px;background:var(--stage);overflow:hidden;isolation:isolate}
.hero .spot{position:absolute;top:-10%;right:-4%;width:min(64rem,90vw);height:120%;background:linear-gradient(to bottom,var(--spot),transparent 75%);clip-path:polygon(44% 0,58% 0,100% 100%,6% 100%);filter:blur(24px);z-index:-1}
.hero .floor{position:absolute;right:6%;bottom:-3rem;width:min(40rem,80vw);height:16rem;background:radial-gradient(ellipse 50% 50%,var(--glow),transparent 70%);opacity:.5;z-index:-1}
.hero-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:clamp(24px,4vw,64px);align-items:center}
.hero-grid>*,.project>*,.entry>*{min-width:0}
.hero h1{font-size:clamp(46px,8.4vw,120px)}
.hero h1 span{display:block}
.hero .lede{max-width:40ch;color:var(--text-2);font-size:clamp(17px,1.4vw,20px);margin:28px 0 0}
.hero .roles{margin-top:24px}
.hero-foot{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-top:56px}
.creed p{margin:0}
@media (max-width:900px){.hero-grid{grid-template-columns:1fr}.hero{padding-top:104px}}

/* portrait stage */
.portrait{position:relative;aspect-ratio:4/5;width:100%;max-width:520px;justify-self:end}
.portrait .halo{position:absolute;inset:8% 6% 0;background:radial-gradient(closest-side,var(--glow),transparent);filter:blur(30px);opacity:.8}
.portrait .figure{position:absolute;inset:0;transform:translate3d(var(--px,0),var(--py,0),0);transition:transform .8s cubic-bezier(.16,1,.3,1)}
.portrait img{width:100%;height:100%;object-fit:cover;object-position:50% 20%}
.portrait.cutout img{object-fit:contain;object-position:50% 100%}
.portrait.framed img{border-radius:22px;-webkit-mask-image:radial-gradient(120% 95% at 50% 40%,#000 62%,transparent 100%);mask-image:radial-gradient(120% 95% at 50% 40%,#000 62%,transparent 100%)}
.portrait .sweep{position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.14) 50%,transparent 65%);background-size:250% 100%;mix-blend-mode:soft-light;border-radius:22px}
.portrait .mark{position:absolute;inset:14%;border-radius:50%;display:grid;place-items:center;border:1px solid var(--hair-strong);font:var(--display-weight) clamp(64px,10vw,140px)/1 var(--f-display)}
.breath{animation:breath 6s ease-in-out infinite alternate;transform-origin:50% 100%}
@keyframes breath{from{scale:1}to{scale:1.018}}
.sweep{animation:sweep 7s ease-in-out infinite}
@keyframes sweep{0%{background-position:120% 0}60%,100%{background-position:-60% 0}}
@media (max-width:900px){.portrait{justify-self:center;max-width:380px}}

/* intro player + captions */
.player{position:absolute;left:50%;bottom:-8px;translate:-50% 0;display:flex;gap:8px;z-index:3}
.pill-btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--hair-strong);background:color-mix(in srgb,var(--bg) 70%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);font:600 12px/1 var(--f-mono);letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.pill-btn:hover{border-color:var(--accent);color:var(--accent)}
.pill-btn[aria-pressed="true"]{border-color:var(--accent)}
.caption{position:absolute;left:4%;right:4%;bottom:56px;text-align:center;z-index:3;min-height:1em}
.caption span{display:inline;padding:.3em .7em;line-height:1.5;border-radius:6px;background:rgba(0,0,0,.66);color:#fff;font-size:clamp(14px,1.3vw,17px);box-decoration-break:clone;-webkit-box-decoration-break:clone}
.caption:empty{display:none}

/* sections */
section.block{padding:clamp(80px,11vw,150px) 0}
.eyebrow{display:flex;gap:10px;margin-bottom:28px}
.h2{font-size:clamp(34px,5vw,64px);max-width:18ch}
.about p{font-size:clamp(18px,1.6vw,22px);line-height:1.6;color:var(--text-2);max-width:62ch;margin:0 0 1.1em}
.about .meta{margin-top:32px;display:flex;flex-wrap:wrap;gap:12px 28px}

.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0}
.stat{padding:28px 24px;border-left:1px solid var(--hair)}
.stat:first-child{border-left:0;padding-left:0}
.stat b{display:block;font:var(--display-weight) clamp(44px,5vw,72px)/1 var(--f-display);letter-spacing:-.02em}
@media (max-width:640px){.stat{border-left:0;padding-left:0;border-top:1px solid var(--hair)}}

.card{position:relative;background:var(--surface);border:1px solid var(--hair);border-radius:18px;padding:clamp(20px,3vw,36px);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
.card.lit{border-color:color-mix(in srgb,var(--accent) 45%,transparent)}
.projects{display:grid;gap:clamp(20px,3vw,32px)}
.project{display:grid;grid-template-columns:1.1fr .9fr;gap:clamp(20px,3vw,40px);align-items:start}
.project h3{font-size:clamp(32px,4vw,52px);margin:10px 0 14px}
.project .desc{color:var(--text-2);margin:0 0 18px;max-width:60ch}
.project .links{display:flex;flex-wrap:wrap;gap:4px 22px;margin-top:18px}
.project .links a{font:600 12px/1 var(--f-mono);letter-spacing:.14em;text-transform:uppercase}
.project .links a:hover{color:var(--accent)}
.cover{aspect-ratio:16/10;border-radius:12px;overflow:hidden;border:1px solid var(--hair);background:linear-gradient(135deg,var(--surface-raised),var(--bg-sunken))}
.cover img{width:100%;height:100%;object-fit:cover}
.cover.gen{display:grid;place-items:end start;padding:18px;background:radial-gradient(90% 90% at 80% 10%,var(--glow),transparent 60%),linear-gradient(135deg,var(--surface-raised),var(--bg-sunken))}
.cover.gen b{font:var(--display-weight) clamp(48px,7vw,96px)/1 var(--f-display);opacity:.85}
.metrics{margin:18px 0 0;display:grid;gap:0}
.metrics div{display:flex;justify-content:space-between;gap:16px;padding:10px 0;border-bottom:1px solid var(--hair)}
.metrics dt{font:500 12px/1.4 var(--f-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--text-3)}
.metrics dd{margin:0;text-align:right}
@media (max-width:900px){.project{grid-template-columns:1fr}}

.pills{display:flex;flex-wrap:wrap;gap:8px;list-style:none;margin:0;padding:0}
.pills li{padding:6px 12px;border:1px solid var(--hair-strong);border-radius:999px;font:500 12px/1.2 var(--f-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--text-2)}

.timeline{list-style:none;margin:0;padding:0;position:relative}
.timeline::before{content:"";position:absolute;left:calc(16.66% - 1px);top:0;bottom:0;width:1px;background:linear-gradient(var(--accent),color-mix(in srgb,var(--accent) 15%,transparent))}
.entry{display:grid;grid-template-columns:16.66% 1fr;gap:0 40px;padding:36px 0;border-top:1px solid var(--hair);position:relative}
.entry::before{content:"";position:absolute;left:calc(16.66% - 6px);top:42px;width:11px;height:11px;border-radius:50%;background:var(--bg);border:1px solid var(--accent)}
.entry h3{font-size:clamp(22px,2.4vw,30px);margin:0 0 10px}
.entry h3 .at{color:var(--accent)}
.entry p{color:var(--text-2);margin:0 0 12px;max-width:62ch}
.entry ul{margin:0 0 14px;padding-left:1.1em;color:var(--text-3)}
@media (max-width:760px){.timeline::before,.entry::before{display:none}.entry{grid-template-columns:1fr}}

.skills{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
.skills h3{font-size:24px;margin:10px 0 18px}

.awards{list-style:none;margin:0;padding:0}
.awards li{display:grid;grid-template-columns:1fr 3fr auto;gap:8px 24px;padding:22px 0;border-top:1px solid var(--hair)}
.awards .note{display:block;color:var(--text-3);font-size:15px;margin-top:4px}
@media (max-width:640px){.awards li{grid-template-columns:1fr auto}.awards li>:nth-child(2){grid-column:1/-1;grid-row:2}}

.resume{background:var(--bg-sunken);border-block:1px solid var(--hair)}
.btn{display:inline-flex;align-items:center;gap:10px;min-height:48px;padding:0 22px;border:1px solid var(--text);font:600 12px/1 var(--f-mono);letter-spacing:.16em;text-transform:uppercase}
.btn:hover{background:var(--accent);border-color:var(--accent);color:var(--accent-contrast)}

.contact .email{display:inline-block;margin-top:40px;font:var(--display-weight) clamp(28px,5.4vw,72px)/1.05 var(--f-display);text-transform:var(--display-case);overflow-wrap:anywhere}
.contact .email:hover{color:var(--accent)}
.socials{display:flex;flex-wrap:wrap;gap:4px 28px;margin-top:48px;padding-top:24px;border-top:1px solid var(--hair)}
.socials a{font:500 12px/1 var(--f-mono);letter-spacing:.14em;text-transform:uppercase;color:var(--text-2)}
.socials a:hover{color:var(--accent)}

footer{overflow:hidden;border-top:1px solid var(--hair)}
.masthead{font:var(--display-weight) clamp(64px,15vw,220px)/.8 var(--f-display);text-transform:var(--display-case);letter-spacing:-.03em;opacity:.12;margin:40px 0 -0.12em;white-space:nowrap}
.colophon{display:flex;justify-content:space-between;gap:16px;padding:18px 0;border-top:1px solid var(--hair)}

/* reveal */
[data-motion="full"] [data-reveal],[data-motion="subtle"] [data-reveal]{opacity:0;translate:0 24px;transition:opacity .9s cubic-bezier(.16,1,.3,1),translate .9s cubic-bezier(.16,1,.3,1)}
[data-motion="subtle"] [data-reveal]{translate:0 8px}
[data-reveal].in{opacity:1!important;translate:0 0!important}
[data-motion="none"] .breath,[data-motion="none"] .sweep{animation:none}
@media (prefers-reduced-motion:reduce){[data-reveal]{opacity:1!important;translate:none!important;transition:none!important}.breath,.sweep{animation:none!important}.portrait .figure{transition:none;transform:none}html{scroll-behavior:auto}}
`;
