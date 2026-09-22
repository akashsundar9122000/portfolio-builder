import { z } from "zod";

/**
 * The whole portfolio a friend is building, as one validated document.
 *
 * It mirrors the shape of Akash's own `config/portfolio.ts` so the two
 * read the same, minus provenance: here the person asserts their own
 * facts. Binary data (photos, audio, PDFs) is never inlined — a BlobRef
 * is a key into IndexedDB, so this JSON stays small enough to autosave on
 * every keystroke and to send to the AI assistant.
 *
 * Every string has a max length. The renderer escapes everything, but
 * bounded input keeps prompts, storage and the exported page sane.
 */

const s = (max: number) => z.string().max(max);
export const BlobRef = z.string().regex(/^blob:[a-z0-9-]{8,64}$/);
export type BlobRef = z.infer<typeof BlobRef>;

export const SECTION_IDS = [
  "about",
  "stats",
  "projects",
  "experience",
  "skills",
  "awards",
  "resume",
  "contact",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const SOCIAL_KINDS = [
  "github",
  "linkedin",
  "x",
  "website",
  "instagram",
  "behance",
  "dribbble",
  "youtube",
  "medium",
  "leetcode",
] as const;

const Social = z.object({
  kind: z.enum(SOCIAL_KINDS),
  url: s(300),
});

const Caption = z.object({
  start: z.number().min(0).max(120),
  end: z.number().min(0).max(120),
  text: s(200),
});

const Metric = z.object({ label: s(40), value: s(60) });

export const Experience = z.object({
  id: s(40),
  role: s(80),
  company: s(80),
  companyUrl: s(300),
  location: s(80),
  start: s(20), // free text, e.g. "May 2022"
  end: s(20), // "" = present
  description: s(600),
  highlights: z.array(s(240)).max(8),
  tech: z.array(s(40)).max(16),
});

export const Education = z.object({
  id: s(40),
  degree: s(120),
  institution: s(120),
  start: s(20),
  end: s(20),
  grade: s(40),
  note: s(240),
});

export const Project = z.object({
  id: s(40),
  title: s(80),
  tagline: s(140),
  description: s(900),
  liveUrl: s(300),
  repoUrl: s(300),
  tech: z.array(s(40)).max(16),
  metrics: z.array(Metric).max(5),
  cover: BlobRef.nullable(),
  featured: z.boolean(),
});

export const SkillGroup = z.object({
  id: s(40),
  label: s(40),
  skills: z.array(s(40)).max(24),
});

export const Stat = z.object({ id: s(40), value: s(12), label: s(40) });

export const Award = z.object({
  id: s(40),
  title: s(120),
  issuer: s(80),
  year: s(12),
  url: s(300),
  note: s(240),
});

export const Draft = z.object({
  version: z.literal(1),
  meta: z.object({
    id: s(40),
    createdAt: z.number(),
    expiresAt: z.number(),
    // who this browser's draft belongs to: the signed-in email ("master" for master codes)
    owner: s(160).optional(),
    themeId: s(40),
    sections: z
      .array(z.object({ id: z.enum(SECTION_IDS), visible: z.boolean() }))
      .max(SECTION_IDS.length),
    motion: z.enum(["full", "subtle", "none"]),
  }),
  identity: z.object({
    name: s(60),
    headline: z.tuple([s(24), s(24), s(24)]),
    roles: z.array(s(40)).max(4),
    creed: z.array(s(48)).max(3),
    signature: s(30),
    location: s(80),
    email: s(120),
    phone: s(30),
    socials: z.array(Social).max(10),
    bioShort: s(240),
    bioLong: s(1600),
  }),
  portrait: z.object({
    photo: BlobRef.nullable(),
    consent: z.boolean(),
    outfitId: s(40),
    outfitColor: s(20),
    variants: z.array(BlobRef).max(6),
    chosen: BlobRef.nullable(),
    cutout: BlobRef.nullable(),
  }),
  intro: z.object({
    mode: z.enum(["voice", "captions"]),
    script: s(600),
    voice: BlobRef.nullable(),
    captions: z.array(Caption).max(30),
  }),
  experience: z.array(Experience).max(12),
  education: z.array(Education).max(6),
  projects: z.array(Project).max(12),
  skillGroups: z.array(SkillGroup).max(8),
  stats: z.array(Stat).max(4),
  awards: z.array(Award).max(12),
  resume: z.object({ file: BlobRef.nullable(), label: s(40) }),
  seo: z.object({ title: s(70), description: s(160) }),
});

export type Draft = z.infer<typeof Draft>;
export type ExperienceItem = z.infer<typeof Experience>;
export type EducationItem = z.infer<typeof Education>;
export type ProjectItem = z.infer<typeof Project>;
export type SkillGroupItem = z.infer<typeof SkillGroup>;
export type StatItem = z.infer<typeof Stat>;
export type AwardItem = z.infer<typeof Award>;
export type SocialKind = (typeof SOCIAL_KINDS)[number];
