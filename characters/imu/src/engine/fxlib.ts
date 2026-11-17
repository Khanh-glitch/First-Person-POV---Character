import * as THREE from "three";
import type { Engine } from "./engine";
import { Dome, Orb, ShockRing, type Actor } from "./actors";
import { clamp, rand, easeOutCubic } from "./util";

const V3 = THREE.Vector3;
const C = THREE.Color;

export const PAL = {
  violet: new C(0.9, 0.15, 1.7),
  violetHot: new C(1.8, 0.7, 2.2),
  crimson: new C(1.9, 0.12, 0.28),
  deepRed: new C(0.7, 0.03, 0.12),
  ember: new C(2.4, 0.55, 0.12),
  white: new C(2.2, 1.9, 2.1),
  hot: new C(2.8, 1.5, 0.9),
  smoke0: new C(0.03, 0.006, 0.04),
  smoke1: new C(0.004, 0, 0.008),
  redSmoke: new C(0.38, 0.05, 0.04),
  bolt0: new C(2.2, 0.2, 0.35),
  bolt1: new C(0.45, 0, 0.14),
  vbolt0: new C(1.8, 0.6, 2.6),
  vbolt1: new C(0.5, 0.05, 0.8),
};

export function randDir(out = new V3()) {
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(a), u, s * Math.sin(a));
}

/** black-flame explosion at a world position. s = scale (1 ≈ small bullet, 3 ≈ huge) */
export function blackExplosion(e: Engine, pos: THREE.Vector3, s = 1) {
  const cam = e.camera.position;
  const dist = pos.distanceTo(cam);
  const near = clamp(1.15 - dist / 420, 0.12, 1);
  const toCam = cam.clone().sub(pos).normalize();
  e.addActor(new Dome(pos, PAL.violet.clone(), 15 * s, 0.85));
  e.addActor(new ShockRing(pos, toCam, PAL.crimson.clone(), 34 * s, 0.9, 0.09));
  e.addActor(new ShockRing(pos, new V3(0.15, 1, 0.1), PAL.violet.clone(), 44 * s, 1.15, 0.07));

  const k = Math.min(s, 2.4);
  const d = new V3();
  for (let i = 0; i < 80 * k; i++) {
    randDir(d);
    const sp = rand(6, 34) * s;
    const r = rand(0, 1.5) * s;
    e.fire.emit({
      x: pos.x + d.x * r,
      y: pos.y + d.y * r,
      z: pos.z + d.z * r,
      vx: d.x * sp,
      vy: d.y * sp,
      vz: d.z * sp,
      life: rand(0.5, 1.4),
      size0: rand(2.5, 5) * s,
      size1: rand(7, 12) * s,
      c0: PAL.violetHot,
      c1: PAL.deepRed,
      a: 0.8,
      drag: 2.4,
    });
  }
  for (let i = 0; i < 40 * k; i++) {
    randDir(d);
    const sp = rand(2, 13) * s;
    e.smoke.emit({
      x: pos.x + d.x * s,
      y: pos.y + d.y * s,
      z: pos.z + d.z * s,
      vx: d.x * sp,
      vy: d.y * sp + 2,
      vz: d.z * sp,
      life: rand(2, 4),
      size0: rand(3, 6) * s,
      size1: rand(11, 17) * s,
      c0: PAL.smoke0,
      c1: PAL.smoke1,
      a: 0.9,
      drag: 1.3,
      turb: 3,
      fadeIn: 0.05,
    });
  }
  for (let i = 0; i < 70 * k; i++) {
    randDir(d);
    const sp = rand(12, 60) * s;
    e.sparks.emit({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      vx: d.x * sp,
      vy: d.y * sp + 6,
      vz: d.z * sp,
      life: rand(1, 2.3),
      size0: rand(0.5, 1.3) * s,
      size1: 0.1,
      c0: PAL.vbolt0,
      c1: PAL.deepRed,
      grav: 9,
      drag: 0.5,
    });
  }
  e.fire.emit({ x: pos.x, y: pos.y, z: pos.z, life: 0.28, size0: 20 * s, size1: 34 * s, c0: PAL.white, a: 1, fadeIn: 0.05 });

  const lp = cam.clone().add(new V3(0, 6, -12));
  e.setLight(lp, 0x9a50ff, 260 * s * near, 5);
  e.shake(0.32 * s * near);
  if (s >= 0.8) {
    e.flash(0x7a40ff, clamp(0.16 * s * near, 0, 0.5), 9);
    e.fx.aberr = Math.max(e.fx.aberr, 0.7 * s * near);
  }
  e.audio.boom(clamp(0.28 * s * near + 0.06, 0, 1.2), 85 / Math.sqrt(s), 1.6 + s * 0.4);
}

