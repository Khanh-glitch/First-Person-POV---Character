import * as THREE from "three";
import { Move, rnd, clamp01, easeOut, easeInOut } from "./base";
import { curvePts } from "../fx/Strings";

/* ------------------------------------------------------------------ */
/* 1. TAMAITO — bullet strings                                         */
/* ------------------------------------------------------------------ */
export class Tamaito extends Move {
  duration = 3.4;
  setup() {
    const e = this.e;
    e.hands.pose("point", "both", 140);
    e.audio.twang(420, 0.3);
    const times = [0.3, 0.42, 0.53, 0.64, 0.75, 0.86, 0.97, 1.08, 1.2, 1.32, 1.46, 1.6];
    times.forEach((tm, i) => this.at(tm, () => this.shot(i % 2 === 0 ? "R" : "L", i)));
    this.at(1.9, () => e.hands.pose("gun2", "R", 200));
    this.at(2.15, () => this.finisher());
    this.at(2.8, () => e.hands.pose("idle", "both", 50));
  }
  target(i: number) {
    const ps = this.e.world.puppets.filter((p) => p.mode !== "fly" && p.mode !== "down");
    if (ps.length && i % 3 !== 2) {
      const p = ps[i % ps.length];
      return p.root.position.clone().add(new THREE.Vector3(rnd(-0.3, 0.3), rnd(0.9, 1.9), 0));
    }
    const bs = this.e.world.buildings.filter((b) => b.z > -110 && b.z < -36 && Math.abs(b.x) < 60 && b.state === "ok");
    const b = bs[Math.floor(Math.random() * bs.length)];
    return new THREE.Vector3(b.x + rnd(-1, 1), b.cur * rnd(0.4, 0.9), b.z + b.d / 2);
  }
  shot(side: "R" | "L", i: number) {
    const e = this.e;
    const h = side === "R" ? e.hands.R : e.hands.L;
    const tips = side === "R" ? this.tipsR : this.tipsL;
    h.kick(new THREE.Vector3(0, 0.025, 0.07), new THREE.Vector3(0.45, 0, 0));
    e.audio.twang(800 + Math.random() * 500, 0.28);
    e.audio.crack(0.3);
    e.shake(0.14);
    e.fovKick(0.8);
    e.speed(0.35, 0.1);
    const fn = () => e.hands.tipsWorld(side, [])[1];
    const tg = this.target(i);
    e.fireBullet({
      origin: tips[1].clone(),
      originFn: fn,
      target: tg,
      speed: 260,
      onHit: (p) => {
        e.bulletImpact(p);
        e.fx.spawnDebris(p, 4, 0xd8c0a8, 6, 0.3);
      },
    });
    this.e.glow.emit({ pos: tips[1], count: 8, speed: 3, color: 0xffffff, size: 0.15, life: 0.2 });
    if (i % 4 === 0) {
      const s = e.toScreen(tips[1]);
      e.sfx(i % 8 === 0 ? "ピシュッ" : "シュン", { x: s.x + rnd(-0.1, 0.1), y: s.y - 0.25, size: 0.8 });
    }
  }
  finisher() {
    const e = this.e;
    const b = e.world.buildings
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => b.z < -60 && b.z > -120 && Math.abs(b.x) < 40 && b.state === "ok")
      .sort((a, c) => c.b.h - a.b.h)[0];
    const tg = b ? new THREE.Vector3(b.b.x, b.b.cur * 0.6, b.b.z + b.b.d / 2) : new THREE.Vector3(0, 5, -80);
    e.hands.R.kick(new THREE.Vector3(0, 0.05, 0.14), new THREE.Vector3(0.8, 0, 0));
    e.audio.twang(300, 0.45);
    e.audio.whoosh(0.3, 0.6, 800, 5000);
    e.shake(0.35);
    e.fovKick(3);
    e.speed(0.9, 0.25);
    for (const k of [1, 2]) {
      e.fireBullet({
        origin: this.tipsR[k].clone(),
        originFn: () => e.hands.tipsWorld("R", [])[k],
        target: tg.clone().add(new THREE.Vector3((k - 1.5) * 0.6, 0, 0)),
        speed: 320,
        color: 0xff9ad5,
        trail: 14,
        onHit: (p) => {
          if (k !== 1) return;
          e.bulletImpact(p, 0xff9ad5, 2.5);
          e.fx.fireball(p, 7, 0.6, 0xff7ac0);
          e.audio.boom(0.8, 1.2, 90);
          e.impact(1);
          e.shake(0.5);
          e.zoomBlur(0.25);
          if (b) e.world.collapse(b.i, 0.05, 1.4);
          e.fx.spawnDebris(p, 40, b ? b.b.color : 0xddccbb, 16, 0.9);
          const s = e.toScreen(p);
          e.sfx("ドンッ!!", { x: s.x, y: s.y - 0.12, size: 1.5, color: "#ff5fae" });
        },
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* 2. OVERHEAT — red-hot string whip                                   */
/* ------------------------------------------------------------------ */
export class Overheat extends Move {
  duration = 5.4;
  heat = 0;
  theta = 1.25;
  thetaHist: { t: number; v: number }[] = [];
  L = 6;
  ropePts: THREE.Vector3[] = [];
  strand: THREE.Vector3[] = [];
  origin = new THREE.Vector3();
  swingStart = 1.75;
  swingDur = 0.75;
  booms = 0;

  setup() {
    const e = this.e;
    e.setCinema(true);
    e.hands.pose("gather", "both", 50);
    this.stops.push(e.audio.drone({ type: "sizzle", vol: 0.25, dur: 3.2, f: 2200 }));
    this.stops.push(e.audio.drone({ type: "rumble", vol: 0.4, dur: 3.4, f: 120 }));
    e.grade.uniforms.uTint.value.setRGB(1.15, 0.8, 0.6);
    e.tintTarget = 0.35;
    this.at(0.2, () => e.audio.twang(160, 0.5));
    this.at(0.6, () => e.sfx("ジジジ…", { x: 0.5, y: 0.62, size: 0.9, color: "#ffb070" }));
    this.at(1.25, () => {
      e.hands.pose({ pos: [0.5, -0.05, -0.35], rot: [0.4, -0.9, -0.6], curl: [0.4, 0.3, 0.3, 0.35, 0.4], spread: 0.6 }, "R", 70);
      e.hands.pose("ready", "L", 60);
      e.look(0.35, -0.02, 3);
      e.audio.whoosh(0.5, 0.4, 200, 900);
    });
    this.at(this.swingStart, () => {
      e.hands.pose({ pos: [-0.35, -0.2, -0.6], rot: [0.2, 0.9, 0.5], curl: [0.4, 0.3, 0.3, 0.35, 0.4], spread: 0.4 }, "R", 160);
      e.look(-0.3, -0.04, 2.2);
      e.audio.whoosh(0.9, 0.9, 120, 2500);
      e.audio.boom(0.7, 1.4, 50);
      e.speed(1, 0.7);
      e.fovKick(7);
      e.shake(0.45);
      e.chroma(0.008);
    });
    this.at(this.swingStart + 0.22, () => {
      e.impact(1);
      e.slow(0.3, 0.7);
      e.zoomBlur(0.3);
      e.sfx("ズバァァッ!!", { x: 0.5, y: 0.35, size: 1.8, color: "#ff7a2a", rot: -8 });
    });
    this.at(this.swingStart + 0.6, () => e.sfx("ゴォォ", { x: 0.75, y: 0.5, size: 1.1, color: "#ffb070" }));
    this.at(3.4, () => {
      e.hands.pose("idle", "both", 40);
      e.look(0, 0, 1.5);
      e.tintTarget = 0;
    });
  }

  thetaAt(t: number) {
    const s = this.swingStart;
    if (t < 1.25) return 0.15;
    if (t < s) return 0.15 + (1.35 - 0.15) * easeOut((t - 1.25) / (s - 1.25));
    return 1.35 - 2.75 * easeInOut((t - s) / this.swingDur);
  }

  ropeY(d: number) {
    return 10.6 - d * 0.017;
  }

  tick(dt: number) {
    const e = this.e;
    const t = this.t;
    const s = this.swingStart;
    // heat & length
    this.heat = clamp01(t / 1.4);
    const cool = clamp01((t - 3.0) / 2.0);
    if (t < s) this.L = 3 + 9 * easeOut(t / 1.4);
    else this.L = 12 + 260 * easeOut((t - s) / 0.35);
    const shk = t < s ? this.heat * 0.6 : Math.max(0, 0.6 - (t - s));
    e.hands.R.shake = shk;
    e.hands.L.shake = shk;

    // origin: avg of right fingertips during swing, between hands while charging
    const o = this.origin.set(0, 0, 0);
    const tipsAll = t < 1.25 ? [...this.tipsR, ...this.tipsL] : this.tipsR;
    tipsAll.forEach((p) => o.add(p));
    o.divideScalar(tipsAll.length);
    o.addScaledVector(this.cam(0, 0, -1).sub(e.camera.position).normalize(), 0.12);

    // rope points
    const N = 70;
    while (this.ropePts.length < N) this.ropePts.push(new THREE.Vector3());
    const lag = 0.18;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const d = u * this.L;
      let ang = this.thetaAt(t - u * lag);
      let y: number;
      if (t < s) {
        // hanging glowing whip during charge — coils & droops
        ang += Math.sin(u * 9 - t * 7) * 0.12 * u;
        y = o.y - u * u * 2.2 + Math.sin(u * 12 + t * 9) * 0.2 * u;
      } else {
        y = this.ropeY(d) + Math.sin(u * 14 - t * 20) * 0.6 * u * (1 - clamp01((t - s) / 1.2));
        const blend = clamp01(u * 8);
        y = o.y + (y - o.y) * blend;
      }
      const dir = this.tmp.set(Math.sin(ang), 0, -Math.cos(ang));
      this.ropePts[i].set(o.x + dir.x * d, y, o.z + dir.z * d);
    }

    // heat colours
    const hc = this.c;
    const hot = this.heat * (1 - cool);
    hc.setRGB(1, 0.35 + 0.35 * hot, 0.1 + 0.15 * hot);
    const fadeAll = 1 - clamp01((t - 4.3) / 1.0);
    const I = (0.6 + hot * 3.2) * fadeAll;
    e.thick.line(this.ropePts, hc, I * 0.45, (k) => Math.min(1, k * 12) * (1 - k * 0.5));
    e.mid.line(this.ropePts, this.tmpColor.setRGB(1, 0.85, 0.55), I * 0.8, (k) => Math.min(1, 0.3 + k * 10) * (1 - k * 0.4));
    // braided strands
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      while (this.strand.length < N) this.strand.push(new THREE.Vector3());
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const ph = u * 60 + sIdx * 2.094 - t * 14;
        const r = 0.08 + u * 0.9;
        this.strand[i].copy(this.ropePts[i]).add(this.tmp.set(Math.cos(ph) * r * 0.5, Math.sin(ph) * r, 0));
      }
      e.thin.line(this.strand, this.tmpColor.setRGB(1, 0.6, 0.3), I * 0.8);
    }
    // finger strings feeding the rope
    for (const tp of tipsAll) {
      curvePts(this.pts, tp, this.ropePts[0], 6, 0, 0.01, t, tp.x * 50);
      e.thin.line(this.pts, hc, I * 0.6);
    }
    // embers
    if (fadeAll > 0.2) {
      for (let k = 0; k < 6; k++) {
        const p = this.ropePts[Math.floor((0.2 + Math.random() * 0.8) * (N - 1))];
        e.glow.emit({ pos: p, count: 2, speed: 2.5, color: 0xff6a10, color2: 0xffd080, size: 0.25 + Math.random() * 0.5, life: 0.8, gravity: -2, drag: 0.97 });
      }
    }

    // cutting
    if (t >= s && t < s + this.swingDur + 0.3) {
      const w = e.world;
      for (let i = 0; i < w.buildings.length; i++) {
        const b = w.buildings[i];
        if (b.state !== "ok") continue;
        const rx = b.x - o.x,
          rz = b.z - o.z;
        const d = Math.hypot(rx, rz);
        if (d > this.L) continue;
        const a = Math.atan2(rx, -rz);
        const u = d / this.L;
        const th0 = this.thetaAt(t - dt - u * lag);
        const th1 = this.thetaAt(t - u * lag);
        if (th0 >= a && th1 < a) {
          const push = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
          const cutY = this.ropeY(d);
          if (w.slice(i, cutY, push, 0xff5a10) && this.booms < 14 && Math.random() < 0.35) {
            this.booms++;
            e.audio.boom(0.35, 0.9, 60 + Math.random() * 40);
            e.fx.flashLight(new THREE.Vector3(b.x, cutY, b.z), 0xff6a20, 4000, 0.4, 120);
          }
        }
      }
      for (const p of w.puppets) {
        if (p.mode === "fly") continue;
        const rx = p.root.position.x - o.x,
          rz = p.root.position.z - o.z;
        const d = Math.hypot(rx, rz);
        const a = Math.atan2(rx, -rz);
        const u = d / this.L;
        if (this.thetaAt(t - dt - u * lag) >= a && this.thetaAt(t - u * lag) < a) {
          w.hitPuppet(p, new THREE.Vector3(-Math.cos(a), 0.3, -Math.sin(a)), 2.4);
          e.glow.emit({ pos: p.root.position.clone().setY(p.root.position.y + 1.5), count: 30, speed: 10, color: 0xff6a10, size: 1, life: 0.5, gravity: 10 });
        }
      }
    }
  }
  private tmpColor = new THREE.Color();
}

/* ------------------------------------------------------------------ */
/* 3. GOSHIKITO — five-coloured string slash                           */
/* ------------------------------------------------------------------ */
const FIVE = [0xff3b5c, 0xffb52e, 0x6dff7a, 0x3ec5ff, 0xc06bff];
export class Goshikito extends Move {
  duration = 4.6;
  slashT = 1.25;
  lanes = FIVE.map((_c, i) => ({ x0: (i - 2) * 2.4, fan: (i - 2) * 0.11 }));
  far = -330;

