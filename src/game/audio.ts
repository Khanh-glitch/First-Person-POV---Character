/* Procedural sound design — everything is synthesised with Web Audio, no samples. */

export class AudioFx {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private rev!: GainNode;
  private noiseBuf!: AudioBuffer;
  private muted = false;
  private lastZap = 0;
  private lastHit = 0;
  private ready = false;

  init() {
    if (this.ready) {
      void this.ctx?.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp).connect(ctx.destination);

    // procedural reverb IR
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.rev = ctx.createGain();
    this.rev.gain.value = 0.5;
    this.rev.connect(conv).connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.ready = true;
    void ctx.resume();
    this.ambience();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ready && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }
  get isMuted() {
    return this.muted;
  }

  private get t() {
    return this.ctx!.currentTime;
  }

  private osc(type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number, send = 0, attack = 0.004) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.rev);
    }
    o.start(t0);
    o.stop(t0 + dur + 0.05);
    return { o, g };
  }

  private noise(t0: number, dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, q = 1, send = 0, attack = 0.005) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.rev);
    }
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  private ambience() {
    const ctx = this.ctx!;
    // ocean
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const g = ctx.createGain();
    g.gain.value = 0.11;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lg = ctx.createGain();
    lg.gain.value = 0.06;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    src.connect(lp).connect(g).connect(this.master);
    src.start();
    // wind
    const w = ctx.createBufferSource();
    w.buffer = this.noiseBuf;
    w.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    const wg = ctx.createGain();
    wg.gain.value = 0.025;
    const l2 = ctx.createOscillator();
    l2.frequency.value = 0.07;
    const l2g = ctx.createGain();
    l2g.gain.value = 0.02;
    l2.connect(l2g).connect(wg.gain);
    l2.start();
    w.connect(bp).connect(wg).connect(this.master);
    w.start();
    // slow pad — a calm, lazy chord (Kizaru's easy-going menace)
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 520;
    const pg = ctx.createGain();
    pg.gain.value = 0.035;
    lpf.connect(pg).connect(this.master);
    const s = ctx.createGain();
    s.gain.value = 0.7;
    pg.connect(s).connect(this.rev);
    [73.42, 110, 146.83, 174.61, 220].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (i % 2 ? 1 : -1) * (4 + i * 2);
      o.connect(lpf);
      o.start();
    });
    const pl = ctx.createOscillator();
    pl.frequency.value = 0.05;
    const plg = ctx.createGain();
    plg.gain.value = 180;
    pl.connect(plg).connect(lpf.frequency);
    pl.start();
  }

  /* ---------- one-shots ---------- */

  zap() {
    if (!this.ready) return;
    const t = this.t;
    if (t - this.lastZap < 0.028) return;
    this.lastZap = t;
    const p = 0.8 + Math.random() * 0.6;
    this.osc('sawtooth', 2400 * p, 260 * p, t, 0.09, 0.045, 0.1);
    this.osc('sine', 1200 * p, 200, t, 0.12, 0.05, 0.15);
    this.noise(t, 0.05, 0.04, 'highpass', 5000, 9000);
  }

  hit(power = 1) {
    if (!this.ready) return;
    const t = this.t;
    if (t - this.lastHit < 0.035) return;
    this.lastHit = t;
    this.noise(t, 0.1, 0.08 * power, 'bandpass', 1500, 300, 1.2, 0.2);
    this.osc('sine', 150, 48, t, 0.14, 0.12 * power);
  }

  charge(dur: number, low = false) {
    if (!this.ready) return;
    const t = this.t;
    const ctx = this.ctx!;
    const f0 = low ? 55 : 120;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 12, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(low ? 0.2 : 0.12, t + dur * 0.96);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    o.connect(f).connect(g).connect(this.master);
    const s = ctx.createGain();
    s.gain.value = 0.4;
    g.connect(s).connect(this.rev);
    o.start(t);
    o.stop(t + dur + 0.1);
    this.osc('sine', f0 * 2, f0 * 30, t, dur, 0.07, 0.2, dur * 0.5);
    this.noise(t, dur, 0.1, 'highpass', 800, 9000, 0.8, 0.2, dur * 0.8);
  }

  whoosh(dur: number, f0 = 300, f1 = 3000, vol = 0.2) {
    if (!this.ready) return;
    const t = this.t;
    this.noise(t, dur, vol, 'bandpass', f0, f1, 1.1, 0.25, dur * 0.35);
  }

  boom(size = 1) {
    if (!this.ready) return;
    const t = this.t;
    this.osc('sine', 95, 26, t, 1.1 * size + 0.4, 0.55, 0.3, 0.003);
    this.osc('triangle', 180, 40, t, 0.6 * size, 0.25);
    this.noise(t, 1.3 * size + 0.3, 0.38, 'lowpass', 2400, 60, 0.7, 0.5, 0.002);
    this.noise(t, 0.35, 0.3, 'highpass', 2500, 7000, 0.7);
  }

  slash() {
    if (!this.ready) return;
    const t = this.t;
    this.noise(t, 0.2, 0.2, 'highpass', 1800, 9000, 0.9, 0.15, 0.01);
    this.osc('sine', 2600, 3400, t, 0.5, 0.05, 0.5);
    this.osc('sawtooth', 700, 120, t, 0.16, 0.08);
    this.osc('square', 2200, 2210, t + 0.02, 0.4, 0.015, 0.4);
  }

  ignite() {
    if (!this.ready) return;
    const t = this.t;
    this.noise(t, 0.35, 0.14, 'bandpass', 600, 6000, 1.4, 0.3, 0.08);
    this.osc('sawtooth', 90, 360, t, 0.35, 0.08, 0.2, 0.1);
  }

  tick(i = 0) {
    if (!this.ready) return;
    const t = this.t;
    const f = 880 * Math.pow(2, i / 5);
    this.osc('sine', f, f * 0.98, t, 0.9, 0.14, 0.6);
    this.osc('sine', f * 2.76, f * 2.7, t, 0.5, 0.06, 0.6);
    this.osc('triangle', f * 5.4, f * 5.3, t, 0.25, 0.03, 0.4);
    this.noise(t, 0.08, 0.06, 'highpass', 4000, 9000);
  }

  sting() {
    if (!this.ready) return;
    const t = this.t;
    this.osc('sine', 3200, 3180, t, 2.4, 0.07, 0.5, 0.02);
    this.osc('sine', 4800, 4790, t, 1.6, 0.03, 0.5, 0.02);
    this.noise(t, 1.2, 0.3, 'lowpass', 9000, 400, 0.6, 0.6, 0.002);
    this.osc('sine', 120, 40, t, 1.0, 0.3, 0.2, 0.003);
  }

  ring(dur = 2.5) {
    if (!this.ready) return;
    const t = this.t;
    this.osc('sine', 4200, 4200, t + 0.1, dur, 0.035, 0.1, 0.4);
  }

  beam(dur: number) {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t = this.t;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.08);
    g.gain.setValueAtTime(0.28, t + dur - 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(4200, t + 0.3);
    f.frequency.exponentialRampToValueAtTime(900, t + dur + 0.4);
    f.connect(g).connect(this.master);
    const s = ctx.createGain();
    s.gain.value = 0.4;
    g.connect(s).connect(this.rev);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 17;
    const lg = ctx.createGain();
    lg.gain.value = 9;
    lfo.connect(lg);
    [55, 55.8, 110, 164.8, 220.5].forEach((fr) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      lg.connect(o.frequency);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.6);
    });
    lfo.start(t);
    lfo.stop(t + dur + 0.6);
    this.noise(t, dur + 0.4, 0.22, 'bandpass', 900, 2200, 0.5, 0.3, 0.1);
  }

  blip() {
    if (!this.ready) return;
    const t = this.t;
    this.osc('sine', 1200, 1800, t, 0.1, 0.06);
  }
}
