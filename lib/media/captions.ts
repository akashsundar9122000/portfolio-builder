/**
 * Caption timing from a recording, with no speech-to-text service.
 *
 * The person typed the script, so the words are known; only the timing
 * is missing. Speech segments come from RNNoise's voice-activity
 * probabilities (10 ms frames). Sentences are laid over the total speech
 * time in proportion to their length, and every boundary is snapped to
 * the nearest real pause — the same method used to sync Akash's own
 * intro, automated.
 */

export interface Caption { start: number; end: number; text: string }
export interface Segment { start: number; end: number }

/** Sentences, with long ones split at commas so no caption exceeds ~14 words. */
export function splitScript(script: string): string[] {
  const sentences = script.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]*["')\]]*/g) ?? [];
  const out: string[] = [];
  for (const s of sentences.map((x) => x.trim()).filter(Boolean)) {
    if (s.split(" ").length <= 14) { out.push(s); continue; }
    let buf = "";
    for (const part of s.split(/(?<=,)\s+/)) {
      if (buf && (buf + " " + part).split(" ").length > 14) { out.push(buf); buf = part; }
      else buf = buf ? `${buf} ${part}` : part;
    }
    if (buf) out.push(buf);
  }
  return out;
}

export function speechSegments(vad: Float32Array, frameSec = 0.01, threshold = 0.5, minGap = 0.3, minLen = 0.12): Segment[] {
  // smooth over 5 frames so single dips don't split a word
  const sm = new Float32Array(vad.length);
  for (let i = 0; i < vad.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(vad.length - 1, i + 2); j++) { s += vad[j]; n++; }
    sm[i] = s / n;
  }
  const segs: Segment[] = [];
  let open = -1;
  for (let i = 0; i <= sm.length; i++) {
    const on = i < sm.length && sm[i] >= threshold;
    if (on && open < 0) open = i;
    if (!on && open >= 0) { segs.push({ start: open * frameSec, end: i * frameSec }); open = -1; }
  }
  const merged: Segment[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && s.start - last.end < minGap) last.end = s.end;
    else merged.push({ ...s });
  }
  return merged.filter((s) => s.end - s.start >= minLen);
}

/** Reading pace for captions-only mode: ~2.6 words per second. */
export function timeCaptionsByPace(script: string, startAt = 0.4): Caption[] {
  let t = startAt;
  return splitScript(script).map((text) => {
    const d = Math.max(1.4, text.split(" ").length / 2.6);
    const c = { start: +t.toFixed(2), end: +(t + d).toFixed(2), text };
    t += d + 0.25;
    return c;
  });
}

export function alignCaptions(script: string, segs: Segment[], duration: number): Caption[] {
  const lines = splitScript(script);
  if (lines.length === 0) return [];
  if (segs.length === 0) return timeCaptionsByPace(script);
  const speech = segs.reduce((a, s) => a + (s.end - s.start), 0);
  const weights = lines.map((l) => l.replace(/[^a-z0-9]/gi, "").length || 1);
  const total = weights.reduce((a, b) => a + b, 0);

  // map "speech seconds elapsed" → wall-clock time across segments
  const toClock = (speechT: number) => {
    let acc = 0;
    for (const s of segs) {
      const len = s.end - s.start;
      if (speechT <= acc + len) return s.start + (speechT - acc);
      acc += len;
    }
    return segs[segs.length - 1].end;
  };
  const gaps = segs.slice(1).map((s, i) => (segs[i].end + s.start) / 2);
  const snap = (t: number) => {
    let best = t, dist = 0.6; // only snap to a pause within 0.6 s
    for (const g of gaps) if (Math.abs(g - t) < dist) { dist = Math.abs(g - t); best = g; }
    return best;
  };

  let acc = 0;
  const bounds = [segs[0].start];
  for (let i = 0; i < lines.length - 1; i++) {
    acc += (weights[i] / total) * speech;
    bounds.push(snap(toClock(acc)));
  }
  bounds.push(Math.min(duration, segs[segs.length - 1].end + 0.2));
  return lines.map((text, i) => ({
    start: +Math.max(0, bounds[i] - 0.05).toFixed(2),
    end: +Math.max(bounds[i] + 0.3, bounds[i + 1] - 0.02).toFixed(2),
    text,
  }));
}
