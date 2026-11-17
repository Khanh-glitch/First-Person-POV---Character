// Fully procedural WebAudio sound design — no external assets.
export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  comp!: DynamicsCompressorNode;
  reverb!: ConvolverNode;
  reverbGain!: GainNode;
  musicGain!: GainNode;
  noiseBuf!: AudioBuffer;
  musicTimer: number | null = null;

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.comp).connect(ctx.destination);
    // reverb impulse
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.35;
    this.reverb.connect(this.reverbGain).connect(this.master);
    // noise
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.16;
    this.musicGain.connect(this.master);
    this.musicGain.connect(this.reverb);
  }

  private out(g: GainNode, wet = 0.4) {
    g.connect(this.master);
    if (wet > 0) {
      const w = this.ctx!.createGain();
      w.gain.value = wet;
      g.connect(w).connect(this.reverb);
    }
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(type: OscillatorType, f0: number, f1: number, dur: number, vol = 0.3, wet = 0.4, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = c.createGain();
    this.env(g, t, 0.01, vol, dur);
    o.connect(g);
    this.out(g, wet);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur: number, vol: number, type: BiquadFilterType, f0: number, f1: number, q = 1, wet = 0.3, delay = 0, attack = 0.005) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(f1, 10), t + dur);
    const g = c.createGain();
    this.env(g, t, attack, vol, dur);
    s.connect(f).connect(g);
    this.out(g, wet);
    s.start(t, Math.random());
    s.stop(t + dur + attack + 0.05);
  }

  sparkle(n = 6, base = 1200, vol = 0.08) {
    for (let i = 0; i < n; i++) {
      const f = base * Math.pow(2, Math.floor(Math.random() * 12) / 12 + Math.floor(Math.random() * 2));
      this.tone("sine", f, f * 1.01, 0.35, vol, 0.7, i * 0.04);
    }
  }

  kiss() {
    // "mwah" - lip smack + formant
    this.noise(0.05, 0.4, "bandpass", 2500, 900, 3, 0.1);
    this.tone("sine", 520, 900, 0.18, 0.18, 0.4, 0.03);
    this.tone("triangle", 1046, 1568, 0.25, 0.08, 0.6, 0.06);
    this.noise(0.25, 0.12, "highpass", 4000, 8000, 0.7, 0.6, 0.05);
    this.sparkle(3, 1500, 0.05);
  }

  heartHit() {
    this.tone("sine", 880, 220, 0.25, 0.25, 0.3);
    this.noise(0.15, 0.25, "lowpass", 3000, 300, 1, 0.3);
    this.sparkle(4, 1760, 0.05);
  }

  petrify() {
    for (let i = 0; i < 8; i++) this.noise(0.04, 0.18, "bandpass", 1800 + Math.random() * 3000, 600, 6, 0.2, i * 0.04 + Math.random() * 0.02);
    this.tone("sine", 160, 60, 0.6, 0.2, 0.3);
    this.tone("triangle", 1318, 1318, 0.6, 0.04, 0.8, 0.1);
  }

  shatter() {
    this.noise(0.6, 0.55, "lowpass", 6000, 200, 0.8, 0.4);
    for (let i = 0; i < 10; i++) this.noise(0.05, 0.15, "bandpass", 2000 + Math.random() * 6000, 1000, 8, 0.3, Math.random() * 0.3);
    this.tone("sine", 120, 40, 0.4, 0.4, 0.2);
  }

  arrowCharge(level: number) {
    this.tone("sine", 400 + level * 600, 420 + level * 620, 0.12, 0.04, 0.5);
  }

  arrowRelease(n: number) {
    this.noise(0.35, 0.35, "bandpass", 3000, 600, 2, 0.3);
    this.tone("sawtooth", 900, 200, 0.3, 0.06, 0.3);
    for (let i = 0; i < Math.min(n, 10); i++) this.noise(0.12, 0.08, "highpass", 5000, 2000, 1, 0.2, i * 0.03);
    this.sparkle(6, 1320, 0.05);
  }

  mellowCharge() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    // choir-ish swell
    [261.6, 329.6, 392, 523.2].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 1.5, t + 1.0);
      const fl = c.createBiquadFilter();
      fl.type = "lowpass";
      fl.frequency.setValueAtTime(400, t);
      fl.frequency.exponentialRampToValueAtTime(4000, t + 1.0);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      o.detune.value = (i - 1.5) * 8;
      o.connect(fl).connect(g);
      this.out(g, 0.8);
      o.start(t);
      o.stop(t + 1.3);
    });
    this.noise(1.0, 0.15, "bandpass", 300, 5000, 2, 0.6, 0, 0.9);
    this.sparkle(10, 1046, 0.04);
  }

  mellowFire() {
    if (!this.ctx) return;
    this.tone("sine", 70, 30, 1.8, 0.6, 0.2);
    this.noise(2.2, 0.5, "lowpass", 8000, 400, 0.7, 0.6, 0, 0.02);
    this.noise(2.0, 0.2, "bandpass", 1200, 3000, 4, 0.8, 0.1, 0.1);
    const c = this.ctx;
    const t = c.currentTime;
    [523.2, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => {
      const o = c.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.05 + i * 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(g);
      this.out(g, 0.9);
      o.start(t);
      o.stop(t + 2.3);
    });
  }

  whoosh() {
    this.noise(0.35, 0.5, "bandpass", 400, 3000, 1.5, 0.2);
  }

  kickImpact() {
    this.tone("sine", 140, 35, 0.5, 0.8, 0.2);
    this.noise(0.25, 0.6, "lowpass", 5000, 200, 1, 0.3);
    this.tone("square", 80, 30, 0.2, 0.15, 0.1);
  }

  haki() {
    if (!this.ctx) return;
    this.tone("sine", 55, 20, 3, 0.9, 0.5);
    this.tone("sawtooth", 110, 27, 2.5, 0.25, 0.6);
    this.noise(3, 0.6, "lowpass", 2000, 60, 1, 0.8, 0, 0.01);
    for (let i = 0; i < 14; i++) this.noise(0.08, 0.3, "highpass", 3000, 1000, 1, 0.5, Math.random() * 1.6);
  }

  hurt() {
    this.tone("square", 220, 80, 0.2, 0.15, 0.1);
    this.noise(0.15, 0.3, "lowpass", 1500, 200, 1, 0.1);
  }

  enemyGasp() {
    const f = 300 + Math.random() * 200;
    this.tone("sine", f, f * 1.8, 0.2, 0.05, 0.4);
  }

  ui() {
    this.tone("sine", 1318, 1760, 0.12, 0.12, 0.5);
  }

  startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    const c = this.ctx;
    // Dm - Bb - F - C ... romantic-epic progression
    const chords = [
      [146.8, 174.6, 220, 293.7],
      [116.5, 146.8, 174.6, 233.1],
      [174.6, 220, 261.6, 349.2],
      [130.8, 164.8, 196, 261.6],
    ];
    let step = 0;
    const bar = 2.4;
    const play = () => {
      const t = c.currentTime + 0.05;
      const ch = chords[step % chords.length];
      ch.forEach((f, i) => {
        const o = c.createOscillator();
        o.type = i === 0 ? "triangle" : "sawtooth";
        o.frequency.value = i === 0 ? f / 2 : f;
        const fl = c.createBiquadFilter();
        fl.type = "lowpass";
        fl.frequency.value = 900;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(i === 0 ? 0.35 : 0.08, t + 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + bar + 0.4);
        o.connect(fl).connect(g).connect(this.musicGain);
        o.start(t);
        o.stop(t + bar + 0.5);
      });
      // arpeggio
      for (let k = 0; k < 8; k++) {
        const f = ch[k % 4] * (k >= 4 ? 4 : 2);
        const o = c.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        const g = c.createGain();
        const tt = t + k * (bar / 8);
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.09, tt + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.5);
        o.connect(g).connect(this.musicGain);
        o.start(tt);
        o.stop(tt + 0.55);
      }
      // taiko
      [0, 0.9, 1.2, 1.8].forEach((o2) => {
        const o = c.createOscillator();
        o.type = "sine";
        const tt = t + o2;
        o.frequency.setValueAtTime(110, tt);
        o.frequency.exponentialRampToValueAtTime(40, tt + 0.3);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.5, tt + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.35);
        o.connect(g).connect(this.musicGain);
        o.start(tt);
        o.stop(tt + 0.4);
      });
      step++;
    };
    play();
    this.musicTimer = window.setInterval(play, bar * 1000);
  }

  stopMusic() {
    if (this.musicTimer !== null) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  duckMusic(amount: number, dur: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setValueAtTime(0.16 * amount, t);
    this.musicGain.gain.linearRampToValueAtTime(0.16, t + dur);
  }
}

export const sfx = new Sfx();
