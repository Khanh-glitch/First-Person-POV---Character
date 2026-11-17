import * as THREE from 'three';
import { World, type Hit } from './world';
import type { Ship } from './ships';
import { Fx } from './fx';
import { Hands } from './hands';
import { PostFx } from './post';
import { AudioFx } from './audio';
import { MoveRunner } from './moves';
import { MOVES, type HudState, type MoveId, type MoveInfo } from './moveData';
import { clamp, damp, shakeNoise } from './util';

export interface EngineEvents {
  onCast(m: MoveInfo): void;
  onHud(s: HudState): void;
  onCinematic(on: boolean): void;
}

export class CameraRig {
  station = new THREE.Vector3(0, 9, 0);
  offset = new THREE.Vector3();
  pos = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  roll = 0;
  rollT = 0;
  fovBase = 72;
  fovKick = 0;
  fovKickT = 0;
  trauma = 0;
  lookAt: THREE.Vector3 | null = null;
  lookW = 0;
  lookWT = 0;
  pushBack = 0;
  private q = new THREE.Quaternion();
  private qLook = new THREE.Quaternion();
  private qRoll = new THREE.Quaternion();
  private e = new THREE.Euler();
  private m = new THREE.Matrix4();
  private z = new THREE.Vector3(0, 0, 1);
  private up = new THREE.Vector3(0, 1, 0);
  private back = new THREE.Vector3();

  constructor(public camera: THREE.PerspectiveCamera) {}

