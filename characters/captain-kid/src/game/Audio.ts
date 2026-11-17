/** Fully synthesised sound design — no audio files. */
export class AudioSys {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private noise!: AudioBuffer;
  private shaper!: Float32Array<ArrayBuffer>;
  muted = false;
  private lastClank = 0;
  private lastZap = 0;

  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.shaper = new Float32Array(new ArrayBuffer(1024 * 4));
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      this.shaper[i] = Math.tanh(x * 5);
    }
    this.ambient();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private nz(t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack = 0.005) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + attack + 0.05);
  }

  private osc(t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.004, dest?: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t); o.stop(t + dur + attack + 0.05);
  }

  private ambient() {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 320; f.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.09;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
    const lg = ctx.createGain(); lg.gain.value = 180;
    lfo.connect(lg).connect(f.frequency);
    s.connect(f).connect(g).connect(this.master);
    s.start(); lfo.start();
    for (const fr of [41, 41.6, 82.5]) {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = fr;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 130;
      const og = ctx.createGain(); og.gain.value = 0.035;
      o.connect(lp).connect(og).connect(this.master); o.start();
    }
  }

  zap(vol = 0.25) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastZap < 0.03) return;
    this.lastZap = t;
    this.nz(t, 0.07 + Math.random() * 0.08, "highpass", 2500 + Math.random() * 3000, 900, 1.5, vol);
    this.osc(t, "square", 900 + Math.random() * 1600, 90, 0.08, vol * 0.25);
  }

  clank(vol = 0.2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastClank < 0.028) return;
    this.lastClank = t;
    const base = 240 + Math.random() * 900;
    const parts = [1, 2.76, 5.4, 8.93];
    parts.forEach((p, i) => this.osc(t, i % 2 ? "triangle" : "sine", base * p, base * p * 0.985, 0.12 + Math.random() * 0.3, (vol * 0.5) / (i + 1), 0.001));
    this.nz(t, 0.04, "bandpass", 3200, 1500, 2, vol * 0.7, 0.001);
  }

  boom(power = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc(t, "sine", 130, 24, 1.3 * power + 0.3, 1.0 * power, 0.004);
    this.osc(t, "triangle", 68, 30, 0.7 * power + 0.2, 0.6 * power, 0.002);
    this.nz(t, 1.2 * power + 0.3, "lowpass", 1800, 50, 0.7, 0.9 * power, 0.002);
    this.nz(t, 0.25, "highpass", 1800, 4500, 0.7, 0.35 * power, 0.001);
    // metal ring-out
    const base = 110 + Math.random() * 60;
    [1, 2.31, 3.9, 6.2].forEach((p, i) => this.osc(t, "sine", base * p, base * p * 0.97, 1.4, (0.16 * power) / (i + 1), 0.002));
  }

  whoosh(dur = 0.5, vol = 0.4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.nz(t, dur, "bandpass", 250, 2600, 1.2, vol, dur * 0.5);
  }

  charge(dur: number, vol = 0.35) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.Q.value = 6;
    lp.frequency.setValueAtTime(140, t);
    lp.frequency.exponentialRampToValueAtTime(5200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    const trem = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.type = "square";
    lfo.frequency.setValueAtTime(9, t);
    lfo.frequency.exponentialRampToValueAtTime(70, t + dur);
    const lg = ctx.createGain(); lg.gain.value = 0.4;
    trem.gain.value = 0.6;
    lfo.connect(lg).connect(trem.gain);
    lp.connect(trem).connect(g).connect(this.master);
    for (const m of [1, 1.503, 2.01]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(48 * m, t);
      o.frequency.exponentialRampToValueAtTime(420 * m, t + dur);
      o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
    lfo.start(t); lfo.stop(t + dur + 0.1);
    this.nz(t, dur, "bandpass", 300, 7000, 3, vol * 0.5, dur * 0.8);
  }

  beam(dur: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const ws = ctx.createWaveShaper();
    ws.curve = this.shaper;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.75, t + 0.03);
    g.gain.setValueAtTime(0.75, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    const pre = ctx.createGain(); pre.gain.value = 0.5;
    pre.connect(ws).connect(g).connect(this.master);
    for (const f of [55, 82.7, 110.6, 221, 333]) {
      const o = ctx.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 1.6, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.25);
      o.frequency.linearRampToValueAtTime(f * 0.8, t + dur + 0.5);
      o.connect(pre); o.start(t); o.stop(t + dur + 0.6);
    }
    this.nz(t, dur + 0.4, "highpass", 900, 2600, 0.7, 0.5, 0.02);
    this.nz(t, dur + 0.6, "lowpass", 300, 60, 0.7, 0.9, 0.02);
  }

  hum(dur: number, vol = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc(t, "sawtooth", 62, 58, dur, vol * 0.5, dur * 0.3);
    this.osc(t, "sine", 124.5, 118, dur, vol, dur * 0.3);
    this.osc(t, "sine", 249, 380, dur, vol * 0.35, dur * 0.5);
  }

  rumble(dur: number, vol = 0.5) {
    if (!this.ctx) return;
    this.nz(this.ctx.currentTime, dur, "lowpass", 90, 180, 0.8, vol, dur * 0.4);
  }
}
