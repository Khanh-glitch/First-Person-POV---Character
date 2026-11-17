import * as THREE from 'three';
import type { Engine } from './engine';
import { MOVES, type MoveId } from './moveData';
import { POSES, type Hand } from './hands';
import { SpriteType, type LightColumn, type Sprite } from './gfx';
import type { Hit } from './world';
import type { Ship } from './ships';
import {
  CYAN, GOLD, GOLD_HOT, TAU, WHITE, clamp, easeInOutCubic, easeInOutSine, easeOutCubic, perpBasis,
  rand, randomUnit, smoothstep,
} from './util';

const V = THREE.Vector3;
const FWD = new V(0, 0, -1);
const Y_AXIS = new V(0, 1, 0);
const Z = new V(0, 0, 1);
const newHit = (): Hit => ({ kind: 'sky', point: new V(), ship: null, dist: 0 });

function segDist(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, tmp: THREE.Vector3) {
  tmp.copy(b).sub(a);
  const l2 = tmp.lengthSq() || 1;
  const t = clamp(p.clone().sub(a).dot(tmp) / l2);
  return p.distanceTo(tmp.multiplyScalar(t).add(a));
}

abstract class Move {
  t = 0;
  done = false;
  cancellable = false;
  private fired = new Set<string>();
  constructor(protected e: Engine, public id: string) {}
  start(): void {}
  end(): void {}
  abstract update(dt: number): void;
  protected once(key: string, cond: boolean) {
    if (cond && !this.fired.has(key)) {
      this.fired.add(key);
      return true;
    }
    return false;
  }
}

/* ================================================================== */
/*  1. 八尺瓊曲玉  Yasakani no Magatama — light barrage                 */
/* ================================================================== */

class Magatama extends Move {
  cancellable = true;
  private acc = 0;
  private flip = false;
  private hit = newHit();
  private tip = new V();
  private u = new V();
  private v = new V();
  private d = new V();
  private p = new V();
  private dn = new V();
  private aimR = new V();
  private aimL = new V();
  private halo: Sprite | null = null;

  start() {
    const e = this.e;
    e.audio.charge(0.32);
    e.post.pulse('chroma', 0.7);
    e.rig.fovKick = -6;
    e.rig.fovKickT = 2;
    const h = e.fx.sprites.spawn({
      type: SpriteType.Halo, pos: new V(), size: 1.35, life: 80, color: GOLD, intensity: 0, near: true, spinRate: 0.7,
    });
    h.onUpdate = (s) => {
      s.mesh.position.set(0, -0.05, -1.3);
      e.camera.localToWorld(s.mesh.position);
      s.intBase = clamp(this.t / 0.35) * 0.22;
    };
    this.halo = h;
  }

  end() {
    const h = this.halo;
    if (!h) return;
    const e = this.e;
    let k = 1;
    const s0 = h.intBase;
    h.onUpdate = (s, dt) => {
      k -= dt * 4;
      s.mesh.position.set(0, -0.05, -1.3);
      e.camera.localToWorld(s.mesh.position);
      s.intBase = s0 * Math.max(0, k);
      if (k <= 0) s.age = s.life;
    };
  }

  update(dt: number) {
    this.t += dt;
    const e = this.e;
    const R = e.hands.right;
    const L = e.hands.left;
    e.localAimDir(R.root.position, this.aimR);
    e.localAimDir(L.root.position, this.aimL);
    // exaggerate the pointing so the finger-guns read clearly in first person
    this.aimR.x -= 0.12; this.aimR.y += 0.3; this.aimR.normalize();
    this.aimL.x += 0.12; this.aimL.y += 0.3; this.aimL.normalize();
    R.setPose(POSES.gun, e.hands.xScale, this.aimR);
    L.setPose(POSES.gun, e.hands.xScale, this.aimL);
    const ch = clamp(this.t / 0.3);
    R.glow = L.glow = 0.25 + ch * 0.8;
    if (this.t < 0.3) {
      for (const h of [R, L]) {
        h.tipWorld('index', this.tip);
        e.fx.flare(this.tip, 0.06 + ch * 0.2, 0.06, GOLD_HOT, 1 + ch * 2, true);
      }
      e.fx.handFlash(this.tip, 1 + ch * 2);
    } else {
      this.acc += dt;
      let n = 0;
      while (this.acc >= 0.05 && n < 3) {
        this.acc -= 0.05;
        n++;
        this.flip = !this.flip;
        this.volley(this.flip ? R : L);
      }
      if (this.acc > 0.1) this.acc = 0;
    }
    if (this.t > 1.5 && !e.holdFire) this.done = true;
    if (this.t > 14) this.done = true;
  }