  setup() {
    const e = this.e;
    e.setCinema(true);
    e.hands.pose("clawHigh", "R", 45);
    e.hands.pose("ready", "L", 40);
    e.look(0.0, 0.22, 2.5);
    this.stops.push(e.audio.drone({ type: "whine", vol: 0.12, dur: 1.3, f: 140 }));
    FIVE.forEach((_, i) => this.at(0.15 + i * 0.12, () => e.audio.twang(300 + i * 90, 0.3)));
    this.at(0.7, () => e.sfx("キィィン", { x: 0.62, y: 0.2, size: 0.9, color: "#ffe680" }));
    this.at(this.slashT, () => {
      e.hands.pose("clawDown", "R", 420);
      e.hands.R.kick(new THREE.Vector3(0, -0.05, -0.05), new THREE.Vector3(-0.6, 0, 0));
      e.look(0, -0.12, 5);
      e.audio.whoosh(0.35, 0.9, 400, 6000);
      e.fovKick(9);
      e.speed(1, 0.5);
    });
    this.at(this.slashT + 0.12, () => {
      e.impact(1);
      e.flash(0.5);
      e.shake(0.9);
      e.slow(0.25, 0.6);
      e.zoomBlur(0.35);
      e.chroma(0.01);
      FIVE.forEach((_, i) => setTimeout(() => e.audio.shing(0.16, 1800 + i * 300), i * 25));
      e.audio.boom(1, 2.2, 45);
      this.stops.push(e.audio.drone({ type: "rumble", vol: 0.55, dur: 2.6, f: 110 }));
      e.sfx("ズバババッ!!", { x: 0.5, y: 0.3, size: 1.9, color: "#ffffff", rot: -6 });
      this.cutGround();
    });
    this.at(this.slashT + 0.9, () => e.sfx("ドドドド", { x: 0.3, y: 0.45, size: 1.2, color: "#ffb52e" }));
    this.at(3.2, () => {
      e.hands.pose("idle", "both", 40);
      e.look(0, 0, 1.5);
    });
  }

