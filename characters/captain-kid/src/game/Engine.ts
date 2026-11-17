import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { PostFX } from "./PostFX";
import { FX, HOT, MAGENTA, PURPLE, WHITE } from "./FX";
import { ScrapSystem } from "./Scrap";
import { Arms } from "./Arms";
import { Colossus, Environment } from "./Environment";
import { AudioSys } from "./Audio";
import { MOVES, MoveDirector } from "./Moves";
import { damp, noise1, rand, randS } from "./util";

export interface EngineEvents {
  onCast?: (id: string) => void;
  onMoveEnd?: (id: string) => void;
  onBoss?: (hp: number, max: number) => void;
  onDamage?: (amount: number, big: boolean) => void;
  onBossDown?: () => void;
}

const BASE_PITCH = 0.16;
const EYE = 1.9;

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  post: PostFX;
  env: Environment;
  colossus: Colossus;
  scrap: ScrapSystem;
  arms: Arms;
  fx: FX;
  audio = new AudioSys();
  moves: MoveDirector;
  events: EngineEvents = {};

  rig = new THREE.Vector3();
  time = 0;
  realTime = 0;
  cam = { fov: 70, fovT: 70, fovSpeed: 6, roll: 0, rollT: 0, pitch: 0, pitchT: 0, yaw: 0, yawT: 0, aim: 0, aimT: 0 };
  fxT = { speed: 0, darken: 0, blur: 0 };
  chargeT = 0.3;
  chroma = 0;
  focus = new THREE.Vector3();
  focusOn = false;
  auto = false;
  paused = false;

  private trauma = 0;
  private flashV = new THREE.Vector3();
  private impactT = 0;
  private hitstopT = 0;
  private look = { yaw: 0, pitch: 0, yawT: 0, pitchT: 0 };
  private camLight: THREE.PointLight;
  private raf = 0;
  private last = 0;
  private container: HTMLElement;
  private autoIdx = 1;
  private autoWait = 1.2;
  private disposed = false;
  private _v = new THREE.Vector3();
  private _v2 = new THREE.Vector3();
  private ro: ResizeObserver;

  constructor(container: HTMLElement) {
    this.container = container;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.camera = new THREE.PerspectiveCamera(70, w / h, 0.04, 4000);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.2;
    pmrem.dispose();

    this.env = new Environment(this.scene);
    this.colossus = this.env.colossus;
    this.scrap = new ScrapSystem(this.scene);
    this.fx = new FX(this.scene);
    this.arms = new Arms();
    this.camera.add(this.arms.group);
    this.camLight = new THREE.PointLight(0xb070ff, 0.4, 9, 2);
    this.camLight.position.set(-0.15, 0.12, -0.2);
    this.camera.add(this.camLight);
    const key = new THREE.PointLight(0xffd0b0, 0.1, 4, 2);
    key.position.set(0.3, 0.3, 0.1);
    this.camera.add(key);

    this.post = new PostFX(this.renderer, this.scene, this.camera, w, h);
    this.moves = new MoveDirector(this);

    // scrap feedback
    this.scrap.onLock = (_i, x, y, z) => {
      if (Math.random() < 0.3) this.fx.burst(this._v.set(x, y, z), 2, 7, 0.1, 0.6);
      this.audio.clank(0.1);
    };
    this.scrap.onLift = (x, y, z) => {
      if (Math.random() < 0.3) this.fx.burst(this._v.set(x, y, z), 2, 6, 0.1, 0.9);
      if (this.focusOn && Math.random() < 0.1) this.fx.bolt(this._v.set(x, y, z), this.focus, PURPLE, 0.06, 0.1, 0.06);
      if (Math.random() < 0.06) this.fx.dust(this._v.set(x, 0, z), 1, 1, 3, 2.5);
    };
    this.scrap.onGround = (x, y, z, sp) => {
      this.fx.burst(this._v.set(x, y, z), 3, sp * 0.5, 0.1, 0.1);
      if (Math.random() < 0.3) this.audio.clank(0.08);
    };

    window.addEventListener("pointermove", this.onPointer);
    window.addEventListener("keydown", this.onKey);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  /* ---------------- input ---------------- */
  private onPointer = (e: PointerEvent) => {
    const r = this.container.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    this.look.yawT = -nx * 0.55;
    this.look.pitchT = -ny * 0.26;
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const m = MOVES.find((mv) => mv.key === e.key);
    if (m) this.cast(m.id);
  };

  cast(id: string) {
    if (this.colossus.dead && this.colossus.deadT < 5.6) return false;
    const ok = this.moves.cast(id);
    if (ok) this.events.onCast?.(id);
    return ok;
  }

  /* ---------------- juice API (used by moves) ---------------- */
  addTrauma(x: number) { this.trauma = Math.min(1, this.trauma + x); }
  holdTrauma(x: number) { this.trauma = Math.max(this.trauma, x); }
  flash(r: number, g: number, b: number) {
    const k = 0.5;
    this.flashV.set(Math.max(this.flashV.x, r * k), Math.max(this.flashV.y, g * k), Math.max(this.flashV.z, b * k));
  }
  kickChroma(x: number) { this.chroma = Math.max(this.chroma, x); }
  impactFrame(d: number) { this.impactT = Math.max(this.impactT, d); }
  hitstop(d: number) { this.hitstopT = Math.max(this.hitstopT, d); }
  fovKick(deg: number) { this.cam.fov += deg; }

  damage(n: number, big = false, kick = 0) {
    const c = this.colossus;
    if (c.dead) return;
    const amount = Math.round(n * rand(0.93, 1.07));
    const died = c.damage(amount);
    if (kick) c.kick(kick);
    this.events.onDamage?.(amount, big);
    this.events.onBoss?.(c.hp, c.maxHp);
    if (died) {
      const p = c.core;
      this.fx.impact(p, this._v2.set(0, 0.2, 1), 5, HOT);
      this.fx.shell(p, 5, 120, 1.6, MAGENTA);
      this.fx.shell(p, 3, 70, 1.1, WHITE);
      this.fx.glow(p, 30, 160, 0.9, WHITE, 1);
      this.flash(1.4, 1.2, 1.3);
      this.addTrauma(1);
      this.impactFrame(0.2);
      this.audio.boom(1.5);
      this.audio.rumble(3, 0.9);
      this.events.onBossDown?.();
    }
  }

  resetAfterMove(id: string) {
    const c = this.cam;
    c.fovT = 70; c.fovSpeed = 6; c.rollT = 0; c.pitchT = 0; c.yawT = 0; c.aimT = 0;
    this.fxT.speed = 0; this.fxT.darken = 0; this.fxT.blur = 0;
    this.chargeT = 0.3;
    this.focusOn = false;
    this.arms.idle(5);
    this.arms.offset.set(0, 0, 0);
    this.autoWait = 1.1;
    this.events.onMoveEnd?.(id);
  }

  /* ---------------- loop ---------------- */
  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    if (this.paused) return;
    this.step(dt);
    this.post.render();
  };

  /** advance the simulation (also used for deterministic debugging) */
  step(dt: number) {
    this.realTime += dt;
    let sdt = dt;
    if (this.hitstopT > 0) {
      this.hitstopT -= dt;
      sdt = dt * 0.03;
    }
    this.time += sdt;
    const t = this.time;
    const c = this.cam;

    // auto-demo
    if (this.auto && !this.moves.active && !this.colossus.dead) {
      this.autoWait -= dt;
      if (this.autoWait <= 0) {
        const m = MOVES[this.autoIdx % MOVES.length];
        if (this.cast(m.id)) this.autoIdx++;
        else this.autoWait = 0.3;
      }
    }

    this.moves.update(sdt);

    // dying colossus theatrics
    const col = this.colossus;
    if (col.dead && col.deadT < 2.6) {
      this.holdTrauma(0.45);
      if (Math.random() < dt * 22) {
        this._v.set(randS(14), rand(2, 30), Colossus.Z + rand(0, 9)).setY(Math.max(1, rand(2, 30) + col.group.position.y));
        this.fx.impact(this._v, this._v2.set(0, 0.3, 1), rand(0.6, 1.4), Math.random() < 0.5 ? HOT : MAGENTA);
        this.audio.boom(0.35);
      }
      if (Math.random() < dt * 30) this.fx.dust(this._v.set(randS(16), 0, Colossus.Z + randS(8)), 2, 6, 12, 9);
    }
    if (col.dead && col.deadT > 4.4 && col.deadT < 4.4 + dt * 2) {
      this.events.onBoss?.(col.maxHp, col.maxHp);
      this.audio.rumble(2, 0.7);
    }
    if (col.dead && col.deadT > 4.4 && col.deadT < 6.2) {
      this.holdTrauma(0.3);
      if (Math.random() < dt * 30) this.fx.dust(this._v.set(randS(18), 0, Colossus.Z + randS(10)), 2, 6, 10, 9);
    }

    this.env.update(sdt, t, this.camera.position);
    this.scrap.update(sdt);

    // ambient embers
    if (Math.random() < dt * 24) {
      const k = rand(0.5, 1.4);
      this.fx.sparks.spawn(
        this.rig.x + randS(34), rand(0, 3), this.rig.z - 14 + randS(34),
        randS(1.2) + 1.5, rand(0.8, 3.2), randS(1.2),
        rand(2.5, 6), rand(0.05, 0.12), 0.01, 2.6 * k, 0.75 * k, 0.2 * k, 0.9, 0.15, 0.1
      );
    }
    // idle crackle on the metal arm
    this.arms.charge = damp(this.arms.charge, this.chargeT, 5, dt);
    if (!this.moves.active && Math.random() < dt * 2.2) {
      this.arms.handWorld(this.arms.L, this._v);
      this._v2.set(randS(0.16), randS(0.16), randS(0.16)).add(this._v);
      this.fx.bolt(this._v, this._v2, PURPLE, 0.003, 0.08, 0.3);
    }
    this.camLight.intensity = 0.1 + this.arms.charge * 0.075 + this.env.skyFlash * 0.12;

    // ---------- camera ----------
    const L = this.look;
    L.yaw = damp(L.yaw, L.yawT, 6, dt);
    L.pitch = damp(L.pitch, L.pitchT, 6, dt);
    c.aim = damp(c.aim, c.aimT, 4, dt);
    c.yaw = damp(c.yaw, c.yawT, 5, dt);
    c.pitch = damp(c.pitch, c.pitchT, 5, dt);
    c.roll = damp(c.roll, c.rollT, 7, dt);
    c.fov = damp(c.fov, c.fovT, c.fovSpeed, dt);
    const free = 1 - c.aim * 0.78;
    const sh = this.trauma * this.trauma;
    const rt = this.realTime;
    this.trauma = Math.max(0, this.trauma - dt * 1.25);
    this.camera.position.set(
      this.rig.x + noise1(rt * 31, 1) * sh * 0.32,
      this.rig.y + EYE + Math.sin(t * 1.5) * 0.018 + noise1(rt * 33, 2) * sh * 0.32,
      this.rig.z + noise1(rt * 29, 3) * sh * 0.2
    );
    this.camera.rotation.set(
      BASE_PITCH + L.pitch * free + c.pitch + noise1(rt * 37, 4) * sh * 0.055,
      L.yaw * free + c.yaw + noise1(rt * 35, 5) * sh * 0.055,
      c.roll + noise1(rt * 27, 6) * sh * 0.08 - L.yaw * 0.03
    );
    // Hor+ on portrait screens: keep the horizontal field of view of a square frame
    let fov = Math.max(30, Math.min(128, c.fov));
    const asp = this.camera.aspect;
    if (asp < 1) {
      const half = Math.tan((fov * Math.PI) / 360);
      fov = Math.min(116, (Math.atan(half / asp) * 360) / Math.PI);
    }
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);

    // arms sway with the look + recoil with shake
    this.arms.offset.x = damp(this.arms.offset.x, (L.yawT - L.yaw) * 0.12, 8, dt);
    this.arms.offset.z = damp(this.arms.offset.z, sh * 0.03, 10, dt);
    this.arms.update(sdt, rt);

    const bufH = this.renderer.getDrawingBufferSize(this._size).y;
    this.fx.update(sdt, this.camera, bufH);

    // ---------- post ----------
    const u = this.post.u;
    u.uTime.value = rt;
    this.chroma = Math.max(0, this.chroma - dt * 3.2);
    u.uChroma.value = this.chroma + sh * 0.3;
    u.uBlur.value = damp(u.uBlur.value, this.fxT.blur, 9, dt);
    u.uSpeed.value = damp(u.uSpeed.value, this.fxT.speed, 10, dt);
    u.uDarken.value = damp(u.uDarken.value, this.fxT.darken, 6, dt);
    if (this.impactT > 0) {
      // ink frames first, the white bloom-out follows once they end
      u.uFlash.value.set(0, 0, 0);
      this.impactT -= dt;
      u.uImpact.value = 1;
      u.uImpactMode.value = Math.floor(this.impactT / 0.045) % 2;
    } else {
      u.uImpact.value = 0;
      this.flashV.multiplyScalar(Math.exp(-dt * 12));
      u.uFlash.value.copy(this.flashV);
    }
    this.post.bloom.strength = 0.6 + this.arms.charge * 0.02;
  }

  private _size = new THREE.Vector2();

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.resize(w, h);
  }

  /** deterministic fast-forward for debugging / screenshots */
  debugStep(seconds: number) {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) this.step(1 / 60);
    this.post.render();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("pointermove", this.onPointer);
    window.removeEventListener("keydown", this.onKey);
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    void this.audio.ctx?.close();
  }
}
