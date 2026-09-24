# The Instagram reel

A 1080×1920 film of FolioForge, cut to a narration track. Everything lives in
`.work/reel/` (git-ignored); only the recipe is committed.

## Build it

```bash
pnpm start -p 3000                                  # the app, for the stills
pnpm exec tsx -e 'import {sampleById} from "@/lib/builder/samples"; \
  const d = sampleById("developer").draft(); const n = Date.now(); \
  d.meta.createdAt = n; d.meta.expiresAt = n + 6*864e5; \
  d.portrait.chosen = "blob:reel-portrait"; d.portrait.consent = true; d.intro.mode = "voice"; \
  process.stdout.write(JSON.stringify(d))' > .work/reel/draft.json
node scripts/reel/capture.mjs                       # stills from the real app
node scripts/reel/build.mjs                         # voice → timeline → frames → mp4
```

Output: `.work/reel/folioforge-reel.mp4`.

- `node scripts/reel/build.mjs --voice` — re-synthesise narration (after editing
  `script.mjs`) and re-cut the picture to it.
- `node scripts/reel/build.mjs --frames` — re-render the picture only, after
  editing `film.html`.

## The voice

Sarvam's Bulbul (`bulbul:v3`, `en-IN`) reads the lines. Put the key in
`.env.local`:

```
SARVAM_API_KEY=…
```

Without it the build falls back to the macOS `say` voice, warns that it has,
and still assembles — useful for checking timing, not for posting. Male en-IN
speakers: `anand` (default), `shubh`, `aditya`; set `REEL_SPEAKER` to change,
`REEL_PACE` to speed the reading up or down.

## How it fits together

- `script.mjs` — the beats: what's said, what's on screen, which scene.
- `film.html` — the picture. Nothing animates by itself: `render(t)` draws the
  frame for a moment in time, so frames are reproducible and the cut follows
  the voice rather than the other way round.
- `build.mjs` — synthesises each line, measures it, writes the timeline, renders
  every frame through Playwright, and muxes with ffmpeg.

Re-run `capture.mjs` whenever the UI changes, or the film will show an old app.
