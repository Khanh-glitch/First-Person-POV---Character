import * as THREE from 'three';
import { ArmRig } from './arm';
import { Sfx } from './audio';
import { Bursts, Debris, Decals, Rings } from './effects';
import { Particles } from './particles';
import { Post } from './post';
import { DECK_R, Target, World, makeGradient } from './world';
import { MOVES } from './moves';

export interface Callbacks {
  onMoveStart: (id: number) => void;
  onMoveEnd: () => void;
}

export interface AimInfo {
  point: THREE.Vector3;
  dir: THREE.Vector3;
  target: Target | null;
  dist: number;
}

interface Look {
  skin: number; emi: number; emiI: number; line: number; tint: number; tintAmt: number; mood: number; vig: number; pulse: number; sat: number;
}
const LOOKS: Record<number, Look> = {
  0: { skin: 0xf0b48c, emi: 0x000000, emiI: 0, line: 0x1a0d08, tint: 0xffffff, tintAmt: 0, mood: 0, vig: 0.55, pulse: 0xff2a2a, sat: 1.08 },
  2: { skin: 0xff7f6e, emi: 0xff2a14, emiI: 0.4, line: 0x2a0606, tint: 0xffc8c8, tintAmt: 0.28, mood: 0, vig: 0.7, pulse: 0xff2a2a, sat: 1.2 },
  3: { skin: 0xf6a37c, emi: 0x6a1a08, emiI: 0.25, line: 0x1a0d08, tint: 0xffe2c0, tintAmt: 0.2, mood: 0, vig: 0.7, pulse: 0xff6a2a, sat: 1.15 },
  4: { skin: 0x17171f, emi: 0x7a0010, emiI: 0.35, line: 0x000000, tint: 0xffa8a8, tintAmt: 0.34, mood: 0, vig: 0.85, pulse: 0xff0018, sat: 1.15 },
  5: { skin: 0xf4f7ff, emi: 0x7fb0ff, emiI: 0.16, line: 0x0f1a45, tint: 0xf0f6ff, tintAmt: 0.15, mood: 1, vig: 0.35, pulse: 0xaad4ff, sat: 1.25 },
};

export class Engine {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  world: World;
  post: Post;
  sfx = new Sfx();
  glow = new Particles(5000, true);
  puffs = new Particles(2200, false);
  rings = new Rings(24);
  bursts = new Bursts(14);
  debris: Debris;
  decals = new Decals(6);
  arms: ArmRig[] = [];
  skin: THREE.MeshToonMaterial;
  ghostMat: THREE.MeshToonMaterial;
  hat: THREE.Mesh;
  overlay: HTMLElement;
  host: HTMLElement;
  cb: Callbacks;

  // timing
  time = 0; // sim time
  wtime = 0; // wall time
  hitStopT = 0;
  slowT = 0;
  slowScale = 1;
  raf = 0;
  last = 0;
  disposed = false;

  // camera state
  ptr = new THREE.Vector2(0, 0);
  ptrS = new THREE.Vector2(0, 0);
  trauma = 0;
  fovOff = 0; fovVel = 0; fovGoal = 0;
  pitchBias = 0; rollBias = 0; yawBias = 0;
  pitchBiasGoal = 0; rollBiasGoal = 0;
  baseFov = 72;
  camBase = new THREE.Vector3(0, 1.65, 0);
  camPos = new THREE.Vector3();

  // post state
  g = { radial: 0, speed: 0, chroma: 0.0015, vig: 0.55, pulse: 0, halftone: 0 };
  cur = { radial: 0, speed: 0, chroma: 0.0015, vig: 0.55, pulse: 0, sat: 1.08 };
  flashAmt = 0;
  flashColor = new THREE.Color(1, 1, 1);
  invertT = 0;
  invertTint = new THREE.Color(1, 0.1, 0.1);
  ripple = { t: 99, c: new THREE.Vector2(0.5, 0.5), s: 0, life: 0.7, size: 0.9 };
  speedColor = new THREE.Color(1, 1, 1);
  pulseColor = new THREE.Color(1, 0.1, 0.1);

  // look/gear
  gear = 0;
  lookRate = 3;
  aura = 1;
  auraBase = new THREE.Color();

  // moves
  moveIdx = -1;
  moveT = 0;
  moveState: unknown = null;
  active = false;

  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private auraAcc = [0, 0, 0, 0];
  private lastTick = 0;
  tmpV3 = new THREE.Vector3();

  constructor(host: HTMLElement, overlay: HTMLElement, cb: Callbacks) {
    this.host = host;
    this.overlay = overlay;
    this.cb = cb;
    const w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    const grad = makeGradient();
    this.world = new World(grad);
    const scene = this.world.scene;
    this.baseFov = w / h < 1 ? 92 : 72;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, w / h, 0.03, 1500);
    this.camera.position.copy(this.camBase);
    scene.add(this.camera);