  private volley(h: Hand) {
    const e = this.e;
    h.tipWorld('index', this.tip);
    const target = e.aim.hit.point;
    this.dn.copy(target).sub(this.tip);
    const dist = this.dn.length();
    this.dn.divideScalar(dist || 1);
    perpBasis(this.dn, this.u, this.v);
    const R = 1.5 + dist * 0.05;
    let shipHits = 0;
    for (let i = 0; i < 7; i++) {
      if (i < 3) {
        const a = rand(0, TAU);
        const r = R * Math.sqrt(Math.random());
        this.p.copy(target).addScaledVector(this.u, Math.cos(a) * r).addScaledVector(this.v, Math.sin(a) * r);
        this.d.copy(this.p).sub(this.tip).normalize();
      } else {
        // wide fan: the barrage sprays across the whole sea
        this.d.copy(this.dn).applyAxisAngle(Y_AXIS, rand(-0.6, 0.6));
        this.d.y += rand(-0.1, 0.22);
        this.d.normalize();
      }
      e.world.rayHit(this.tip, this.d, this.hit);
      const hit = this.hit;
      const end = hit.kind === 'sky' ? this.p.copy(this.tip).addScaledVector(this.d, 700) : hit.point;
      const len = hit.kind === 'sky' ? 700 : hit.dist;
      e.fx.beam(this.tip, end, {
        w: Math.min(8, 0.5 + len * 0.006), shape: 0.8, int: 3.6, life: rand(0.12, 0.26),
        color: Math.random() < 0.14 ? CYAN : GOLD_HOT, pow: 1.3,
      });
      if (hit.kind === 'ship' && hit.ship) {
        e.fx.impactSmall(hit.point, hit.dist);
        e.world.damage(hit.ship, 0.55, hit.point);
        shipHits++;
      } else if (hit.kind === 'water') {
        if (Math.random() < 0.4) e.fx.splash(hit.point, 3 + hit.dist * 0.018);
        e.fx.impactSmall(hit.point, hit.dist, 0.7);
      }
    }
    e.fx.flare(this.tip, 0.34, 0.08, GOLD_HOT, 2.4, true);
    e.fx.handFlash(this.tip, 3.5);
    h.recoil(0.02);
    e.addTrauma(0.035);
    e.audio.zap();
    if (shipHits) {
      e.audio.hit(0.5);
      e.moves.registerHit(shipHits);
    }
    e.post.bloomBoost = Math.max(e.post.bloomBoost, 0.4);
    e.post.pulse('chroma', 0.3);
  }
}

/* ================================================================== */
/*  2. 天叢雲劍  Ama no Murakumo — light sword, X-slash                  */
/* ================================================================== */

const A0 = new V(5.2, 3.0, -6.5);
const A1 = new V(-5.0, -2.6, -6.5);
const B0 = new V(-5.2, 2.8, -6.5);
const B1 = new V(5.0, -2.8, -6.5);
const HP_REST = new V(0.3, -0.25, -0.55);
const HP0 = new V(0.4, 0.04, -0.55);
const HP1 = new V(-0.28, -0.28, -0.62);
const HP2 = new V(-0.3, 0.0, -0.55);
const HP3 = new V(0.38, -0.28, -0.6);

interface Wave {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  start: THREE.Vector3;
  total: number;
  angle: number;
  idx: number;
  sprite: Sprite;
  done: boolean;
}

class Murakumo extends Move {
  private target!: { ship: Ship | null; point: THREE.Vector3 };
  private hp = new V();
  private tipC = new V();
  private dirC = new V();
  private base = new V();
  private tipW = new V();
  private qa = new THREE.Quaternion();
  private qr = new THREE.Quaternion().setFromAxisAngle(Z, -0.9);
  private waves: Wave[] = [];
  private right = new V();
  private up = new V();

  start() {
    const e = this.e;
    this.target = e.lockTarget();
    e.audio.ignite();
    e.fx.ribbonA.clear();
    e.fx.ribbonA.maxAge = 0.42;
    e.fx.ribbonA.intensity = 1.9;
    e.rig.fovKickT = -5;
    e.hands.left.setPose(POSES.fist, e.hands.xScale);
    e.post.hold('dim', 0.12);
  }

  private arc(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, s: number) {
    out.lerpVectors(a, b, s);
    const k = Math.sin(Math.PI * s);
    out.y += k * 0.9;
    out.z -= k * 0.6;
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const e = this.e;
    const R = e.hands.right;
    let slashing = false;
    let shrink = 1;

    if (t < 0.36) {
      const k = easeOutCubic(t / 0.3);
      this.hp.lerpVectors(HP_REST, HP0, k);
      this.dirC.copy(A0).sub(this.hp).normalize();
      this.tipC.copy(this.hp).addScaledVector(this.dirC, 8 * k);
    } else if (t < 0.52) {
      const s = easeInOutCubic((t - 0.36) / 0.16);
      this.hp.lerpVectors(HP0, HP1, s);
      this.arc(this.tipC, A0, A1, s);
      slashing = true;
    } else if (t < 0.64) {
      const s = easeInOutCubic((t - 0.52) / 0.12);
      this.hp.lerpVectors(HP1, HP2, s);
      this.tipC.lerpVectors(A1, B0, s);
    } else if (t < 0.8) {
      const s = easeInOutCubic((t - 0.64) / 0.16);
      this.hp.lerpVectors(HP2, HP3, s);
      this.arc(this.tipC, B0, B1, s);
      slashing = true;
    } else {
      this.hp.copy(HP3);
      shrink = 1 - easeInOutCubic((t - 0.9) / 0.22);
      this.dirC.copy(B1).sub(this.hp);
      const full = this.dirC.length();
      this.dirC.normalize();
      this.tipC.copy(this.hp).addScaledVector(this.dirC, full * shrink);
    }

    // events
    if (this.once('s1', t >= 0.36)) {
      e.audio.slash();
      e.post.pulse('chroma', 1);
      e.post.pulse('radial', 0.35);
      e.addTrauma(0.35);
      e.rig.rollT = 0.1;
      e.rig.fovKick = 10;
      e.rig.fovKickT = 4;
    }
    if (this.once('w1', t >= 0.5)) this.spawnWave(0, 0.5);
    if (this.once('s2', t >= 0.64)) {
      e.audio.slash();
      e.post.pulse('chroma', 1);
      e.post.pulse('radial', 0.35);
      e.addTrauma(0.4);
      e.rig.rollT = -0.1;
    }
    if (this.once('w2', t >= 0.78)) this.spawnWave(1, -0.5);
    if (this.once('end', t >= 0.9)) {
      e.rig.rollT = 0;
      e.rig.fovKickT = 0;
      e.post.release('dim');
    }

    // hand + blade
    R.setPose(POSES.blade, e.hands.xScale);
    this.dirC.copy(this.tipC).sub(this.hp);
    const len = this.dirC.length();
    this.dirC.divideScalar(len || 1);
    this.qa.setFromUnitVectors(FWD, this.dirC).multiply(this.qr);
    const hpx = new V(this.hp.x * e.hands.xScale, this.hp.y, this.hp.z);
    R.place(hpx, this.qa);
    R.glow = 0.6 + 0.4 * Math.sin(t * 30);
    e.hands.left.glow = 0.2;

    if (len > 0.4 && shrink > 0.02) {
      this.base.copy(hpx).addScaledVector(this.dirC, 0.1);
      e.camera.localToWorld(this.base);
      this.tipW.copy(this.tipC);
      e.camera.localToWorld(this.tipW);
      const grow = t < 0.36 ? clamp(t / 0.3) : 1;
      e.fx.beam(this.base, this.tipW, { w: 0.2 + 0.1 * grow, color: WHITE, int: 6, life: 0.05, pow: 0.4, shape: -0.55 });
      e.fx.beam(this.base, this.tipW, { w: 0.75, color: GOLD, int: 1.7, life: 0.05, pow: 0.4, shape: -0.3 });
      e.fx.flare(this.base, 0.45, 0.05, GOLD_HOT, 2, true);
      e.fx.handFlash(this.base, 4);
      if (slashing) {
        e.fx.ribbonA.push(this.base, this.tipW);
        e.fx.sparkBurst(this.tipW, 3, 28, 0.4, 0.12);
      }
    }

    if (t > 1.7 && this.waves.every((w) => w.done)) this.done = true;
    if (t > 4) this.done = true;
  }