  laneX(i: number, z: number) {
    return this.lanes[i].x0 + -z * this.lanes[i].fan * 0.5 * (z < 0 ? 1 : 0) * 1;
  }

  cutGround() {
    const e = this.e;
    const w = e.world;
    this.lanes.forEach((_, i) => {
      const col = FIVE[i];
      // terrace segment
      const a = new THREE.Vector3(this.laneX(i, -3), 10.06, -3);
      const b = new THREE.Vector3(this.laneX(i, -24.6), 10.06, -24.6);
      e.fx.cut(a, b.clone().sub(a), a.distanceTo(b), 0.9, col, 0.08, 3.2, {
        onProgress: (p) => {
          if (Math.random() < 0.3) e.glow.emit({ pos: p.clone(), count: 4, speed: 8, color: col, color2: 0xffffff, size: 0.7, life: 0.6, gravity: 12, dir: new THREE.Vector3(0, 1, 0), spread: 0.6 });
          for (const pp of w.puppets) {
            if (pp.mode !== "fly" && Math.abs(pp.root.position.x - p.x) < 1.4 && Math.abs(pp.root.position.z - p.z) < 1.2)
              w.hitPuppet(pp, new THREE.Vector3(Math.sign(pp.root.position.x - p.x) || 1, 0.5, 0), 2.2);
          }
        },
      });
      // town segment
      const c = new THREE.Vector3(this.laneX(i, -25), 0.08, -25);
      const d = new THREE.Vector3(this.laneX(i, this.far), 0.08, this.far);
      setTimeout(() => {
        let last = 0;
        e.fx.cut(c, d.clone().sub(c), c.distanceTo(d), 2.6, col, 0.8, 3.0, {
          onProgress: (p, k) => {
            if (k - last > 0.012) {
              last = k;
              const pp = p.clone();
              e.glow.emit({ pos: pp, count: 10, speed: 18, color: col, color2: 0xffffff, size: 1.6, life: 0.9, gravity: 18, dir: new THREE.Vector3(0, 1, 0), spread: 0.5 });
              e.smoke.emit({ pos: pp, count: 3, speed: 6, color: 0x6a5048, color2: 0xa88a7a, size: 10, life: 2.4, grow: 1.6, dir: new THREE.Vector3(0, 1, 0), spread: 0.8 });
              if (Math.random() < 0.4) e.fx.spawnDebris(pp, 3, 0xb98d6c, 14, 0.7);
              w.buildings.forEach((bb, bi) => {
                if (bb.state === "down") return;
                if (Math.abs(bb.z - pp.z) < bb.d / 2 + 2 && Math.abs(bb.x - pp.x) < bb.w / 2 + 1.2) {
                  w.collapse(bi, Math.random() * 0.1, 1.6);
                  e.fx.spawnDebris(new THREE.Vector3(bb.x, bb.cur * 0.7, bb.z), 10, bb.color, 16, 1);
                }
              });
            }
          },
        });
      }, 70);
    });
  }