    this.debris = new Debris(700, grad);
    scene.add(this.debris.mesh, this.rings.group, this.bursts.group, this.decals.group, this.puffs.mesh, this.glow.mesh);

    // arms
    this.skin = new THREE.MeshToonMaterial({ color: LOOKS[0].skin, gradientMap: grad, emissive: 0x000000 });
    this.ghostMat = new THREE.MeshToonMaterial({ color: LOOKS[0].skin, gradientMap: grad, transparent: true, opacity: 0.42, depthWrite: false });
    for (let i = 0; i < 10; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const a = new ArmRig(side, i < 2 ? this.skin : this.ghostMat, i >= 2);
      if (i >= 2) a.visible = false;
      this.camera.add(a.group);
      this.arms.push(a);
    }
    this.resetArms();

    // straw hat brim peeking in at the top of the view
    const brimTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d')!;
      g.fillStyle = '#e8c15a';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 90; i++) {
        g.strokeStyle = i % 2 ? 'rgba(160,110,30,0.5)' : 'rgba(255,230,150,0.45)';
        g.lineWidth = 2;
        g.beginPath(); g.arc(128, 128, 6 + i * 1.4, 0, 7); g.stroke();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    this.hat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.52, 0.012, 48),
      [new THREE.MeshToonMaterial({ color: 0xc9a040, gradientMap: grad }), new THREE.MeshToonMaterial({ color: 0xe8c15a, gradientMap: grad }), new THREE.MeshToonMaterial({ map: brimTex, gradientMap: grad })],
    );
    this.hat.position.set(0, 0.405, -0.02);
    this.hat.rotation.x = 0.08;
    this.camera.add(this.hat);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 24, 1, true), new THREE.MeshToonMaterial({ color: 0xc8202a, gradientMap: grad, side: THREE.DoubleSide }));
    band.position.set(0, 0.5, 0.05);
    this.camera.add(band);

    this.post = new Post(this.renderer, scene, this.camera, w, h);
    this.post.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.post.setSize(w, h);

    window.addEventListener('resize', this.onResize);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /* ---------------------------------------------------------------- setup helpers */
  onResize = () => {
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
    this.baseFov = w / h < 1 ? 92 : 72;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  setPointer(nx: number, ny: number) {
    this.ptr.set(THREE.MathUtils.clamp(nx, -1, 1), THREE.MathUtils.clamp(ny, -1, 1));
  }

  restF(side: number, out: THREE.Vector3) {
    return out.set(side * 0.3, -0.3, -0.62);
  }

  resetArms() {
    this.arms.forEach((a, i) => {
      const side = a.side;
      a.shoulder.set(side * 0.4, -0.74, 0.06);
      this.restF(side, a.F);
      a.bend.set(side * 0.16, -0.24, 0.1);
      a.thick = 1; a.thickEnd = 1; a.thinK = 1; a.taper = 1; a.bulge = 0; a.fist = 1; a.curl = 1;
      a.roll = side * -0.22; a.wobble = 0;
      if (i >= 2) a.visible = false;
    });
  }

  /* ---------------------------------------------------------------- spatial helpers */
  toCam(p: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(p).applyMatrix4(this.camera.matrixWorldInverse);
  }
  toWorld(p: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(p).applyMatrix4(this.camera.matrixWorld);
  }

  project(p: THREE.Vector3) {
    const v = this.tmpV.copy(p).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * 100, y: (-v.y * 0.5 + 0.5) * 100, behind: v.z > 1 };
  }

  /** What would a punch thrown at the reticle hit? */
  aim(): AimInfo {
    this.camera.updateMatrixWorld(true);
    const cp = this.camPos.setFromMatrixPosition(this.camera.matrixWorld);
    const dir = new THREE.Vector3(this.ptrS.x, this.ptrS.y, 0.5).unproject(this.camera).sub(cp).normalize();
    let best: Target | null = null;
    let bestScore = 0.14;
    const c = new THREE.Vector3();
    for (const t of this.world.targets) {
      if (!t.alive || t.kind === 'barrel' || t.kind === 'crate') continue;
      t.center(c);
      const v = c.clone().sub(cp);
      const d = v.length();
      const ang = Math.acos(THREE.MathUtils.clamp(dir.dot(v) / d, -1, 1));
      const score = ang - Math.atan((t.radius * t.baseScale) / d);
      if (score < bestScore) { bestScore = score; best = t; }
    }
    if (best) {
      best.center(c);
      const toT = c.clone().sub(cp);
      const dist = toT.length();
      const point = c.clone().addScaledVector(toT.normalize(), -best.radius * best.baseScale * 0.55);
      return { point, dir: point.clone().sub(cp).normalize(), target: best, dist: point.distanceTo(cp) + 0 * dist };
    }
    let dd = 24;
    if (dir.y < -0.01) dd = Math.min(24, (cp.y - 0.8) / -dir.y);
    const point = cp.clone().addScaledVector(dir, dd);
    return { point, dir, target: null, dist: dd };
  }

  /* ---------------------------------------------------------------- effect primitives */
  addTrauma(v: number) { this.trauma = Math.min(1, Math.max(this.trauma, 0) + v); }
  kickFov(v: number) { this.fovVel += v; }
  hitStop(s: number) { this.hitStopT = Math.max(this.hitStopT, s); }
  slowmo(scale: number, dur: number) { this.slowScale = scale; this.slowT = dur; }
  flash(a: number, color: THREE.ColorRepresentation = 0xffffff) { this.flashAmt = Math.max(this.flashAmt, a); this.flashColor.set(color); }
  impactFrame(sec: number, tint: THREE.ColorRepresentation = 0xff1a1a) { this.invertT = Math.max(this.invertT, sec); this.invertTint.set(tint); }
  doRipple(p: THREE.Vector3, s = 0.05, size = 0.9, life = 0.75) {
    const q = this.tmpV.copy(p).project(this.camera);
    this.ripple.c.set(q.x * 0.5 + 0.5, q.y * 0.5 + 0.5);
    this.ripple.t = 0; this.ripple.s = s; this.ripple.size = size; this.ripple.life = life;
  }

  setGear(g: number, rate = 3) {
    this.gear = g;
    this.lookRate = rate;
  }

  /** Comic-book sound-effect text pinned in screen space. */
  text(str: string, opts: { x?: number; y?: number; size?: number; color?: string; rot?: number; sub?: string; world?: THREE.Vector3; cls?: string; life?: number } = {}) {
    const el = document.createElement('div');
    el.className = `sfx-text ${opts.cls ?? ''}`;
    let x = opts.x ?? 50 + (Math.random() - 0.5) * 40;
    let y = opts.y ?? 45 + (Math.random() - 0.5) * 30;
    if (opts.world) {
      const p = this.project(opts.world);
      if (!p.behind) { x = THREE.MathUtils.clamp(p.x + (Math.random() - 0.5) * 12, 12, 88); y = THREE.MathUtils.clamp(p.y + (Math.random() - 0.5) * 10 - 8, 14, 80); }
    }
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.setProperty('--s', `${opts.size ?? 9}vmin`);
    el.style.setProperty('--c', opts.color ?? '#ffe14a');
    el.style.setProperty('--r', `${opts.rot ?? (Math.random() - 0.5) * 24}deg`);
    el.style.setProperty('--life', `${opts.life ?? 1.1}s`);
    el.innerHTML = `<span class="jp">${str}</span>${opts.sub ? `<span class="en">${opts.sub}</span>` : ''}`;
    this.overlay.appendChild(el);
    setTimeout(() => el.remove(), (opts.life ?? 1.1) * 1000 + 100);
  }

  banner(jp: string, en: string, gear: string, color: string) {
    const el = document.createElement('div');
    el.className = 'move-banner';
    el.style.setProperty('--c', color);
    el.innerHTML = `<div class="mb-band"></div><div class="mb-gear">${gear}</div><div class="mb-jp">${jp}</div><div class="mb-en">${en}</div>`;
    this.overlay.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  lightning(a: THREE.Vector3, b: THREE.Vector3, color: number, width = 0.04, jitter = 0.35, segs = 8, life = 0.1) {
    const dir = this.tmpV2.copy(b).sub(a);
    const total = dir.length();
    if (total < 0.01) return;
    dir.divideScalar(total);
    const perp1 = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const perp2 = new THREE.Vector3().crossVectors(dir, perp1);
    let prev = a.clone();
    for (let i = 1; i <= segs; i++) {
      const p = a.clone().addScaledVector(dir, (total * i) / segs);
      if (i < segs) {
        const j = jitter * Math.min(1, total * 0.25) * (Math.random() * 2 - 1);
        const j2 = jitter * Math.min(1, total * 0.25) * (Math.random() * 2 - 1);
        p.addScaledVector(perp1, j).addScaledVector(perp2, j2);
      }
      const mid = prev.clone().add(p).multiplyScalar(0.5);
      const seg = p.clone().sub(prev);
      const l = seg.length();
      seg.normalize();
      this.glow.emit({ pos: mid, vel: seg.multiplyScalar(0.001), life, size0: width, size1: width * 0.5, len: l * 1.15, stretch: 0, c0: 0xffffff, c1: color, a0: 1, a1: 0.2, style: 2 });
      this.glow.emit({ pos: mid, vel: seg, life: life * 1.3, size0: width * 4, size1: width * 4, len: l * 1.3, stretch: 0, c0: color, c1: color, a0: 0.35, a1: 0, style: 2 });
      prev = p;
    }
  }

  private rand(a: number, b: number) { return a + Math.random() * (b - a); }
  private rsphere(out = new THREE.Vector3()) {
    const u = Math.random() * 2 - 1, th = Math.random() * 6.2832, r = Math.sqrt(1 - u * u);
    return out.set(r * Math.cos(th), u, r * Math.sin(th));
  }

  /** The big one – every special-move strike funnels through here. */
  impactFx(p: THREE.Vector3, dir: THREE.Vector3, s: number, color: THREE.ColorRepresentation, o: {
    stop?: number; slow?: [number, number]; shake?: number; flash?: number; frames?: number; debris?: number; crater?: boolean; ripple?: number; text?: [string, string?]; frameTint?: number; mini?: boolean;
  } = {}) {
    const col = new THREE.Color(color);
    const white = new THREE.Color(0xffffff);
    const toCam = this.tmpV2.copy(this.camPos).sub(p).normalize().clone();
    this.bursts.spawn(p.clone().addScaledVector(toCam, 0.3), 2.6 * s, color, o.mini ? 0.3 : 0.5);
    if (!o.mini) this.bursts.spawn(p.clone().addScaledVector(toCam, 0.2).add(this.rsphere().multiplyScalar(s * 0.4)), 1.6 * s, 0xffffff, 0.38);
    const axis = dir.clone();
    this.rings.spawn(p, axis, 0.4 * s, 6.5 * s, o.mini ? 0.35 : 0.65, color, 0.5);
    if (!o.mini) {
      this.rings.spawn(p, axis, 0.2 * s, 12 * s, 1.0, 0xffffff, 0.2);
      if (p.y < 7) this.rings.spawn(new THREE.Vector3(p.x, 0.15, p.z), new THREE.Vector3(0, 1, 0), 0.5 * s, 16 * s, 1.1, color, 0.3);
    }
    if (s >= 1.8) {
      this.rings.spawn(p, axis, 1, 10 * s, 0.75, color, 0, true);
      this.rings.spawn(p, new THREE.Vector3(0, 1, 0), 1, 6 * s, 0.5, 0xffffff, 0, true);
    }
    // sparks
    const nSp = Math.min(260, Math.floor((o.mini ? 14 : 38) * s));
    for (let i = 0; i < nSp; i++) {
      const v = this.rsphere().addScaledVector(dir, -0.45).normalize().multiplyScalar(this.rand(6, 26) * Math.pow(s, 0.6));
      this.glow.emit({
        pos: p, vel: v, life: this.rand(0.3, 0.9), size0: 0.05 * Math.sqrt(s), size1: 0.01, len: 0.3, stretch: 0.05,
        c0: white, c1: col, a0: 1, a1: 0, drag: 1.6, grav: 14, style: 2,
      });
    }
    // fireball glow
    for (let i = 0; i < (o.mini ? 1 : 4); i++) {
      this.glow.emit({ pos: p, vel: this.rsphere().multiplyScalar(2 * s), life: this.rand(0.3, 0.55), size0: 1.2 * s, size1: 4.5 * s, c0: white, c1: col, a0: 0.9, a1: 0, drag: 3, style: 0 });
    }
    // smoke
    const nP = Math.floor((o.mini ? 3 : 10) * s);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up2 = new THREE.Vector3().crossVectors(right, dir);
    for (let i = 0; i < nP; i++) {
      const a = Math.random() * 6.2832;
      const v = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up2, Math.sin(a)).multiplyScalar(this.rand(3, 9) * Math.pow(s, 0.6));
      this.puffs.emit({ pos: p, vel: v, life: this.rand(0.8, 1.5), size0: 0.7 * s, size1: this.rand(2, 3) * s, c0: 0xfff2ea, c1: 0xb698a8, a0: 0.95, a1: 0, drag: 2.4, style: 1 });
    }
    // dust ring along the deck
    if (p.y < 7 && !o.mini) {
      const n = Math.floor(16 + s * 4);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.2832 + Math.random() * 0.3;
        const sp = this.rand(4, 10) * Math.pow(s, 0.6);
        this.puffs.emit({ pos: new THREE.Vector3(p.x, 0.35, p.z), vel: new THREE.Vector3(Math.cos(a) * sp, this.rand(0.4, 2), Math.sin(a) * sp), life: this.rand(1, 1.8), size0: 0.9 * s, size1: this.rand(2.2, 3.4) * s, c0: 0xe6c39a, c1: 0x9a7a6a, a0: 0.9, a1: 0, drag: 2.0, style: 1 });
      }
    }
    // debris
    const nD = o.debris ?? Math.floor(8 * s);
    const cols = [0x9c6a38, 0x6b4220, 0xb88650, 0x7a7488, 0x5a5468];
    for (let i = 0; i < nD; i++) {
      const v = this.rsphere().addScaledVector(dir, 0.6).normalize().multiplyScalar(this.rand(5, 20) * Math.pow(s, 0.6));
      v.y = Math.abs(v.y) + 3;
      this.debris.spawn(p, v, this.rand(0.06, 0.2) * (1 + s * 0.25), cols[Math.floor(Math.random() * cols.length)], 3, Math.random() < 0.4 ? 3 : 1);
    }
    if (o.crater && p.y < 7) this.decals.spawn(p.x, p.z, 3.2 * s);
    // screen
    this.addTrauma(o.shake ?? 0.3 + 0.12 * s);
    this.kickFov(-26 * Math.sqrt(s));
    this.flash(o.flash ?? 0.1 * s, color);
    if (!o.mini) this.doRipple(p, 0.03 + 0.012 * s, 0.9, 0.5 + s * 0.1);
    if (o.stop !== undefined) this.hitStop(o.stop); else if (!o.mini) this.hitStop(0.04 * s);
    if (o.slow) this.slowmo(o.slow[0], o.slow[1]);
    if (o.frames) this.impactFrame(o.frames / 60, o.frameTint ?? 0xff1a1a);
    if (o.text) this.text(o.text[0], { world: p, size: 8 + s * 2.2, sub: o.text[1], color: '#ffe14a' });
    if (!o.mini) {
      this.sfx.hit(Math.min(2, s * 0.6));
      if (s >= 1.5) this.sfx.boom(Math.min(2, s * 0.4));
    } else if (this.wtime - this.lastTick > 0.045) {
      this.lastTick = this.wtime;
      this.sfx.tick();
    }
  }

  /** Apply damage in a radius, returns how many were launched. */
  blast(p: THREE.Vector3, dir: THREE.Vector3, power: number, radius: number, primary: Target | null) {
    const c = new THREE.Vector3();
    let n = 0;
    for (const t of this.world.targets) {
      if (!t.alive) continue;
      t.center(c);
      let pw = 0;
      const d = c.distanceTo(p);
      if (t === primary) pw = power;
      else if (d < radius + t.radius) pw = power * (0.25 + 0.75 * (1 - d / (radius + t.radius)));
      if (pw < 7) continue;
      const out = c.clone().sub(p).setY(0);
      if (out.lengthSq() < 0.01) out.copy(dir);
      out.normalize().multiplyScalar(0.55).addScaledVector(dir, 0.75).normalize();
      const r = t.hit(out, pw);
      if (r === 'launch') {
        n++;
        this.bursts.spawn(c, 1.2 + t.radius * 0.5, 0xffffff, 0.35);
        if (t.kind === 'barrel' || t.kind === 'crate') {
          for (let i = 0; i < 7; i++) this.debris.spawn(c, this.rsphere().multiplyScalar(this.rand(3, 9)).add(out.clone().multiplyScalar(6)), this.rand(0.07, 0.2), 0xa8723a, 2.5, 2.5);
        }
      } else {
        this.bursts.spawn(c, 1 + t.radius * 0.4, 0xffffff, 0.3);
      }
    }
    return n;
  }

  emitAura(dt: number) {
    const g = this.gear;
    const white = new THREE.Color(0xffffff);
    const p = new THREE.Vector3();
    for (let i = 0; i < 2; i++) {
      const a = this.arms[i];
      if (!a.visible) continue;
      const rate = Math.min(this.aura, 3);
      const inView = (t: number) => {
        a.pointAt(t, p);
        return this.toWorld(p, new THREE.Vector3());
      };
      if (g === 2) {
        this.auraAcc[i] += dt * 38 * rate;
        while (this.auraAcc[i] > 1) {
          this.auraAcc[i] -= 1;
          const w = inView(this.rand(0.1, 1));
          this.puffs.emit({ pos: w, vel: new THREE.Vector3(this.rand(-0.4, 0.4), this.rand(0.8, 2), this.rand(-0.4, 0.4)), life: this.rand(0.6, 1.1), size0: 0.09, size1: this.rand(0.25, 0.45), c0: 0xffffff, c1: 0xffc4cc, a0: 0.5, a1: 0, drag: 0.8, style: 1 });
        }
      } else if (g === 3) {
        this.auraAcc[i] += dt * 14 * rate;
        while (this.auraAcc[i] > 1) {
          this.auraAcc[i] -= 1;
          const w = inView(this.rand(0.1, 1));
          this.puffs.emit({ pos: w, vel: new THREE.Vector3(this.rand(-1, 1), this.rand(0.5, 2.5), this.rand(-1, 1)), life: this.rand(0.6, 1.2), size0: 0.14, size1: this.rand(0.3, 0.55), c0: 0xffffff, c1: 0xffd8c0, a0: 0.35, a1: 0, drag: 1, style: 1 });
        }
      } else if (g === 4) {
        this.auraAcc[i] += dt * 60 * rate;
        while (this.auraAcc[i] > 1) {
          this.auraAcc[i] -= 1;
          const w = inView(this.rand(0.05, 1));
          this.glow.emit({ pos: w, vel: this.rsphere().multiplyScalar(this.rand(1.5, 5)), life: this.rand(0.25, 0.55), size0: 0.015, size1: 0.005, len: 0.1, stretch: 0.06, c0: 0xff4050, c1: 0x300008, a0: 1, a1: 0, drag: 1, style: 2 });
          if (Math.random() < 0.12 * rate) {
            const a0 = inView(this.rand(0.05, 0.9));
            const b0 = a0.clone().add(this.rsphere().multiplyScalar(this.rand(0.3, 1.1)));
            this.lightning(a0, b0, Math.random() < 0.5 ? 0xff1030 : 0x9a0a30, 0.012, 0.18, 5, 0.1);
          }
        }
        if (Math.random() < 0.35) {
          const w = inView(this.rand(0.1, 1));
          this.puffs.emit({ pos: w, vel: new THREE.Vector3(this.rand(-0.3, 0.3), this.rand(0.5, 1.4), this.rand(-0.3, 0.3)), life: 0.9, size0: 0.15, size1: 0.5, c0: 0x2a0a14, c1: 0x0a0408, a0: 0.55, a1: 0, drag: 1, style: 1 });
        }
      } else if (g === 5) {
        this.auraAcc[i] += dt * 36 * rate;
        while (this.auraAcc[i] > 1) {
          this.auraAcc[i] -= 1;
          const w = inView(this.rand(0.1, 1));
          this.puffs.emit({ pos: w, vel: new THREE.Vector3(this.rand(-0.8, 0.8), this.rand(0.3, 1.8), this.rand(-0.8, 0.8)), life: this.rand(0.9, 1.5), size0: 0.1, size1: this.rand(0.3, 0.6), c0: 0xffffff, c1: 0xcfe2ff, a0: 0.6, a1: 0, drag: 0.7, style: 1 });
          this.glow.emit({ pos: w, vel: this.rsphere().multiplyScalar(this.rand(1, 3)), life: this.rand(0.4, 0.9), size0: 0.045, size1: 0.0, c0: white, c1: 0x80c0ff, a0: 1, a1: 0, drag: 1.2, style: 0 });
        }
        if (Math.random() < 0.18 * rate) {
          const a0 = inView(this.rand(0.05, 0.9));
          const b0 = a0.clone().add(this.rsphere().multiplyScalar(this.rand(0.4, 1.4)));
          this.lightning(a0, b0, 0x8ec8ff, 0.014, 0.22, 6, 0.09);
        }
      }
    }
  }

  /* ---------------------------------------------------------------- move control */
  trigger(i: number) {
    if (this.active) return false;
    this.sfx.init();
    const m = MOVES[i];
    if (!m) return false;
    this.moveIdx = i;
    this.moveT = 0;
    this.active = true;
    this.aura = 1;
    this.moveState = m.start(this);
    this.cb.onMoveStart(i);
    return true;
  }

  private endMove() {
    const m = MOVES[this.moveIdx];
    m?.end?.(this);
    this.active = false;
    this.moveIdx = -1;
    this.resetArms();
    this.setGear(0, 2);
    this.pitchBiasGoal = 0; this.rollBiasGoal = 0; this.fovGoal = 0;
    this.aura = 1;
    this.cb.onMoveEnd();
  }

  /* ---------------------------------------------------------------- main loop */
  frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const rdt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(rdt);
    this.post.composer.render(rdt);
  };

  step(rdt: number) {
    this.wtime += rdt;
    let ts = 1;
    if (this.slowT > 0) { ts = this.slowScale; this.slowT -= rdt; }
    if (this.hitStopT > 0) { ts = 0.02; this.hitStopT -= rdt; }
    const dt = rdt * ts;
    this.time += dt;
    const time = this.time;

    // reset hold goals
    const g = this.g;
    g.radial = 0; g.speed = 0; g.chroma = 0.0015; g.pulse = 0; g.halftone = 0;
    const look = LOOKS[this.gear] ?? LOOKS[0];
    g.vig = look.vig;
    this.fovGoal = this.active ? this.fovGoal : 0;

    // camera look
    this.ptrS.lerp(this.ptr, 1 - Math.exp(-9 * rdt));
    this.pitchBias += (this.pitchBiasGoal - this.pitchBias) * (1 - Math.exp(-5 * rdt));
    this.rollBias += (this.rollBiasGoal - this.rollBias) * (1 - Math.exp(-6 * rdt));

    // move
    if (this.active) {
      const m = MOVES[this.moveIdx];
      this.moveT += dt;
      m.update(this, this.moveT, dt, this.moveState);
      if (this.moveT >= m.dur) this.endMove();
    } else {
      this.idle(time);
    }

    // camera transform
    this.trauma = Math.max(0, this.trauma - rdt * 1.25);
    const sh = this.trauma * this.trauma;
    const w = this.wtime;
    const yaw = -this.ptrS.x * 0.32 + this.yawBias + sh * 0.055 * (Math.sin(w * 53) + Math.sin(w * 31 + 1.7) * 0.6);
    const pitch = this.ptrS.y * 0.17 + this.pitchBias + sh * 0.05 * (Math.sin(w * 47 + 2.1) + Math.sin(w * 29) * 0.6);
    const roll = this.rollBias + sh * 0.045 * Math.sin(w * 41 + 0.4) + Math.sin(time * 0.7) * 0.004;
    this.camera.rotation.set(pitch, yaw, roll, 'YXZ');
    this.camera.position.copy(this.camBase);
    this.camera.position.x += sh * 0.12 * Math.sin(w * 61);
    this.camera.position.y += sh * 0.12 * Math.sin(w * 57 + 1) + Math.sin(time * 1.5) * 0.012;
    this.fovVel += (this.fovGoal - this.fovOff) * 140 * rdt;
    this.fovVel *= Math.exp(-10 * rdt);
    this.fovOff += this.fovVel * rdt;
    this.camera.fov = this.baseFov + this.fovOff;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    this.camPos.setFromMatrixPosition(this.camera.matrixWorld);

    // gear look blend
    const k = 1 - Math.exp(-this.lookRate * rdt);
    const tc = new THREE.Color(look.skin);
    this.skin.color.lerp(tc, k);
    const ec = new THREE.Color(look.emi).multiplyScalar(look.emiI);
    this.skin.emissive.lerp(ec, k);
    this.ghostMat.color.copy(this.skin.color);
    this.ghostMat.emissive.copy(this.skin.emissive);
    const lc = new THREE.Color(look.line);
    for (const a of this.arms) {
      if (a.outlineMat) (a.outlineMat.uniforms.uColor.value as THREE.Color).lerp(lc, k);
      if (a.handOutline) (a.handOutline.uniforms.uColor.value as THREE.Color).lerp(lc, k);
    }
    const mood = this.world.uniforms.uMood.value + (look.mood - this.world.uniforms.uMood.value) * (1 - Math.exp(-(look.mood > 0.5 ? 2.2 : 1.6) * rdt));

    // arms
    const aw = this.time;
    for (const a of this.arms) a.update(aw);
    this.emitAura(dt);

    // world
    this.world.update(dt, this.wtime, mood);
    this.updateTargetFx(dt);
    this.glow.update(dt);
    this.puffs.update(dt);
    this.rings.update(dt);
    this.bursts.update(dt, this.camera);
    this.debris.update(dt, DECK_R);
    this.decals.update(dt);
    this.hat.visible = true;

    // post uniforms
    const u = this.post.u;
    const c = this.cur;
    const kr = 1 - Math.exp(-(g.radial > c.radial ? 24 : 7) * rdt);
    c.radial += (g.radial - c.radial) * kr;
    c.speed += (g.speed - c.speed) * (1 - Math.exp(-14 * rdt));
    c.chroma += (g.chroma - c.chroma) * (1 - Math.exp(-12 * rdt));
    c.vig += (g.vig - c.vig) * (1 - Math.exp(-5 * rdt));
    c.pulse += (g.pulse - c.pulse) * (1 - Math.exp(-(g.pulse > c.pulse ? 30 : 5) * rdt));
    c.sat += (look.sat - c.sat) * k;
    this.flashAmt = Math.max(0, this.flashAmt - rdt * 3.2);
    this.ripple.t += rdt;
    const ru = this.ripple.t / this.ripple.life;
    u.uRipple.value.set(this.ripple.c.x, this.ripple.c.y, ru * this.ripple.size, ru < 1 ? this.ripple.s * (1 - ru) * (1 - ru) : 0);
    this.invertT = Math.max(0, this.invertT - rdt);
    u.uTime.value = this.wtime;
    u.uRadial.value = c.radial;
    u.uChroma.value = c.chroma + this.trauma * 0.002;
    u.uVignette.value = c.vig;
    u.uSpeed.value = c.speed;
    u.uSpeedColor.value.copy(this.speedColor);
    u.uFlash.value = this.flashAmt;
    u.uFlashColor.value.copy(this.flashColor);
    u.uInvert.value = this.invertT > 0 ? 1 : 0;
    u.uInvertTint.value.copy(this.invertTint);
    u.uPulse.value = c.pulse;
    u.uPulseColor.value.copy(this.pulseColor.set(look.pulse));
    u.uSat.value = c.sat;
    u.uTintAmt.value += (look.tintAmt - u.uTintAmt.value) * k;
    u.uTint.value.lerp(tc.set(look.tint), k);
    u.uHalftone.value = g.halftone;
    this.post.bloom.strength = 0.34 + this.flashAmt * 0.4 + (this.gear === 5 ? 0.0 : 0) + c.pulse * 0.2;
    // radial blur centre follows the reticle
    u.uCenter.value.set(this.ptrS.x * 0.5 + 0.5, this.ptrS.y * 0.5 + 0.5).multiplyScalar(0.55).add(new THREE.Vector2(0.225, 0.225));
  }

  /** Resting stance while nothing special is happening. */
  idle(time: number) {
    const A = this.arms;
    for (let i = 0; i < 2; i++) {
      const a = A[i];
      const s = a.side;
      this.restF(s, a.F);
      a.F.x += Math.sin(time * 1.6 + i * 1.7) * 0.012 + s * Math.sin(time * 0.9) * 0.01;
      a.F.y += Math.sin(time * 2.1 + i * 2.3) * 0.016;
      a.F.z += Math.sin(time * 1.3 + i) * 0.012;
      a.roll = s * -0.22 + Math.sin(time * 1.1 + i) * 0.05;
      a.wobble = 0;
    }
  }

  private updateTargetFx(dt: number) {
    for (const t of this.world.targets) {
      if (t.state === 'fly') {
        t.trailT += dt;
        const p = t.group.position;
        const c = this.tmpV.copy(p).setY(p.y + t.centerY * t.baseScale * 0.5);
        const n = t.kind === 'boss' ? 4 : 1;
        for (let i = 0; i < n; i++) {
          this.puffs.emit({ pos: c.clone().add(this.rsphere().multiplyScalar(t.radius * 0.4)), vel: this.rsphere().multiplyScalar(1.5), life: 0.8, size0: 0.3 * (t.baseScale * 1.3), size1: 1.1 * t.baseScale, c0: 0xffffff, c1: 0xd6c0d0, a0: 0.55, a1: 0, drag: 2, style: 1 });
        }
        const sp = t.vel.length();
        if (sp > 8) this.glow.emit({ pos: c, vel: t.vel.clone().multiplyScalar(-0.15), life: 0.25, size0: 0.08 * t.baseScale, size1: 0, len: 0.6, stretch: 0.03, c0: 0xffffff, c1: 0xffd080, a0: 0.9, a1: 0, style: 2 });
      }
      if (t.vanished) {
        const p = t.lastPos;
        const far = Math.hypot(p.x, p.z) > 45 || p.y > 22;
        if (far) {
          const dir = p.clone().sub(this.camPos).normalize();
          const spot = this.camPos.clone().addScaledVector(dir, 120);
          if (spot.y < 6) spot.y = 6;
          this.bursts.spawn(spot, t.kind === 'boss' ? 26 : 9, 0xffffff, 0.8);
          this.glow.emit({ pos: spot, vel: new THREE.Vector3(), life: 0.9, size0: 30, size1: 2, c0: 0xffffff, c1: 0xaad4ff, a0: 1, a1: 0, style: 0 });
          this.sfx.ping();
          if (t.kind === 'boss') this.text('キラーン ✦', { x: 50, y: 22, size: 9, color: '#ffffff', rot: -6, life: 1.6 });
        } else if (p.y < 0) {
          const sp = new THREE.Vector3(p.x, -1, p.z);
          for (let i = 0; i < 20; i++) this.puffs.emit({ pos: sp, vel: new THREE.Vector3(this.rand(-3, 3), this.rand(5, 12), this.rand(-3, 3)), life: 1.1, size0: 0.6, size1: 1.8, c0: 0xffffff, c1: 0xbfe4ff, a0: 0.9, a1: 0, drag: 1, grav: 12, style: 1 });
        }
      }
    }
  }
}