  private spawnWave(idx: number, angle: number) {
    const e = this.e;
    const start = e.camera.position.clone().addScaledVector(new V(0, 0, -1).applyQuaternion(e.camera.quaternion), 2.5);
    const dir = this.target.point.clone().sub(start);
    const total = dir.length();
    dir.normalize();
    const sprite = e.fx.sprites.spawn({
      type: SpriteType.Crescent, pos: start, size: 12, life: 6, color: idx ? WHITE : GOLD_HOT, intensity: 3.2,
      seed: 0.17, spin: angle,
    });
    const w: Wave = { pos: start.clone(), dir, start: start.clone(), total, angle, idx, sprite, done: false };
    this.waves.push(w);
    sprite.onUpdate = (s, dt) => {
      w.pos.addScaledVector(w.dir, 640 * dt);
      const trav = w.pos.distanceTo(w.start);
      const size = 12 + trav * 0.3;
      s.mesh.position.copy(w.pos);
      s.s0.set(size, size);
      s.s1.set(size, size);
      this.right.set(1, 0, 0).applyQuaternion(e.camera.quaternion);
      this.up.set(0, 1, 0).applyQuaternion(e.camera.quaternion);
      for (let i = 0; i < 3; i++) {
        const c = rand(-0.5, 0.5) * size * 0.9;
        const px = w.pos.x + (this.right.x * Math.cos(angle) + this.up.x * Math.sin(angle)) * c;
        const py = w.pos.y + (this.right.y * Math.cos(angle) + this.up.y * Math.sin(angle)) * c;
        const pz = w.pos.z + (this.right.z * Math.cos(angle) + this.up.z * Math.sin(angle)) * c;
        e.fx.glow.emit({ x: px, y: py, z: pz, life: 0.35, s0: size * 0.05, s1: 0.1, c0: GOLD_HOT, c1: GOLD, a0: 0.8, drag: 1 });
      }
      this.base.copy(w.pos).addScaledVector(w.dir, -70);
      e.fx.beam(this.base, w.pos, { w: size * 0.05, color: GOLD_HOT, int: 3, life: 0.1, pow: 0.7, shape: -0.6 });
      if (trav >= w.total - 8 && !w.done) {
        w.done = true;
        this.hitCut(w);
        s.age = s.life;
        s.mesh.visible = false;
      }
    };
  }

  private hitCut(w: Wave) {
    const e = this.e;
    const p = w.pos.clone();
    this.right.set(1, 0, 0).applyQuaternion(e.camera.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(e.camera.quaternion);
    const axis = new V().addScaledVector(this.right, Math.cos(w.angle)).addScaledVector(this.up, Math.sin(w.angle));
    const normal = new V().addScaledVector(this.right, -Math.sin(w.angle)).addScaledVector(this.up, Math.cos(w.angle));
    const a = p.clone().addScaledVector(axis, -70);
    const b = p.clone().addScaledVector(axis, 70);
    e.fx.beam(a, b, { w: 3.6, color: WHITE, int: 8, life: 0.5, pow: 1, shape: 0 });
    e.fx.beam(a, b, { w: 10, color: GOLD, int: 1.8, life: 0.55, pow: 1.2, shape: 0 });
    e.fx.star(p, 90, 0.45, WHITE, 3);
    e.fx.flare(p, 100, 0.6, GOLD_HOT, 2.4);
    e.fx.ring(p, 120, 0.7, GOLD, 1.6);
    e.fx.sparkBurst(p, 90, 70, 1.1, 0.3, GOLD_HOT, axis);
    e.fx.flashLight(p, 4500, 0xffcf80);
    const ship = this.target.ship;
    if (ship && ship.alive) e.world.damage(ship, w.idx === 0 ? 52 : 90, p, 'cut', normal);
    else if (!ship) e.fx.explosion(p, 1.0);
    const uv = e.screenUV(p);
    e.post.shock(uv.x, uv.y, 0.04 + 0.03 * w.idx, 1.6, 0.6);
    e.post.pulse('flash', 0.4 + 0.4 * w.idx);
    e.addTrauma(0.6 + 0.35 * w.idx);
    e.hitStop(0.08 + 0.07 * w.idx, 0.04);
    e.audio.boom(0.7 + 0.5 * w.idx);
    e.audio.hit(2);
    e.moves.registerHit(3);
    if (w.idx === 1) {
      e.post.pulse('invert', 0.8);
      e.post.bloomBoost = 0.72;
    }
  }
}

/* ================================================================== */
/*  3. 八咫鏡  Yata no Kagami — mirror bounce → light-speed kick          */
/* ================================================================== */

class Kagami extends Move {
  private pts: THREE.Vector3[] = [];
  private cum: number[] = [];
  private total = 0;
  private target!: { ship: Ship | null; point: THREE.Vector3 };
  private tB = [0.5, 0.55, 0.6, 0.65];
  private tDash = 0.86;
  private travel = 0.66;
  private tHit = 1.52;
  private tRet = 2.47;
  private pos = new V();
  private look = new V();
  private tmp = new V();
  private palm = new V();
  private offEnd = new V();

