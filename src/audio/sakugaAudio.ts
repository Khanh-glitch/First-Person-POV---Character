// Procedural Web Audio API Sakuga Sound Engine (Toei Wano / Anime Swordplay inspired)

class SakugaAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambientGain: GainNode | null = null;
  private hakiHumGain: GainNode | null = null;
  private muted = false;
  private initialized = false;

  public unlock(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -10;
      this.compressor.knee.value = 14;
      this.compressor.ratio.value = 6;
      this.compressor.attack.value = 0.002;
      this.compressor.release.value = 0.14;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.72;

      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Generate 2.5 seconds of white/pink hybrid noise buffer
      const length = Math.floor(this.ctx.sampleRate * 2.5);
      this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.35) * 1.4));
      }

      this.startAmbientStorm();
      this.initialized = true;
    } catch {
      // Ignore audio failures gracefully
    }
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.72, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setKingOfHellHum(active: boolean): void {
    if (!this.hakiHumGain || !this.ctx) return;
    this.hakiHumGain.gain.setTargetAtTime(active ? 0.09 : 0.0, this.ctx.currentTime, 0.25);
  }

  private startAmbientStorm(): void {
    if (!this.ctx || !this.compressor || !this.noiseBuffer) return;

    // Rooftop night wind
    const wind = this.ctx.createBufferSource();
    wind.buffer = this.noiseBuffer;
    wind.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 220;
    filter.Q.value = 1.6;

    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 0.16;
    lfoGain.gain.value = 95;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.075;

    wind.connect(filter);
    filter.connect(this.ambientGain);
    this.ambientGain.connect(this.compressor);

    wind.start();
    lfo.start();

    // King of Hell subtle Enma spectral flame drone
    const drone = this.ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 54;

    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 140;
    droneFilter.Q.value = 4;

    this.hakiHumGain = this.ctx.createGain();
    this.hakiHumGain.gain.value = 0;

    drone.connect(droneFilter);
    droneFilter.connect(this.hakiHumGain);
    this.hakiHumGain.connect(this.compressor);
    drone.start();
  }

  private ready(): boolean {
    this.unlock();
    return Boolean(this.ctx && this.compressor && this.noiseBuffer && !this.muted);
  }

  /** Crisp katana steel draw "SHIIING!" */
  public playSheathDraw(pitch = 1.0): void {
    if (!this.ready() || !this.ctx || !this.compressor || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Metallic FM shimmer partials
    const partials = [2180, 3290, 4870, 6420];
    partials.forEach((freq, idx) => {
      if (!this.ctx || !this.compressor) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      const f = freq * pitch;
      osc.frequency.setValueAtTime(f * 0.78, now);
      osc.frequency.exponentialRampToValueAtTime(f * 1.18, now + 0.14);
      osc.frequency.exponentialRampToValueAtTime(f * 1.04, now + 0.55);

      const g = this.ctx.createGain();
      const amp = 0.08 / (idx + 1);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.52 - idx * 0.06);

      osc.connect(g);
      g.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 0.56);
    });

    // Steel friction scrape
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400 * pitch, now);
    bp.frequency.exponentialRampToValueAtTime(6800 * pitch, now + 0.22);
    bp.Q.value = 5.5;

    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.001, now);
    ng.gain.linearRampToValueAtTime(0.18, now + 0.03);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    src.connect(bp);
    bp.connect(ng);
    ng.connect(this.compressor);
    src.start(now);
    src.stop(now + 0.3);
  }

  /** Thumb popping golden tsuba slightly out of scabbard before Iai */
  public playTsubaClink(): void {
    if (!this.ready() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;
    [3450, 5180, 7720].forEach((freq, i) => {
      if (!this.ctx || !this.compressor) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.09 / (i + 1), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.connect(g);
      g.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 0.24);
    });
  }

  /** Iconic delayed anime resheath "KA-CHIN!!" */
  public playKachinResheath(): void {
    if (!this.ready() || !this.ctx || !this.compressor || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Short slide "ka-"
    const slide = this.ctx.createBufferSource();
    slide.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(4600, now);
    hp.Q.value = 4;
    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.12, now);
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    slide.connect(hp);
    hp.connect(sg);
    sg.connect(this.compressor);
    slide.start(now);
    slide.stop(now + 0.07);

    // Sharp crystalline tsuba lock "-CHIN!"
    const lockTime = now + 0.068;
    [1860, 2940, 4420, 6880, 9120].forEach((freq, i) => {
      if (!this.ctx || !this.compressor) return;
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, lockTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.992, lockTime + 0.65);

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, lockTime);
      g.gain.linearRampToValueAtTime(0.16 / (i * 0.7 + 1), lockTime + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, lockTime + 0.62 - i * 0.06);

      osc.connect(g);
      g.connect(this.compressor);
      osc.start(lockTime);
      osc.stop(lockTime + 0.65);
    });
  }

  /** One Piece Toei Conqueror's Haki seismic bass drop + black lightning crackle */
  public playHakiBurst(intensity = 1.0): void {
    if (!this.ready() || !this.ctx || !this.compressor || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Iconic Wano Haoshoku Haki wobbling sub-bass drop
    const sub = this.ctx.createOscillator();
    sub.type = 'sawtooth';
    sub.frequency.setValueAtTime(165, now);
    sub.frequency.exponentialRampToValueAtTime(42, now + 0.18);
    sub.frequency.exponentialRampToValueAtTime(26, now + 0.75);

    // Vibrato wobble characteristic of One Piece Haki SFX
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(28, now);
    lfo.frequency.exponentialRampToValueAtTime(11, now + 0.7);
    lfoGain.gain.value = 14;
    lfo.connect(lfoGain);
    lfoGain.connect(sub.frequency);

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(520, now);
    lp.frequency.exponentialRampToValueAtTime(95, now + 0.72);
    lp.Q.value = 3.2;

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.45 * intensity, now + 0.015);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);

    sub.connect(lp);
    lp.connect(subGain);
    subGain.connect(this.compressor);
    sub.start(now);
    lfo.start(now);
    sub.stop(now + 0.82);
    lfo.stop(now + 0.82);

    // Rapid black lightning electric crackles
    for (let i = 0; i < 4; i++) {
      this.playLightningSnap(now + i * 0.055 + Math.random() * 0.02, 0.7 * intensity);
    }
  }

  public playLightningSnap(startTime?: number, volume = 0.65): void {
    if (!this.ready() || !this.ctx || !this.compressor || !this.noiseBuffer) return;
    const t = startTime ?? this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800 + Math.random() * 2400, t);
    bp.Q.value = 2.6;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.24 * volume, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.065 + Math.random() * 0.04);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.compressor);
    src.start(t, Math.random() * 1.2);
    src.stop(t + 0.12);

    // Electric zap chirp
    const zap = this.ctx.createOscillator();
    zap.type = 'sawtooth';
    zap.frequency.setValueAtTime(1400 + Math.random() * 900, t);
    zap.frequency.exponentialRampToValueAtTime(180, t + 0.055);
    const zg = this.ctx.createGain();
    zg.gain.setValueAtTime(0.08 * volume, t);
    zg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    zap.connect(zg);
    zg.connect(this.compressor);
    zap.start(t);
    zap.stop(t + 0.065);
  }

  /** Supersonic heavy sword cleave + air crescent scream */
  public playSwordSlash(pitch = 1.0, heavy = false): void {
    if (!this.ready() || !this.ctx || !this.compressor || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const dur = heavy ? 0.44 : 0.27;

    // Air tear noise sweep
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(420 * pitch, now);
    bp.frequency.exponentialRampToValueAtTime(2800 * pitch, now + 0.045);
    bp.frequency.exponentialRampToValueAtTime(260 * pitch, now + dur);
    bp.Q.value = heavy ? 1.5 : 2.1;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(heavy ? 0.48 : 0.32, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.compressor);
    src.start(now, Math.random() * 0.8);
    src.stop(now + dur + 0.02);

    // Razor edge whistle
    const edge = this.ctx.createOscillator();
    edge.type = 'triangle';
    edge.frequency.setValueAtTime(2900 * pitch, now);
    edge.frequency.exponentialRampToValueAtTime(620 * pitch, now + dur * 0.65);

    const eg = this.ctx.createGain();
    eg.gain.setValueAtTime(0.001, now);
    eg.gain.linearRampToValueAtTime(heavy ? 0.16 : 0.1, now + 0.01);
    eg.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.65);

    edge.connect(eg);
    eg.connect(this.compressor);
    edge.start(now);
    edge.stop(now + dur * 0.7);

    if (heavy) {
      // Low impact punch
      const punch = this.ctx.createOscillator();
      punch.type = 'sine';
      punch.frequency.setValueAtTime(190, now);
      punch.frequency.exponentialRampToValueAtTime(34, now + 0.28);
      const pg = this.ctx.createGain();
      pg.gain.setValueAtTime(0.42, now);
      pg.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      punch.connect(pg);
      pg.connect(this.compressor);
      punch.start(now);
      punch.stop(now + 0.32);
    }
  }

  /** Massive anime detonation & monolith boulder fracture */
  public playImpactExplosion(scale = 1.0): void {
    if (!this.ready() || !this.ctx || !this.compressor || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const dur = Math.min(1.6, 0.78 * scale);

    // Seismic sub slam
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(135, now);
    sub.frequency.exponentialRampToValueAtTime(24, now + dur);

    const sg = this.ctx.createGain();
    sg.gain.setValueAtTime(0.001, now);
    sg.gain.linearRampToValueAtTime(Math.min(0.68, 0.52 * scale), now + 0.008);
    sg.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    sub.connect(sg);
    sg.connect(this.compressor);
    sub.start(now);
    sub.stop(now + dur + 0.04);

    // Distorted explosion roar
    const roar = this.ctx.createBufferSource();
    roar.buffer = this.noiseBuffer;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1900, now);
    lp.frequency.exponentialRampToValueAtTime(140, now + dur);

    const rg = this.ctx.createGain();
    rg.gain.setValueAtTime(0.001, now);
    rg.gain.linearRampToValueAtTime(Math.min(0.58, 0.42 * scale), now + 0.012);
    rg.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    roar.connect(lp);
    lp.connect(rg);
    rg.connect(this.compressor);
    roar.start(now);
    roar.stop(now + dur + 0.05);

    // Anime glass/plasma beam Zing (Toei Wano signature!)
    const zing = this.ctx.createOscillator();
    zing.type = 'sawtooth';
    zing.frequency.setValueAtTime(980, now);
    zing.frequency.exponentialRampToValueAtTime(210, now + 0.35);
    const zbp = this.ctx.createBiquadFilter();
    zbp.type = 'bandpass';
    zbp.frequency.value = 820;
    zbp.Q.value = 3;
    const zg = this.ctx.createGain();
    zg.gain.setValueAtTime(0.14 * scale, now);
    zg.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    zing.connect(zbp);
    zbp.connect(zg);
    zg.connect(this.compressor);
    zing.start(now);
    zing.stop(now + 0.38);
  }

  /** Focused heartbeat for Breath of All Things (Shishi Sonson) */
  public playHeartbeat(): void {
    if (!this.ready() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;
    [0, 0.21].forEach((offset, i) => {
      if (!this.ctx || !this.compressor) return;
      const t = now + offset;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(i === 0 ? 74 : 62, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.16);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(i === 0 ? 0.38 : 0.26, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(g);
      g.connect(this.compressor);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  /** Spinning propeller blades for Sanzen Sekai */
  public playSpinWhoosh(speed = 1.0): void {
    if (!this.ready() || !this.ctx || !this.compressor || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(480 * speed, now);
    bp.frequency.exponentialRampToValueAtTime(1400 * speed, now + 0.08);
    bp.frequency.exponentialRampToValueAtTime(520 * speed, now + 0.16);
    bp.Q.value = 3.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.17);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.compressor);
    src.start(now, Math.random());
    src.stop(now + 0.18);
  }

  /** Swirling cyclonic wind for Kokujo O Tatsumaki */
  public playTornadoVortex(duration = 2.1): void {
    if (!this.ready() || !this.ctx || !this.compressor || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 540;
    bp.Q.value = 2.4;

    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    lfo.frequency.value = 7.5;
    lfoG.gain.value = 340;
    lfo.connect(lfoG);
    lfoG.connect(bp.frequency);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.36, now + 0.18);
    g.gain.setValueAtTime(0.32, now + duration * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(bp);
    bp.connect(g);
    g.connect(this.compressor);
    src.start(now);
    lfo.start(now);
    src.stop(now + duration + 0.05);
    lfo.stop(now + duration + 0.05);
  }

  /** Ominous Buddhist temple bell for Kyutoryu: Ashura */
  public playAshuraBell(): void {
    if (!this.ready() || !this.ctx || !this.compressor) return;
    const now = this.ctx.currentTime;
    const ratios = [1, 2.01, 2.76, 4.07, 5.43];
    const base = 138.6;
    ratios.forEach((r, idx) => {
      if (!this.ctx || !this.compressor) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(base * r, now);
      const g = this.ctx.createGain();
      const amp = 0.24 / (idx * 0.85 + 1);
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(amp, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 2.3 - idx * 0.28);
      osc.connect(g);
      g.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 2.35);
    });
  }

  /** Ferocious spectral Flying Dragon roar for Ippyakusanjo Hiryu Jigoku */
  public playDragonRoar(): void {
    if (!this.ready() || !this.ctx || !this.compressor || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Growling harmonic chord sweep
    [92, 138, 185, 277].forEach((freq, i) => {
      if (!this.ctx || !this.compressor) return;
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * 0.85, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.42, now + 0.25);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.62, now + 1.35);

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(340 + i * 220, now);
      bp.frequency.exponentialRampToValueAtTime(760 + i * 180, now + 0.3);
      bp.frequency.exponentialRampToValueAtTime(220 + i * 110, now + 1.3);
      bp.Q.value = 3.5;

      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.16, now + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);

      osc.connect(bp);
      bp.connect(g);
      g.connect(this.compressor);
      osc.start(now);
      osc.stop(now + 1.45);
    });

    // Roaring dragon breath fire
    const fire = this.ctx.createBufferSource();
    fire.buffer = this.noiseBuffer;
    const flp = this.ctx.createBiquadFilter();
    flp.type = 'bandpass';
    flp.frequency.setValueAtTime(650, now);
    flp.frequency.exponentialRampToValueAtTime(1600, now + 0.3);
    flp.frequency.exponentialRampToValueAtTime(320, now + 1.3);
    flp.Q.value = 1.4;
    const fg = this.ctx.createGain();
    fg.gain.setValueAtTime(0.001, now);
    fg.gain.linearRampToValueAtTime(0.35, now + 0.1);
    fg.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
    fire.connect(flp);
    flp.connect(fg);
    fg.connect(this.compressor);
    fire.start(now);
    fire.stop(now + 1.4);
  }

  /** Crisp black bandana tie snap */
  public playBandanaSnap(): void {
    if (!this.ready() || !this.ctx || !this.compressor || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(950, now);
    bp.frequency.exponentialRampToValueAtTime(2200, now + 0.09);
    bp.Q.value = 2.0;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.28, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.compressor);
    src.start(now);
    src.stop(now + 0.16);
  }
}

export const sakugaAudio = new SakugaAudioEngine();
