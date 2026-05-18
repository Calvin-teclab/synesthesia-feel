import type { EarAnchor } from "./anchors";

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (typeof window === "undefined") {
    throw new Error("AudioContext requires a browser environment.");
  }
  if (!ctx) {
    const C = (window.AudioContext ||
      (window as any).webkitAudioContext) as typeof AudioContext;
    ctx = new C();
  }
  if (ctx.state === "suspended") {
    void ctx.resume();
  }
  return ctx;
}

/** Play an "ear" anchor as a brief, layered tone. */
export function playEar(anchor: EarAnchor, durationSec = 3.2) {
  const ac = getAudioContext();
  const now = ac.currentTime;

  const master = ac.createGain();
  master.gain.value = 0;
  master.connect(ac.destination);

  // Soft attack
  master.gain.setValueAtTime(0, now);
  master.gain.linearRampToValueAtTime(0.55, now + anchor.attack);
  master.gain.exponentialRampToValueAtTime(
    0.0001,
    now + anchor.attack + anchor.release,
  );

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = anchor.filter;
  filter.Q.value = 1.4;
  filter.connect(master);

  const makeOsc = (freq: number, gain: number, detune = 0) => {
    const o = ac.createOscillator();
    o.type = anchor.waveform;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ac.createGain();
    g.gain.value = gain;
    o.connect(g);
    g.connect(filter);
    o.start(now);
    o.stop(now + anchor.attack + anchor.release + 0.5);
    return { o, g };
  };

  // Fundamental + harmonic + subtle detuned twin → richer tone
  makeOsc(anchor.freq, 0.7);
  makeOsc(anchor.freq * anchor.harmonic, 0.32, 6);
  makeOsc(anchor.freq * 0.5, 0.22, -4);

  // Gentle stereo shimmer
  const shimmer = ac.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = 4 + Math.random() * 3;
  const shimmerGain = ac.createGain();
  shimmerGain.gain.value = anchor.freq * 0.005;
  shimmer.connect(shimmerGain);
  // shimmer modulates the lowpass cutoff a little
  shimmerGain.connect(filter.frequency);
  shimmer.start(now);
  shimmer.stop(now + anchor.attack + anchor.release + 0.5);

  // Final fade-out safety
  setTimeout(() => {
    try {
      master.disconnect();
    } catch {}
  }, (anchor.attack + anchor.release + 1) * 1000);
}