  start() {
    const e = this.e;
    this.target = e.lockTarget();
    e.events.onCinematic(true);
    e.audio.charge(0.5);
    const P0 = e.rig.pos.clone();
    const T = this.target.point;
    const f = T.clone().sub(P0);
    const D = Math.max(120, f.length());
    f.normalize();
    const right = new V().crossVectors(f, new V(0, 1, 0)).normalize();
    const up = new V().crossVectors(right, f).normalize();
    const mk = (a: number, b: number, c: number) => {
      const p = P0.clone().addScaledVector(f, D * a).addScaledVector(right, D * b).addScaledVector(up, D * c);
      p.y = clamp(p.y, 9, 160);
      return p;
    };
    const M1 = mk(0.3, 0.2, 0.1);
    const M2 = mk(0.52, -0.27, 0.04);
    const M3 = mk(0.74, 0.15, 0.12);
    const end = T.clone().addScaledVector(f, -44);
    end.y = Math.max(end.y, 8);
    this.pts = [P0, M1, M2, M3, end];
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.total = this.cum[this.cum.length - 1];
  }

  private posAt(s: number, out: THREE.Vector3) {
    s = clamp(s, 0, this.total);
    for (let i = 1; i < this.pts.length; i++) {
      if (s <= this.cum[i] || i === this.pts.length - 1) {
        const k = (s - this.cum[i - 1]) / (this.cum[i] - this.cum[i - 1] || 1);
        return out.lerpVectors(this.pts[i - 1], this.pts[i], clamp(k));
      }
    }
    return out.copy(this.pts[this.pts.length - 1]);
  }

  private bounce(i: number) {
    const e = this.e;
    const from = i === 0 ? this.palm.clone() : this.pts[i].clone();
    const to = i === 3 ? this.target.point.clone() : this.pts[i + 1].clone();
    e.fx.beam(from, to, { w: 1.2, color: GOLD_HOT, int: 6, life: 0.32, pow: 0.9, shape: i === 0 ? 0.7 : 0 });
    e.fx.beam(from, to, { w: 3.6, color: GOLD, int: 1.0, life: 0.32, pow: 1.2, shape: i === 0 ? 0.7 : 0 });
    e.audio.tick(i);
    if (i < 3) {
      const m = this.pts[i + 1];
      const mirror = e.fx.sprites.spawn({
        type: SpriteType.Mirror, pos: m, size: [26, 30], life: 1.1, color: i % 2 ? CYAN : GOLD_HOT, intensity: 2.2, spin: rand(-0.4, 0.4),
      });
      mirror.onUpdate = (sp) => {
        sp.intBase = 2.2 * smoothstep(12, 80, sp.mesh.position.distanceTo(e.camera.position));
      };
      e.fx.flare(m, 40, 0.2, WHITE, 2.2);
      e.fx.ring(m, 50, 0.4, GOLD_HOT, 1.3);
      e.fx.sparkBurst(m, 40, 50, 0.9, 0.25);
      e.fx.flashLight(m, 2500, 0xffe0a0);
    }
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const e = this.e;
    const R = e.hands.right;
    const L = e.hands.left;

    if (t < this.tDash) {
      // charge → hands open, light gathers
      R.setPose(POSES.open, e.hands.xScale);
      L.setPose(POSES.open, e.hands.xScale);
      const k = clamp(t / 0.5);
      R.glow = L.glow = k * 1.1;
      R.root.getWorldPosition(this.palm);
      this.palm.addScaledVector(new V(0, 0, -0.2).applyQuaternion(e.camera.quaternion), 1);
      if (t < 0.5) {
        e.fx.flare(this.palm, 0.1 + k * 0.5, 0.06, GOLD_HOT, 1.5 + k * 2, true);
        for (let i = 0; i < 3; i++) {
          randomUnit(this.tmp).multiplyScalar(rand(1.0, 2.2));
          const p = this.palm.clone().add(this.tmp);
          e.fx.glow.emit({
            x: p.x, y: p.y, z: p.z, vx: -this.tmp.x * 6, vy: -this.tmp.y * 6, vz: -this.tmp.z * 6,
            life: 0.18, s0: 0.1, s1: 0.03, c0: GOLD_HOT, a0: 0.9,
          });
        }
        e.post.hold('dim', 0.25 * k);
      } else {
        e.post.release('dim');
      }
    }

    for (let i = 0; i < 4; i++) if (this.once('b' + i, t >= this.tB[i])) this.bounce(i);

    if (this.once('dashStart', t >= this.tDash)) {
      e.audio.whoosh(0.85, 220, 9000, 0.4);
      e.fx.flare(this.pts[0].clone().add(new V(0, 0, -4)), 22, 0.5, WHITE, 2, false);
      e.post.pulse('flash', 0.9);
      for (let i = 0; i < 4; i++) e.fx.warpLines(this.pts[i], this.pts[i + 1], 110, 26);
      e.fx.warpLines(this.pts[3], this.pts[4], 140, 18);
      e.hands.left.setPose(POSES.fist, e.hands.xScale);
      e.hands.right.setPose(POSES.fist, e.hands.xScale);
    }

    if (t >= this.tDash && t < this.tHit) {
      const u = clamp((t - this.tDash) / this.travel);
      const s = easeInOutSine(u) * this.total;
      this.posAt(s, this.pos);
      e.rig.offset.copy(this.pos).sub(e.rig.station);
      this.posAt(s + 6 + this.total * 0.05, this.look);
      this.look.lerp(this.target.point, smoothstep(0.8, 1, u));
      e.rig.lookAt = this.look;
      e.rig.lookWT = 1;
      e.rig.fovKickT = 42 * smoothstep(0, 0.12, u);
      e.post.hold('radial', 1);
      e.post.hold('chroma', 1);
      e.post.hold('warp', 0.7);
      e.post.hold('vignette', 0.25);
      e.post.hold('sat', 1.15);
      for (let m = 1; m <= 3; m++) {
        if (this.once('c' + m, s >= this.cum[m] - 5)) {
          e.post.pulse('flash', 0.28);
          e.post.shock(0.5, 0.5, 0.05, 1.5, 0.4);
          e.rig.roll = (m % 2 ? 1 : -1) * 0.35;
          e.addTrauma(0.4);
          e.audio.tick(m + 1);
        }
      }
      const k = smoothstep(0.45, 0.88, u);
      e.hands.leg.set(k, smoothstep(0.55, 1, u));
      e.fx.handFlash(this.pos, 8);
    }

    if (this.once('hit', t >= this.tHit)) this.impact();

    if (t >= this.tHit && t < this.tRet) {
      e.hands.leg.set(1, 1);
      e.rig.fovKickT = -4;
      e.post.release('radial');
      e.post.release('warp');
      e.post.release('vignette');
      e.post.release('chroma');
      e.post.release('sat');
    }

    if (this.once('ret', t >= this.tRet)) {
      this.offEnd.copy(e.rig.offset);
      e.audio.whoosh(0.4, 400, 9000, 0.35);
      e.post.pulse('flash', 1.03);
      e.post.pulse('radial', 0.9);
      e.rig.lookWT = 0;
      e.fx.flare(e.rig.pos.clone().add(new V(0, 0, -2)), 14, 0.5, WHITE, 2, false);
    }
    if (t >= this.tRet) {
      const u = clamp((t - this.tRet) / 0.3);
      e.rig.offset.copy(this.offEnd).multiplyScalar(1 - easeInOutCubic(u));
      e.hands.leg.set(1 - u, 1 - u);
      e.rig.fovKickT = 0;
    }
    if (t > this.tRet + 0.4) this.done = true;
  }

