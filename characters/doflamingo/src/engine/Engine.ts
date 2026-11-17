import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { World } from "./World";
import { Hands } from "./Hands";
import { Effects } from "./fx/Effects";
import { ParticlePool } from "./fx/Particles";
import { StringBatch, curvePts } from "./fx/Strings";
import { AnimeGradeShader } from "./Post";
import { audio } from "./Audio";
import { createMove, MOVE_LIST, type Move } from "./moves";

export type EngineEvent =
  | { type: "title"; id: string; kanji: string; romaji: string; en: string; color: string }
  | { type: "sfx"; text: string; x: number; y: number; size: number; color: string; rot: number }
  | { type: "cinema"; on: boolean }
  | { type: "moveEnd" }
  | { type: "caption"; text: string };

interface Projectile {
  origin: THREE.Vector3;
  originFn?: () => THREE.Vector3;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  dist: number;
  maxDist: number;
  color: THREE.Color;
  onHit: (p: THREE.Vector3) => void;
  trail: number;
  alive: boolean;
  t: number;
  fade: number;
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  world: World;
  hands: Hands;
  fx: Effects;
  glow: ParticlePool;
  smoke: ParticlePool;
  thin: StringBatch;
  mid: StringBatch;
  thick: StringBatch;
  audio = audio;
  overlay: HTMLCanvasElement;
  octx: CanvasRenderingContext2D;
  listeners: ((e: EngineEvent) => void)[] = [];
  time = 0;
  timeScale = 1;
  slowmo = { t: 0, dur: 0, scale: 1 };
  move: Move | null = null;
  queue: string[] = [];
  autoplay = false;
  autoplayIdx = 0;
  idleTimer = 0;
  projectiles: Projectile[] = [];

  // camera rig
  basePos = new THREE.Vector3(0, 11.75, 1.5);
  yaw = 0;
  pitch = -0.04;
  moveYaw = 0;
  movePitch = 0;
  moveYawT = 0;
  movePitchT = 0;
  lookSpeed = 3;
  mouse = new THREE.Vector2();
  mouseSmooth = new THREE.Vector2();
  mouseDelta = new THREE.Vector2();
  private lastMouse = new THREE.Vector2();
  trauma = 0;
  fovBase = 72;
  fovKickV = 0;
  fovOffset = 0;
  fovTarget = 0;
  chromaV = 0;
  zoomV = 0;
  flashV = 0;
  impactV = 0;
  impactInvert = 1;
  speedLines = 0;
  speedLinesT = 0;
  tintAmt = 0;
  tintTarget = 0;
  stormTarget = 0;
  cinema = false;
  private clock = new THREE.Timer();
  private raf = 0;
  private tips: THREE.Vector3[] = [];
  private tmpPts: THREE.Vector3[] = [];
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private col = new THREE.Color();
  private raycaster = new THREE.Raycaster();
  disposed = false;