/** homing black-flame projectile with fiery trail */
export class Projectile implements Actor {
  obj = new THREE.Group();
  pos: THREE.Vector3;
  vel = new V3();
  private age = 0;
  growTime = 0;
  private orb?: Orb;
  private d = new V3();
  constructor(
    private e: Engine,
    start: THREE.Vector3,
    initialDir: THREE.Vector3,
    private target: THREE.Vector3,
    private speed: number,
    private turn: number,
    private size: number,
    private onHit: (p: THREE.Vector3) => void,
    private trailKind: "omen" | "spear" = "omen",
    mesh: THREE.Object3D | null = null
  ) {
    this.pos = start.clone();
    this.vel.copy(initialDir).normalize().multiplyScalar(speed * 0.5);
    if (trailKind === "omen") {
      this.orb = new Orb(size * 0.5, PAL.violet.clone());
      this.obj.add(this.orb.obj);
    } else if (mesh) {
      this.obj.add(mesh);
    }
    this.obj.position.copy(this.pos);
  }
  update(dt: number, t: number) {
    this.age += dt;
    const e = this.e;
    this.d.subVectors(this.target, this.pos);
    const dist = this.d.length();
    const step = this.speed * dt;
    if (dist < Math.max(step * 1.3, 2.5)) {
      this.onHit(this.pos);
      return false;
    }
    this.d.normalize().multiplyScalar(this.speed);
    const k = 1 - Math.exp(-(this.turn + this.age * this.turn * 1.4) * dt);
    this.vel.lerp(this.d, k);
    const accel = 0.45 + Math.min(1, this.age * 1.6) * 0.55;
    this.vel.setLength(this.speed * accel);
    const prev = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);
    this.obj.position.copy(this.pos);
    if (this.trailKind === "spear") {
      this.obj.lookAt(this.pos.x + this.vel.x, this.pos.y + this.vel.y, this.pos.z + this.vel.z);
    }
    this.orb?.update(dt, t);
    const gm = this.growTime > 0 ? 0.04 + 0.96 * easeOutCubic(this.age / this.growTime) : 1;
    if (this.orb) this.orb.obj.scale.setScalar(gm * (1 + Math.sin(t * 30) * 0.06));

    const n = this.trailKind === "omen" ? 5 : 3;
    for (let j = 0; j < n; j++) {
      const f = j / n;
      const x = prev.x + (this.pos.x - prev.x) * f;
      const y = prev.y + (this.pos.y - prev.y) * f;
      const z = prev.z + (this.pos.z - prev.z) * f;
      const sz = this.size * gm;
      e.fire.emit({
        x,
        y,
        z,
        vx: rand(-1, 1) * sz,
        vy: rand(-0.5, 1.5) * sz,
        vz: rand(-1, 1) * sz,
        life: rand(0.35, 0.7),
        size0: sz * 1.5,
        size1: sz * 0.6,
        c0: PAL.violet,
        c1: PAL.deepRed,
        a: 0.8,
        drag: 2,
      });
      e.smoke.emit({
        x,
        y,
        z,
        vx: rand(-1, 1) * sz * 0.6,
        vy: rand(0, 1.6) * sz,
        vz: rand(-1, 1) * sz * 0.6,
        life: rand(0.8, 1.6),
        size0: sz * 1.0,
        size1: sz * 2.6,
        c0: PAL.smoke0,
        c1: PAL.smoke1,
        a: 0.85,
        drag: 1.2,
        turb: 1.5,
      });
      if (Math.random() < 0.5) {
        e.sparks.emit({
          x,
          y,
          z,
          vx: rand(-1, 1) * sz * 3,
          vy: rand(-1, 2) * sz * 3,
          vz: rand(-1, 1) * sz * 3,
          life: rand(0.3, 0.9),
          size0: sz * 0.28,
          size1: 0.02,
          c0: PAL.vbolt0,
          c1: PAL.deepRed,
          grav: 3,
        });
      }
    }
    return true;
  }
  dispose() {
    this.orb?.dispose();
  }
}

const spearMat = new THREE.MeshStandardMaterial({ color: 0x2a1238, roughness: 0.35, metalness: 0.7, emissive: 0xa030ff, emissiveIntensity: 0.85 });
const goldSpear = new THREE.MeshStandardMaterial({ color: 0xc9a13f, roughness: 0.3, metalness: 1, emissive: 0x4a2a04, emissiveIntensity: 0.8 });
const glowMat = new THREE.MeshBasicMaterial({ color: new C(1.6, 0.2, 0.5) });

/** spear pointing along +Z (use obj.lookAt to aim) */
export function makeSpear(len = 5, r = 0.12) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, len * 0.8, 8), spearMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = len * 0.4;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 2, len * 0.28, 6), spearMat);
  tip.rotation.x = Math.PI / 2;
  tip.position.z = len * 0.8 + len * 0.14;
  g.add(tip);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.25, r * 1.25, len * 0.04, 8), glowMat);
  band.rotation.x = Math.PI / 2;
  band.position.z = len * 0.78;
  g.add(band);
  return g;
}

export function makeTrident(len = 20) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, len, 10), spearMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = len / 2;
  g.add(shaft);
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.07, 6, 14), goldSpear);
    ring.position.z = len * (0.25 + i * 0.12);
    g.add(ring);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.38, 0.5), goldSpear);
  bar.position.z = len;
  g.add(bar);
  const mk = (x: number, h: number, rr: number) => {
    const p = new THREE.Mesh(new THREE.ConeGeometry(rr, h, 8), spearMat);
    p.rotation.x = Math.PI / 2;
    p.position.set(x, 0, len + h / 2);
    g.add(p);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.6, rr * 0.6, 1.4, 8), spearMat);
    base.rotation.x = Math.PI / 2;
    base.position.set(x, 0, len - 0.4);
    g.add(base);
  };
  mk(0, 6.2, 0.62);
  mk(-2.2, 4.2, 0.46);
  mk(2.2, 4.2, 0.46);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), glowMat);
  gem.position.z = len - 1.2;
  g.add(gem);
  return g;
}
