import { SECTION_IDS, type Draft } from "./schema";
import { DEFAULT_THEME_ID } from "./themes";

export const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function uid(prefix = ""): string {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return prefix + Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function emptyDraft(now = Date.now()): Draft {
  return {
    version: 1,
    meta: {
      id: uid("d"),
      createdAt: now,
      expiresAt: now + TTL_MS,
      themeId: DEFAULT_THEME_ID,
      sections: SECTION_IDS.map((id) => ({ id, visible: true })),
      motion: "full",
    },
    identity: {
      name: "",
      headline: ["I build", "digital", "experiences"],
      roles: [],
      creed: ["Code is the craft.", "Shipping is the point."],
      signature: "",
      location: "",
      email: "",
      phone: "",
      socials: [],
      bioShort: "",
      bioLong: "",
    },
    portrait: {
      photo: null,
      consent: false,
      outfitId: "suit-tie",
      outfitColor: "charcoal",
      variants: [],
      chosen: null,
      cutout: null,
    },
    intro: { mode: "voice", script: "", voice: null, captions: [] },
    experience: [],
    education: [],
    projects: [],
    skillGroups: [
      { id: uid("g"), label: "Languages", skills: [] },
      { id: uid("g"), label: "Frameworks", skills: [] },
      { id: uid("g"), label: "Tools", skills: [] },
    ],
    stats: [],
    awards: [],
    resume: { file: null, label: "Download resume" },
    seo: { title: "", description: "" },
  };
}

/** A filled-in example, used for theme thumbnails before the person has typed anything. */
export function sampleDraft(): Draft {
  const d = emptyDraft(0);
  d.identity = {
    ...d.identity,
    name: "Alex Morgan",
    roles: ["Product Engineer", "Design Systems"],
    signature: "Alex",
    location: "Bengaluru, India",
    email: "alex@example.com",
    bioShort: "Products built end to end, with interfaces that feel deliberate.",
    bioLong: "I design and ship web products from the database to the pixel.",
  };
  d.projects = [
    { id: "p1", title: "Orbit", tagline: "Team planning, calmly.", description: "A planning tool for small teams.", liveUrl: "", repoUrl: "", tech: ["React", "Postgres"], metrics: [{ label: "Users", value: "2k" }], cover: null, featured: true },
  ];
  return d;
}