  constructor(container: HTMLElement, overlay: HTMLCanvasElement) {
    this.overlay = overlay;
    this.octx = overlay.getContext("2d")!;
    const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    r.setSize(container.clientWidth, container.clientHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    container.appendChild(r.domElement);
    this.renderer = r;

    this.camera = new THREE.PerspectiveCamera(this.fovBase, container.clientWidth / container.clientHeight, 0.02, 6000);
    this.scene.add(this.camera);

    this.world = new World(this.scene);
    this.fx = new Effects();
    this.fx.groundAt = this.world.groundAt;
    this.scene.add(this.fx.group);
    this.glow = new ParticlePool(7000, "glow");
    this.smoke = new ParticlePool(2200, "smoke");
    this.scene.add(this.glow.points, this.smoke.points);
    this.world.fx = this.fx;
    this.world.glow = this.glow;
    this.world.smoke = this.smoke;

    this.hands = new Hands();
    this.camera.add(this.hands.group);

    this.thin = new StringBatch(9000, 1.6);
    this.mid = new StringBatch(5000, 3.5);
    this.thick = new StringBatch(2000, 11);
    this.scene.add(this.thin.mesh, this.mid.mesh, this.thick.mesh);

    // composer
    const size = new THREE.Vector2(container.clientWidth, container.clientHeight);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(size, 0.7, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(AnimeGradeShader);
    this.composer.addPass(this.grade);
    this.resize(container.clientWidth, container.clientHeight);

    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  on(fn: (e: EngineEvent) => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }
  emit(e: EngineEvent) {
    this.listeners.forEach((f) => f(e));
  }

  resize(w: number, h: number) {
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    [this.thin, this.mid, this.thick].forEach((b) => b.setResolution(w * pr, h * pr));
    this.grade.uniforms.uAspect.value = w / h;
    this.glow.mat.uniforms.uScale.value = h * pr * 0.32;
    this.smoke.mat.uniforms.uScale.value = h * pr * 0.4;
    this.overlay.width = w;
    this.overlay.height = h;
  }

  setMouse(nx: number, ny: number) {
    this.mouse.set(nx, ny);
  }

  // ---------- feedback API for moves ----------
  shake(a: number) {
    this.trauma = Math.min(1.2, this.trauma + a);
  }
  fovKick(deg: number) {
    this.fovKickV += deg * 12;
  }
  impact(strength = 1, invert = true) {
    this.impactV = strength;
    this.impactInvert = invert ? 1 : 0;
  }
  flash(a = 1, color = 0xffffff) {
    this.flashV = Math.max(this.flashV, a);
    this.grade.uniforms.uFlashColor.value.set(color);
  }
  chroma(a: number) {
    this.chromaV = Math.max(this.chromaV, a);
  }
  zoomBlur(a: number) {
    this.zoomV = Math.max(this.zoomV, a);
  }
  speed(a: number, dur = 0.6) {
    this.speedLines = Math.max(this.speedLines, a);
    this.speedLinesT = Math.max(this.speedLinesT, dur);
  }
  slow(scale: number, dur: number) {
    this.slowmo = { t: 0, dur, scale };
  }
  look(yaw: number, pitch: number, speed = 3) {
    this.moveYawT = yaw;
    this.movePitchT = pitch;
    this.lookSpeed = speed;
  }
  setCinema(on: boolean) {
    if (this.cinema === on) return;
    this.cinema = on;
    this.emit({ type: "cinema", on });
  }
  sfx(text: string, opts: { x?: number; y?: number; size?: number; color?: string; rot?: number } = {}) {
    this.emit({
      type: "sfx",
      text,
      x: opts.x ?? 0.2 + Math.random() * 0.6,
      y: opts.y ?? 0.2 + Math.random() * 0.4,
      size: opts.size ?? 1,
      color: opts.color ?? "#ffffff",
      rot: opts.rot ?? (Math.random() - 0.5) * 24,
    });
  }
  /** project a world position to normalized screen coords */
  toScreen(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  }

  fireBullet(opts: {
    origin: THREE.Vector3;
    originFn?: () => THREE.Vector3;
    target: THREE.Vector3;
    speed?: number;
    color?: number;
    onHit?: (p: THREE.Vector3) => void;
    trail?: number;
  }) {
    const dir = opts.target.clone().sub(opts.origin);
    const maxDist = dir.length();
    dir.normalize();
    this.projectiles.push({
      origin: opts.origin.clone(),
      originFn: opts.originFn,
      pos: opts.origin.clone(),
      dir,
      speed: opts.speed ?? 220,
      dist: 0,
      maxDist,
      color: new THREE.Color(opts.color ?? 0xffffff),
      onHit: opts.onHit ?? (() => {}),
      trail: opts.trail ?? 6,
      alive: true,
      t: 0,
      fade: 1,
    });
  }

  /** default bullet impact */
  bulletImpact(p: THREE.Vector3, color = 0xffd0f0, big = 1) {
    this.glow.emit({ pos: p, count: Math.floor(18 * big), speed: 14 * big, color, color2: 0xffffff, size: 0.45 * big, life: 0.4, gravity: 14, drag: 0.94 });
    this.smoke.emit({ pos: p, count: Math.floor(5 * big), speed: 2.5, color: 0x8a7068, size: 3 * big, life: 1.3, grow: 1.4 });
    this.fx.ring(p, 0.1, 1.3 * big, 0.3, 0x9a6080, { face: true, thick: 0.2 });
    this.fx.flashLight(p, 0xffc0e0, 140 * big, 0.2, 18 * big);
    // puppets nearby
    for (const pp of this.world.puppets) {
      const d = pp.root.position.distanceTo(p);
      if (d < 2.2 * big) {
        const dir = pp.root.position.clone().sub(this.camera.position).setY(0).normalize();
        this.world.hitPuppet(pp, dir, big > 1.4 ? 2.2 : 1);
      }
    }
  }

  pickWorld(nx: number, ny: number) {
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const objs = [...this.world.solids, ...this.world.puppets.map((p) => p.root)];
    const hit = this.raycaster.intersectObjects(objs, true)[0];
    if (hit) return hit.point;
    return this.raycaster.ray.at(200, new THREE.Vector3());
  }

  clickShoot(nx: number, ny: number) {
    if (this.move && this.move.locksInput) return;
    const target = this.pickWorld(nx, ny);
    const useR = Math.random() > 0.35 || !!this.move;
    const h = useR ? this.hands.R : this.hands.L;
    this.hands.pose("point", useR ? "R" : "L", 260);
    const tips = this.hands.tipsWorld(useR ? "R" : "L", []);
    const fn = () => this.hands.tipsWorld(useR ? "R" : "L", this.tips)[1].clone();
    h.kick(new THREE.Vector3(0, 0.02, 0.06), new THREE.Vector3(0.35, 0, 0));
    this.audio.twang(900 + Math.random() * 300, 0.25);
    this.audio.crack(0.25);
    this.shake(0.12);
    this.fovKick(1);
    this.fireBullet({ origin: tips[1], originFn: fn, target, onHit: (p) => this.bulletImpact(p) });
    this.idleTimer = 0;
    window.clearTimeout((this as any)._clickT);
    (this as any)._clickT = window.setTimeout(() => {
      if (!this.move) this.hands.pose("idle", "both", 60);
    }, 700);
  }

  play(id: string) {
    if (this.move) {
      if (this.queue.length < 2) this.queue.push(id);
      return;
    }
    if (id === "laugh") {
      this.move = createMove("laugh", this);
      return;
    }
    const def = MOVE_LIST.find((m) => m.id === id);
    if (!def) return;
    this.world.restore();
    this.move = createMove(id, this);
    this.emit({ type: "title", id, kanji: def.kanji, romaji: def.romaji, en: def.en, color: def.color });
  }

  startAutoplay(on: boolean) {
    this.autoplay = on;
    this.autoplayIdx = 0;
    if (on && !this.move) this.play(MOVE_LIST[0].id);
  }

  // ---------- frame ----------
  private loop() {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.clock.update();
    const rdt = Math.min(0.05, this.clock.getDelta());
    // slow-mo
    let ts = 1;
    if (this.slowmo.t < this.slowmo.dur) {
      this.slowmo.t += rdt;
      const k = this.slowmo.t / this.slowmo.dur;
      ts = this.slowmo.scale + (1 - this.slowmo.scale) * Math.pow(k, 3);
    }
    const dt = rdt * ts;
    this.time += dt;
    this.update(dt, rdt);
    this.composer.render(rdt);
  }

  private update(dt: number, rdt: number) {
    // mouse look
    this.mouseDelta.copy(this.mouse).sub(this.lastMouse).divideScalar(Math.max(rdt, 0.001));
    this.mouseDelta.clampScalar(-8, 8);
    this.lastMouse.copy(this.mouse);
    this.mouseSmooth.lerp(this.mouse, Math.min(1, rdt * 4));
    const ls = Math.min(1, rdt * this.lookSpeed);
    this.moveYaw += (this.moveYawT - this.moveYaw) * ls;
    this.movePitch += (this.movePitchT - this.movePitch) * ls;
    const mInfl = this.move ? 0.35 : 1;
    const yaw = this.yaw + this.moveYaw - this.mouseSmooth.x * 0.45 * mInfl;
    const pitch = this.pitch + this.movePitch + this.mouseSmooth.y * 0.25 * mInfl;

    // shake
    this.trauma = Math.max(0, this.trauma - rdt * 1.1);
    const sh = this.trauma * this.trauma;
    const t = this.time * 32;
    const sx = (Math.sin(t * 1.1) + Math.sin(t * 2.3 + 1)) * 0.5 * sh;
    const sy = (Math.sin(t * 1.7 + 2) + Math.sin(t * 2.9)) * 0.5 * sh;
    const sr = Math.sin(t * 1.3 + 4) * sh;
    this.camera.position.copy(this.basePos).add(this.v1.set(sx * 0.25, sy * 0.25, 0));
    this.camera.rotation.set(pitch + sy * 0.05, yaw + sx * 0.05, sr * 0.06, "YXZ");

    // fov spring
    this.fovKickV += (-this.fovOffset * 120 - this.fovKickV * 14) * rdt;
    this.fovOffset += this.fovKickV * rdt;
    const targetFov = this.fovBase + this.fovTarget + this.fovOffset;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, rdt * 10);
      this.camera.updateProjectionMatrix();
    }

    // post fx decay
    const u = this.grade.uniforms;
    this.chromaV = Math.max(0, this.chromaV - rdt * 0.02 - this.chromaV * rdt * 2.5);
    this.zoomV = Math.max(0, this.zoomV - rdt * 1.5);
    this.flashV = Math.max(0, this.flashV - rdt * 4.5);
    this.impactV = Math.max(0, this.impactV - rdt * 7);
    u.uTime.value = this.time;
    u.uChroma.value = 0.001 + this.chromaV + sh * 0.0035;
    u.uZoom.value = this.zoomV;
    u.uFlash.value = this.flashV;
    u.uImpact.value = this.impactV > 0.5 ? 1 : this.impactV * 2;
    u.uImpactInvert.value = this.impactInvert;
    this.tintAmt += (this.tintTarget - this.tintAmt) * Math.min(1, rdt * 1.5);
    u.uTintAmt.value = this.tintAmt;
    const sk = this.world.skyMat.uniforms;
    sk.uStorm.value += (this.stormTarget - sk.uStorm.value) * Math.min(1, rdt * 1.5);
    this.bloom.strength = 0.7 + this.flashV * 0.8 + sh * 0.4;

    // strings begin
    this.thin.begin();
    this.mid.begin();
    this.thick.begin();

    this.hands.update(dt, this.move ? this.mouseDelta.clone().multiplyScalar(0.3) : this.mouseDelta);
    this.camera.updateMatrixWorld(true);

    // move
    if (this.move) {
      this.move.update(dt);
      if (this.move.done) {
        this.move.end();
        this.move = null;
        this.setCinema(false);
        this.look(0, 0, 2);
        this.fovTarget = 0;
        this.hands.R.shake = 0;
        this.hands.L.shake = 0;
        this.hands.R.twitch.fill(0);
        this.hands.L.twitch.fill(0);
        this.hands.pose("idle", "both", 50);
        this.tintTarget = 0;
        this.stormTarget = 0;
        this.emit({ type: "moveEnd" });
        this.idleTimer = 0;
        if (this.queue.length) {
          const next = this.queue.shift()!;
          setTimeout(() => this.play(next), 250);
        } else if (this.autoplay) {
          this.autoplayIdx = (this.autoplayIdx + 1) % MOVE_LIST.length;
          setTimeout(() => {
            if (this.autoplay && !this.move) this.play(MOVE_LIST[this.autoplayIdx].id);
          }, 1300);
        }
      }
    } else {
      this.idleTimer += dt;
      this.idleBehaviour(dt);
      if (this.world.dirty && this.idleTimer > 3.5) this.world.restore();
    }

    if (!this.move || this.move.idleStrings) this.drawIdleStrings();
    this.updateProjectiles(dt);

    this.world.update(dt);
    this.fx.update(dt, this.camera);
    this.glow.update(dt);
    this.smoke.update(dt);

    this.thin.end();
    this.mid.end();
    this.thick.end();

    this.drawSpeedLines(rdt);
  }

  private idleBehaviour(dt: number) {
    // subtle finger fidgets
    const tt = this.time;
    for (const h of [this.hands.R, this.hands.L]) {
      for (let i = 0; i < 5; i++) {
        h.twitch[i] = Math.max(0, Math.sin(tt * 1.3 + i * 0.9 + h.side * 2)) * 0.12 * Math.sin(tt * 0.4 + i);
      }
    }
    void dt;
  }

  private drawIdleStrings() {
    const c = this.col.set(0xffe6f4);
    for (const side of ["R", "L"] as const) {
      const tips = this.hands.tipsWorld(side, this.tips);
      for (let i = 0; i < 5; i++) {
        const a = tips[i];
        const len = 0.25 + Math.sin(this.time * 0.8 + i * 1.7) * 0.06;
        this.v2.copy(a).add(this.v1.set(Math.sin(this.time * 1.2 + i) * 0.03, -len, Math.cos(this.time + i) * 0.02));
        curvePts(this.tmpPts, a, this.v2, 6, -0.02, 0.01, this.time, i);
        this.thin.line(this.tmpPts, c, 0.6, (k) => (1 - k) * (0.5 + 0.5 * Math.sin(this.time * 3 + i + k * 8)));
      }
    }
  }

  private updateProjectiles(dt: number) {
    const head = this.v1,
      tail = this.v2;
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.originFn) p.origin.copy(p.originFn());
      if (p.alive) {
        p.dist += p.speed * dt;
        if (p.dist >= p.maxDist) {
          p.dist = p.maxDist;
          p.alive = false;
          p.pos.copy(p.origin).addScaledVector(p.dir, 0);
          const hitP = p.pos.copy(p.origin).addScaledVector(p.dir, p.maxDist).clone();
          p.pos.copy(hitP);
          p.onHit(hitP);
        } else {
          // pos relative to the original launch (dir fixed)
          p.pos.copy(p.origin).addScaledVector(p.dir, p.dist);
        }
      } else {
        p.fade -= dt * 2.5;
      }
      head.copy(p.pos);
      tail.copy(p.pos).addScaledVector(p.dir, -Math.min(p.trail, p.dist));
      if (p.alive) {
        this.mid.seg(tail, head, p.color, 0.2, p.color, 3.5);
        this.thin.seg(tail, head, this.col.set(0xffffff), 0.5, this.col, 4);
      }
      // the string connecting finger → bullet
      curvePts(this.tmpPts, p.origin, p.pos, 10, 0, p.alive ? 0 : 0.15 * (1 - p.fade), p.t, p.t * 10);
      this.thin.line(this.tmpPts, p.color, 1.3 * Math.max(0, p.fade), (k) => 0.4 + k * 0.6);
    }
    this.projectiles = this.projectiles.filter((p) => p.fade > 0);
  }

  private drawSpeedLines(rdt: number) {
    const g = this.octx;
    const w = this.overlay.width,
      h = this.overlay.height;
    g.clearRect(0, 0, w, h);
    this.speedLinesT -= rdt;
    if (this.speedLinesT <= 0) this.speedLines = Math.max(0, this.speedLines - rdt * 3);
    const a = this.speedLines;
    if (a <= 0.01) return;
    const cx = w / 2,
      cy = h / 2;
    const R = Math.hypot(w, h) * 0.6;
    const n = Math.floor(90 * a);
    g.fillStyle = `rgba(255,255,255,${0.55 * Math.min(1, a)})`;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const inner = R * (0.35 + Math.random() * 0.35);
      const wd = 0.004 + Math.random() * 0.01;
      g.beginPath();
      g.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
      g.lineTo(cx + Math.cos(ang - wd) * R, cy + Math.sin(ang - wd) * R);
      g.lineTo(cx + Math.cos(ang + wd) * R, cy + Math.sin(ang + wd) * R);
      g.closePath();
      g.fill();
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
