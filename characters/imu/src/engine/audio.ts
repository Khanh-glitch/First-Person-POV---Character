/**
 * Fully procedural sound design (no external assets).
 * Dark drone + choir pad, impacts, risers, whooshes, crackling flames.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  dry!: GainNode;
  wet!: GainNode;
  noise!: AudioBuffer;
  muted = false;
  private droneGain!: GainNode;
  private padGain!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private started = false;

  init() {
    if (this.started) {
      this.ctx?.resume();
      return;
    }
    this.started = true;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(3.6, 2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    this.wet.connect(conv).connect(this.master);

    // noise buffer
    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.985 * b0 + 0.015 * w; // slightly pinkish
      d[i] = w * 0.6 + b0 * 3;
    }

    this.startAmbient();
    ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.08);
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  private startAmbient() {
    const ctx = this.ctx!;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0;
    this.droneGain.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 4);
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 220;
    this.droneFilter.Q.value = 3;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.dry);
    this.droneGain.connect(this.wet);

    [36.7, 55, 55.4, 73.4].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? "sawtooth" : "square";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.22;
      o.connect(g).connect(this.droneFilter);
      o.start();
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 90;
    lfo.connect(lg).connect(this.droneFilter.frequency);
    lfo.start();

    // choir-ish pad (minor cluster)
    this.padGain = ctx.createGain();
    this.padGain.gain.value = 0;
    this.padGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 6);
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 700;
    f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.value = 1150;
    f2.Q.value = 5;
    this.padGain.connect(this.wet);
    this.padGain.connect(this.dry);
    f1.connect(this.padGain);
    f2.connect(this.padGain);
    [146.8, 174.6, 220, 233.1, 293.7].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f * (1 + (i - 2) * 0.002);
      const v = ctx.createOscillator();
      v.frequency.value = 4.5 + i * 0.37;
      const vg = ctx.createGain();
      vg.gain.value = f * 0.006;
      v.connect(vg).connect(o.frequency);
      v.start();
      o.connect(f1);
      o.connect(f2);
      o.start();
    });

    // wind
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = "bandpass";
    wf.frequency.value = 420;
    wf.Q.value = 0.7;
    const wg = ctx.createGain();
    wg.gain.value = 0.07;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.13;
    const wlg = ctx.createGain();
    wlg.gain.value = 200;
    wl.connect(wlg).connect(wf.frequency);
    wl.start();
    wind.connect(wf).connect(wg).connect(this.dry);
    wind.start();
  }

  /** intensity 0..1 shifts the ambience darker / louder while powers are cast */
  intensity(v: number, time = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.droneFilter.frequency.setTargetAtTime(220 + v * 700, t, time);
    this.droneGain.gain.setTargetAtTime(0.32 + v * 0.35, t, time);
    this.padGain.gain.setTargetAtTime(0.05 + v * 0.1, t, time);
  }

  private src(loop = false) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    return s;
  }

  boom(vol = 1, pitch = 70, tail = 2.2) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(pitch * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(18, pitch * 0.35), t + tail * 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 1.1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + tail);
    o.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    o.start(t);
    o.stop(t + tail + 0.1);

    const n = this.src();
    const nf = ctx.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.setValueAtTime(5000, t);
    nf.frequency.exponentialRampToValueAtTime(90, t + tail * 0.8);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vol * 0.9, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + tail * 0.9);
    n.connect(nf).connect(ng);
    ng.connect(this.dry);
    ng.connect(this.wet);
    n.start(t, Math.random() * 1.5, tail);
  }

  whoosh(dur = 1, from = 300, to = 3000, vol = 0.5, q = 1.2) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.src();
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.45);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    n.start(t, Math.random() * 1.5, dur + 0.05);
  }

  rumble(dur = 3, vol = 0.6, freq = 90) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.src();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    f.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g);
    g.connect(this.dry);
    n.start(t, Math.random() * 1.5, dur + 0.05);
  }

  riser(dur = 3, vol = 0.35, from = 80, to = 900) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(from * 3, t);
    f.frequency.exponentialRampToValueAtTime(to * 6, t + dur);
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.92);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    f.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    [1, 1.007, 0.5, 1.5].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = i === 3 ? "triangle" : "sawtooth";
      o.frequency.setValueAtTime(from * m, t);
      o.frequency.exponentialRampToValueAtTime(to * m, t + dur);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.1);
    });
  }

  choir(dur = 4, vol = 0.18, base = 220) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 800;
    f1.Q.value = 6;
    const f2 = ctx.createBiquadFilter();
    f2.type = "bandpass";
    f2.frequency.value = 1200;
    f2.Q.value = 7;
    f1.connect(g);
    f2.connect(g);
    g.connect(this.wet);
    g.connect(this.dry);
    [1, 1.189, 1.5, 1.782, 2].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(base * m * 0.9, t);
      o.frequency.linearRampToValueAtTime(base * m, t + dur * 0.5);
      o.detune.value = (i - 2) * 7;
      const v = ctx.createOscillator();
      v.frequency.value = 5 + i * 0.4;
      const vg = ctx.createGain();
      vg.gain.value = 6;
      v.connect(vg).connect(o.detune);
      v.start(t);
      v.stop(t + dur + 0.1);
      o.connect(f1);
      o.connect(f2);
      o.start(t);
      o.stop(t + dur + 0.1);
    });
  }

  crackle(dur = 2, vol = 0.3) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.src();
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    // random amplitude chops
    for (let i = 0; i < dur * 40; i++) {
      g.gain.setValueAtTime(vol * Math.random() * (Math.random() < 0.3 ? 1 : 0.15), t + i / 40);
    }
    g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(f).connect(g).connect(this.dry);
    n.start(t, Math.random() * 1.5, dur + 0.05);
  }

  zap(vol = 0.4) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.src();
    const f = ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(800, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    n.connect(f).connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    n.start(t, Math.random() * 1.5, 0.35);
  }

  /** ominous low "hit" with a dissonant tone, for skill cast */
  stinger(vol = 0.5) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 2.5);
    f.connect(g);
    g.connect(this.dry);
    g.connect(this.wet);
    [55, 58.3, 110, 164.8, 233.1].forEach((fr) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = fr;
      o.connect(f);
      o.start(t);
      o.stop(t + 3.3);
    });
  }
}