  private impact() {
    const e = this.e;
    const T = this.target.point;
    const sole = new V();
    e.hands.leg.soleWorld(sole);
    e.fx.columns.beam(sole, T, 0.14, 7, 0.55, GOLD_HOT, 2.6, 0.02, 0.4);
    e.fx.beam(sole, T, { w: 8, color: WHITE, int: 7, life: 0.5, shape: 0.9, pow: 0.8 });
    e.fx.beam(sole, T, { w: 22, color: GOLD, int: 1.5, life: 0.6, shape: 0.9 });
    e.fx.star(T, 150, 0.5, WHITE, 3);
    e.fx.flare(T, 170, 0.7, GOLD_HOT, 2.5);
    if (this.target.ship && this.target.ship.alive) e.world.destroy(this.target.ship, T, 1.6);
    else e.fx.explosion(T, 1.8);
    e.hitStop(0.17, 0.03);
    e.post.pulse('invert', 1);
    e.post.pulse('flash', 1.06);
    e.post.shock(0.5, 0.5, 0.09, 1.8, 0.9);
    e.post.bloomBoost = 0.68;
    e.addTrauma(1);
    e.rig.pushBack = 1.4;
    e.rig.fovKick = -10;
    e.audio.boom(1.5);
    e.audio.sting();
    e.moves.registerHit(5);
  }
}

/* ================================================================== */
/*  4. 天照  Amaterasu — blinding flash, then judgement pillars          */
/* ================================================================== */

interface Strike {
  t: number;
  p: THREE.Vector3;
  r: number;
  big: boolean;
}

class Amaterasu extends Move {
  private target!: { ship: Ship | null; point: THREE.Vector3 };
  private strikes: Strike[] = [];
  private idx = 0;
  private aimR = new V();
  private tip = new V();
  private tip2 = new V();
  private endT = 4;

  start() {
    const e = this.e;
    this.target = e.lockTarget();
    e.events.onCinematic(true);
    e.audio.charge(0.7);
    const base = this.target.point.clone();
    base.y = 0;
    let t = 1.08;
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      const rad = 6 + i * 6;
      this.strikes.push({ t, p: new V(base.x + Math.cos(a) * rad, 0, base.z + Math.sin(a) * rad), r: 3.2 + rand(0, 1.2), big: false });
      t += 0.1 - i * 0.006;
    }
    for (const s of e.world.alive()) {
      if (s === this.target.ship) continue;
      for (let k = 0; k < 2; k++) {
        this.strikes.push({ t, p: new V(s.root.position.x + rand(-30, 30), 0, s.root.position.z + rand(-30, 30)), r: 3.5 + rand(0, 1.2), big: false });
        t += 0.075;
      }
    }
    for (let k = 0; k < 4; k++) {
      this.strikes.push({ t, p: new V(rand(-250, 250), 0, rand(-450, -140)), r: 3 + rand(0, 1.5), big: false });
      t += 0.06;
    }
    this.strikes.push({ t: t + 0.3, p: base, r: 13, big: true });
    this.endT = t + 0.3 + 1.5;
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const e = this.e;
    const R = e.hands.right;

    if (t < 0.9) {
      const k = clamp(t / 0.7);
      e.localAimDir(R.root.position, this.aimR);
      R.setPose(POSES.two, e.hands.xScale, this.aimR);
      R.glow = k * 1.5;
      R.tipWorld('index', this.tip);
      R.tipWorld('middle', this.tip2);
      if (t < 0.7) {
        e.fx.flare(this.tip, 0.05 + k * 0.28, 0.06, GOLD_HOT, 1.5 + k * 3, true);
        e.fx.flare(this.tip2, 0.05 + k * 0.28, 0.06, GOLD_HOT, 1.5 + k * 3, true);
        e.fx.handFlash(this.tip, 2 + k * 6);
        e.post.hold('dim', 0.4 * k);
        e.post.hold('vignette', 0.3 * k);
        e.rig.fovKickT = -7 * k;
        e.rig.trauma = Math.max(e.rig.trauma, 0.05 + 0.18 * k);
      }
    }

