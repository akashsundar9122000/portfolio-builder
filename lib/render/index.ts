import type { Draft, SectionId, SocialKind } from "@/lib/builder/schema";
import type { Theme } from "@/lib/builder/themes";
import { BASE_CSS, themeVars } from "./css";
import { RUNTIME } from "./runtime";
import { attr, h, initials, jsonForScript, paragraphs, prettyUrl, safeUrl } from "./html";

/**
 * Draft + theme + asset URLs → one complete HTML document.
 *
 * Pure and synchronous, so the studio preview (an iframe `srcdoc`) and
 * both downloads are literally the same string: what they approve is
 * byte-for-byte what they get. The caller decides how assets are
 * addressed — blob: URLs in the preview, relative files in the ZIP,
 * data: URIs in the single-file download.
 */

export interface RenderAssets {
  portrait?: { src: string; kind: "cutout" | "framed" };
  voice?: string;
  resume?: string;
  covers: Record<string, string>;
}

const SOCIAL_LABEL: Record<SocialKind, string> = {
  github: "GitHub", linkedin: "LinkedIn", x: "X", website: "Website", instagram: "Instagram",
  behance: "Behance", dribbble: "Dribbble", youtube: "YouTube", medium: "Medium", leetcode: "LeetCode",
};

const SECTION_LABEL: Record<SectionId, string> = {
  about: "About", stats: "Numbers", projects: "Work", experience: "Experience",
  skills: "Skills", awards: "Recognition", resume: "Resume", contact: "Contact",
};

const ext = `<span aria-hidden="true">↗</span>`;

function eyebrow(n: number, label: string): string {
  return `<p class="eyebrow label"><span class="accent">${String(n).padStart(2, "0")}</span> / ${h(label)}</p>`;
}

function hasContent(d: Draft, id: SectionId, a: RenderAssets): boolean {
  switch (id) {
    case "about": return d.identity.bioLong.trim().length > 0;
    case "stats": return d.stats.some((s) => s.value.trim());
    case "projects": return d.projects.some((p) => p.title.trim());
    case "experience": return d.experience.some((e) => e.role.trim() || e.company.trim()) || d.education.some((e) => e.degree.trim());
    case "skills": return d.skillGroups.some((g) => g.skills.length > 0);
    case "awards": return d.awards.some((w) => w.title.trim());
    case "resume": return Boolean(a.resume);
    case "contact": return Boolean(d.identity.email.trim() || d.identity.socials.length);
  }
}

// ── sections ─────────────────────────────────────────────────────────────

function nav(d: Draft, order: SectionId[]): string {
  const links = order
    .filter((id) => ["about", "projects", "experience", "contact"].includes(id))
    .map((id) => `<li><a href="#${id}">${h(SECTION_LABEL[id])}</a></li>`)
    .join("");
  return `<header class="nav"><div class="shell bar">
<a class="brand tap" href="#top"><span class="mono-mark" aria-hidden="true">${h(initials(d.identity.name))}</span>${h(d.identity.name || "Your name")}</a>
<nav aria-label="Sections"><ul>${links}</ul></nav></div></header>`;
}

