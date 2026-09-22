"use client";

import { speechSegments, type Segment } from "./captions";

/**
 * The voice pipeline, all in the browser:
 *   decode → mono 48 kHz → RNNoise (denoise + voice activity per 10 ms)
 *   → high-pass, presence lift, gentle compression → peak-normalise
 *   → trim silence (keeping air) → MP3.
 *
 * RNNoise is the same family of model as the neural denoising used on
 * Akash's own voice, running as WebAssembly: free, private, offline.
 */

const SR = 48000;

export interface ProcessedVoice {
  mp3: Blob;
  duration: number;
  segments: Segment[];
}

async function decode(blob: Blob): Promise<AudioBuffer> {
  const ctx = new AudioContext({ sampleRate: SR });
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void ctx.close();
  }
}

function mono(buf: AudioBuffer): Float32Array {
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / buf.numberOfChannels;
  }
  return out;
}

async function denoise(pcm: Float32Array): Promise<{ clean: Float32Array; vad: Float32Array }> {
  const { Rnnoise } = await import("@shiguredo/rnnoise-wasm");
  const rn = await Rnnoise.load();
  const st = rn.createDenoiseState();
  const N = rn.frameSize; // 480 = 10 ms at 48 kHz
  const frames = Math.floor(pcm.length / N);
  const clean = new Float32Array(frames * N);
  const vad = new Float32Array(frames);
  const f = new Float32Array(N);
  for (let i = 0; i < frames; i++) {
    for (let j = 0; j < N; j++) f[j] = pcm[i * N + j] * 32768;
    vad[i] = st.processFrame(f);
    for (let j = 0; j < N; j++) clean[i * N + j] = f[j] / 32768;
  }
  st.destroy();
  return { clean, vad };
}

async function polish(pcm: Float32Array): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, pcm.length, SR);
  const buf = ctx.createBuffer(1, pcm.length, SR);
  buf.copyToChannel(new Float32Array(pcm), 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass"; hp.frequency.value = 80;
  const mud = ctx.createBiquadFilter();
  mud.type = "peaking"; mud.frequency.value = 220; mud.Q.value = 1.2; mud.gain.value = -1.5;
  const presence = ctx.createBiquadFilter();
  presence.type = "peaking"; presence.frequency.value = 3200; presence.Q.value = 1.4; presence.gain.value = 2;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24; comp.ratio.value = 2.5; comp.attack.value = 0.008; comp.release.value = 0.12; comp.knee.value = 6;
  src.connect(hp).connect(mud).connect(presence).connect(comp).connect(ctx.destination);
  src.start();
  const out = (await ctx.startRendering()).getChannelData(0);
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? 0.89 / peak : 1; // -1 dBFS
  for (let i = 0; i < out.length; i++) out[i] *= gain;
  return out;
}

function encodeMp3Sync(pcm: Float32Array, Mp3Encoder: new (c: number, sr: number, kbps: number) => { encodeBuffer(l: Int16Array): Uint8Array; flush(): Uint8Array }): Blob {
  const enc = new Mp3Encoder(1, SR, 112);
  const chunks: Uint8Array[] = [];
  const block = 1152 * 20;
  const i16 = new Int16Array(block);
  for (let i = 0; i < pcm.length; i += block) {
    const n = Math.min(block, pcm.length - i);
    for (let j = 0; j < n; j++) i16[j] = Math.max(-32768, Math.min(32767, Math.round(pcm[i + j] * 32767)));
    const out = enc.encodeBuffer(i16.subarray(0, n));
    if (out.length) chunks.push(out);
  }
  const tail = enc.flush();
  if (tail.length) chunks.push(tail);
  return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
}

export async function processVoice(input: Blob): Promise<ProcessedVoice> {
  const raw = mono(await decode(input));
  if (raw.length < SR * 1.5) throw new Error("That recording is too short — aim for 10 to 25 seconds.");
  if (raw.length > SR * 75) throw new Error("Please keep the intro under a minute.");
  const { clean, vad } = await denoise(raw);
  const segs = speechSegments(vad);
  if (segs.length === 0) throw new Error("No speech detected — check your microphone and try again.");
  // trim to speech, keeping 0.3 s of air each side
  const from = Math.max(0, Math.floor((segs[0].start - 0.3) * SR));
  const to = Math.min(clean.length, Math.ceil((segs[segs.length - 1].end + 0.45) * SR));
  const trimmed = await polish(clean.subarray(from, to));
  // fade 20 ms in/out so the trim never clicks
  const fade = Math.floor(0.02 * SR);
  for (let i = 0; i < fade; i++) { trimmed[i] *= i / fade; trimmed[trimmed.length - 1 - i] *= i / fade; }
  const shift = from / SR;
  const segments = segs.map((s) => ({ start: +(s.start - shift).toFixed(2), end: +(s.end - shift).toFixed(2) }));
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  return { mp3: encodeMp3Sync(trimmed, Mp3Encoder), duration: trimmed.length / SR, segments };
}

/** Microphone recording with the browser's own noise suppression on. */
export async function startRecording(): Promise<{ stop: () => Promise<Blob>; stream: MediaStream }> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
  rec.start(250);
  return {
    stream,
    stop: () =>
      new Promise<Blob>((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(parts, { type: rec.mimeType || "audio/webm" }));
        };
        rec.stop();
      }),
  };
}