    if (this.once('flash', t >= 0.7)) this.flash();

    while (this.idx < this.strikes.length && this.strikes[this.idx].t <= t) this.strike(this.strikes[this.idx++]);

    if (t >= 1.2) {
      R.glow = Math.max(0, R.glow - dt * 2);
      e.rig.fovKickT = 0;
    }
    if (t > this.endT) this.done = true;
  }

  private flash() {
    const e = this.e;
    R_tip(e, this.tip);
    e.post.release('dim');
    e.post.release('vignette');
    e.post.pulse('flash', 1.27);
    e.post.pulse('chroma', 1.4);
    e.post.bloomBoost = 1.03;
    const uv = e.screenUV(this.tip);
    e.post.shock(uv.x, uv.y, 0.07, 1.4, 1.2);
    e.addTrauma(0.75);
    e.rig.fovKick = 26;
    e.rig.fovKickT = 0;
    const fwd = new V(0, 0, -1).applyQuaternion(e.camera.quaternion);
    const c = e.camera.position.clone().addScaledVector(fwd, 40);
    e.fx.sprites.spawn({
      type: SpriteType.Halo, pos: c, size: 100, life: 1.8, color: GOLD_HOT, intensity: 1.0, spinRate: 0.55,
    });
    e.fx.flare(c, 120, 0.7, [1, 0.95, 0.75], 1.4);
    const g = new V(e.camera.position.x, 0.6, e.camera.position.z);
    e.fx.ring(g, 760, 2.4, [1, 0.88, 0.6], 1.1, true);
    setTimeout(() => e.fx.ring(g, 1200, 3.2, [1, 0.8, 0.5], 0.8, true), 220);
    e.fx.flashLight(c, 9000, 0xffe0a0);
    e.audio.sting();
    e.audio.ring(3.2);
    for (const s of e.world.alive()) s.shake = 1.2;
  }

  private strike(s: Strike) {
    const e = this.e;
    const top = new V(s.p.x, 1100, s.p.z);
    const bot = new V(s.p.x, 0, s.p.z);
    e.fx.columns.beam(top, bot, s.r * 1.5, s.r, s.big ? 1.9 : 0.95, [1, 0.88, 0.55], s.big ? 3.4 : 2.4, 0.03, s.big ? 1.1 : 0.6);
    if (s.big) e.fx.columns.beam(top, bot, s.r * 2.6, s.r * 2.1, 1.7, GOLD, 0.9, 0.05, 1.0);
    const hp = new V(s.p.x, 7, s.p.z);
    if (s.big) e.fx.explosion(hp, 2.4);
    else e.fx.blast(hp, 1.1);
    e.fx.ring(new V(s.p.x, 0.6, s.p.z), s.big ? 280 : 90, 1.0, GOLD_HOT, 1.2, true);
    e.fx.splash(s.p, s.big ? 60 : 20);
    e.fx.flare(new V(s.p.x, 28, s.p.z), s.big ? 130 : 56, 0.4, GOLD_HOT, 1.8);
    for (const sh of e.world.alive()) {
      if (sh.root.position.distanceTo(s.p) < (s.big ? 95 : 50)) {
        e.world.damage(sh, s.big ? 999 : 46, s.p);
        e.moves.registerHit(2);
      }
    }
    e.addTrauma(s.big ? 1 : 0.28);
    e.post.pulse('flash', s.big ? 1.2 : 0.18);
    const uv = e.screenUV(hp);
    e.post.shock(uv.x, uv.y, s.big ? 0.07 : 0.02, s.big ? 1.8 : 1.2, 0.5);
    e.audio.boom(s.big ? 1.6 : 0.45);
    if (s.big) {
      e.hitStop(0.18, 0.1);
      e.audio.sting();
      e.post.bloomBoost = 0.9;
    }
  }
}

function R_tip(e: Engine, out: THREE.Vector3) {
  e.hands.right.tipWorld('index', out);
}

/* ================================================================== */
/*  5. 天岩戸  Ama no Iwato — ultimate laser                            */
/* ================================================================== */

class Iwato extends Move {
  private orb = new V();
  private tp = new V();
  private halo!: Sprite;
  private core!: Sprite;
  private col: LightColumn | null = null;
  private col2: LightColumn | null = null;
  private firedT = -1;
  private impactAcc = 0;
  private tmpA = new V();
  private tmpB = new V();
  private tmpC = new V();
  private target!: { ship: Ship | null; point: THREE.Vector3 };
  private fireAt = 1.7;
  private beamLen = 1.55;

  private orbWorld() {
    return this.e.camera.localToWorld(this.orb.set(0, -0.07, -0.95));
  }

