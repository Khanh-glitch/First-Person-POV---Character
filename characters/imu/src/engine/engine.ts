import * as THREE from "three";
import { Post } from "./post";
import { World } from "./world";
import { ParticleSystem } from "./particles";
import { puffTexture, dotTexture } from "./textures";
import { Hand, REST, mirror } from "./hands";
import type { Actor } from "./actors";
import { emitBolt } from "./actors";
import { AudioEngine } from "./audio";
import { damp, clamp } from "./util";
import { MOVES, type MoveDef } from "./moves";

class Spring3 {
  p = [0, 0, 0];
  v = [0, 0, 0];
  constructor(private k: number, private d: number) {}
  kick(i: number, a: number) {
    this.v[i] += a;
  }
  update(dt: number) {
    for (let i = 0; i < 3; i++) {
      this.v[i] += -this.k * this.p[i] * dt;
      this.v[i] *= Math.exp(-this.d * dt);
      this.p[i] += this.v[i] * dt;
    }
  }
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  post: Post;
  world: World;
  fire: ParticleSystem;
  smoke: ParticleSystem;
  sparks: ParticleSystem;
  left = new Hand(-1);
  right = new Hand(1);
  audio = new AudioEngine();
  actors: Actor[] = [];
  time = 0;

  // callbacks to the React UI
  onCast?: (m: MoveDef, chainIndex: number, chainLen: number) => void;
  onEnd?: () => void;
  onProgress?: (p: number) => void;

  // camera / look
  mouse = { x: 0, y: 0 };
  look = { yaw: 0, pitch: 0 };
  script = { yaw: 0, pitch: 0, roll: 0, k: 2.5 };
  userWeight = 1;
  private uw = 1;
  trauma = 0;
  baseFov = 74;
  fovKickV = 0;
  private camRot = new Spring3(110, 9);
  private camPos = new Spring3(130, 12);
  private lagX = 0;
  private lagY = 0;

  // post fx state
  fx = {
    flashA: 0,
    flashDecay: 6,
    flashColor: new THREE.Color(1, 1, 1),
    aberr: 0,
    glitch: 0,
    invert: 0,
    zoom: 0,
    eye: 0,
    vig: 0.55,
    desat: 0,
    bloom: 0.85,
  };
  target = { storm: 0, dark: 0, vig: 0.55, bloom: 0.85, desat: 0 };
  private storm = 0;
  private dark = 0;
  private ripples = [
    { x: 0.5, y: 0.5, r: -1, speed: 1, s: 0 },
    { x: 0.5, y: 0.5, r: -1, speed: 1, s: 0 },
  ];
  private ripIdx = 0;

  // lights
  handLight: THREE.PointLight;
  private handLightI = 0;
  private handLightTarget = 0;
  private lightI = 0;
  private lightDecay = 6;
  private skyGlowAmt = 0;
  private skyGlowDecay = 3;
  private skyGlowCol = new THREE.Color();