function hero(d: Draft, a: RenderAssets): string {
  const id = d.identity;
  const [l1, l2, l3] = id.headline;
  const hasCaps = d.intro.captions.length > 0;
  const hasVoice = d.intro.mode === "voice" && Boolean(a.voice);
  const portrait = a.portrait
    ? `<div class="figure"><div class="halo"></div><div class="breath" style="position:absolute;inset:0"><img src="${attr(a.portrait.src)}" alt="Portrait of ${attr(id.name)}" fetchpriority="high"></div>${a.portrait.kind === "framed" ? `<div class="sweep"></div>` : ""}</div>`
    : `<div class="figure"><div class="halo"></div><div class="mark grad" aria-hidden="true">${h(initials(id.name))}</div></div>`;
  const player = hasCaps || hasVoice
    ? `<div class="player">
<button type="button" class="pill-btn" id="intro-play" aria-pressed="false"><span>${hasVoice ? "Hear my intro" : "Play intro"}</span></button>
${hasCaps ? `<button type="button" class="pill-btn" id="intro-cc" aria-pressed="true" aria-label="Captions">CC</button>` : ""}
</div><div class="caption" id="intro-caption" aria-live="polite"></div>
${hasVoice ? `<audio id="intro-audio" preload="metadata" src="${attr(a.voice!)}"></audio>` : ""}
<script type="application/json" id="intro-data">${jsonForScript({ captions: d.intro.captions })}</script>`
    : "";
  const creed = id.creed.filter(Boolean).map((c) => `<p class="label">${h(c)}</p>`).join("");
  return `<section class="hero" id="top" aria-labelledby="hero-title">
<div class="spot" aria-hidden="true"></div><div class="floor" aria-hidden="true"></div>
<div class="shell">
<div class="hero-grid">
<div data-reveal>
<p class="label accent">${h(id.name)}</p>
<h1 id="hero-title" class="display"><span>${h(l1)}</span><span class="grad">${h(l2)}</span><span class="grad">${h(l3)}</span></h1>
${id.bioShort ? `<p class="lede">${h(id.bioShort)}</p>` : ""}
${id.roles.length ? `<p class="label roles">${id.roles.map(h).join("  ·  ")}</p>` : ""}
</div>
<div class="portrait ${a.portrait?.kind ?? "framed"}" data-reveal>${portrait}${player}</div>
</div>
<div class="hero-foot"><span class="label">Scroll</span>
<div style="display:flex;align-items:flex-end;gap:18px;text-align:right"><div class="creed">${creed}</div>${id.signature ? `<span class="script" aria-hidden="true">${h(id.signature)}</span>` : ""}</div></div>
</div></section>`;
}

function about(d: Draft, n: number): string {
  const id = d.identity;
  const meta = [id.location && `<span class="label">${h(id.location)}</span>`, ...id.roles.map((r) => `<span class="label">${h(r)}</span>`)].filter(Boolean).join("");
  return `<section class="block about" id="about"><div class="shell" data-reveal>${eyebrow(n, "About")}
${paragraphs(id.bioLong).map((p) => `<p>${h(p)}</p>`).join("")}
${meta ? `<div class="meta">${meta}</div>` : ""}</div></section>`;
}

function stats(d: Draft): string {
  const items = d.stats.filter((s) => s.value.trim());
  return `<section class="block" id="stats" style="padding-block:clamp(48px,6vw,80px)"><div class="shell stats rule" data-reveal>
${items.map((s) => `<div class="stat"><b>${h(s.value)}</b><span class="label">${h(s.label)}</span></div>`).join("")}</div></section>`;
}

function projects(d: Draft, a: RenderAssets, n: number): string {
  const list = d.projects.filter((p) => p.title.trim());
  const total = String(list.length).padStart(2, "0");
  const cards = list.map((p, i) => {
    const live = safeUrl(p.liveUrl);
    const repo = safeUrl(p.repoUrl);
    const cover = p.cover && a.covers[p.cover]
      ? `<div class="cover"><img src="${attr(a.covers[p.cover])}" alt="${attr(p.title)} screenshot" loading="lazy"></div>`
      : `<div class="cover gen" aria-hidden="true"><b class="grad">${h(initials(p.title))}</b></div>`;
    const metrics = p.metrics.filter((m) => m.label && m.value);
    return `<article class="card ${p.featured ? "lit" : ""} project" data-reveal>
<div><p class="label"><span class="accent">${String(i + 1).padStart(2, "0")} / ${total}</span></p>
<h3 class="display">${h(p.title)}</h3>
${p.tagline ? `<p class="label" style="margin:0 0 14px">${h(p.tagline)}</p>` : ""}
${p.description ? `<p class="desc">${h(p.description)}</p>` : ""}
${p.tech.length ? `<ul class="pills">${p.tech.map((t) => `<li>${h(t)}</li>`).join("")}</ul>` : ""}
<p class="links">${live ? `<a class="tap" href="${attr(live)}" target="_blank" rel="noopener">Live site ${ext}</a>` : ""}${repo ? `<a class="tap" href="${attr(repo)}" target="_blank" rel="noopener">Code ${ext}</a>` : ""}</p></div>
<div>${cover}${metrics.length ? `<dl class="metrics">${metrics.map((m) => `<div><dt>${h(m.label)}</dt><dd>${h(m.value)}</dd></div>`).join("")}</dl>` : ""}</div>
</article>`;
  }).join("");
  return `<section class="block" id="projects"><div class="shell">${eyebrow(n, "Selected work")}
<h2 class="display h2" data-reveal>Things I've <span class="grad">shipped</span>.</h2>
<div class="projects" style="margin-top:clamp(40px,6vw,72px)">${cards}</div></div></section>`;
}

