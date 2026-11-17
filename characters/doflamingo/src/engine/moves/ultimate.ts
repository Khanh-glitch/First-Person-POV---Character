import * as THREE from "three";
import { Move, rnd, clamp01, easeOut, easeInOut } from "./base";
import { curvePts } from "../fx/Strings";

/* ------------------------------------------------------------------ */
/* 5. FULBRIGHT — strings rain from the sky                            */
/* ------------------------------------------------------------------ */
interface Drop {
  x: number;
  z: number;
  gy: number;
  t0: number;
  hit: boolean;
  hitT: number;
  ox: number;
  oz: number;
}
export class Fulbright extends Move {
  duration = 5.6;
  drops: Drop[] = [];
  top = 320;
  speed = 520;
  hits = 0;

  setup() {
    const e = this.e;
    e.setCinema(true);
    e.hands.pose("sky", "R", 60);
    e.hands.pose("ready", "L", 40);
    e.look(0.05, 0.62, 2.2);
    e.stormTarget = 1;
    this.stops.push(e.audio.drone({ type: "rumble", vol: 0.5, dur: 4.6, f: 90 }));
    this.at(0.4, () => e.sfx("ゴロゴロ…", { x: 0.65, y: 0.25, size: 1, color: "#bcd8ff" }));
    this.at(1.35, () => {
      e.hands.pose("clawDown", "R", 360);
      e.hands.R.kick(new THREE.Vector3(0, -0.04, 0), new THREE.Vector3(-0.6, 0, 0));
      e.look(0, -0.14, 3.5);
      e.audio.whoosh(0.5, 0.7, 300, 4000);
      e.fovKick(5);
      e.speed(0.8, 0.4);
    });
    this.at(1.9, () => {
      e.impact(1);
      e.shake(0.6);
      e.sfx("ズドドドドッ!!", { x: 0.5, y: 0.3, size: 1.8, color: "#ffffff", rot: -4 });
    });
    this.at(3.0, () => e.sfx("降無頼糸", { x: 0.25, y: 0.42, size: 1.2, color: "#9fd8ff", rot: 8 }));
    this.at(4.2, () => {
      e.hands.pose("idle", "both", 40);
      e.stormTarget = 0;
      e.look(0, 0, 1.5);
    });
    // build drops
    for (let i = 0; i < 170; i++) {
      let x: number, z: number;
      if (i < 14) {
        x = rnd(-12, 12);
        z = rnd(-22, -8);
      } else {
        x = rnd(-140, 140);
        z = rnd(-40, -280);
      }
      this.drops.push({ x, z, gy: e.world.groundAt(x, z), t0: 1.4 + Math.pow(Math.random(), 1.3) * 1.9, hit: false, hitT: 0, ox: rnd(-30, 30), oz: rnd(-30, 30) });
    }
  }

  tick(dt: number) {
    const e = this.e;
    const t = this.t;
    // gathering glints in the clouds
    if (t < 1.6) {
      for (let k = 0; k < 4; k++) {
        e.glow.emit({ pos: new THREE.Vector3(rnd(-160, 160), rnd(160, 260), rnd(-40, -300)), count: 1, speed: 2, color: 0xcfe6ff, size: 9, life: 0.6 });
      }
      e.hands.R.shake = 0.2;
    } else e.hands.R.shake = 0;
    // sky string from finger to clouds during charge
    if (t < 1.5) {
      const tip = this.tipsR[1];
      const end = this.tmp.copy(tip).add(this.tmp2.set(0, 260 * easeOut(t / 0.6), -60));
      curvePts(this.pts, tip, end, 16, 0, 0.2, t, 1);
      e.mid.line(this.pts, this.c.set(0xcfe6ff), 1.6 * (1 - clamp01((t - 1.3) * 5)));
    }
    let hitsThisFrame = 0;
    for (const d of this.drops) {
      if (t < d.t0) continue;
      const fall = (t - d.t0) * this.speed;
      const y = this.top - fall;
      const sx = d.x + d.ox,
        sz = d.z + d.oz;
      if (!d.hit && y <= d.gy) {
        d.hit = true;
        d.hitT = t;
        hitsThisFrame++;
        this.onHit(d);
      }
      const fade = d.hit ? Math.max(0, 1 - (t - d.hitT) / 1.4) : 1;
      if (fade <= 0) continue;
      const hy = Math.max(d.gy, y);
      const k = (hy - d.gy) / (this.top - d.gy);
      const head = this.tmp.set(d.x + d.ox * k, hy, d.z + d.oz * k);
      const tail = this.tmp2.set(sx, this.top, sz);
      this.c.setRGB(0.85, 0.92, 1);
      e.thin.seg(tail, head, this.c, 0.35 * fade, this.c, 1.4 * fade);
      if (!d.hit) {
        const streak = new THREE.Vector3().copy(head).add(new THREE.Vector3(-d.ox / this.top * 18, 18, -d.oz / this.top * 18));
        e.mid.seg(streak, head, this.c, 0.3, this.c.setRGB(1, 1, 1), 3);
      }
    }
    if (hitsThisFrame) e.shake(0.05 * Math.min(4, hitsThisFrame));
    void dt;
  }