  start() {
    const e = this.e;
    e.events.onCinematic(true);
    e.audio.charge(this.fireAt + 0.05, true);
    this.halo = e.fx.sprites.spawn({
      type: SpriteType.Halo, pos: new V(), size: 2.1, life: 60, color: GOLD, intensity: 0, near: true, spinRate: 0.9,
    });
    this.halo.onUpdate = (s, dt) => {
      s.mesh.position.set(0, -0.07, -1.25);
      e.camera.localToWorld(s.mesh.position);
      const k = clamp(this.t / this.fireAt);
      s.intBase = this.firedT < 0 ? k * 0.55 : Math.max(0, 0.55 - this.firedT * 3);
      s.spinRate = 0.9 + k * 3;
      if (this.firedT > 0.3) s.age = s.life;
      void dt;
    };
    this.core = e.fx.sprites.spawn({
      type: SpriteType.Flare, pos: new V(), size: 0.1, life: 60, color: GOLD_HOT, intensity: 0, near: true,
    });
    this.core.onUpdate = (s) => {
      const k = clamp(this.t / this.fireAt);
      const size = this.firedT < 0 ? 0.08 + 1.15 * k * k : 1.2 * Math.max(0, 1 - this.firedT * 3);
      s.mesh.position.copy(this.orb);
      s.s0.set(size, size);
      s.s1.set(size, size);
      s.intBase = this.firedT < 0 ? 1 + k * 3 : 4;
      if (this.firedT > 0.35) s.age = s.life;
    };
  }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    const e = this.e;
    const R = e.hands.right;
    const L = e.hands.left;
    this.orbWorld();

    if (t < this.fireAt) {
      const k = clamp(t / this.fireAt);
      R.setPose(POSES.open, e.hands.xScale);
      L.setPose(POSES.open, e.hands.xScale);
      R.glow = L.glow = 0.2 + k * 1.3;
      e.post.hold('dim', 0.55 * k);
      e.post.hold('vignette', 0.3 * k);
      e.post.hold('radial', 0.14 * k);
      e.rig.fovKickT = -12 * k;
      e.rig.trauma = Math.max(e.rig.trauma, 0.04 + 0.3 * k * k);
      const n = Math.ceil(220 * dt * (0.3 + k));
      for (let i = 0; i < n; i++) {
        randomUnit(this.tmpA).multiplyScalar(rand(3, 10));
        const p = this.tmpB.copy(this.orb).add(this.tmpA);
        e.fx.glow.emit({
          x: p.x, y: p.y, z: p.z, vx: -this.tmpA.x / 0.45, vy: -this.tmpA.y / 0.45, vz: -this.tmpA.z / 0.45,
          life: 0.45, s0: 0.2, s1: 0.04, c0: GOLD_HOT, c1: GOLD, a0: 0.9,
        });
      }
      e.fx.handFlash(this.orb, 2 + k * 14);
      if (this.once('p1', t >= 0.85)) {
        e.fx.ring(this.orb.clone(), 3, 0.7, GOLD_HOT, 1.3);
        e.post.shock(0.5, 0.47, 0.025, 1.2, 0.6);
        e.addTrauma(0.3);
      }
    }

    if (this.once('fire', t >= this.fireAt)) this.fire();

    if (this.firedT >= 0) {
      this.firedT += dt;
      const ft = this.firedT;
      R.glow = L.glow = 0.9;
      if (ft < this.beamLen) {
        const dist = this.orb.distanceTo(this.tp);
        e.fx.beam(this.orb, this.tp, { w: dist * 0.06, shape: 0.95, int: 2.6, life: 0.05, pow: 0.3, color: GOLD_HOT });
        e.fx.beam(this.orb, this.tp, { w: dist * 0.02, shape: 0.9, int: 3.6, life: 0.05, pow: 0.3, color: WHITE });
        e.rig.trauma = Math.max(e.rig.trauma, 0.6);
        e.rig.fovKickT = 8;
        e.post.hold('radial', 0.26);
        e.post.hold('chroma', 0.7);
        e.fx.handFlash(this.orb, 3);
        e.fx.flashLight(this.tp.clone().setY(14), 1800, 0xffb060);
        this.impactAcc += dt;
        while (this.impactAcc > 0.055) {
          this.impactAcc -= 0.055;
          this.tmpC.set(this.tp.x + rand(-14, 14), rand(2, 12), this.tp.z + rand(-14, 14));
          e.fx.blast(this.tmpC, 0.95);
          if (Math.random() < 0.35) e.fx.ring(new V(this.tp.x, 0.6, this.tp.z), 70, 0.8, GOLD_HOT, 1, true);
          if (Math.random() < 0.4) e.fx.splash(new V(this.tp.x + rand(-20, 20), 0, this.tp.z + rand(-20, 20)), 30);
        }
        for (const s of e.world.alive()) {
          const c = s.center;
          if (c.distanceTo(this.tp) < 150 || segDist(c, this.orb, this.tp, this.tmpA) < 28) {
            if (e.world.damage(s, 220 * dt, c)) e.moves.registerHit(5);
          }
        }
      } else {
        e.post.release('radial');
        e.post.release('chroma');
        e.rig.fovKickT = 0;
      }
      if (this.once('finale', ft >= this.beamLen - 0.05)) this.finale();
    }