function experience(d: Draft, n: number): string {
  const jobs = d.experience.filter((e) => e.role.trim() || e.company.trim()).map((e) => {
    const url = safeUrl(e.companyUrl);
    const company = e.company ? (url ? `<a class="at" href="${attr(url)}" target="_blank" rel="noopener">${h(e.company)}</a>` : `<span class="at">${h(e.company)}</span>`) : "";
    const when = [e.start, e.end || (e.start ? "Present" : "")].filter(Boolean).join(" — ");
    return `<li class="entry" data-reveal><p class="label">${h(when)}</p><div>
<h3 class="display">${h(e.role)}${e.role && company ? `<span style="opacity:.4"> · </span>` : ""}${company}</h3>
${e.location ? `<p class="label" style="margin-bottom:12px">${h(e.location)}</p>` : ""}
${e.description ? `<p>${h(e.description)}</p>` : ""}
${e.highlights.filter(Boolean).length ? `<ul>${e.highlights.filter(Boolean).map((x) => `<li>${h(x)}</li>`).join("")}</ul>` : ""}
${e.tech.length ? `<p class="label">${e.tech.map(h).join("  ·  ")}</p>` : ""}</div></li>`;
  }).join("");
  const edu = d.education.filter((e) => e.degree.trim()).map((e) => `<li class="entry" data-reveal><p class="label">${h([e.start, e.end].filter(Boolean).join(" — "))}</p><div>
<p class="label" style="margin-bottom:10px">Education</p>
<h3 class="display">${h(e.degree)}${e.institution ? `<span style="opacity:.4"> · </span><span class="at">${h(e.institution)}</span>` : ""}</h3>
${e.grade ? `<p>${h(e.grade)}</p>` : ""}${e.note ? `<p>${h(e.note)}</p>` : ""}</div></li>`).join("");
  return `<section class="block" id="experience"><div class="shell">${eyebrow(n, "Experience")}
<h2 class="display h2" data-reveal>Where the work was <span class="grad">built</span>.</h2>
<ol class="timeline" style="margin-top:clamp(40px,6vw,72px)">${jobs}${edu}</ol></div></section>`;
}

function skills(d: Draft, n: number): string {
  const groups = d.skillGroups.filter((g) => g.skills.length);
  return `<section class="block" id="skills"><div class="shell">${eyebrow(n, "Skills")}
<h2 class="display h2" data-reveal>The <span class="grad">toolkit</span>.</h2>
<div class="skills" style="margin-top:clamp(40px,6vw,72px)">${groups.map((g, i) => `<div class="card" data-reveal><p class="label accent">${String(i + 1).padStart(2, "0")} //</p><h3 class="display">${h(g.label)}</h3><ul class="pills">${g.skills.map((s) => `<li>${h(s)}</li>`).join("")}</ul></div>`).join("")}</div></div></section>`;
}

