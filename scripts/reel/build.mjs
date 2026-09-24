/**
 * Builds the Instagram reel: voice first, then the picture cut to it.
 *
 *   node scripts/reel/build.mjs            # full build
 *   node scripts/reel/build.mjs --voice    # re-synthesise narration only
 *   node scripts/reel/build.mjs --frames   # re-render frames from the last timeline
 *
 * Narration is Sarvam's Bulbul (SARVAM_API_KEY, male en-IN voice). Without a
 * key it falls back to the macOS `say` voice and says so loudly — the film
 * still assembles, it just isn't the voice it ships with.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { BEATS, PAUSE } from "./script.mjs";

const ROOT = process.cwd();
const WORK = path.join(ROOT, ".work/reel");
const VOICE_DIR = path.join(WORK, "voice");
const FRAME_DIR = path.join(WORK, "frames");
const OUT = path.join(WORK, "folioforge-reel.mp4");
const FPS = 30;
const SPEAKER = process.env.REEL_SPEAKER ?? "anand"; // en-IN male, as used in StudioPulse
const PACE = Number(process.env.REEL_PACE ?? 1.0);
const KEY = process.env.SARVAM_API_KEY ?? readEnv("SARVAM_API_KEY");
const only = new Set(process.argv.slice(2).map((a) => a.replace(/^--/, "")));
const ffmpeg = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "pipe", "inherit"] });
/* Both engines leave dead air at the ends; the film is cut to the voice, so
 * that silence would become a pause nobody asked for. */
const TRIM = "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,areverse";
const seconds = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

function readEnv(name) {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    const m = readFileSync(f, "utf8").match(new RegExp(`^${name}=(.*)$`, "m"));
    if (m && m[1].trim()) return m[1].trim();
  }
  return "";
}

// ── 1. the voice ─────────────────────────────────────────────────────────

async function sarvam(text, file) {
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ text, target_language_code: "en-IN", speaker: SPEAKER, model: "bulbul:v3", pace: PACE, speech_sample_rate: 48000 }),
  });
  if (!res.ok) throw new Error(`Sarvam ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { audios } = await res.json();
  const raw = path.join(VOICE_DIR, ".raw.wav");
  writeFileSync(raw, Buffer.concat(audios.map((a) => Buffer.from(a, "base64"))));
  ffmpeg(["-i", raw, "-af", TRIM, "-ar", "48000", "-ac", "1", file]);
  rmSync(raw, { force: true });
}

function macSay(text, file) {
  const aiff = path.join(VOICE_DIR, ".raw.aiff");
  execFileSync("say", ["-v", process.env.REEL_SAY_VOICE ?? "Aman", "-r", "178", "-o", aiff, text]);
  ffmpeg(["-i", aiff, "-af", TRIM, "-ar", "48000", "-ac", "1", file]);
  rmSync(aiff, { force: true });
}

async function buildVoice() {
  mkdirSync(VOICE_DIR, { recursive: true });
  console.log(KEY ? `Voice: Sarvam bulbul:v3 · ${SPEAKER}` : "⚠︎  No SARVAM_API_KEY — using the macOS placeholder voice");
  const clips = [];
  for (const beat of BEATS) {
    const file = path.join(VOICE_DIR, `${beat.id}.wav`);
    if (KEY) await sarvam(beat.line, file);
    else macSay(beat.line, file);
    const dur = seconds(file);
    clips.push({ ...beat, file, dur });
    console.log(`  ${beat.id.padEnd(10)} ${dur.toFixed(2)}s  ${beat.line.slice(0, 54)}…`);
  }
  writeFileSync(path.join(WORK, "voice.json"), JSON.stringify(clips, null, 2));
  return clips;
}

/** One narration track: each line, then its pause, so the picture can follow the same clock. */
function assembleVoice(clips) {
  const parts = [];
  for (const c of clips) {
    parts.push(c.file);
    const gap = PAUSE[c.id] ?? 0.45;
    const silence = path.join(VOICE_DIR, `.gap-${c.id}.wav`);
    ffmpeg(["-f", "lavfi", "-i", `anullsrc=r=48000:cl=mono`, "-t", String(gap), silence]);
    parts.push(silence);
  }
  const list = path.join(VOICE_DIR, "list.txt");
  writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
  const track = path.join(WORK, "narration.wav");
  ffmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", track]);
  return track;
}

function timelineFrom(clips) {
  let t = 0;
  return clips.map((c) => {
    const start = t;
    const end = start + c.dur + (PAUSE[c.id] ?? 0.45);
    t = end;
    return { id: c.id, scene: c.scene, caption: c.caption, start, end };
  });
}

// ── 2. the picture ───────────────────────────────────────────────────────

async function renderFrames(timeline) {
  rmSync(FRAME_DIR, { recursive: true, force: true });
  mkdirSync(FRAME_DIR, { recursive: true });
  const total = Math.ceil(timeline[timeline.length - 1].end * FPS);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.addInitScript((tl) => { window.TIMELINE = tl; }, timeline);
  await page.goto(`file://${path.join(ROOT, "scripts/reel/film.html")}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null)))));
  console.log(`Frames: ${total} at ${FPS}fps (${(total / FPS).toFixed(1)}s)`);
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    await page.screenshot({ path: path.join(FRAME_DIR, String(f).padStart(5, "0") + ".png"), animations: "disabled" });
    if (f % 150 === 0) process.stdout.write(`  ${Math.round((f / total) * 100)}%\r`);
  }
  await browser.close();
  return total;
}

// ── 3. the film ──────────────────────────────────────────────────────────

function assemble(track) {
  ffmpeg([
    "-framerate", String(FPS), "-i", path.join(FRAME_DIR, "%05d.png"),
    "-i", track,
    "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.2",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart", "-shortest", OUT,
  ]);
}

// ── run ──────────────────────────────────────────────────────────────────

mkdirSync(WORK, { recursive: true });
const all = only.size === 0;
let clips;
if (all || only.has("voice")) clips = await buildVoice();
else {
  // cached audio, but always the current wording of the captions and scenes
  const cached = JSON.parse(readFileSync(path.join(WORK, "voice.json"), "utf8"));
  clips = BEATS.map((b) => ({ ...b, ...cached.find((c) => c.id === b.id), caption: b.caption, scene: b.scene }));
}

const timeline = timelineFrom(clips);
writeFileSync(path.join(WORK, "timeline.json"), JSON.stringify(timeline, null, 2));
const track = assembleVoice(clips);

if (all || only.has("frames") || only.has("voice")) await renderFrames(timeline);
assemble(track);
console.log(`\n✓ ${path.relative(ROOT, OUT)} — ${seconds(OUT).toFixed(1)}s, ${(Buffer.byteLength(readFileSync(OUT)) / 1048576).toFixed(1)} MB`);