  onHit(d: Drop) {
    const e = this.e;
    const p = new THREE.Vector3(d.x, d.gy + 0.1, d.z);
    this.hits++;
    e.glow.emit({ pos: p, count: 18, speed: 14, color: 0xbfe0ff, color2: 0xffffff, size: 1.2, life: 0.5, gravity: 16, dir: new THREE.Vector3(0, 1, 0), spread: 0.9 });
    e.smoke.emit({ pos: p, count: 4, speed: 4, color: 0x7a6a70, size: 8, life: 2, grow: 1.5, dir: new THREE.Vector3(0, 1, 0), spread: 1 });
    e.fx.ring(p, 0.2, d.z > -26 ? 2.5 : 7, 0.45, d.z > -26 ? 0x506070 : 0xbfe0ff, { thick: 0.18 });
    if (this.hits % 3 === 0) e.audio.twang(500 + Math.random() * 800, 0.18);
    if (this.hits % 7 === 0) e.audio.boom(0.35, 0.8, 70 + Math.random() * 40);
    if (this.hits % 2 === 0) e.audio.crack(0.18);
    if (this.hits % 10 === 0) e.fx.flashLight(p.clone().setY(8), 0xbfe0ff, 3000, 0.3, 90);
    const near = e.world.buildingsNear(p, 1.5);
    near.forEach((i) => {
      if (e.world.collapse(i, 0.05, 1.2)) e.fx.spawnDebris(new THREE.Vector3(e.world.buildings[i].x, e.world.buildings[i].cur, e.world.buildings[i].z), 8, e.world.buildings[i].color, 12, 0.8);
    });
    for (const pp of e.world.puppets) {
      if (pp.mode !== "fly" && pp.root.position.distanceTo(p) < 3) {
        e.world.hitPuppet(pp, pp.root.position.clone().sub(p).setY(0).normalize(), 2);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* 6. TORIKAGO — the Birdcage                                          */
/* ------------------------------------------------------------------ */
export class Torikago extends Move {
  duration = 10;
  center = new THREE.Vector3(0, 0, -170);
  apex = new THREE.Vector3(0, 540, -170);
  R = 430;
  N = 140;
  strings: { phi: number; delay: number; landed: boolean }[] = [];
  shrink = 0;
  lastR = 430;

  setup() {
    const e = this.e;
    e.setCinema(true);
    e.hands.pose("spreadWide", "both", 30);
    e.look(0.0, 0.25, 1.5);
    e.grade.uniforms.uTint.value.setRGB(1.1, 0.75, 1.05);
    e.tintTarget = 0.3;
    e.stormTarget = 0.45;
    this.stops.push(e.audio.drone({ type: "choir", vol: 0.25, dur: 9, f: 73 }));
    this.stops.push(e.audio.drone({ type: "rumble", vol: 0.45, dur: 9.5, f: 70 }));
    for (let i = 0; i < this.N; i++) this.strings.push({ phi: (i / this.N) * Math.PI * 2 + rnd(-0.01, 0.01), delay: rnd(0, 0.9), landed: false });
    this.at(0.8, () => {
      e.hands.pose("raise", "both", 25);
      e.look(0.15, 0.95, 0.9);
    });
    this.at(1.4, () => {
      e.fx.fireball(this.apex, 25, 1.0, 0xffa0e0);
      e.fx.ring(this.apex, 5, 160, 1.6, 0xff9ad5, { face: true, thick: 0.1 });
      e.audio.boom(0.6, 2.4, 40);
      e.audio.shing(0.2, 900);
      e.flash(0.25, 0xffd0f0);
      e.sfx("ゴゴゴゴゴ", { x: 0.18, y: 0.3, size: 1.4, color: "#ff9ad5", rot: -10 });
    });
    this.at(3.2, () => {
      e.look(-0.25, 0.32, 0.7);
      e.hands.pose("ready", "both", 30);
    });
    this.at(4.3, () => {
      e.impact(0.9, false);
      e.audio.boom(0.9, 3, 35);
      e.shake(0.5);
      e.sfx("鳥カゴ", { x: 0.7, y: 0.28, size: 1.9, color: "#ff4fa3", rot: 4 });
    });
    this.at(5.6, () => {
      e.hands.pose("laugh", "R", 30);
      e.sfx("フッフッフッ…", { x: 0.62, y: 0.6, size: 1.1, color: "#ffd1ec" });
      e.look(0.3, 0.1, 0.6);
    });
    this.at(8.2, () => {
      e.hands.pose("idle", "both", 30);
      e.look(0, 0, 1);
      e.tintTarget = 0;
      e.stormTarget = 0;
    });
  }

  domePoint(phi: number, u: number, R: number, out: THREE.Vector3) {
    const a = u * Math.PI * 0.5;
    const H = this.apex.y;
    return out.set(this.center.x + Math.sin(a) * Math.cos(phi) * R, H * Math.cos(a) * (1 - 0.0 * u), this.center.z + Math.sin(a) * Math.sin(phi) * R);
  }

  tick(dt: number) {
    const e = this.e;
    const t = this.t;
    const fade = 1 - clamp01((t - 8.6) / 1.3);
    // shrinking
    if (t > 5.2) this.shrink = easeInOut((t - 5.2) / 3.4);
    const R = this.R - this.shrink * 70;
    // apex knot glow
    if (t > 1.2 && fade > 0.1 && Math.random() < 0.5) {
      e.glow.emit({ pos: this.apex, count: 1, speed: 20, color: 0xffd0f0, size: 10, life: 0.6, posJitter: 15 });
    }
    // descending strings
    const segs = 28;
    for (const s of this.strings) {
      const g = easeInOut((t - 1.3 - s.delay) / 2.2);
      if (g <= 0) continue;
      while (this.pts.length < segs + 1) this.pts.push(new THREE.Vector3());
      this.pts.length = segs + 1;
      for (let k = 0; k <= segs; k++) {
        const u = (k / segs) * g;
        this.domePoint(s.phi, u, R, this.pts[k]);
        const wob = Math.sin(u * 20 + t * 2 + s.phi * 5) * 2 * u;
        this.pts[k].x += wob;
      }
      const flick = 0.8 + 0.2 * Math.sin(t * 7 + s.phi * 30);
      const major = Math.round(s.phi * 100) % 4 === 0;
      (major ? e.mid : e.thin).line(this.pts, this.c.setRGB(1, 0.78, 0.95), (major ? 0.75 : 0.9) * fade * flick, (k) => 0.25 + k * 0.75);
      // bright growing head
      if (g < 1) {
        const head = this.pts[segs];
        if (Math.random() < 0.25) e.glow.emit({ pos: head, count: 1, speed: 1, color: 0xffffff, size: 6, life: 0.25 });
      } else if (!s.landed) {
        s.landed = true;
        const foot = this.pts[segs].clone().setY(0.2);
        e.glow.emit({ pos: foot, count: 10, speed: 20, color: 0xffb0e0, size: 4, life: 0.8, gravity: 12 });
        e.smoke.emit({ pos: foot, count: 3, speed: 8, color: 0x7a5a70, size: 25, life: 3, grow: 1.4 });
        if (Math.random() < 0.15) e.audio.twang(150 + Math.random() * 200, 0.15);
      }
    }
    // shrink: cut through town at the feet
    if (this.shrink > 0 && fade > 0.3) {
      const w = e.world;
      w.buildings.forEach((b, i) => {
        if (b.state === "down") return;
        const d = Math.hypot(b.x - this.center.x, b.z - this.center.z);
        if (d <= this.lastR + 3 && d > R - 3) {
          if (w.collapse(i, 0, 1.3) && Math.random() < 0.4) {
            e.glow.emit({ pos: new THREE.Vector3(b.x, b.cur * 0.5, b.z), count: 14, speed: 10, color: 0xff9ad5, size: 2, life: 0.6, gravity: 10 });
          }
        }
      });
      for (let k = 0; k < 6; k++) {
        const phi = Math.random() * Math.PI * 2;
        const p = new THREE.Vector3(this.center.x + Math.cos(phi) * R, 0.5, this.center.z + Math.sin(phi) * R);
        e.glow.emit({ pos: p, count: 3, speed: 10, color: 0xff9ad5, color2: 0xffffff, size: 3, life: 0.5, gravity: 10 });
      }
      e.trauma = Math.max(e.trauma, 0.25);
    }
    this.lastR = R;
    void dt;
  }
}

/* ------------------------------------------------------------------ */
/* 7. KAMICHŪSATSU — God Thread                                        */
/* ------------------------------------------------------------------ */
export class GodThread extends Move {
  duration = 6.2;
  fireT = 2.4;
  hitT = 0;
  target = new THREE.Vector3(55, 12, -150);
  focus = new THREE.Vector3();
  head = new THREE.Vector3();
  launched = false;
  hit = false;
  dist = 0;

  setup() {
    const e = this.e;
    e.setCinema(true);
    e.hands.pose("gather", "both", 45);
    e.look(-0.33, -0.05, 2);
    e.fovTarget = -10;
    e.grade.uniforms.uTint.value.setRGB(1.2, 0.75, 0.8);
    e.tintTarget = 0.25;
    this.stops.push(e.audio.drone({ type: "whine", vol: 0.18, dur: this.fireT, f: 90 }));
    this.stops.push(e.audio.drone({ type: "rumble", vol: 0.45, dur: this.fireT + 0.2, f: 100 }));
    for (let i = 0; i < 10; i++) this.at(0.1 + i * 0.07, () => e.audio.twang(250 + i * 60, 0.22));
    this.at(0.8, () => e.sfx("ギュルルル", { x: 0.5, y: 0.66, size: 1.1, color: "#ff6a8a" }));
    this.at(this.fireT - 0.25, () => {
      e.hands.pose({ pos: [0.14, -0.12, -0.38], rot: [1.2, 0.2, 0.2], curl: [0.4, 0.4, 0.4, 0.4, 0.4], spread: 0.6 }, "both", 200);
    });
    this.at(this.fireT, () => {
      this.launched = true;
      this.focus.copy(this.focusPoint());
      this.head.copy(this.focus);
      e.hands.pose("thrust", "both", 520);
      e.hands.R.kick(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0.3, 0, 0));
      e.hands.L.kick(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(0.3, 0, 0));
      e.fovTarget = 4;
      e.fovKick(-6);
      e.speed(1.2, 0.5);
      e.zoomBlur(0.45);
      e.audio.whoosh(0.5, 1, 200, 7000);
      e.audio.shing(0.25, 1200);
      e.sfx("神誅殺", { x: 0.3, y: 0.3, size: 1.9, color: "#ff2a55", rot: -6 });
    });
    this.at(4.4, () => {
      e.hands.pose("idle", "both", 30);
      e.look(0, 0, 1);
      e.fovTarget = 0;
      e.tintTarget = 0;
    });
  }

  focusPoint() {
    return this.cam(0, -0.06, -2.4);
  }

  onImpact() {
    const e = this.e;
    const p = this.target.clone();
    this.hit = true;
    this.hitT = this.t;
    e.slow(0.2, 0.9);
    e.impact(1, true);
    setTimeout(() => e.impact(1, false), 120);
    e.flash(0.75, 0xfff0f4);
    e.shake(1.2);
    const camDir = e.camera.position.clone().sub(p).setY(0).normalize();
    e.fx.cut(p.clone().setY(0), new THREE.Vector3(0, 1, 0), 420, 16, 0xff5a8a, 0.35, 1.6, { normal: camDir });
    e.fx.cut(p.clone().setY(0), new THREE.Vector3(0, 1, 0), 300, 5, 0xffffff, 0.25, 1.2, { normal: camDir });
    e.chroma(0.015);
    e.zoomBlur(0.6);
    e.audio.boom(1, 3.5, 32);
    setTimeout(() => e.audio.boom(0.8, 2.5, 55), 120);
    e.audio.crack(0.8);
    this.stops.push(e.audio.drone({ type: "rumble", vol: 0.6, dur: 3, f: 80 }));
    e.fx.fireball(p, 38, 1.1, 0xff3a6a);
    e.fx.fireball(p, 18, 0.5, 0xffffff);
    e.fx.ring(p.clone().setY(1), 2, 160, 1.4, 0xff9ab0, { thick: 0.08 });
    e.fx.ring(p.clone().setY(1), 2, 90, 0.9, 0xffffff, { thick: 0.12 });
    e.fx.ring(p, 4, 120, 1.1, 0xff6a8a, { face: true, thick: 0.08 });
    e.fx.flashLight(p.clone().setY(30), 0xff7a9a, 60000, 1.8, 600);
    e.glow.emit({ pos: p, count: 500, speed: 60, color: 0xff3a6a, color2: 0xffe0e8, size: 3, life: 1.6, gravity: 25, drag: 0.96 });
    e.smoke.emit({ pos: p, count: 70, speed: 22, color: 0x5a3a40, color2: 0xa07070, size: 40, life: 4.5, grow: 1.8, drag: 0.95, posJitter: 20 });
    e.smoke.emit({ pos: p, count: 40, speed: 30, color: 0x4a3038, size: 30, life: 5, grow: 2, drag: 0.96, dir: new THREE.Vector3(0, 1, 0), spread: 0.25 });
    e.fx.spawnDebris(p, 220, 0xd9b48a, 45, 2.2);
    e.world.colTarget = 1;
    e.world.buildingsNear(p, 80).forEach((i) => {
      const b = e.world.buildings[i];
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      e.world.collapse(i, d * 0.006, 1.8);
    });
    e.world.puppets.forEach((pp) => e.world.hitPuppet(pp, pp.root.position.clone().sub(p).setY(0).normalize(), 1.2));
    const s = e.toScreen(p);
    e.sfx("ドォォォン!!", { x: Math.min(0.8, Math.max(0.2, s.x)), y: Math.max(0.2, s.y - 0.15), size: 2.4, color: "#ffffff", rot: -8 });
  }

  tick(dt: number) {
    const e = this.e;
    const t = this.t;
    const all = [...this.tipsR, ...this.tipsL];
    const charge = clamp01(t / this.fireT);
    if (!this.launched) {
      this.focus.copy(this.focusPoint());
      e.hands.R.shake = charge * 0.9;
      e.hands.L.shake = charge * 0.9;
      e.chroma(charge * 0.006);
      e.trauma = Math.max(e.trauma, charge * 0.35);
      // strings from all fingertips spiral into focus
      all.forEach((tp, i) => {
        const pts = curvePts(this.pts, tp, this.focus, 14, 0, 0, t, i);
        const axis = this.tmp2.copy(this.focus).sub(tp);
        for (let k = 1; k < pts.length - 1; k++) {
          const u = k / (pts.length - 1);
          const ang = u * 6 + t * (6 + charge * 20) + i;
          const r = Math.sin(u * Math.PI) * 0.06;
          pts[k].add(this.tmp.set(Math.cos(ang) * r, Math.sin(ang) * r, 0).applyAxisAngle(axis.clone().normalize(), 0));
        }
        e.thin.line(pts, this.c.setRGB(1, 0.5, 0.65), 1.4 + charge * 2);
      });
      // energy suction
      for (let k = 0; k < 6; k++) {
        const dir = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
        const p = this.focus.clone().addScaledVector(dir, rnd(1.2, 3));
        e.glow.emit({ pos: p, count: 1, speed: 0.01, color: 0xff6a8a, size: 0.08, life: 0.3 });
        e.glow.emit({ pos: p, count: 1, speed: 6, dir: dir.clone().negate(), spread: 0.05, color: 0xffd0dc, size: 0.05, life: 0.3, drag: 1 });
      }
      this.drawSpear(this.focus, this.focus.clone().add(this.cam(0, 0, -1).sub(e.camera.position).normalize().multiplyScalar(0.6 + charge * 1.6)), charge, t);
    } else {
      // travel
      const toT = this.target.clone().sub(this.focus);
      const total = toT.length();
      if (!this.hit) {
        this.dist = Math.min(total, this.dist + dt * 520);
        this.head.copy(this.focus).addScaledVector(toT.normalize(), this.dist);
        if (this.dist >= total) this.onImpact();
      }
      const fade = this.hit ? Math.max(0, 1 - (t - this.hitT) / 1.2) : 1;
      if (fade > 0) {
        const fp = this.focusPoint();
        all.forEach((tp, i) => {
          curvePts(this.pts, tp, fp, 6, 0, 0, t, i);
          e.thin.line(this.pts, this.c.setRGB(1, 0.5, 0.65), 2 * fade);
        });
        this.drawSpear(fp, this.head, fade, t);
      }
      if (!this.hit && Math.random() < 0.9) e.glow.emit({ pos: this.head, count: 6, speed: 8, color: 0xff3a6a, color2: 0xffffff, size: 1.2, life: 0.4 });
      e.hands.R.shake = Math.max(0, 0.4 - (t - this.fireT));
      e.hands.L.shake = e.hands.R.shake;
    }
  }

  drawSpear(a: THREE.Vector3, b: THREE.Vector3, power: number, t: number) {
    const e = this.e;
    const axis = b.clone().sub(a);
    const len = axis.length();
    if (len < 0.01) return;
    const dir = axis.clone().normalize();
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const s1 = new THREE.Vector3().crossVectors(dir, up).normalize();
    const s2 = new THREE.Vector3().crossVectors(dir, s1).normalize();
    const segs = 40;
    for (let k = 0; k < 16; k++) {
      while (this.pts.length < segs + 1) this.pts.push(new THREE.Vector3());
      this.pts.length = segs + 1;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const r = (0.05 + Math.min(len * 0.02, 0.9)) * (1 - u * 0.85) * (0.6 + 0.4 * Math.sin(u * 20 + k));
        const ang = (k / 16) * Math.PI * 2 + u * len * 0.35 - t * 18;
        this.pts[i].copy(a).addScaledVector(dir, u * len).addScaledVector(s1, Math.cos(ang) * r).addScaledVector(s2, Math.sin(ang) * r);
      }
      e.thin.line(this.pts, this.c.setRGB(1, 0.35 + (k % 3) * 0.2, 0.55), 1.6 * power);
    }
    this.pts.length = 2;
    this.pts[0] = a.clone();
    this.pts[1] = b.clone();
    e.thick.line(this.pts, this.c.setRGB(1, 0.2, 0.4), 0.9 * power);
    e.mid.line(this.pts, this.c.setRGB(1, 0.9, 0.95), 2.2 * power);
  }
}

/* ------------------------------------------------------------------ */
/* 8. AWAKENING — Nami Shiraito (wave of white thread)                 */
/* ------------------------------------------------------------------ */
const waveVert = /* glsl */ `
uniform float uFront, uAmp, uTime, uStart;
varying vec3 vW; varying float vH; varying float vMask;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec4 w = modelMatrix * vec4(position,1.0);
  float s = uFront - w.z; // >0 : ahead of the crest (not reached yet)
  float lat = 0.75 + 0.25*sin(w.x*0.035 + uTime*0.8) + 0.15*noise(vec2(w.x*0.05, uTime*0.5));
  float prof = s > 0.0 ? exp(-s*s/(14.0*14.0)) : exp(-s*s/(55.0*55.0));
  float behind = smoothstep(uStart+2.0, uStart-12.0, w.z);
  float h = uAmp * prof * lat * behind;
  h += noise(w.xz*0.15 + uTime*1.5) * 2.5 * behind * smoothstep(0.0, 6.0, h + 3.0);
  // lean the crest forward
  w.z -= h * 0.35 * smoothstep(0.5*uAmp, uAmp, h);
  w.y = max(w.y, 0.0) + h - 0.5;
  vH = h; vW = w.xyz; vMask = behind;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const waveFrag = /* glsl */ `
uniform float uAmp, uTime, uFade; uniform vec3 uSun;
varying vec3 vW; varying float vH; varying float vMask;
void main(){
  vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
  if(n.y < 0.0) n = -n;
  vec3 L = normalize(vec3(-0.3,0.7,-0.6));
  float lam = 0.22 + 0.78*max(0.0, dot(n, L));
  float rim = pow(1.0 - abs(n.y), 2.0);
  // thread bundles & strands
  float bundle = 0.55 + 0.45*sin(vW.x*0.09 + sin(vW.z*0.02)*2.0);
  float s1 = abs(fract(vW.x*0.32 + sin(vW.z*0.03 + vW.y*0.05)*0.8) - 0.5);
  float s2 = abs(fract(vW.x*0.9 + vW.y*0.15 + uTime*0.4) - 0.5);
  float strands = smoothstep(0.14, 0.02, s1) * 0.8 + smoothstep(0.08, 0.0, s2) * 0.35;
  float flow = smoothstep(0.05, 0.0, abs(fract(vW.y*0.18 - uTime*1.2 + vW.x*0.01) - 0.5)) * 0.2;
  vec3 base = mix(vec3(0.32,0.22,0.36), vec3(0.78,0.72,0.84), lam) * (0.7 + 0.3*bundle);
  vec3 col = base * (0.75 + 0.25*bundle) + vec3(1.0,0.9,1.0) * (strands*bundle + flow) * (0.35 + lam*0.6);
  col += vec3(1.0,0.55,0.8) * rim * 0.25;
  float crest = smoothstep(0.8*uAmp, uAmp, vH);
  col += vec3(1.0,0.95,1.0) * crest * 0.45;
  float a = smoothstep(0.2, 2.5, vH) * vMask * uFade;
  if(a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;

export class NamiShiraito extends Move {
  duration = 7.6;
  slamT = 1.5;
  wave: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  front = -30;
  amp = 0;
  lastFront = -30;
  sprouts: { x: number; z: number; h: number; t0: number }[] = [];

  constructor(e: any) {
    super(e);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: waveVert,
      fragmentShader: waveFrag,
      uniforms: {
        uFront: { value: -30 },
        uAmp: { value: 0 },
        uTime: { value: 0 },
        uStart: { value: -27 },
        uFade: { value: 1 },
        uSun: { value: new THREE.Vector3(0.3, 0.8, 0.4) },
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
    const g = new THREE.PlaneGeometry(560, 400, 280, 260);
    g.rotateX(-Math.PI / 2);
    this.wave = new THREE.Mesh(g, this.mat);
    this.wave.position.set(0, 0.2, -225);
    this.wave.frustumCulled = false;
    this.wave.renderOrder = 3;
  }

  setup() {
    const e = this.e;
    e.scene.add(this.wave);
    e.setCinema(true);
    e.hands.pose("raise", "both", 35);
    e.look(0, 0.05, 2);
    e.grade.uniforms.uTint.value.setRGB(0.95, 0.95, 1.12);
    e.tintTarget = 0.3;
    this.stops.push(e.audio.drone({ type: "rumble", vol: 0.45, dur: 2, f: 80 }));
    this.stops.push(e.audio.drone({ type: "choir", vol: 0.15, dur: 6.5, f: 82 }));
    this.at(0.3, () => e.sfx("覚醒", { x: 0.5, y: 0.3, size: 2.2, color: "#ffffff", rot: 0 }));
    for (let i = 0; i < 60; i++) this.sprouts.push({ x: rnd(-120, 120), z: rnd(-30, -200), h: rnd(4, 18), t0: rnd(0.4, 1.4) });
    this.at(this.slamT, () => {
      e.hands.pose("slam", "both", 480);
      e.hands.R.kick(new THREE.Vector3(0, -0.06, 0), new THREE.Vector3(-0.4, 0, 0));
      e.hands.L.kick(new THREE.Vector3(0, -0.06, 0), new THREE.Vector3(-0.4, 0, 0));
      e.impact(1);
      e.flash(0.6);
      e.shake(1.1);
      e.slow(0.3, 0.6);
      e.zoomBlur(0.4);
      e.fovKick(8);
      e.speed(1.2, 0.6);
      e.audio.boom(1, 3, 35);
      e.audio.crack(0.7);
      this.stops.push(e.audio.drone({ type: "rumble", vol: 0.7, dur: 5, f: 150 }));
      e.look(0, 0.38, 2.2);
      e.fx.ring(new THREE.Vector3(0, 10.05, -20), 1, 40, 0.8, 0xffffff, { thick: 0.1 });
      e.world.puppets.forEach((p) => e.world.hitPuppet(p, new THREE.Vector3(0, 0, -1), 1.6));
      e.sfx("ザバァァァン!!", { x: 0.5, y: 0.25, size: 2.2, color: "#ffffff", rot: -6 });
    });
    this.at(this.slamT + 1.6, () => e.look(0, 0.02, 1.2));
    this.at(this.slamT + 2.0, () => e.sfx("波白糸", { x: 0.28, y: 0.4, size: 1.6, color: "#ffd1ec", rot: 6 }));
    this.at(5.6, () => {
      e.hands.pose("idle", "both", 30);
      e.look(0, 0, 1);
      e.tintTarget = 0;
    });
  }

  tick(dt: number) {
    const e = this.e;
    const t = this.t;
    const s = this.slamT;
    // pre-slam: strings sprout from the ground
    if (t < s + 0.5) {
      e.hands.R.shake = clamp01(t / s) * 0.6;
      e.hands.L.shake = e.hands.R.shake;
      for (const sp of this.sprouts) {
        const g = easeOut((t - sp.t0) / 0.6);
        if (g <= 0) continue;
        const f = t > s ? Math.max(0, 1 - (t - s) * 2) : 1;
        const a = this.tmp.set(sp.x, 0, sp.z);
        const b = this.tmp2.set(sp.x + Math.sin(t * 3 + sp.x) * 1.5, sp.h * g, sp.z);
        curvePts(this.pts, a, b, 8, 0, 0.8, t, sp.x);
        e.thin.line(this.pts, this.c.setRGB(1, 0.95, 1), 1.3 * f, (k) => 1 - k * 0.6);
      }
      // strings from fingers down to the ground
      const all = [...this.tipsR, ...this.tipsL];
      all.forEach((tp, i) => {
        const end = this.tmp.set(tp.x * 30 + (i - 5) * 4, 10.05, -20 - i * 0.4);
        curvePts(this.pts, tp, end, 10, -0.5, 0.05, t, i);
        e.thin.line(this.pts, this.c.setRGB(1, 0.9, 1), 1.2 * clamp01(t * 2) * (t > s ? Math.max(0, 1 - (t - s) * 3) : 1));
      });
    } else {
      e.hands.R.shake = 0;
      e.hands.L.shake = 0;
    }
    // wave dynamics
    if (t >= s) {
      const k = t - s;
      this.amp = 52 * easeOut(k / 0.7) * (1 - clamp01((k - 1.4) / 3.5) * 0.55);
      if (k > 0.9) this.front = -30 - (k - 0.9) * 95;
    }
    const fade = 1 - clamp01((t - 6.0) / 1.4);
    const u = this.mat.uniforms;
    u.uFront.value = this.front;
    u.uAmp.value = this.amp * (0.6 + 0.4 * fade);
    u.uTime.value = t;
    u.uFade.value = fade;

    if (t >= s && fade > 0.3) {
      // crest spray
      for (let i = 0; i < 10; i++) {
        const x = rnd(-180, 180);
        const p = new THREE.Vector3(x, this.amp * rnd(0.6, 1.0), this.front - 4);
        e.glow.emit({ pos: p, count: 2, speed: 12, color: 0xffffff, color2: 0xffc0ec, size: 2.4, life: 0.8, gravity: 15, dir: new THREE.Vector3(0, 0.6, -1), spread: 0.6 });
      }
      // destroy what the crest passes
      const w = e.world;
      if (this.front < this.lastFront) {
        w.buildings.forEach((b, i) => {
          if (b.state === "down") return;
          if (b.z <= this.lastFront + 4 && b.z > this.front - 4 && Math.abs(b.x) < 260) {
            if (w.collapse(i, 0.15, 2)) {
              if (Math.random() < 0.25) e.fx.spawnDebris(new THREE.Vector3(b.x, b.cur, b.z), 6, b.color, 18, 0.9);
            }
          }
        });
        if (this.front < -120 && this.front > -200 && this.lastFront >= -120) w.colTarget = 1;
      }
      this.lastFront = this.front;
      e.trauma = Math.max(e.trauma, 0.3 * fade);
    }
    void dt;
  }

  end() {
    super.end();
    this.e.scene.remove(this.wave);
    this.wave.geometry.dispose();
    this.mat.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Laugh — フッフッフッ                                                 */
/* ------------------------------------------------------------------ */
export class Laugh extends Move {
  duration = 2.6;
  locksInput = false;
  idleStrings = true;
  setup() {
    const e = this.e;
    e.hands.pose("laugh", "R", 60);
    e.hands.pose({ pos: [0.3, -0.3, -0.5], rot: [0.0, 0.3, -0.3], curl: [0.2, 0.15, 0.2, 0.3, 0.4], spread: 0.3 }, "L", 50);
    const txt = ["フッ", "フッフッ", "フッフッフッ!!"];
    txt.forEach((tx, i) =>
      this.at(0.2 + i * 0.55, () => {
        e.sfx(tx, { x: 0.55 + i * 0.08, y: 0.3 + i * 0.1, size: 1 + i * 0.35, color: "#ff9ad5" });
        e.audio.drone({ type: "choir", vol: 0.08, dur: 0.35, f: 110 - i * 8 });
        e.hands.R.kick(new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0.15, 0, 0));
      })
    );
    this.at(2.0, () => e.hands.pose("idle", "both", 40));
  }
  tick() {
    const e = this.e;
    e.hands.R.shake = this.t < 2 ? 0.25 + 0.25 * Math.sin(this.t * 25) : 0;
    void easeInOut;
  }
}
