import * as THREE from 'three';
import { Columns, Particles, Ribbon, SpriteType, Sprites, Streaks } from './gfx';
import {
  CYAN, GOLD, GOLD_HOT, PINK, SMOKE, TAU, WHITE, perpBasis, pick, rand, randomUnit,
  type RGB,
} from './util';
import type { WorldHooks } from './world';

interface BeamItem {
  on: boolean;
  s: THREE.Vector3;
  e: THREE.Vector3;
  w: number;
  c: RGB;
  int: number;
  age: number;
  life: number;
  shape: number;
  pow: number;
}

export interface BeamOpts {
  w?: number;
  color?: RGB;
  int?: number;
  life?: number;
  shape?: number;
  pow?: number;
}

const _x = new THREE.Vector3(1, 0, 0);
const FLAT = new THREE.Quaternion().setFromAxisAngle(_x, -Math.PI / 2);

/* ------------------------------------------------------------------ */

class Debris {
  mesh: THREE.InstancedMesh;
  private cap = 520;
  private on = new Uint8Array(this.cap);
  private pos = new Float32Array(this.cap * 3);
  private vel = new Float32Array(this.cap * 3);
  private rot = new Float32Array(this.cap * 3);
  private spin = new Float32Array(this.cap * 3);
  private scl = new Float32Array(this.cap * 3);
  private age = new Float32Array(this.cap);
  private col = new Float32Array(this.cap * 3);
  private hot = new Float32Array(this.cap);
  private head = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  onSplash: ((p: THREE.Vector3) => void) | null = null;
  onTrail: ((p: THREE.Vector3) => void) | null = null;