  update(dt: number, t: number, mx: number, my: number) {
    this.yaw = damp(this.yaw, -mx * 0.42, 5, dt);
    this.pitch = damp(this.pitch, my * 0.2, 5, dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.1);
    const sh = this.trauma * this.trauma;
    this.e.set(this.pitch + shakeNoise(t * 30, 1) * sh * 0.05, this.yaw + shakeNoise(t * 27, 2) * sh * 0.05, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.pos.copy(this.station).add(this.offset);
    this.pos.y += Math.sin(t * 1.1) * 0.05;
    this.lookW = damp(this.lookW, this.lookWT, 14, dt);
    if (this.lookAt && this.lookW > 0.001) {
      this.m.lookAt(this.pos, this.lookAt, this.up);
      this.qLook.setFromRotationMatrix(this.m);
      this.q.slerp(this.qLook, this.lookW);
    }
    this.roll = damp(this.roll, this.rollT, 8, dt);
    this.qRoll.setFromAxisAngle(this.z, this.roll + shakeNoise(t * 33, 3) * sh * 0.06);
    this.q.multiply(this.qRoll);
    this.camera.quaternion.copy(this.q);
    this.back.set(0, 0, 1).applyQuaternion(this.q);
    this.camera.position.copy(this.pos).addScaledVector(this.back, this.pushBack);
    this.camera.position.x += shakeNoise(t * 41, 4) * sh * 0.3;
    this.camera.position.y += shakeNoise(t * 37, 5) * sh * 0.3;
    this.pushBack = damp(this.pushBack, 0, 6, dt);
    this.fovKick = damp(this.fovKick, this.fovKickT, 9, dt);
    const fov = this.fovBase + this.fovKick;
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: World;
  fx: Fx;
  hands: Hands;
  post: PostFx;
  audio = new AudioFx();
  rig: CameraRig;
  moves: MoveRunner;
  mouse = new THREE.Vector2(0.28, -0.05);
  aim = {
    origin: new THREE.Vector3(),
    dir: new THREE.Vector3(0, 0, -1),
    hit: { kind: 'sky', point: new THREE.Vector3(), ship: null, dist: 0 } as Hit,
  };
  time = 0;
  timeScale = 1;
  holdFire = false;
  started = false;
  manual = false;
  private hitStopT = 0;
  private hitStopScale = 0.05;
  private raf = 0;
  private last = 0;
  private hudT = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private fps = 60;
  private pr: number;
  private maxPr: number;
  private adaptive = true;
  private ray = new THREE.Raycaster();
  private tmp = new THREE.Vector3();
  private keys = new Set<string>();
  private ro: ResizeObserver;
  private cleanup: (() => void)[] = [];
  private disposed = false;
  private width = 1;
  private height = 1;
  private idleT = 0;

  constructor(public container: HTMLElement, public events: EngineEvents) {
    const q = new URLSearchParams(location.search);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: q.has('fixed') });
    this.maxPr = q.has('lowres') ? 0.6 : Math.min(window.devicePixelRatio || 1, 1.5);
    this.pr = this.maxPr;
    this.adaptive = !q.has('fixed');
    this.renderer.setPixelRatio(this.pr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.42;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h);
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(72, w / h, 0.05, 20000);
    this.camera.layers.enable(1);
    this.scene.add(this.camera);
    this.rig = new CameraRig(this.camera);

    this.world = new World(this.scene, this.renderer);
    this.fx = new Fx();
    this.scene.add(this.fx.group);
    this.world.hooks = this.fx.hooks();

    this.hands = new Hands();
    this.hands.setAspect(w / h);
    this.camera.add(this.hands.group);
    const fill = new THREE.PointLight(0xffd8b0, 0.16, 3, 2);
    fill.position.set(0.1, 0.35, 0.25);
    this.camera.add(fill);

    this.post = new PostFx(this.renderer, this.scene, this.camera, w, h, this.pr);
    this.moves = new MoveRunner(this);

    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.camera.updateMatrixWorld(true);

    (window as unknown as { __kz: Engine }).__kz = this;
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      if (this.manual) return;
      const raw = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(raw);
      this.render(raw);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /* ---------------- lifecycle ---------------- */

  start() {
    if (this.started) return;
    this.started = true;
    this.audio.init();
    this.fx.flare(this.camera.position.clone().add(new THREE.Vector3(0, 0, -3).applyQuaternion(this.camera.quaternion)), 6, 0.9, [1, 0.9, 0.6], 2, true);
    this.post.pulse('flash', 1.3);
    this.rig.fovKick = 30;
    this.addTrauma(0.35);
    this.audio.whoosh(0.7, 300, 5000, 0.3);
    this.audio.sting();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.applySize(w, h);
  }

  private applySize(w: number, h: number) {
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(this.pr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(w, h, this.pr);
    this.hands.setAspect(w / h);
  }

  /* ---------------- input ---------------- */

  private bindInput() {
    const el = this.container;
    const setMouse = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const down = (e: PointerEvent) => {
      setMouse(e);
      if (!this.started) return;
      if (e.button === 2) this.cast('murakumo');
      else if (e.button === 0) {
        this.holdFire = true;
        this.cast('magatama');
      }
    };
    const move = (e: PointerEvent) => setMouse(e);
    const up = (e: PointerEvent) => {
      if (e.button === 0) this.holdFire = false;
    };
    const ctx = (e: Event) => e.preventDefault();
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (!this.started) return;
      if (k >= '1' && k <= '5') this.cast(MOVES[Number(k) - 1].id);
      else if (k === ' ') {
        e.preventDefault();
        this.cast('kagami');
      } else if (k === 'shift' || k === 'e' || k === 'q') {
        const dir = k === 'q' || this.keys.has('a') ? -1 : k === 'e' || this.keys.has('d') ? 1 : this.mouse.x < 0 ? -1 : 1;
        this.moves.step(dir);
      } else if (k === 'f') this.holdFire = true, this.cast('magatama');
    };
    const ku = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      this.keys.delete(k);
      if (k === 'f') this.holdFire = false;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    el.addEventListener('contextmenu', ctx);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this.cleanup.push(() => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.removeEventListener('contextmenu', ctx);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    });
  }

  cast(id: MoveId) {
    return this.moves.start(id);
  }

  /* ---------------- helpers for moves ---------------- */

  addTrauma(v: number) {
    this.rig.trauma = Math.min(1, Math.max(this.rig.trauma, v) + v * 0.15);
  }

  hitStop(dur: number, scale = 0.04) {
    this.hitStopT = dur;
    this.hitStopScale = scale;
  }

  /** direction from `from` (camera space) to the aim point, in camera space */
  localAimDir(from: THREE.Vector3, out = new THREE.Vector3()) {
    out.copy(this.aim.hit.point);
    this.camera.worldToLocal(out);
    return out.sub(from).normalize();
  }