  tick(_dt: number) {
    const e = this.e;
    const t = this.t;
    const s = this.slashT;
    const fade = 1 - clamp01((t - 2.8) / 1.2);
    for (let i = 0; i < 5; i++) {
      const tip = this.tipsR[i];
      const col = this.c.set(FIVE[i]);
      let end: THREE.Vector3;
      if (t < s) {
        const g = easeOut(t / 0.8);
        end = this.tmp.copy(tip).add(this.tmp2.set((i - 2) * 6 * g, 140 * g, -40 * g));
      } else {
        const k = easeOut((t - s) / 0.14);
        const skyP = this.tmp2.copy(tip).add(new THREE.Vector3((i - 2) * 6, 140, -40));
        const groundP = new THREE.Vector3(this.laneX(i, this.far), 0.1, this.far);
        end = this.tmp.lerpVectors(skyP, groundP, k);
      }
      curvePts(this.pts, tip, end, 24, 0, t < s ? 0.3 : 0.05, t, i);
      e.mid.line(this.pts, col, 2.2 * fade, (k) => 1 - k * 0.3);
      e.thin.line(this.pts, this.c.setRGB(1, 1, 1), 1.2 * fade);
    }
    if (t < s) {
      e.hands.R.shake = clamp01(t / s) * 0.4;
      if (Math.random() < 0.5) {
        const i = Math.floor(Math.random() * 5);
        e.glow.emit({ pos: this.tipsR[i], count: 1, speed: 0.4, color: FIVE[i], size: 0.08, life: 0.4 });
      }
    } else e.hands.R.shake = 0;
  }
}

/* ------------------------------------------------------------------ */
/* 4. PARASITE — marionette control                                    */
/* ------------------------------------------------------------------ */
export class Parasite extends Move {
  duration = 6;
  attach = 0;
  clenchT = 3.6;
  meetT = 3.85;
  assign: { side: "R" | "L"; f: number }[] = [
    { side: "R", f: 1 },
    { side: "R", f: 2 },
    { side: "R", f: 3 },
    { side: "R", f: 4 },
    { side: "L", f: 1 },
    { side: "L", f: 2 },
  ];
  center = new THREE.Vector3(0, 10, -15);
  jolt = 0;