function awards(d: Draft, n: number): string {
  const items = d.awards.filter((w) => w.title.trim());
  return `<section class="block" id="awards"><div class="shell">${eyebrow(n, "Recognition")}
<ul class="awards" data-reveal>${items.map((w) => {
    const url = safeUrl(w.url);
    const title = url ? `<a href="${attr(url)}" target="_blank" rel="noopener">${h(w.title)} ${ext}</a>` : h(w.title);
    return `<li><span class="label">${h(w.issuer)}</span><span>${title}${w.note ? `<span class="note">${h(w.note)}</span>` : ""}</span><span class="label">${h(w.year)}</span></li>`;
  }).join("")}</ul></div></section>`;
}

function resume(d: Draft, a: RenderAssets): string {
  return `<section class="block resume" id="resume"><div class="shell" data-reveal>
<p class="label">Resume</p><h2 class="display h2" style="margin:18px 0 32px">Want the <span class="grad">complete</span> story?</h2>
<a class="btn" href="${attr(a.resume!)}" download>${h(d.resume.label || "Download resume")} <span aria-hidden="true">↓</span></a></div></section>`;
}

function contact(d: Draft, n: number): string {
  const id = d.identity;
  const mail = safeUrl(id.email, "email");
  const tel = safeUrl(id.phone, "tel");
  const socials = id.socials.map((s) => {
    const u = safeUrl(s.url);
    return u ? `<a class="tap" href="${attr(u)}" target="_blank" rel="noopener">${h(SOCIAL_LABEL[s.kind])} <span style="opacity:.6">${h(prettyUrl(u))}</span> ${ext}</a>` : "";
  }).join("");
  const [local, domain] = id.email.split("@");
  return `<section class="block contact" id="contact"><div class="shell" data-reveal>${eyebrow(n, "Contact")}
<h2 class="display h2">Have a project? <span class="grad">Let's build it.</span></h2>
${mail ? `<a class="email" href="${attr(mail)}">${h(local)}@<wbr>${h(domain)}</a>` : ""}
<div class="socials">${socials}${tel ? `<a class="tap" href="${attr(tel)}">Phone <span style="opacity:.6">${h(id.phone)}</span></a>` : ""}${id.location ? `<span class="label tap">${h(id.location)}</span>` : ""}</div>
</div></section>`;
}

// ── document ─────────────────────────────────────────────────────────────

export function renderSite(d: Draft, theme: Theme, a: RenderAssets): string {
  const order = d.meta.sections.filter((s) => s.visible && hasContent(d, s.id, a)).map((s) => s.id);
  let n = 0;
  const body = order.map((id) => {
    switch (id) {
      case "about": return about(d, ++n);
      case "stats": return stats(d);
      case "projects": return projects(d, a, ++n);
      case "experience": return experience(d, ++n);
      case "skills": return skills(d, ++n);
      case "awards": return awards(d, ++n);
      case "resume": return resume(d, a);
      case "contact": return contact(d, ++n);
    }
  }).join("\n");

  const name = d.identity.name || "My portfolio";
  const title = d.seo.title || `${name}${d.identity.roles[0] ? ` — ${d.identity.roles[0]}` : ""}`;
  const description = d.seo.description || d.identity.bioShort || `${name}'s portfolio.`;
  const year = new Date().getFullYear();
  const csp = [
    "default-src 'self' data: blob:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "script-src 'unsafe-inline'",
    "connect-src 'none'",
  ].join("; ");

  return `<!doctype html>
<html lang="en" data-motion="${attr(d.meta.motion)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${attr(csp)}">
<title>${h(title)}</title>
<meta name="description" content="${attr(description)}">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<meta name="theme-color" content="${attr(theme.colors.bg)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${attr(theme.fonts.href)}">
<style>${themeVars(theme)}${BASE_CSS}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${nav(d, order)}
<main id="main">
${hero(d, a)}
${body}
</main>
<footer><div class="shell"><p class="masthead" aria-hidden="true">${h(name)}</p>
<div class="colophon"><span class="label">© ${year} ${h(name)}</span>${d.identity.location ? `<span class="label">${h(d.identity.location)}</span>` : ""}</div></div></footer>
<script>${RUNTIME}</script>
</body>
</html>`;
}