  /** world → screen uv (0..1, y up). falls back to centre if behind camera */
  screenUV(p: THREE.Vector3, out = new THREE.Vector2()) {
    this.tmp.copy(p).project(this.camera);
    if (this.tmp.z > 1 || !isFinite(this.tmp.x)) return out.set(0.5, 0.5);
    return out.set(clamp(this.tmp.x * 0.5 + 0.5, -0.5, 1.5), clamp(this.tmp.y * 0.5 + 0.5, -0.5, 1.5));
  }

  lockTarget(): { ship: Ship | null; point: THREE.Vector3 } {
    const h = this.aim.hit;
    let ship: Ship | null = h.kind === 'ship' ? h.ship : null;
    if (!ship) ship = this.world.pickShip(this.camera.position, this.aim.dir);
    if (ship) return { ship, point: ship.center };
    return { ship: null, point: h.point.clone() };
  }

  resetPose() {
    const { post, rig, hands } = this;
    (['radial', 'chroma', 'dim', 'warp', 'vignette', 'sat'] as const).forEach((k) => post.release(k));
    rig.lookAt = null;
    rig.lookWT = 0;
    rig.offset.set(0, 0, 0);
    rig.fovKickT = 0;
    rig.rollT = 0;
    hands.left.glow = 0;
    hands.right.glow = 0;
    hands.leg.set(0, 0);
    hands.left.kPos = hands.right.kPos = 15;
    hands.left.kQuat = hands.right.kQuat = 17;
    post.center.set(0.5, 0.5);
    this.events.onCinematic(false);
    hands.both('rest');
  }

  /* ---------------- frame ---------------- */

  private updateAim() {
    this.camera.updateMatrixWorld(true);
    this.ray.setFromCamera(this.mouse, this.camera);
    this.aim.origin.copy(this.ray.ray.origin);
    this.aim.dir.copy(this.ray.ray.direction);
    this.world.rayHit(this.aim.origin, this.aim.dir, this.aim.hit);
  }

  step(raw: number) {
    // hit-stop / time scale
    if (this.hitStopT > 0) {
      this.hitStopT -= raw;
      this.timeScale = damp(this.timeScale, this.hitStopScale, 80, raw);
    } else {
      this.timeScale = damp(this.timeScale, 1, 9, raw);
    }
    const dt = raw * this.timeScale;
    this.time += dt;

    // idle drift before the player enters
    let mx = this.mouse.x;
    let my = this.mouse.y;
    if (!this.started) {
      this.idleT += raw;
      mx = Math.sin(this.idleT * 0.18) * 0.3;
      my = 0.05 + Math.sin(this.idleT * 0.13) * 0.04;
    }

    this.moves.update(dt);
    this.rig.update(dt, this.time, mx, my);
    this.hands.update(dt, this.time);
    this.updateAim();
    this.world.update(dt, this.time);
    this.fx.update(dt, this.camera);
    this.camera.updateMatrixWorld(true);

    this.hudT += raw;
    this.fpsAcc += raw;
    this.fpsN++;
    if (this.hudT > 0.07) {
      this.hudT = 0;
      this.events.onHud({
        cd: this.moves.cooldownRatios(),
        active: this.moves.activeId,
        sunk: this.world.sunk,
        combo: this.moves.combo,
        locked: this.aim.hit.kind === 'ship',
        fps: this.fps,
      });
    }
    if (this.fpsAcc > 2.5) {
      this.fps = this.fpsN / this.fpsAcc;
      if (this.adaptive && this.fps < 36 && this.pr > 0.7) {
        this.pr = Math.max(0.7, this.pr - 0.2);
        this.applySize(this.width, this.height);
      }
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
  }

  render(raw: number) {
    this.post.render(raw, this.time);
  }

  /** deterministic fast-forward (used for testing / screenshots) */
  advance(seconds: number, h = 1 / 30) {
    this.manual = true;
    const n = Math.round(seconds / h);
    for (let i = 0; i < n; i++) {
      this.step(h);
      this.post.update(h, this.time);
    }
    this.post.draw(h);
  }
}
