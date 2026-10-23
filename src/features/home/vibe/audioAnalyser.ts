import { isNativeApp } from "@/shared/platform/native";
// Taps the player's <audio> element with an AnalyserNode so visuals can react to the beat.
// Shares the AudioContext / MediaElementSource with the pitch & reverb graph
// (window.__liner_audio_context / __liner_media_source_node) because an element
// can only ever have one MediaElementSource.

export interface BeatFrame {
  /** 0..1 smoothed low-end energy */
  bass: number;
  /** 0..1 smoothed overall energy */
  level: number;
  /** 0..1, jumps to 1 on a detected beat and decays */
  beat: number;
  /** true when real audio data is flowing */
  live: boolean;
}

let analyser: AnalyserNode | null = null;
let freq: Uint8Array<ArrayBuffer> | null = null;
let lastEnsure = 0;

function getAudio(): HTMLAudioElement | null {
  const win = window as any;
  return (win.__liner_audio || document.getElementById("liner-audio")) as HTMLAudioElement | null;
}

function ensureGraph(): AnalyserNode | null {
  // Android: tapping a stream without CORS headers would silence it; the visuals
  // fall back to their own pulse instead
  if (isNativeApp()) return null;
  const now = performance.now();
  if (analyser && now - lastEnsure < 1000) return analyser;
  lastEnsure = now;

  const win = window as any;
  const audio = getAudio();
  const AudioCtx = window.AudioContext || win.webkitAudioContext;
  if (!audio || !AudioCtx) return null;

  try {
    if (!win.__liner_audio_context) win.__liner_audio_context = new AudioCtx();
    const ctx = win.__liner_audio_context as AudioContext;

    let source = (audio as any).__liner_source_node as MediaElementAudioSourceNode | undefined;
    if (!source && win.__liner_media_source_node?.mediaElement === audio) source = win.__liner_media_source_node;
    if (!source) {
      source = ctx.createMediaElementSource(audio);
      (audio as any).__liner_source_node = source;
      win.__liner_media_source_node = source;
    }

    // nobody else routes the element to the speakers yet -> we must
    if (!win.__liner_pitch_graph && !(audio as any).__liner_pitch_graph && !(source as any).__lane_direct) {
      source.connect(ctx.destination);
      (source as any).__lane_direct = true;
    }

    if (!analyser || analyser.context !== ctx) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;
      freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    }
    // the effects graph calls source.disconnect() when it rebuilds; re-tap every second
    // (connecting an already connected pair is a no-op)
    source.connect(analyser);
    if (ctx.state === "suspended" && !audio.paused) void ctx.resume().catch(() => {});
    return analyser;
  } catch {
    return null;
  }
}

export class BeatTracker {
  private bass = 0;
  private level = 0;
  private beat = 0;
  private avgBass = 0.15;
  private peak = 0.35;
  private lastBeatAt = 0;
  private synthPhase = 0;

  /** dt in seconds, playing = whether the player is currently playing */
  next(dt: number, playing: boolean): BeatFrame {
    const node = playing ? ensureGraph() : null;
    let rawBass = 0;
    let rawLevel = 0;
    let live = false;

    if (node && freq) {
      node.getByteFrequencyData(freq);
      const sr = node.context.sampleRate;
      const binHz = sr / node.fftSize;
      const bassEnd = Math.max(2, Math.round(160 / binHz));
      const levelEnd = Math.min(freq.length, Math.round(8000 / binHz));
      let b = 0;
      for (let i = 1; i < bassEnd; i++) b += freq[i];
      let l = 0;
      for (let i = 1; i < levelEnd; i++) l += freq[i];
      rawBass = b / ((bassEnd - 1) * 255);
      rawLevel = l / ((levelEnd - 1) * 255);
      live = rawLevel > 0.002;
    }

    if (playing && !live) {
      // no data (e.g. effects disabled before first play): soft synthetic ~118 bpm pulse
      this.synthPhase += dt * (118 / 60);
      const p = this.synthPhase % 1;
      rawBass = Math.pow(1 - p, 3) * 0.55 + 0.1;
      rawLevel = 0.25 + Math.sin(this.synthPhase * 0.7) * 0.05;
    }

    // adaptive normalisation so quiet and loud masters both move the visuals
    this.peak = Math.max(rawBass, this.peak * Math.pow(0.5, dt / 4));
    const norm = this.peak > 0.02 ? Math.min(1, rawBass / this.peak) : 0;

    this.avgBass += (rawBass - this.avgBass) * Math.min(1, dt * 1.5);
    const now = performance.now();
    if (playing && rawBass > this.avgBass * 1.28 && rawBass > 0.12 && now - this.lastBeatAt > 220) {
      this.lastBeatAt = now;
      this.beat = 1;
    }
    this.beat = Math.max(0, this.beat - dt * 3.2);

    const target = playing ? norm : 0;
    const k = target > this.bass ? 18 : 5; // fast attack, slow release
    this.bass += (target - this.bass) * Math.min(1, dt * k);
    this.level += ((playing ? Math.min(1, rawLevel * 2.2) : 0) - this.level) * Math.min(1, dt * 6);

    return { bass: this.bass, level: this.level, beat: this.beat, live };
  }
}