  constructor() {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        roughness: 0.85,
        emissive: new THREE.Color(0.7, 0.24, 0.05),
        emissiveIntensity: 0.55,
      }),
      this.cap,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, this.c.setRGB(1, 1, 1));
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, size: number) {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    this.on[i] = 1;
    this.age[i] = 0;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.rot[i * 3] = rand(0, TAU); this.rot[i * 3 + 1] = rand(0, TAU); this.rot[i * 3 + 2] = rand(0, TAU);
    this.spin[i * 3] = rand(-9, 9); this.spin[i * 3 + 1] = rand(-9, 9); this.spin[i * 3 + 2] = rand(-9, 9);
    const long = rand(1, 4.5);
    this.scl[i * 3] = size * rand(0.25, 0.7);
    this.scl[i * 3 + 1] = size * rand(0.2, 0.5);
    this.scl[i * 3 + 2] = size * long;
    const k = rand(0.6, 1.2);
    this.col[i * 3] = 0.34 * k; this.col[i * 3 + 1] = 0.2 * k; this.col[i * 3 + 2] = 0.1 * k;
    this.hot[i] = Math.random();
  }

  burst(p: THREE.Vector3, n: number, speed: number, size: number) {
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      randomUnit(v).multiplyScalar(rand(0.25, 1) * speed);
      v.y = Math.abs(v.y) * 0.8 + speed * 0.15;
      this.emit(p, v, size * rand(0.5, 1.6));
    }
  }

  update(dt: number) {
    let n = 0;
    for (let i = 0; i < this.cap; i++) {
      if (!this.on[i]) continue;
      this.age[i] += dt;
      this.vel[i * 3 + 1] -= 26 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.rot[i * 3] += this.spin[i * 3] * dt;
      this.rot[i * 3 + 1] += this.spin[i * 3 + 1] * dt;
      this.rot[i * 3 + 2] += this.spin[i * 3 + 2] * dt;
      this.p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      if (this.p.y < 0.3 || this.age[i] > 8) {
        if (this.p.y < 0.5 && this.onSplash) this.onSplash(this.p);
        this.on[i] = 0;
        continue;
      }
      if (this.hot[i] > 0.6 && this.age[i] < 2.2 && this.onTrail && Math.random() < dt * 14) this.onTrail(this.p);
      this.e.set(this.rot[i * 3], this.rot[i * 3 + 1], this.rot[i * 3 + 2]);
      this.q.setFromEuler(this.e);
      this.s.set(this.scl[i * 3], this.scl[i * 3 + 1], this.scl[i * 3 + 2]);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      this.c.setRGB(this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]);
      this.mesh.setColorAt(n, this.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */

export class Fx {
  group = new THREE.Group();
  streaks = new Streaks(7000);
  glow = new Particles(9000, true);
  smoke = new Particles(1800, false);
  sprites = new Sprites(120);
  columns = new Columns(30, 8);
  debris = new Debris();
  ribbonA = new Ribbon(56);
  ribbonB = new Ribbon(56);
  light = new THREE.PointLight(0xffc880, 0, 0, 2);
  handLight = new THREE.PointLight(0xffd890, 0, 7, 2);
  private lightI = 0;
  private handI = 0;
  private beams: BeamItem[] = [];
  private beamCursor = 0;
  private time = 0;
  // sparks
  private sc = 3200;
  private spHead = 0;
  private spOn = new Uint8Array(this.sc);
  private spP = new Float32Array(this.sc * 3);
  private spV = new Float32Array(this.sc * 3);
  private spAge = new Float32Array(this.sc);
  private spLife = new Float32Array(this.sc);
  private spW = new Float32Array(this.sc);
  private spInt = new Float32Array(this.sc);
  private spC = new Float32Array(this.sc * 3);
  private u = new THREE.Vector3();
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();
  private cam = new THREE.Vector3();
  private camFwd = new THREE.Vector3(0, 0, -1);

  constructor() {
    for (let i = 0; i < 900; i++) {
      this.beams.push({
        on: false, s: new THREE.Vector3(), e: new THREE.Vector3(), w: 1, c: GOLD, int: 1,
        age: 0, life: 1, shape: 0, pow: 1.5,
      });
    }
    this.group.add(
      this.smoke.mesh, this.glow.mesh, this.streaks.mesh, this.sprites.group, this.columns.group,
      this.debris.mesh, this.ribbonA.mesh, this.ribbonB.mesh, this.light, this.handLight,
    );
    this.debris.onSplash = (p) => this.splash(p, 3);
    this.debris.onTrail = (p) => this.trailAt(p, 0.6);
  }

  hooks(): WorldHooks {
    return {
      splash: (p, s) => this.splash(p, s),
      trail: (p, s) => this.trailAt(p, s),
      burn: (p, pw) => this.burnAt(p, pw),
      explode: (p, s) => this.explosion(p, s),
    };
  }

  /* -------- primitives -------- */

  beam(from: THREE.Vector3, to: THREE.Vector3, o: BeamOpts = {}) {
    const b = this.beams[this.beamCursor];
    this.beamCursor = (this.beamCursor + 1) % this.beams.length;
    b.on = true;
    b.s.copy(from);
    b.e.copy(to);
    b.w = o.w ?? 0.5;
    b.c = o.color ?? GOLD;
    b.int = o.int ?? 3;
    b.age = 0;
    b.life = o.life ?? 0.2;
    b.shape = o.shape ?? 0;
    b.pow = o.pow ?? 1.5;
    return b;
  }

  spark(p: THREE.Vector3, v: THREE.Vector3, life: number, w: number, c: RGB = GOLD_HOT, int = 4) {
    const i = this.spHead;
    this.spHead = (this.spHead + 1) % this.sc;
    this.spOn[i] = 1;
    this.spAge[i] = 0;
    this.spLife[i] = life;
    this.spW[i] = w;
    this.spInt[i] = int;
    this.spP[i * 3] = p.x; this.spP[i * 3 + 1] = p.y; this.spP[i * 3 + 2] = p.z;
    this.spV[i * 3] = v.x; this.spV[i * 3 + 1] = v.y; this.spV[i * 3 + 2] = v.z;
    this.spC[i * 3] = c[0]; this.spC[i * 3 + 1] = c[1]; this.spC[i * 3 + 2] = c[2];
  }

  sparkBurst(p: THREE.Vector3, n: number, speed: number, life = 0.8, w = 0.25, c: RGB = GOLD_HOT, bias?: THREE.Vector3) {
    for (let i = 0; i < n; i++) {
      randomUnit(this.u).multiplyScalar(rand(0.2, 1) * speed);
      if (bias) this.u.addScaledVector(bias, speed * rand(0.2, 0.9));
      this.spark(p, this.u, rand(life * 0.4, life), w, Math.random() < 0.12 ? CYAN : c);
    }
  }

  flashLight(pos: THREE.Vector3, intensity: number, color?: number) {
    if (intensity >= this.lightI) {
      this.light.position.copy(pos);
      this.lightI = intensity;
      if (color !== undefined) this.light.color.setHex(color);
    }
  }

  /** short, local light used for fingertip / muzzle flashes */
  handFlash(pos: THREE.Vector3, intensity: number) {
    // keep the light well away from the skin — I/d² explodes (and overflows HDR) when d → 0
    if (intensity > this.handI) {
      this.handI = Math.min(intensity, 4.5);
      this.handLight.position.copy(pos).addScaledVector(this.camFwd, 0.45);
    }
  }

  ring(pos: THREE.Vector3, size: number, life: number, color: RGB = GOLD, int = 1.5, flat = false) {
    return this.sprites.spawn({
      type: SpriteType.Ring, pos, size, life, color, intensity: int, billboard: !flat, quat: flat ? FLAT : undefined,
    });
  }

  flare(pos: THREE.Vector3, size: number, life: number, color: RGB = GOLD_HOT, int = 1.6, near = false) {
    return this.sprites.spawn({ type: SpriteType.Flare, pos, size, life, color, intensity: int, near });
  }

  star(pos: THREE.Vector3, size: number, life: number, color: RGB = GOLD_HOT, int = 2) {
    return this.sprites.spawn({ type: SpriteType.Star, pos, size, life, color, intensity: int, spin: rand(0, TAU) });
  }

  /* -------- composite effects -------- */

  impactSmall(p: THREE.Vector3, dist: number, power = 1) {
    const s = (2.2 + dist * 0.013) * rand(0.75, 1.3) * power;
    this.star(p, s, 0.22, pick([GOLD_HOT, GOLD_HOT, WHITE, CYAN]), 1.9);
    this.glow.emit({ x: p.x, y: p.y, z: p.z, life: 0.25, s0: s * 0.8, s1: s * 0.15, c0: GOLD_HOT, a0: 0.9 });
    this.sparkBurst(p, 4, 18 + dist * 0.06, 0.45, 0.12);
  }

  splash(p: THREE.Vector3, size: number) {
    const s = Math.max(1, size);
    for (let i = 0; i < 22; i++) {
      const a = rand(0, TAU);
      const r = rand(0.1, 0.6) * s * 0.5;
      this.glow.emit({
        x: p.x + Math.cos(a) * r, y: 0.5, z: p.z + Math.sin(a) * r,
        vx: Math.cos(a) * rand(1, 7) * s * 0.3, vy: rand(6, 24) * Math.sqrt(s) * 0.55, vz: Math.sin(a) * rand(1, 7) * s * 0.3,
        life: rand(0.7, 1.6), s0: rand(0.5, 1.4) * Math.sqrt(s) * 0.7, s1: 0.2,
        c0: [1.0, 0.86, 0.66], c1: [0.8, 0.9, 1.0], a0: 0.55, a1: 0, grav: 20, drag: 0.4,
      });
    }
    for (let i = 0; i < 5; i++) {
      this.smoke.emit({
        x: p.x + rand(-1, 1) * s * 0.3, y: 1, z: p.z + rand(-1, 1) * s * 0.3,
        vx: rand(-2, 2), vy: rand(2, 6), vz: rand(-2, 2),
        life: rand(1.6, 2.8), s0: s * 0.35, s1: s * 1.4, c0: [0.95, 0.82, 0.7], c1: [0.8, 0.78, 0.78], a0: 0.35, a1: 0, drag: 0.8,
      });
    }
    this.sprites.spawn({
      type: SpriteType.Ring, pos: new THREE.Vector3(p.x, 0.6, p.z), size: s * 3.2, life: 1.2,
      color: [1, 0.88, 0.7], intensity: 0.9, billboard: false, quat: FLAT,
    });
  }

  burnAt(p: THREE.Vector3, power: number) {
    this.glow.emit({
      x: p.x, y: p.y, z: p.z, vx: rand(-2, 2), vy: rand(3, 9), vz: rand(-2, 2),
      life: rand(0.5, 1.3), s0: rand(1.4, 3.4) * (0.6 + power), s1: 0.3,
      c0: [1, 0.62, 0.2], c1: [1, 0.12, 0.02], a0: 0.85, a1: 0, grav: -1, drag: 0.5,
    });
    if (Math.random() < 0.45) {
      this.smoke.emit({
        x: p.x, y: p.y, z: p.z, vx: rand(-1.5, 1.5), vy: rand(3, 7), vz: rand(-1.5, 1.5),
        life: rand(3.5, 6), s0: 3, s1: rand(12, 20), c0: [0.2, 0.15, 0.12], c1: SMOKE, a0: 0.5, a1: 0, grav: -1.2, drag: 0.3,
      });
    }
  }

  trailAt(p: THREE.Vector3, size: number) {
    this.glow.emit({
      x: p.x, y: p.y, z: p.z, vx: rand(-1, 1), vy: rand(0, 2), vz: rand(-1, 1),
      life: rand(0.4, 0.9), s0: rand(1, 2.2) * size, s1: 0.2, c0: [1, 0.7, 0.3], c1: [1, 0.2, 0.05], a0: 0.8, a1: 0,
    });
    if (Math.random() < 0.5) {
      this.smoke.emit({
        x: p.x, y: p.y, z: p.z, vx: rand(-1, 1), vy: rand(0.5, 2), vz: rand(-1, 1),
        life: rand(1.5, 3), s0: 1.5 * size, s1: 7 * size, c0: [0.22, 0.17, 0.14], c1: SMOKE, a0: 0.4, a1: 0, grav: -0.6,
      });
    }
  }

  explosion(p: THREE.Vector3, s = 1) {
    this.flare(p, 70 * s, 0.6, GOLD_HOT, 2.2);
    this.star(p, 60 * s, 0.45, WHITE, 2.6);
    this.ring(p, 120 * s, 0.9, GOLD, 1.7);
    this.flashLight(p, 7000 * s, 0xffb060);
    const v = this.v;
    for (let i = 0; i < 70; i++) {
      randomUnit(v).multiplyScalar(rand(6, 38) * s);
      this.glow.emit({
        x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z,
        life: rand(0.5, 1.4), s0: rand(4, 10) * s, s1: rand(1, 3) * s,
        c0: [1, 0.86, 0.5], c1: [1, 0.28, 0.04], a0: 0.9, a1: 0, drag: 1.5, grav: -3,
      });
    }
    for (let i = 0; i < 12; i++) {
      randomUnit(v).multiplyScalar(rand(0, 6) * s);
      this.glow.emit({
        x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, life: rand(0.35, 0.7), s0: 14 * s, s1: 26 * s,
        c0: [1, 0.92, 0.65], c1: [1, 0.55, 0.2], a0: 0.65, a1: 0, drag: 2,
      });
    }
    for (let i = 0; i < 26; i++) {
      randomUnit(v).multiplyScalar(rand(2, 14) * s);
      this.smoke.emit({
        x: p.x + rand(-4, 4) * s, y: p.y + rand(-2, 6) * s, z: p.z + rand(-4, 4) * s, vx: v.x, vy: Math.abs(v.y) + 3, vz: v.z,
        life: rand(3, 6), s0: 7 * s, s1: rand(20, 34) * s, c0: [0.22, 0.14, 0.09], c1: SMOKE, a0: 0.62, a1: 0, drag: 0.55, grav: -1.4,
      });
    }
    this.sparkBurst(p, 90, 70 * s, 1.5, 0.4);
    this.debris.burst(p, Math.round(30 * Math.min(s, 2)), 34 * s, 1.1);
    if (p.y < 25) this.splash(new THREE.Vector3(p.x, 0, p.z), 26 * s);
    const col = this.columns.dome(p, 4 * s, 55 * s, 0.7, [1, 0.62, 0.22], 0.9);
    col.hold = false;
  }

  /** lighter, cheaper detonation used for sustained effects */
  blast(p: THREE.Vector3, s = 1) {
    this.flare(p, 24 * s, 0.3, GOLD_HOT, 1.4);
    this.star(p, 20 * s, 0.25, WHITE, 1.8);
    this.flashLight(p, 1400 * s, 0xffb060);
    const v = this.v;
    for (let i = 0; i < 16; i++) {
      randomUnit(v).multiplyScalar(rand(6, 28) * s);
      this.glow.emit({
        x: p.x, y: p.y, z: p.z, vx: v.x, vy: Math.abs(v.y) + 4, vz: v.z, life: rand(0.4, 0.9), s0: rand(3, 7) * s, s1: rand(0.5, 1.5) * s,
        c0: [1, 0.85, 0.5], c1: [1, 0.3, 0.05], a0: 0.85, a1: 0, drag: 1.4, grav: -2,
      });
    }
    this.sparkBurst(p, 26, 55 * s, 0.9, 0.3);
    if (Math.random() < 0.5) {
      this.smoke.emit({
        x: p.x, y: p.y, z: p.z, vx: rand(-3, 3), vy: rand(4, 10), vz: rand(-3, 3), life: rand(2.5, 4.5), s0: 6 * s, s1: 20 * s,
        c0: [0.22, 0.14, 0.09], c1: SMOKE, a0: 0.5, a1: 0, grav: -1.4, drag: 0.5,
      });
    }
  }

  warpLines(from: THREE.Vector3, to: THREE.Vector3, n: number, radius: number, color: RGB = GOLD_HOT) {
    const dir = this.w.copy(to).sub(from);
    const L = dir.length();
    dir.divideScalar(L);
    perpBasis(dir, this.u, this.v);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const t = rand(0, L);
      const ang = rand(0, TAU);
      const rr = radius * (0.14 + 0.86 * Math.sqrt(Math.random()));
      a.copy(from).addScaledVector(dir, t).addScaledVector(this.u, Math.cos(ang) * rr).addScaledVector(this.v, Math.sin(ang) * rr);
      b.copy(a).addScaledVector(dir, rand(30, 120));
      const c = Math.random() < 0.15 ? CYAN : Math.random() < 0.2 ? WHITE : color;
      this.beam(a, b, { w: rand(0.08, 0.4), color: c, int: rand(1.6, 3.6), life: rand(0.6, 1.1), pow: 1.1 });
    }
  }

  /* -------- frame -------- */

  update(dt: number, camera: THREE.Camera) {
    this.time += dt;
    camera.getWorldPosition(this.cam);
    this.camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.streaks.begin();

    for (const b of this.beams) {
      if (!b.on) continue;
      b.age += dt;
      const k = b.age / b.life;
      if (k >= 1) {
        b.on = false;
        continue;
      }
      const a = Math.pow(1 - k, b.pow);
      this.streaks.add(
        b.s.x, b.s.y, b.s.z, b.e.x, b.e.y, b.e.z,
        b.w * (1 - k * 0.55), b.c[0], b.c[1], b.c[2], b.int * (1 + (1 - k) * 1.2), a, b.shape,
      );
    }

    for (let i = 0; i < this.sc; i++) {
      if (!this.spOn[i]) continue;
      this.spAge[i] += dt;
      const k = this.spAge[i] / this.spLife[i];
      if (k >= 1) {
        this.spOn[i] = 0;
        continue;
      }
      const j = i * 3;
      this.spV[j + 1] -= 16 * dt;
      const dr = Math.exp(-0.55 * dt);
      this.spV[j] *= dr; this.spV[j + 1] *= dr; this.spV[j + 2] *= dr;
      this.spP[j] += this.spV[j] * dt;
      this.spP[j + 1] += this.spV[j + 1] * dt;
      this.spP[j + 2] += this.spV[j + 2] * dt;
      if (this.spP[j + 1] < 0.2) {
        this.spOn[i] = 0;
        continue;
      }
      const tl = 0.05;
      this.streaks.add(
        this.spP[j], this.spP[j + 1], this.spP[j + 2],
        this.spP[j] - this.spV[j] * tl, this.spP[j + 1] - this.spV[j + 1] * tl, this.spP[j + 2] - this.spV[j + 2] * tl,
        this.spW[i] * (1 - k * 0.5), this.spC[j], this.spC[j + 1], this.spC[j + 2], this.spInt[i], 1 - k * k, -1,
      );
    }

    this.ribbonA.update(dt);
    this.ribbonB.update(dt);
    this.glow.update(dt);
    this.smoke.update(dt);
    this.sprites.update(dt, camera);
    this.columns.update(dt, this.time);
    this.debris.update(dt);
    this.streaks.end();

    this.lightI *= Math.exp(-7 * dt);
    this.light.intensity = this.lightI;
    this.handI *= Math.exp(-16 * dt);
    this.handLight.intensity = this.handI;

    // ambient golden motes drifting around the viewer
    if (Math.random() < dt * 26) {
      this.glow.emit({
        x: this.cam.x + rand(-40, 40), y: this.cam.y + rand(-8, 25), z: this.cam.z + rand(-70, 10),
        vx: rand(-1, 1.5), vy: rand(-0.2, 0.8), vz: rand(-1, 1),
        life: rand(3, 6), s0: rand(0.1, 0.32), s1: 0.05, c0: pick([GOLD, GOLD_HOT, PINK]), a0: 0.55, a1: 0.0,
      });
    }
  }
}

