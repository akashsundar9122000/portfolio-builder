/**
 * The reel's script: one entry per narrated beat.
 *
 *   line    — what the voice says (Sarvam bulbul, en-IN male)
 *   caption — what's burned on screen, for the 80% who watch muted
 *   scene   — which visual in film.html
 *
 * Durations are not written here: each line is synthesised first and the
 * picture is cut to the voice, so re-wording a line can never desync the
 * captions from it.
 */
export const BEATS = [
  { id: "hook", scene: "hook", line: "Your resume is a PDF that nobody opens.", caption: "Your resume is a PDF\nnobody opens" },
  { id: "intro", scene: "logo", line: "This is FolioForge. It turns your details into a portfolio website, in minutes.", caption: "FolioForge builds\nyour portfolio site" },
  { id: "photo", scene: "photo", line: "Start with your photo. It gets cut out and lit like a film poster.", caption: "Your photo, lit like\na film poster" },
  { id: "voice", scene: "voice", line: "Record ten seconds in your own voice, so people actually hear you.", caption: "Ten seconds in\nyour own voice" },
  { id: "theme", scene: "theme", line: "Pick one of ten themes. They're designed, so you don't have to be.", caption: "Ten designed themes" },
  { id: "assistant", scene: "studio", line: "Add your work. And when the words don't come, the assistant writes them with you.", caption: "The AI writes it\nwith you" },
  { id: "publish", scene: "publish", line: "Then press publish, and your portfolio gets its own link.", caption: "Publish → your own link" },
  { id: "site", scene: "site", line: "Your face, your voice, your projects — on a page that looks like you paid for it.", caption: "Looks like you\npaid for it" },
  { id: "send", scene: "send", line: "Send that link instead of a PDF. Links get opened.", caption: "Send a link, not a PDF" },
  { id: "cta", scene: "cta", line: "It's free. Comment CODE, and I'll send you an access code.", caption: "Comment CODE\nfor free access" },
];

/** Pauses (seconds) added after a beat, where the picture needs a breath. */
export const PAUSE = { hook: 0.35, intro: 0.2, publish: 0.25, send: 0.3, cta: 1.4 };

export const SITE = "folioforge-app.vercel.app";
