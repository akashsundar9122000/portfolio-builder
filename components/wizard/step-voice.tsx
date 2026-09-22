"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square, Trash2, Upload, Wand2 } from "lucide-react";
import { TextArea } from "@/components/form/fields";
import { blobUrl, mutate, putBlob, update, useDraft } from "@/lib/builder/store";
import { processVoice, startRecording } from "@/lib/media/audio";
import { alignCaptions, timeCaptionsByPace, type Segment } from "@/lib/media/captions";

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function StepVoice() {
  const d = useDraft();
  const [recording, setRecording] = useState<null | { stop: () => Promise<Blob> }>(null);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const [voiceUrl, setVoiceUrl] = useState<string>();
  const segmentsRef = useRef<Segment[] | null>(null);
  const durationRef = useRef(0);
  const n = words(d.intro.script);

  useEffect(() => {
    let live = true;
    void blobUrl(d.intro.voice).then((u) => live && setVoiceUrl(u));
    return () => { live = false; };
  }, [d.intro.voice]);

  useEffect(() => {
    if (!recording) return;
    const t0 = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - t0) / 1000), 200);
    return () => clearInterval(id);
  }, [recording]);

  async function handle(blob: Blob) {
    setErr("");
    setStatus("Removing background noise and levelling your voice…");
    try {
      const out = await processVoice(blob);
      const ref = await putBlob(out.mp3);
      segmentsRef.current = out.segments;
      durationRef.current = out.duration;
      mutate((x) => { x.intro.voice = ref; x.intro.mode = "voice"; x.intro.captions = alignCaptions(x.intro.script, out.segments, out.duration); });
      setStatus("");
    } catch (e) {
      setStatus("");
      setErr(e instanceof Error ? e.message : "Couldn’t process that recording.");
    }
  }

  async function toggleRecord() {
    if (recording) {
      const blob = await recording.stop();
      setRecording(null);
      await handle(blob);
      return;
    }
    setErr("");
    try {
      setElapsed(0);
      setRecording(await startRecording());
    } catch {
      setErr("Microphone access was blocked. Allow it in your browser’s site settings, or upload a recording instead.");
    }
  }

  function retime() {
    mutate((x) => {
      x.intro.captions = x.intro.mode === "voice" && segmentsRef.current
        ? alignCaptions(x.intro.script, segmentsRef.current, durationRef.current)
        : timeCaptionsByPace(x.intro.script);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <TextArea path="intro.script" label="What you’ll say" max={600} rows={4} ai="script"
        hint={<>About 40–55 words reads in 15–20 seconds. {n > 0 && <span className="tabular-nums">~{Math.round(n / 2.6)}s at a natural pace.</span>}</>} />

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How your intro plays">
        <button type="button" role="radio" aria-checked={d.intro.mode === "voice"} className={`btn ${d.intro.mode === "voice" ? "btn-primary" : ""}`} onClick={() => update("intro.mode", "voice")}>My voice + captions</button>
        <button type="button" role="radio" aria-checked={d.intro.mode === "captions"} className={`btn ${d.intro.mode === "captions" ? "btn-primary" : ""}`} onClick={() => { update("intro.mode", "captions"); if (!d.intro.captions.length) retime(); }}>Captions only</button>
      </div>

      {d.intro.mode === "voice" ? (
        <div className="card flex flex-col gap-5 p-5 sm:p-6">
          {d.intro.script && (
            <div className="bg-sunken rounded-xl p-5">
              <p className="label mb-2">Teleprompter</p>
              <p className="text-xl leading-relaxed sm:text-2xl">{d.intro.script}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={`btn ${recording ? "border-danger text-danger" : "btn-primary"}`} onClick={toggleRecord} disabled={Boolean(status)}>
              {recording ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
              {recording ? `Stop · ${elapsed.toFixed(0)}s` : d.intro.voice ? "Record again" : "Start recording"}
            </button>
            <label className="btn cursor-pointer">
              <Upload className="size-4" aria-hidden /> Upload a recording
              <input type="file" accept="audio/*,video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); }} />
            </label>
            {d.intro.voice && !recording && (
              <button type="button" className="btn" onClick={() => mutate((x) => { x.intro.voice = null; })}><Trash2 className="size-4" aria-hidden /> Remove</button>
            )}
          </div>
          <p className="text-text-3 text-sm">Tips: a quiet room with soft furnishings, phone a hand’s width from your mouth, pause briefly between sentences. Noise is removed automatically.</p>
          {recording && <p role="status" className="text-danger flex items-center gap-2 text-sm"><span className="bg-danger size-2 animate-pulse rounded-full" />Recording…</p>}
          {status && <p role="status" className="text-text-2 flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" aria-hidden />{status}</p>}
          {err && <p role="alert" className="text-danger text-sm">{err}</p>}
          {voiceUrl && d.intro.voice && <audio controls src={voiceUrl} className="w-full" />}
        </div>
      ) : (
        <p className="text-text-2">Your script plays as subtitles over your portrait, timed to a natural reading pace.</p>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">Captions</p>
          <button type="button" className="btn" disabled={!d.intro.script.trim()} onClick={retime}><Wand2 className="size-4" aria-hidden /> {d.intro.captions.length ? "Re-time from script" : "Create captions"}</button>
        </div>
        {d.intro.captions.length === 0 ? (
          <p className="text-text-3 text-sm">Captions appear here once you record or create them.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {d.intro.captions.map((c, i) => (
              <li key={i} className="grid grid-cols-[5rem_5rem_1fr] gap-2">
                <input className="input tabular-nums" type="number" step="0.1" min={0} aria-label={`Caption ${i + 1} start (seconds)`} value={c.start} onChange={(e) => mutate((x) => { x.intro.captions[i].start = Math.max(0, Number(e.target.value)); })} />
                <input className="input tabular-nums" type="number" step="0.1" min={0} aria-label={`Caption ${i + 1} end (seconds)`} value={c.end} onChange={(e) => mutate((x) => { x.intro.captions[i].end = Math.max(0, Number(e.target.value)); })} />
                <input className="input" aria-label={`Caption ${i + 1} text`} maxLength={200} value={c.text} onChange={(e) => mutate((x) => { x.intro.captions[i].text = e.target.value; })} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
