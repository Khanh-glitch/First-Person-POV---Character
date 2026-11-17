// Fully procedural sound design (WebAudio) – no external assets needed.
export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  noiseBuf!: AudioBuffer;
  enabled = true;

  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    const ctx = new C();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.85 : 0;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // ocean ambience
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.value = 0.07;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lg = ctx.createGain();
    lg.gain.value = 0.045;
    lfo.connect(lg);
    lg.connect(g.gain);
    lfo.start();
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start();
  }

  setEnabled(b: boolean) {
    this.enabled = b;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(b ? 0.85 : 0, this.ctx.currentTime, 0.05);
  }

  private noise(dur: number, f0: number, f1: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.03, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0, vib = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (vib > 0) {
      const l = ctx.createOscillator();
      l.frequency.value = 22;
      const lg = ctx.createGain();
      lg.gain.value = vib;
      l.connect(lg);
      lg.connect(o.frequency);
      l.start(t);
      l.stop(t + dur);
    }
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  whoosh(dur = 0.4, f0 = 300, f1 = 3200, gain = 0.5) {
    this.noise(dur, f0, f1, 0.9, gain);
  }
  twang(dur = 0.5) {
    this.tone('sine', 520, 140, dur, 0.22, 0, 90);
    this.tone('triangle', 900, 220, dur * 0.7, 0.1, 0, 140);
  }
  stretch(dur = 0.5) {
    this.tone('sawtooth', 160, 700, dur, 0.05, 0, 30);
    this.noise(dur, 400, 1800, 3, 0.1);
  }
  hit(power = 1) {
    this.tone('sine', 150 * (1.2 - power * 0.1), 38, 0.35 + power * 0.1, 0.65);
    this.noise(0.18, 3000, 400, 0.7, 0.45 * Math.min(1.4, power), 'bandpass');
    this.noise(0.4, 1200, 80, 0.6, 0.3 * power, 'lowpass');
  }
  tick() {
    this.noise(0.07, 2600, 500, 1.2, 0.28);
    this.tone('sine', 120, 55, 0.1, 0.35);
  }
  boom(power = 1) {
    this.tone('sine', 90, 24, 1.1 + power * 0.7, 0.9);
    this.noise(1.4 + power * 0.8, 900, 40, 0.5, 0.8 * Math.min(1.5, power), 'lowpass');
    this.noise(0.25, 5000, 600, 0.6, 0.5, 'bandpass');
    this.tone('square', 60, 20, 0.7, 0.18, 0.02);
  }
  hiss(dur = 1) {
    this.noise(dur, 5200, 3200, 0.6, 0.22, 'highpass');
  }
  thump(gain = 0.9) {
    this.tone('sine', 78, 34, 0.28, gain);
    this.tone('sine', 66, 30, 0.3, gain * 0.8, 0.16);
    this.noise(0.12, 200, 60, 0.7, 0.3, 'lowpass');
  }
  zap(dur = 0.25) {
    this.noise(dur, 6500, 1800, 1.5, 0.25, 'bandpass');
    this.tone('sawtooth', 1800, 200, dur, 0.06);
  }
  ping() {
    this.tone('sine', 2400, 2400, 0.9, 0.22);
    this.tone('sine', 3600, 3600, 0.7, 0.1, 0.02);
  }
  laugh() {
    for (let i = 0; i < 5; i++) this.tone('triangle', 420 + (i % 2) * 90, 330, 0.12, 0.09, i * 0.14);
  }
  heartbeat() {
    this.thump(1);
  }
  drumroll(n = 12, gap = 0.06) {
    for (let i = 0; i < n; i++) this.noise(0.05, 900, 300, 1, 0.1 + (i / n) * 0.25, 'bandpass', i * gap);
  }
}