  // moves
  active: { def: MoveDef; t: number } | null = null;
  private chain: string[] = [];
  private chainTotal = 0;
  private chainGap = 0;
  private raf = 0;
  private last = 0;
  private disposed = false;
  fixedDt: number | null = null;
  private container: HTMLElement;
  private ambientTimer = 0;
  private v2 = new THREE.Vector2();

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x000000);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.camera = new THREE.PerspectiveCamera(this.baseFov, w / h, 0.02, 4500);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.world = new World(this.scene);

    // particle layers (draw order matters: glow first, smoke over it => black flames with glowing rims)
    this.fire = new ParticleSystem(9000, puffTexture(3), true, 20);
    this.smoke = new ParticleSystem(4500, puffTexture(7), false, 21);
    this.sparks = new ParticleSystem(7000, dotTexture(), true, 22);
    this.scene.add(this.fire.points, this.smoke.points, this.sparks.points);

    // hands
    this.camera.add(this.left.root, this.right.root);
    this.left.snapTo(mirror(REST));
    this.right.snapTo(REST);
    this.handLight = new THREE.PointLight(0xff3050, 0, 4, 1.6);
    this.handLight.position.set(0, -0.05, -0.45);
    this.camera.add(this.handLight);

    this.post = new Post(this.renderer, this.scene, this.camera);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("mousemove", this.onMove);
    window.addEventListener("touchmove", this.onTouch, { passive: true });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ------------------------------ input ------------------------------ */
  private onMove = (e: MouseEvent) => {
    this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  private onTouch = (e: TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    this.mouse.x = (t.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = (t.clientY / window.innerHeight) * 2 - 1;
  };
  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  /* ------------------------------ helpers for moves ------------------------------ */
  addActor(a: Actor) {
    this.actors.push(a);
    this.scene.add(a.obj);
    return a;
  }
  removeActor(a: Actor) {
    const i = this.actors.indexOf(a);
    if (i >= 0) this.actors.splice(i, 1);
    this.scene.remove(a.obj);
    a.dispose();
  }
  shake(amount: number) {
    this.trauma = clamp(this.trauma + amount);
  }
  kickCam(pitch: number, yaw = 0, roll = 0) {
    this.camRot.kick(0, pitch);
    this.camRot.kick(1, yaw);
    this.camRot.kick(2, roll);
  }
  kickPos(x: number, y: number, z: number) {
    this.camPos.kick(0, x);
    this.camPos.kick(1, y);
    this.camPos.kick(2, z);
  }
  kickFov(v: number) {
    this.fovKickV += v;
  }
  flash(color: THREE.Color | number, a = 1, decay = 6) {
    this.fx.flashColor.set(color as THREE.ColorRepresentation);
    this.fx.flashA = Math.max(this.fx.flashA * 0.5, a);
    this.fx.flashDecay = decay;
  }
  ripple(x: number, y: number, speed: number, strength: number) {
    const r = this.ripples[this.ripIdx];
    this.ripIdx = (this.ripIdx + 1) % 2;
    r.x = x;
    r.y = y;
    r.r = 0;
    r.speed = speed;
    r.s = strength;
  }
  setLight(pos: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, decay = 6) {
    this.world.fxLight.position.copy(pos);
    this.world.fxLight.color.set(color);
    this.lightI = intensity;
    this.lightDecay = decay;
  }
  handGlow(color: THREE.ColorRepresentation, intensity: number) {
    this.handLight.color.set(color);
    this.handLightTarget = intensity;
  }
  skyGlow(color: THREE.ColorRepresentation, amt: number, dir: THREE.Vector3, decay = 3) {
    this.skyGlowCol.set(color);
    this.skyGlowAmt = amt;
    this.skyGlowDecay = decay;
    this.world.skyU.uGlowDir.value.copy(dir).normalize();
  }
  bolt(a: THREE.Vector3, b: THREE.Vector3, size = 1.2, c0 = new THREE.Color(1.6, 0.5, 1.2), c1 = new THREE.Color(0.7, 0.05, 0.25), jag = 0.12, life = 0.22) {
    emitBolt(this.fire, a, b, c0, c1, size, jag, life);
  }
  /** direction camera is facing */
  forward(out: THREE.Vector3) {
    return this.camera.getWorldDirection(out);
  }

  /* ------------------------------ moves ------------------------------ */
  cast(id: string): boolean {
    if (this.active || this.chainGap > 0) return false;
    const def = MOVES.find((m) => m.id === id);
    if (!def) return false;
    this.audio.init();
    this.active = { def, t: 0 };
    this.left.follow = this.right.follow = 15;
    def.start(this);
    this.audio.intensity(0.8);
    this.onCast?.(def, this.chainTotal ? this.chainTotal - this.chain.length : 0, this.chainTotal);
    return true;
  }

  castChain(ids: string[]) {
    if (this.active) return false;
    this.chain = ids.slice(1);
    this.chainTotal = ids.length;
    return this.cast(ids[0]);
  }

  private endMove() {
    if (!this.active) return;
    const def = this.active.def;
    def.end(this);
    this.active = null;
    this.script.pitch = this.script.yaw = this.script.roll = 0;
    this.script.k = 2.5;
    this.userWeight = 1;
    this.target.storm = 0;
    this.target.dark = 0;
    this.target.vig = 0.55;
    this.target.bloom = 0.85;
    this.target.desat = 0;
    this.fx.eye = 0;
    this.handGlow(0xff3050, 0);
    this.audio.intensity(0, 1.5);
    if (this.chain.length) {
      this.chainGap = 0.35;
    } else {
      this.chainTotal = 0;
      this.onEnd?.();
    }
  }

  /* ------------------------------ loop ------------------------------ */
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.fixedDt ?? Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.step(dt, this.time);
    this.post.render(dt);
  };

  private step(dt: number, t: number) {
    // ---- moves
    if (this.chainGap > 0) {
      this.chainGap -= dt;
      if (this.chainGap <= 0 && this.chain.length) {
        const next = this.chain.shift()!;
        this.chainGap = 0;
        this.cast(next);
      }
    }
    if (this.active) {
      this.active.t += dt;
      const d = this.active.def;
      d.update(this, this.active.t, dt);
      this.onProgress?.(clamp(this.active.t / d.duration));
      if (this.active.t >= d.duration) this.endMove();
    }
    if (!this.active) {
      this.right.set(REST);
      this.left.set(mirror(REST));
    }

    // ---- camera (first person)
    this.uw += (this.userWeight - this.uw) * damp(2, dt);
    const tyaw = -this.mouse.x * 0.42 * this.uw;
    const tpitch = -this.mouse.y * 0.28 * this.uw;
    const prevYaw = this.look.yaw;
    const prevPitch = this.look.pitch;
    this.look.yaw += (tyaw + this.script.yaw - this.look.yaw) * damp(this.script.k + 1.5, dt);
    this.look.pitch += (tpitch + this.script.pitch - this.look.pitch) * damp(this.script.k + 1.5, dt);
    const lagTargetX = clamp((this.look.yaw - prevYaw) / Math.max(dt, 1e-3), -2, 2) * 0.012;
    const lagTargetY = clamp((this.look.pitch - prevPitch) / Math.max(dt, 1e-3), -2, 2) * -0.012;
    this.lagX += (lagTargetX - this.lagX) * damp(10, dt);
    this.lagY += (lagTargetY - this.lagY) * damp(10, dt);

    this.camRot.update(dt);
    this.camPos.update(dt);
    this.trauma = Math.max(0, this.trauma - dt * 0.65);
    const sh = this.trauma * this.trauma;
    const n1 = Math.sin(t * 43.1) + Math.sin(t * 27.3 + 1.7) * 0.7;
    const n2 = Math.sin(t * 39.7 + 4.1) + Math.sin(t * 23.9 + 0.3) * 0.7;
    const n3 = Math.sin(t * 51.3 + 2.2) + Math.sin(t * 31.1 + 5.5) * 0.7;
    const breathe = Math.sin(t * 1.25) * 0.0035;
    const sway = Math.sin(t * 0.6) * 0.004;
    this.camera.position.set(
      this.camPos.p[0] + n1 * sh * 0.09,
      this.camPos.p[1] + n2 * sh * 0.09 + breathe * 3,
      this.camPos.p[2] + n3 * sh * 0.05
    );
    this.camera.rotation.set(
      this.look.pitch + this.camRot.p[0] + n2 * sh * 0.05 + breathe,
      this.look.yaw + this.camRot.p[1] + n1 * sh * 0.05 + sway,
      this.script.roll * 0 + this.camRot.p[2] + n3 * sh * 0.05
    );
    this.fovKickV *= Math.exp(-dt * 3.2);
    const fov = this.baseFov + this.fovKickV;
    if (Math.abs(this.camera.fov - fov) > 0.001) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // ---- hands
    this.left.update(dt, t);
    this.right.update(dt, t);
    this.camera.updateMatrixWorld(true);
    this.left.root.position.x += this.lagX;
    this.right.root.position.x += this.lagX;
    this.left.root.position.y += this.lagY;
    this.right.root.position.y += this.lagY;
    this.handLightI += (this.handLightTarget - this.handLightI) * damp(10, dt);
    this.handLight.intensity = this.handLightI;

    // ---- actors
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i];
      if (!a.update(dt, t)) {
        this.scene.remove(a.obj);
        a.dispose();
        this.actors.splice(i, 1);
      }
    }

    // ---- ambient embers
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 0.03;
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 45;
      const c0 = new THREE.Color().setHSL(0.97 - Math.random() * 0.1, 1, 0.55);
      this.sparks.emit({
        x: Math.cos(a) * r,
        y: -2 + Math.random() * 22,
        z: Math.sin(a) * r - 25,
        vx: (Math.random() - 0.3) * 0.8,
        vy: 0.5 + Math.random() * 1.5,
        vz: (Math.random() - 0.5) * 0.8,
        life: 5 + Math.random() * 5,
        size0: 0.07 + Math.random() * 0.1,
        c0,
        a: 0.55,
        turb: 2.5,
        fadeIn: 0.3,
      });
    }

    // ---- particles
    const scale = (this.renderer.getDrawingBufferSize(this.v2).y || 800) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    for (const p of [this.fire, this.smoke, this.sparks]) {
      p.setScale(scale);
      p.update(dt);
    }

    // ---- world + atmosphere
    this.storm += (this.target.storm - this.storm) * damp(1.6, dt);
    this.dark += (this.target.dark - this.dark) * damp(2.2, dt);
    this.world.skyU.uStorm.value = this.storm;
    this.world.cloudU.uDark.value = this.dark;
    this.world.update(dt, t, this.camera);
    this.world.rumble(sh * 14, t);
    this.world.hemi.intensity = 0.9 * (1 - this.dark * 0.7);
    this.world.moon.intensity = 1.5 * (1 - this.dark * 0.8);

    this.lightI *= Math.exp(-this.lightDecay * dt);
    this.world.fxLight.intensity = this.lightI;
    this.skyGlowAmt *= Math.exp(-this.skyGlowDecay * dt);
    this.world.skyU.uGlow.value.copy(this.skyGlowCol).multiplyScalar(this.skyGlowAmt);

    // ---- post
    const f = this.fx;
    f.flashA *= Math.exp(-f.flashDecay * dt);
    f.aberr *= Math.exp(-dt * 3);
    f.glitch *= Math.exp(-dt * 4);
    f.invert *= Math.exp(-dt * 12);
    f.zoom *= Math.exp(-dt * 3.5);
    f.vig += (this.target.vig - f.vig) * damp(3, dt);
    f.desat += (this.target.desat - f.desat) * damp(3, dt);
    f.bloom += (this.target.bloom - f.bloom) * damp(3, dt);
    const u = this.post.u;
    u.uTime.value = t;
    u.uAberr.value = f.aberr + this.trauma * 0.9;
    u.uFlash.value.set(f.flashColor.r, f.flashColor.g, f.flashColor.b, f.flashA);
    u.uInvert.value = f.invert;
    u.uGlitch.value = f.glitch;
    u.uZoom.value = f.zoom;
    u.uVig.value = f.vig;
    u.uDesat.value = f.desat;
    u.uEye.value = f.eye;
    this.post.bloom.strength = f.bloom;
    for (let i = 0; i < 2; i++) {
      const r = this.ripples[i];
      const v = i === 0 ? u.uRipple0.value : u.uRipple1.value;
      if (r.r >= 0) {
        r.r += r.speed * dt;
        r.s *= Math.exp(-dt * 1.4);
        if (r.r > 1.8) r.r = -1;
      }
      v.set(r.x, r.y, r.r, r.r >= 0 ? r.s : 0);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("mousemove", this.onMove);
    window.removeEventListener("touchmove", this.onTouch);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
