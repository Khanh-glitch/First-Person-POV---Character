// Procedural audio — every sound is synthesized at runtime (no external assets).
export class AudioFX {
  ctx: AudioContext | null = null;
  master!: GainNode;
  reverbSend!: GainNode;
  muted = false;
  private noiseBuf!: AudioBuffer;
  private ksCache = new Map<number, AudioBuffer>();

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // generated impulse reverb
    const conv = ctx.createConvolver();
    const len = ctx.sampleRate * 2.8;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    conv.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(conv);
    conv.connect(this.master);

    const nlen = ctx.sampleRate * 3;
    this.noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.8;
  }

  private out(g: AudioNode, wet = 0.4) {
    g.connect(this.master);
    if (wet > 0) {
      const s = this.ctx!.createGain();
      s.gain.value = wet;
      g.connect(s);
      s.connect(this.reverbSend);
    }
  }

  private noise(dur: number) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.loopEnd = 3;
    const off = Math.random() * 2;
    src.start(this.ctx!.currentTime, off, dur + 0.1);
    return src;
  }

  private ks(freq: number) {
    const key = Math.round(freq);
    let b = this.ksCache.get(key);
    if (b) return b;
    const ctx = this.ctx!;
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 1.2);
    b = ctx.createBuffer(1, len, sr);
    const d = b.getChannelData(0);
    const N = Math.max(2, Math.floor(sr / freq));
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const nx = (idx + 1) % N;
      const v = (ring[idx] + ring[nx]) * 0.4985;
      d[i] = ring[idx];
      ring[idx] = v;
      idx = nx;
    }
    this.ksCache.set(key, b);
    return b;
  }

  /** plucked string "twang" */
  twang(freq = 600, vol = 0.35, detune = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.ks(freq);
    src.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = vol;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 180;
    src.connect(hp).connect(g);
    this.out(g, 0.5);
    src.start();
  }

  /** metallic slicing shing */
  shing(vol = 0.25, base = 2400) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    this.out(g, 0.6);
    [1, 1.47, 2.09, 2.76, 3.9].forEach((r, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(base * r, t);
      o.frequency.exponentialRampToValueAtTime(base * r * 0.97, t + 1);
      const og = ctx.createGain();
      og.gain.value = 1 / (i + 1.5);
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 1.2);
    });
    const n = this.noise(0.15);
    const bp = ctx.createBiquadFilter();
    bp.type = "highpass";
    bp.frequency.value = 5000;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.8, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(bp).connect(ng);
    this.out(ng, 0.2);
  }

  whoosh(dur = 0.5, vol = 0.5, f0 = 300, f1 = 3000) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this.noise(dur);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
    bp.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g);
    this.out(g, 0.3);
  }

  boom(vol = 0.9, dur = 1.6, pitch = 70) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(pitch * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(pitch * 0.4, t + dur * 0.7);
    const og = ctx.createGain();
    og.gain.setValueAtTime(vol, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(og);
    this.out(og, 0.3);
    o.start(t);
    o.stop(t + dur);
    const n = this.noise(dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3500, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + dur * 0.8);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.9, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(lp).connect(ng);
    this.out(ng, 0.6);
  }

  crack(vol = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = this.noise(0.25);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    n.connect(hp).connect(g);
    this.out(g, 0.5);
  }

  /** looping-ish sustained layer, returns stop() */
  drone(opts: { type?: "rumble" | "sizzle" | "choir" | "whine"; vol?: number; dur?: number; f?: number }) {
    if (!this.ctx) return () => {};
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = opts.dur ?? 3;
    const vol = opts.vol ?? 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.6, dur * 0.3));
    g.gain.setValueAtTime(vol, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const stops: (() => void)[] = [];
    const type = opts.type ?? "rumble";
    if (type === "rumble" || type === "sizzle") {
      const n = this.noise(dur);
      const f = ctx.createBiquadFilter();
      if (type === "rumble") {
        f.type = "lowpass";
        f.frequency.value = opts.f ?? 140;
      } else {
        f.type = "highpass";
        f.frequency.value = opts.f ?? 2500;
      }
      n.connect(f).connect(g);
      stops.push(() => n.stop());
      if (type === "sizzle") {
        // crackle modulation
        const lfo = ctx.createOscillator();
        lfo.type = "square";
        lfo.frequency.value = 23;
        const lg = ctx.createGain();
        lg.gain.value = vol * 0.4;
        lfo.connect(lg).connect(g.gain);
        lfo.start(t);
        lfo.stop(t + dur);
      }
    } else if (type === "choir") {
      const base = opts.f ?? 110;
      [1, 1.5, 2, 2.4, 3].forEach((r, i) => {
        for (const dt of [-9, 9]) {
          const o = ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = base * r;
          o.detune.value = dt + i * 2;
          const lp = ctx.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.value = 900;
          lp.Q.value = 4;
          const og = ctx.createGain();
          og.gain.value = 0.12 / (i + 1);
          o.connect(lp).connect(og).connect(g);
          o.start(t);
          o.stop(t + dur);
        }
      });
    } else if (type === "whine") {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      const f0 = opts.f ?? 180;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 8, t + dur);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(f0 * 2, t);
      bp.frequency.exponentialRampToValueAtTime(f0 * 14, t + dur);
      bp.Q.value = 6;
      o.connect(bp).connect(g);
      o.start(t);
      o.stop(t + dur);
    }
    this.out(g, 0.5);
    return () => {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      stops.forEach((s) => {
        try {
          s();
        } catch {
          /* noop */
        }
      });
    };
  }
}

export const audio = new AudioFX();