    if (t > this.fireAt + 3.4) this.done = true;
  }

  private fire() {
    const e = this.e;
    this.target = e.lockTarget();
    this.tp.copy(this.target.point);
    if (!this.target.ship) this.tp.copy(e.aim.hit.point);
    this.firedT = 0;
    e.post.release('dim');
    e.post.release('vignette');
    e.post.pulse('flash', 1.18);
    e.post.pulse('chroma', 1.3);
    e.post.bloomBoost = 0.99;
    e.post.shock(0.5, 0.47, 0.08, 1.7, 0.9);
    e.rig.fovKick = 24;
    e.rig.pushBack = 1.1;
    e.addTrauma(1);
    e.audio.beam(this.beamLen);
    e.audio.boom(1.2);
    const ext = this.tp.clone().sub(this.orb).normalize().multiplyScalar(80).add(this.tp);
    this.col = e.fx.columns.beam(this.orb, ext, 0.34, 24, this.beamLen, GOLD, 1.5, 0.06, 0.5);
    this.col2 = e.fx.columns.beam(this.orb, ext, 0.16, 9, this.beamLen, WHITE, 2.2, 0.06, 0.5);
    this.col.onUpdate = (c) => {
      c.from.copy(this.orb);
      c.r1 = 24 * (1 + 0.1 * Math.sin(this.t * 38));
    };
    this.col2.onUpdate = (c) => {
      c.from.copy(this.orb);
      c.r1 = 9 * (1 + 0.15 * Math.sin(this.t * 51));
    };
    e.fx.flare(this.orb.clone(), 2.2, 0.5, WHITE, 3, true);
  }

  private finale() {
    const e = this.e;
    const g = this.tp.clone();
    g.y = 0;
    const top = new V(g.x, 1600, g.z);
    e.fx.columns.beam(top, g, 30, 24, 1.7, GOLD_HOT, 2.6, 0.05, 1.2);
    e.fx.columns.beam(top, g, 62, 48, 1.5, GOLD, 0.8, 0.08, 1.1);
    e.fx.columns.dome(g.clone().setY(8), 6, 150, 1.4, [1, 0.65, 0.25], 1);
    e.fx.columns.dome(g.clone().setY(8), 6, 95, 1.1, [1, 0.9, 0.7], 1);
    e.fx.explosion(g.clone().setY(10), 3.0);
    e.fx.ring(new V(g.x, 0.6, g.z), 900, 2.2, GOLD_HOT, 1.2, true);
    e.fx.splash(g, 90);
    for (const s of e.world.alive()) if (s.root.position.distanceTo(g) < 420) e.world.destroy(s, s.center, 1.4);
    e.post.pulse('flash', 1.3);
    e.post.pulse('invert', 1);
    e.post.shock(0.5, 0.5, 0.1, 2.2, 1.4);
    e.post.bloomBoost = 1.17;
    e.hitStop(0.28, 0.12);
    e.addTrauma(1);
    e.audio.boom(2.4);
    e.audio.ring(3.5);
    e.audio.sting();
  }
}

/* ================================================================== */
/*  Pika step — light-speed side blink                                  */
/* ================================================================== */

class StepMove extends Move {
  private from = new V();
  private to = new V();

  constructor(e: Engine, private dir: number) {
    super(e, 'step');
  }

  start() {
    const e = this.e;
    const idx = e.moves.stationIdx;
    const next = ((idx + 1 + this.dir + 3) % 3) - 1;
    e.moves.stationIdx = next;
    this.from.copy(e.rig.station);
    this.to.set(next * 36, 9, next === 0 ? 0 : 6);
    e.audio.whoosh(0.28, 600, 8000, 0.3);
    e.post.pulse('flash', 0.5);
    e.post.pulse('chroma', 1);
    e.fx.flare(this.from.clone().add(new V(0, 0, -3)), 7, 0.4, WHITE, 2, false);
    e.fx.sparkBurst(this.from.clone().add(new V(0, -1, -3)), 40, 30, 0.8, 0.2);
    e.fx.warpLines(this.from, this.to, 80, 6);
    e.addTrauma(0.3);
  }

  update(dt: number) {
    this.t += dt;
    const e = this.e;
    const u = easeInOutCubic(this.t / 0.17);
    e.rig.station.lerpVectors(this.from, this.to, u);
    const s = Math.sin(Math.PI * clamp(this.t / 0.17));
    e.rig.fovKick = Math.max(e.rig.fovKick, 20 * s);
    e.post.pulse('radial', 0.9 * s);
    e.rig.roll = Math.sign(this.to.x - this.from.x || 1) * -0.12 * s;
    if (this.once('arrive', this.t >= 0.17)) {
      e.fx.flare(e.camera.position.clone().add(new V(0, 0, -3)), 5, 0.3, GOLD_HOT, 1.5, true);
      e.post.pulse('flash', 0.25);
    }
    if (this.t > 0.3) this.done = true;
  }
}

/* ================================================================== */
/*  Runner                                                              */
/* ================================================================== */

export class MoveRunner {
  active: Move | null = null;
  cd: number[] = MOVES.map(() => 0);
  combo = 0;
  stationIdx = 0;
  private comboT = 0;
  private stepCd = 0;

  constructor(private e: Engine) {}

  get activeId(): MoveId | null {
    const a = this.active;
    return a && a.id !== 'step' ? (a.id as MoveId) : null;
  }

  cooldownRatios() {
    return this.cd.map((c, i) => (MOVES[i].cooldown > 0 ? clamp(c / MOVES[i].cooldown) : 0));
  }

  registerHit(n: number) {
    this.combo += n;
    this.comboT = 2.4;
  }

  private finish() {
    const a = this.active;
    if (!a) return;
    a.end();
    const idx = MOVES.findIndex((m) => m.id === a.id);
    if (idx >= 0) this.cd[idx] = MOVES[idx].cooldown;
    this.active = null;
    this.e.resetPose();
  }

  start(id: MoveId): boolean {
    const idx = MOVES.findIndex((m) => m.id === id);
    if (idx < 0 || this.cd[idx] > 0) return false;
    if (this.active) {
      if (this.active.cancellable && this.active.id !== id) this.finish();
      else return false;
    }
    const e = this.e;
    let m: Move;
    switch (id) {
      case 'magatama': m = new Magatama(e, id); break;
      case 'murakumo': m = new Murakumo(e, id); break;
      case 'kagami': m = new Kagami(e, id); break;
      case 'amaterasu': m = new Amaterasu(e, id); break;
      default: m = new Iwato(e, id);
    }
    this.active = m;
    m.start();
    e.events.onCast(MOVES[idx]);
    return true;
  }

  step(dir: number) {
    if (this.stepCd > 0) return;
    if (this.active) {
      if (this.active.cancellable) this.finish();
      else return;
    }
    this.stepCd = 0.55;
    this.active = new StepMove(this.e, dir);
    this.active.start();
  }

  update(dt: number) {
    for (let i = 0; i < this.cd.length; i++) this.cd[i] = Math.max(0, this.cd[i] - dt);
    this.stepCd = Math.max(0, this.stepCd - dt);
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    if (this.active) {
      this.active.update(dt);
      if (this.active.done) this.finish();
    } else {
      this.e.hands.both('rest');
    }
  }
}