  setup() {
    const e = this.e;
    e.setCinema(true);
    e.hands.pose("puppeteer", "both", 60);
    e.grade.uniforms.uTint.value.setRGB(1.05, 0.8, 1.2);
    e.tintTarget = 0.45;
    e.look(0, -0.08, 2);
    for (let i = 0; i < 6; i++) this.at(0.15 + i * 0.06, () => e.audio.twang(1200 + i * 120, 0.2));
    this.at(0.25, () => e.sfx("ピンッ", { x: 0.5, y: 0.35, size: 1, color: "#f0a0ff" }));
    this.at(0.55, () => {
      e.world.puppets.forEach((p) => {
        p.mode = "puppet";
        p.root.rotation.set(0, p.homeYaw, 0);
      });
      e.sfx("ギギギ…", { x: 0.3, y: 0.55, size: 1, color: "#d9a0ff" });
      e.audio.drone({ type: "choir", vol: 0.12, dur: 3.2, f: 98 });
    });
    for (let k = 0; k < 9; k++) {
      this.at(0.9 + k * 0.28, () => {
        this.jolt = 1;
        const h = Math.random() < 0.5 ? e.hands.R : e.hands.L;
        h.kick(new THREE.Vector3(rnd(-0.02, 0.02), 0.03, 0), new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.2, 0.2), rnd(-0.2, 0.2)));
        e.audio.twang(600 + Math.random() * 600, 0.12);
      });
    }
    this.at(2.3, () => e.sfx("寄生糸", { x: 0.72, y: 0.3, size: 1.3, color: "#e45cff", rot: 6 }));
    this.at(this.clenchT, () => {
      e.hands.pose("fist", "both", 380);
      e.hands.R.kick(new THREE.Vector3(0, 0, 0.06), new THREE.Vector3(0.5, 0, 0));
      e.hands.L.kick(new THREE.Vector3(0, 0, 0.06), new THREE.Vector3(0.5, 0, 0));
      e.audio.twang(200, 0.5);
      e.audio.whoosh(0.3, 0.7, 500, 3000);
      e.fovKick(4);
      e.speed(0.8, 0.3);
      e.world.puppets.forEach((p) => {
        p.mode = "fly";
        const to = this.center.clone().sub(p.root.position);
        p.vel.copy(to).multiplyScalar(1 / (this.meetT - this.clenchT));
        p.vel.y = 6;
        p.spin = rnd(-6, 6);
      });
    });
    this.at(this.meetT, () => {
      const c = this.center.clone().setY(11.5);
      e.impact(1);
      e.shake(0.7);
      e.flash(0.15, 0xffd0ff);
      e.slow(0.3, 0.5);
      e.audio.boom(0.8, 1.2, 80);
      e.audio.shing(0.3, 1500);
      e.fx.fireball(c, 2.2, 0.35, 0xc050c0);
      e.fx.ring(c, 0.2, 9, 0.5, 0xff9cff, { face: true, thick: 0.2 });
      e.glow.emit({ pos: c, count: 120, speed: 22, color: 0xffffff, color2: 0xff70e0, size: 1, life: 0.7, gravity: 10, drag: 0.94 });
      e.fx.spawnDebris(c, 10, 0x1d3a7a, 10, 0.4);
      e.world.puppets.forEach((p) => {
        const away = p.root.position.clone().sub(this.center).setY(0).normalize();
        p.vel.copy(away).multiplyScalar(rnd(10, 16));
        p.vel.y = rnd(6, 12);
        p.spin = rnd(-12, 12);
      });
      e.sfx("ガキィィン!!", { x: 0.5, y: 0.32, size: 1.8, color: "#ffffff", rot: -5 });
    });
    this.at(4.6, () => {
      e.hands.pose("idle", "both", 40);
      e.tintTarget = 0;
    });
  }

  tick(dt: number) {
    const e = this.e;
    const t = this.t;
    this.attach = easeOut(t / 0.45);
    this.jolt = Math.max(0, this.jolt - dt * 4);
    const ctl = t < this.clenchT ? clamp01((t - 0.4) * 2) : Math.max(0, 1 - (t - this.meetT) * 2);
    // finger twitching drives puppets
    if (t < this.clenchT) {
      for (const h of [e.hands.R, e.hands.L]) {
        for (let i = 1; i < 5; i++) {
          h.twitch[i] = Math.sin(t * 9 + i * 1.7 + h.side) * Math.sin(t * 3.3 + i) * 0.35 + this.jolt * 0.2;
        }
      }
    } else {
      e.hands.R.twitch.fill(0);
      e.hands.L.twitch.fill(0);
    }
    const puppets = e.world.puppets;
    puppets.forEach((p, i) => {
      p.control = ctl;
      if (p.mode === "puppet") p.lift = 0.3 + Math.sin(t * 4 + i) * 0.2 + this.jolt * 0.3;
      const a = this.assign[i % this.assign.length];
      const tip = (a.side === "R" ? this.tipsR : this.tipsL)[a.f];
      const fade = t < this.meetT ? 1 : Math.max(0, 1 - (t - this.meetT) * 3);
      if (fade <= 0) return;
      const targets = [p.head, p.foreL, p.foreR];
      targets.forEach((obj, k) => {
        obj.getWorldPosition(this.tmp2);
        if (k > 0) this.tmp2.y -= 0.3;
        const end = this.tmp.lerpVectors(tip, this.tmp2, this.attach);
        curvePts(this.pts, tip, end, 14, -0.15 * (1 - ctl), 0.03 + this.jolt * 0.05, t, i * 3 + k);
        const flick = 0.75 + 0.25 * Math.sin(t * 20 + i + k);
        e.thin.line(this.pts, this.c.setRGB(1, 0.75, 1), 1.4 * fade * flick, (u) => 0.5 + 0.5 * u);
      });
      if (Math.random() < 0.08 && fade > 0.5) {
        p.head.getWorldPosition(this.tmp2);
        e.glow.emit({ pos: this.tmp2, count: 2, speed: 1, color: 0xe45cff, size: 0.4, life: 0.5 });
      }
    });
  }
}
