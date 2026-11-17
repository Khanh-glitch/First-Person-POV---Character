import * as THREE from "three";
import type { Engine } from "./engine";
import { P, REST, mirror, sample, type Key } from "./hands";
import { Beam, MagicCircle, Orb, ShockRing, Dome } from "./actors";
import { PAL, Projectile, blackExplosion, makeSpear, makeTrident, randDir } from "./fxlib";
import { ISLAND_CENTER, ISLAND_RADIUS } from "./world";
import { clamp, easeOutCubic, rand, smoothstep } from "./util";
import { magicCircleTexture, grimoireTexture } from "./textures";

const V3 = THREE.Vector3;
const C = THREE.Color;

export interface MoveDef {
  id: string;
  key: string;
  name: string;
  sub: string;
  kanji: string;
  desc: string;
  color: string;
  duration: number;
  start(e: Engine): void;
  update(e: Engine, t: number, dt: number): void;
  end(e: Engine): void;
}

const FIRE_V = PAL.violet.clone().multiplyScalar(0.6);
const FIRE_R = PAL.crimson.clone().multiplyScalar(0.6);

/** tiny one-shot timeline */
class TL {
  private done: boolean[];
  constructor(private evs: [number, () => void][]) {
    this.done = evs.map(() => false);
  }
  run(t: number) {
    for (let i = 0; i < this.evs.length; i++) {
      if (!this.done[i] && t >= this.evs[i][0]) {
        this.done[i] = true;
        this.evs[i][1]();
      }
    }
  }
}

function setHands(e: Engine, t: number, r: Key[], l: Key[]) {
  e.right.set(sample(r, t));
  e.left.set(sample(l, t));
}

function aimPoint(e: Engine, yaw: number, pitch: number, dist: number) {
  return new V3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
    .applyQuaternion(e.camera.quaternion)
    .multiplyScalar(dist)
    .add(e.camera.position);
}

/* ====================================================================== */
/*  1. OMEN — black flames                                                */
/* ====================================================================== */
function omen(): MoveDef {
  let orb: Orb | null = null;
  let tl: TL;
  let acc = 0;
  let launched = 0;
  let orbR = 0;
  let released = false;
  const pv = new V3();
  const R_KEYS: Key[] = [
    { t: 0, pose: REST },
    { t: 0.9, pose: P(0.25, -0.3, -0.45, 0.1, 0.1, -1.2, 0.2, 0.25), e: "out" },
    { t: 2.5, pose: P(0.05, -0.12, -0.46, 0.38, 0.35, -0.9, 0.25, [0.9, 0.5, 0.9, 0.45, 0.4]) },
    { t: 3.15, pose: P(0.1, -0.1, -0.56, 0.48, 0.12, -1.0, 0.95, [0.0, 0.0, 0.0, 0.05, 0.1]), e: "snap" },
    { t: 5.2, pose: P(0.12, -0.12, -0.56, 0.5, 0.1, -1.0, 0.9, [0.0, 0.0, 0.0, 0.05, 0.1]) },
    { t: 6.6, pose: REST },
  ];
  const L_KEYS: Key[] = [
    { t: 0, pose: mirror(REST) },
    { t: 0.9, pose: P(-0.1, -0.2, -0.5, 0.2, -0.16, 0, 0.55, [0.45, 0.4, 0.4, 0.42, 0.45]), e: "out" },
    { t: 5.4, pose: P(-0.1, -0.2, -0.5, 0.2, -0.16, 0, 0.55, [0.45, 0.4, 0.4, 0.42, 0.45]) },
    { t: 5.62, pose: P(-0.04, -0.1, -0.52, 1.35, -0.06, Math.PI, 0.75, 0.1), e: "snap" },
    { t: 6.8, pose: P(-0.04, -0.1, -0.52, 1.35, -0.06, Math.PI, 0.75, 0.1) },
    { t: 7.6, pose: mirror(REST) },
  ];

  const flameAt = (e: Engine, p: THREE.Vector3, r: number, rate: number, dt: number) => {
    acc += rate * dt;
    const n = Math.floor(acc);
    acc -= n;
    const d = new V3();
    for (let i = 0; i < n; i++) {
      randDir(d);
      const x = p.x + d.x * r * 0.9;
      const y = p.y + d.y * r * 0.9;
      const z = p.z + d.z * r * 0.9;
      const up = 0.2 + r * 4 + Math.random() * 0.5;
      e.fire.emit({
        x,
        y,
        z,
        vx: d.x * r * 0.7 + rand(-0.1, 0.1),
        vy: up * (0.5 + d.y * 0.4 + 0.5),
        vz: d.z * r * 0.7 + rand(-0.1, 0.1),
        life: rand(0.55, 1.1),
        size0: r * rand(0.9, 1.5),
        size1: r * rand(1.6, 2.4),
        c0: Math.random() < 0.7 ? FIRE_V : FIRE_R,
        c1: PAL.deepRed,
        a: 0.5,
        drag: 0.6,
        turb: 1.6,
      });
      e.smoke.emit({
        x,
        y: y + r * 0.1,
        z,
        vx: d.x * r * 0.6,
        vy: up * (0.6 + d.y * 0.4 + 0.5),
        vz: d.z * r * 0.6,
        life: rand(0.6, 1.2),
        size0: r * rand(0.7, 1.1),
        size1: r * rand(1.3, 2.0),
        c0: PAL.smoke0,
        c1: PAL.smoke1,
        a: 0.95,
        drag: 0.6,
        turb: 1.6,
      });
      if (Math.random() < 0.18) {
        e.sparks.emit({
          x,
          y,
          z,
          vx: d.x * r * 3,
          vy: up * 2 + 0.6,
          vz: d.z * r * 3,
          life: rand(0.8, 1.7),
          size0: 0.012 + r * 0.06,
          size1: 0.005,
          c0: PAL.vbolt0,
          c1: PAL.deepRed,
          turb: 2,
          grav: -0.2,
        });
      }
    }
  };

  const launchBullet = (e: Engine, big: boolean) => {
    const s = orb ? orb.obj.position.clone() : e.camera.position.clone();
    if (!big) {
      const side = rand(-1, 1);
      const dirLocal = new V3(side * 1.1, rand(0.4, 1.1), -0.5).applyQuaternion(e.camera.quaternion);
      const target = aimPoint(e, rand(-0.6, 0.6), rand(-0.1, 0.3), rand(70, 210));
      const proj = new Projectile(e, s, dirLocal, target, rand(95, 135), 2.4, 1.4, (p) => blackExplosion(e, p, rand(0.8, 1.2)));
      proj.growTime = 0.12;
      e.addActor(proj);
      e.right.kick(0, 0.02, 0.05);
      e.left.kick(0, -0.01, 0.02);
      e.shake(0.07);
      e.kickCam(-0.006, rand(-0.006, 0.006), 0);
      e.audio.whoosh(0.7, 500, 3000, 0.28);
      e.sparks.emit({ x: s.x, y: s.y, z: s.z, life: 0.3, size0: 0.3, c0: PAL.white, a: 1 });
    } else {
      const target = aimPoint(e, 0, 0.12, 230);
      const proj = new Projectile(e, s, new V3(0, 0.3, -1).applyQuaternion(e.camera.quaternion), target, 120, 1.0, 5.2, (p) => {
        blackExplosion(e, p, 3.6);
        e.skyGlow(0x7a30ff, 1.4, p.clone().sub(e.camera.position), 0.9);
        e.ripple(0.5, 0.45, 0.85, 0.9);
        e.addActor(new Dome(p, PAL.violet.clone(), 110, 1.4));
        e.addActor(new ShockRing(p, new V3(0, 1, 0), PAL.crimson.clone(), 260, 2.2, 0.06));
        for (let i = 0; i < 160; i++) {
          const d = randDir();
          e.smoke.emit({
            x: p.x + d.x * 8,
            y: p.y + d.y * 8,
            z: p.z + d.z * 8,
            vx: d.x * rand(10, 40),
            vy: d.y * rand(10, 40) + 12,
            vz: d.z * rand(10, 40),
            life: rand(3, 6),
            size0: rand(16, 30),
            size1: rand(50, 90),
            c0: PAL.smoke0,
            c1: PAL.smoke1,
            a: 0.9,
            drag: 0.9,
            turb: 4,
          });
        }
        e.kickFov(10);
        e.fx.zoom = 0.9;
        e.fx.glitch = 0.5;
      });
      proj.growTime = 0.9;
      e.addActor(proj);
      e.kickFov(8);
      e.kickCam(-0.03, 0, 0);
      e.kickPos(0, 0, 0.12);
      e.shake(0.5);
      e.flash(0x9a50ff, 0.5, 6);
      e.fx.zoom = 0.8;
      e.fx.aberr = 1.2;
      e.audio.whoosh(1.6, 200, 4500, 0.9, 0.8);
      e.audio.boom(0.7, 62, 2.5);
    }
  };

  return {
    id: "omen",
    key: "1",
    name: "HẮC VIÊM",
    sub: "Omen · Điềm Gở",
    kanji: "黒炎",
    desc: "Ngọn lửa đen tối thượng — búng tay là nổ tung.",
    color: "#a855f7",
    duration: 8.8,
    start(e) {
      launched = 0;
      acc = 0;
      orbR = 0;
      released = false;
      orb = null;
      e.userWeight = 0.55;
      e.script.pitch = -0.03;
      e.target.storm = 0.5;
      e.target.dark = 0.25;
      e.target.vig = 0.8;
      tl = new TL([
        [
          0.05,
          () => {
            e.audio.stinger(0.5);
            e.audio.riser(3.4, 0.3, 60, 520);
            e.fx.glitch = 1;
            e.shake(0.12);
            e.flash(0x300050, 0.35, 5);
          },
        ],
        [
          0.55,
          () => {
            orb = new Orb(1, PAL.violet.clone());
            orb.obj.scale.setScalar(0.001);
            e.addActor(orb);
            e.audio.crackle(5.5, 0.22);
            e.audio.rumble(4, 0.4, 70);
          },
        ],
        [2.6, () => e.audio.choir(3.6, 0.14, 196)],
        [
          4.55,
          () => {
            e.audio.riser(1.0, 0.4, 200, 1400);
            e.fx.glitch = 0.6;
          },
        ],
        [
          5.55,
          () => {
            released = true;
            launchBullet(e, true);
            if (orb) orb.obj.scale.setScalar(0.0001);
          },
        ],
      ]);
    },
    update(e, t, dt) {
      setHands(e, t, R_KEYS, L_KEYS);
      tl.run(t);
      if (orb && !released) {
        e.left.palmWorld(pv);
        const grow = easeOutCubic((t - 0.55) / 2.0);
        const charge = 1 + smoothstep(4.4, 5.5, t) * 0.55;
        const shrink = 1 - 0.55 * smoothstep(3.2, 4.5, t) * (1 - smoothstep(4.5, 5.4, t));
        orbR = 0.012 + 0.06 * grow;
        const r = orbR * charge * shrink;
        orb.obj.position.set(pv.x, pv.y + r * 0.9 + 0.03, pv.z);
        orb.obj.scale.setScalar(r * 0.85);
        flameAt(e, orb.obj.position, r, (120 + 260 * grow) * clamp(r / 0.07, 0.25, 1.1), dt);
        e.handGlow(0x9b30ff, 0.5 + r * 7);
        if (t > 4.5) e.shake(0.004 + (t - 4.5) * 0.004);
        // gentle halo
        e.fire.emit({ x: orb.obj.position.x, y: orb.obj.position.y, z: orb.obj.position.z, life: 0.12, size0: r * 3.0, size1: r * 3.4, c0: PAL.violet, a: 0.07, fadeIn: 0.3 });
      }
      // flicks
      while (launched < 7 && t >= 3.25 + launched * 0.17) {
        launched++;
        launchBullet(e, false);
        if (orb) orb.obj.scale.multiplyScalar(0.96);
      }
      // sky ambience
      if (t > 1 && t < 5.5 && Math.random() < dt * 3) {
        const a = new V3(rand(-300, 300), rand(200, 400), rand(-700, -300));
        const b = a.clone().add(new V3(rand(-120, 120), rand(-250, -100), rand(-100, 100)));
        e.bolt(a, b, 4, PAL.vbolt0, PAL.vbolt1, 0.12, 0.22);
      }
    },
    end(e) {
      if (orb) e.removeActor(orb);
      orb = null;
    },
  };
}

/* ====================================================================== */
/*  2. MOTHER FLAME — judgment from the sky                               */
/* ====================================================================== */
function mother(): MoveDef {
  const tex0 = { a: null as THREE.Texture | null, b: null as THREE.Texture | null };
  let group: THREE.Group;
  let circles: MagicCircle[] = [];
  let circleGroups: THREE.Group[] = [];
  let beam: Beam | null = null;
  let sun: Orb | null = null;
  let tl: TL;
  let boltTimer = 0;
  let impact = false;
  let colTimer = 0;
  const T_FIRE = 4.35;
  const T_HIT = 4.66;
  const TOP = new V3(0, 270, -520);
  const BOT = new V3(0, -18, -520);
  const CENTER = new V3(0, 275, -520);
  const normal = new V3(0, -0.73, 0.49).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), normal);

  const R_KEYS: Key[] = [
    { t: 0, pose: REST },
    { t: 1.0, pose: P(0.16, -0.1, -0.5, 1.28, 0.0, -1.2, 0.5, [0.7, 0.0, 0.9, 0.95, 1.0]), e: "out" },
    { t: 4.1, pose: P(0.15, -0.05, -0.5, 1.38, -0.05, -1.25, 0.5, [0.7, 0.0, 0.9, 0.95, 1.0]) },
    { t: 4.34, pose: P(0.12, -0.15, -0.56, 0.42, 0.02, -1.2, 0.4, [0.7, 0.0, 0.9, 0.95, 1.0]), e: "snap" },
    { t: 7.6, pose: P(0.12, -0.15, -0.56, 0.42, 0.02, -1.2, 0.4, [0.7, 0.0, 0.9, 0.95, 1.0]) },
    { t: 9.4, pose: REST },
  ];
  const L_KEYS: Key[] = [
    { t: 0, pose: mirror(REST) },
    { t: 1.1, pose: P(-0.2, -0.16, -0.5, 0.9, -0.2, 0.5, 1.0, 0.2), e: "out" },
    { t: 4.2, pose: P(-0.22, -0.14, -0.5, 1.0, -0.22, 0.55, 1.0, 0.15) },
    { t: 4.42, pose: P(-0.16, -0.14, -0.52, 0.5, -0.1, 0.9, 0.7, 0.35), e: "snap" },
    { t: 7.6, pose: P(-0.16, -0.14, -0.52, 0.5, -0.1, 0.9, 0.7, 0.35) },
    { t: 9.4, pose: mirror(REST) },
  ];

  const planePoint = (c: THREE.Vector3, a: number, r: number, out = new V3()) => {
    const u = new V3(1, 0, 0).applyQuaternion(q);
    const v = new V3(0, 1, 0).applyQuaternion(q);
    return out.copy(c).addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r);
  };

  return {
    id: "mother",
    key: "2",
    name: "THIÊN PHẠT",
    sub: "Mother Flame · Lulusia",
    kanji: "天罰",
    desc: "Triệu hồi ngọn lửa mẹ — xoá sổ cả một vương quốc.",
    color: "#ff3b4e",
    duration: 10.8,
    start(e) {
      tex0.a = tex0.a ?? magicCircleTexture(0);
      tex0.b = tex0.b ?? magicCircleTexture(1);
      impact = false;
      boltTimer = 0;
      colTimer = 0;
      e.world.city.reset();
      e.world.groundU.uBurn.value = -10;
      e.world.groundU.uHeat.value = 0;
      e.world.groundU.uFront.value = 0;
      e.world.cloudU.uGlowPos.value.set(ISLAND_CENTER.x, -30, ISLAND_CENTER.z);
      e.world.cloudU.uGlowI.value = 0;
      e.world.cloudU.uRing.value.set(0, 60, 0);

      group = new THREE.Group();
      e.scene.add(group);
      circles = [];
      circleGroups = [];
      const defs = [
        { size: 460, tex: tex0.a!, col: new C(1.8, 0.14, 0.28), spin: 0.14 },
        { size: 320, tex: tex0.b!, col: new C(2.0, 0.35, 0.25), spin: -0.22 },
        { size: 200, tex: tex0.a!, col: new C(2.4, 0.9, 0.6), spin: 0.34 },
      ];
      defs.forEach((d, i) => {
        const g = new THREE.Group();
        g.position.copy(CENTER).add(new V3(0, -i * 30, 0));
        g.quaternion.copy(q);
        const c = new MagicCircle(d.tex, d.col, d.size);
        c.spin = d.spin;
        g.add(c.obj);
        group.add(g);
        circles.push(c);
        circleGroups.push(g);
      });
      beam = new Beam(TOP, BOT, 30, new C(2.0, 0.12, 0.2), new C(2.8, 1.6, 1.4));
      beam.set(0, 0, 0);
      group.add(beam.obj);
      sun = new Orb(1, new C(2.6, 0.25, 0.15), new C(2.4, 1.3, 1.1));
      sun.obj.position.copy(TOP).add(new V3(0, 12, 0));
      sun.obj.scale.setScalar(0.001);
      group.add(sun.obj);

      e.userWeight = 0.25;
      e.script.k = 1.6;
      e.target.storm = 1;
      e.target.dark = 0.45;
      e.target.vig = 0.85;
      e.target.bloom = 0.8;

      tl = new TL([
        [
          0.05,
          () => {
            e.audio.stinger(0.55);
            e.audio.riser(4.2, 0.45, 70, 700);
            e.audio.rumble(6, 0.5, 70);
            e.audio.choir(5.2, 0.2, 174.6);
            e.fx.glitch = 1;
            e.flash(0x400010, 0.4, 4);
          },
        ],
        [1.2, () => e.audio.zap(0.3)],
        [3.3, () => e.audio.riser(1.1, 0.4, 300, 1800)],
        [
          T_FIRE,
          () => {
            e.flash(0xff2030, 0.55, 7);
            e.audio.boom(0.6, 90, 2);
            e.audio.whoosh(0.5, 300, 6000, 0.9, 0.6);
            e.right.kick(0, -0.03, 0.08);
            e.kickCam(-0.03, 0, 0);
            e.kickFov(6);
            e.fx.aberr = 1.2;
          },
        ],
        [
          T_HIT,
          () => {
            impact = true;
            e.flash(0xffffff, 1.0, 2.2);
            e.shake(1);
            e.kickFov(16);
            e.kickCam(0.06, 0, 0.02);
            e.kickPos(0, 0, 0.3);
            e.ripple(0.5, 0.42, 0.8, 1.3);
            e.fx.aberr = 2.4;
            e.fx.glitch = 0.8;
            e.fx.zoom = 1.3;
            e.audio.boom(1.6, 46, 6);
            e.audio.rumble(8, 0.9, 60);
            e.audio.crackle(4, 0.25);
            e.skyGlow(0xff3020, 1.6, new V3(0, -0.1, -1), 0.45);
            e.setLight(new V3(0, 28, -30), 0xff3418, 900, 0.5);
            const hp = ISLAND_CENTER.clone();
            e.addActor(new Dome(hp.clone().add(new V3(0, 0, 0)), new C(2.2, 0.35, 0.2), 200, 1.6, true));
            e.addActor(new ShockRing(new V3(hp.x, ISLAND_CENTER.y + 6, hp.z), new V3(0, 1, 0), new C(2.5, 0.5, 0.3), 700, 3.2, 0.05));
            e.addActor(new ShockRing(new V3(hp.x, ISLAND_CENTER.y + 6, hp.z), new V3(0, 1, 0), new C(1.5, 0.15, 0.3), 1400, 5, 0.04));
            for (let i = 0; i < 700; i++) {
              const a = rand(0, Math.PI * 2);
              const sp = rand(20, 140);
              e.sparks.emit({
                x: hp.x + Math.cos(a) * rand(0, 60),
                y: hp.y + 5,
                z: hp.z + Math.sin(a) * rand(0, 60),
                vx: Math.cos(a) * sp * 0.6,
                vy: rand(80, 260),
                vz: Math.sin(a) * sp * 0.6,
                life: rand(2, 5),
                size0: rand(1, 3),
                size1: 0.2,
                c0: Math.random() < 0.5 ? PAL.hot : PAL.ember,
                c1: PAL.deepRed,
                grav: 55,
                drag: 0.1,
              });
            }
          },
        ],
        [
          5.4,
          () => {
            // mushroom cap
            const hp = ISLAND_CENTER;
            for (let i = 0; i < 320; i++) {
              const a = rand(0, Math.PI * 2);
              const sp = rand(35, 100);
              e.fire.emit({
                x: hp.x + Math.cos(a) * rand(0, 30),
                y: 150 + rand(-25, 25),
                z: hp.z + Math.sin(a) * rand(0, 30),
                vx: Math.cos(a) * sp,
                vy: rand(-6, 22),
                vz: Math.sin(a) * sp,
                life: rand(3, 5.5),
                size0: rand(35, 60),
                size1: rand(90, 140),
                c0: PAL.ember,
                c1: new C(0.18, 0.02, 0.03),
                a: 0.6,
                drag: 0.95,
              });
            }
            for (let i = 0; i < 220; i++) {
              const a = rand(0, Math.PI * 2);
              const sp = rand(30, 90);
              e.smoke.emit({
                x: hp.x + Math.cos(a) * rand(0, 30),
                y: 160 + rand(-30, 30),
                z: hp.z + Math.sin(a) * rand(0, 30),
                vx: Math.cos(a) * sp,
                vy: rand(-4, 20),
                vz: Math.sin(a) * sp,
                life: rand(5, 8),
                size0: rand(60, 100),
                size1: rand(150, 240),
                c0: PAL.redSmoke,
                c1: PAL.smoke1,
                a: 0.9,
                drag: 0.8,
                turb: 3,
              });
            }
          },
        ],
        [6.2, () => e.audio.choir(4.5, 0.15, 130.8)],
        [
          8.4,
          () => {
            e.target.storm = 0;
            e.target.dark = 0;
            e.target.vig = 0.55;
            e.target.bloom = 0.85;
          },
        ],
      ]);
    },
    update(e, t, dt) {
      setHands(e, t, R_KEYS, L_KEYS);
      tl.run(t);
      const w = e.world;

      // camera choreography
      e.script.pitch = 0.27 * easeOutCubic(t / 1.6) - (t > T_HIT ? 0.07 * smoothstep(T_HIT, T_HIT + 1, t) : 0) - 0.27 * smoothstep(8.5, 10.5, t) * 0.7;
      e.handGlow(0xff2a2a, t < T_FIRE ? 0.4 + t * 0.2 : 2.5 * (1 - smoothstep(6, 8.5, t)));
      if (t > 1.4 && t < T_FIRE) e.trauma = Math.max(e.trauma, 0.08 + 0.3 * smoothstep(1.4, T_FIRE, t));
      if (t > T_HIT && t < 6.5) e.trauma = Math.max(e.trauma, 0.55 * (1 - smoothstep(T_HIT, 6.5, t)));

      // circles
      const fadeOut = 1 - smoothstep(7.4, 9.6, t);
      circles.forEach((c, i) => {
        const t0 = 1.1 + i * 0.4;
        const k = clamp((t - t0) / 1.4);
        const s = 0.25 + 0.75 * easeOutCubic(k);
        circleGroups[i].scale.setScalar(s);
        const flick = 0.85 + Math.sin(t * 22 + i) * 0.1;
        c.mat.opacity = easeOutCubic(k) * fadeOut * flick * (1 + (t > T_FIRE && t < T_HIT + 1.5 ? 0.6 : 0));
        c.update(dt);
        if (k > 0 && k < 0.05) e.audio.zap(0.2);
      });

      // charge: converging sparks + sun
      if (t > 1.3 && t < T_FIRE) {
        const prog = smoothstep(1.3, T_FIRE, t);
        const sunR = 52 * easeOutCubic((t - 1.8) / 2.6);
        if (sun) {
          sun.obj.scale.setScalar(Math.max(0.001, sunR) * (1 + Math.sin(t * 25) * 0.03));
          sun.update(dt, t);
        }
        e.fire.emit({ x: TOP.x, y: TOP.y + 12, z: TOP.z, life: 0.14, size0: sunR * 3.6 + 20, size1: sunR * 4.4 + 20, c0: PAL.crimson, a: 0.3, fadeIn: 0.3 });
        const n = 10 + Math.floor(18 * prog);
        const p = new V3();
        for (let i = 0; i < n; i++) {
          const r = rand(90, 215);
          planePoint(CENTER, rand(0, Math.PI * 2), r, p);
          const dir = TOP.clone().add(new V3(0, 12, 0)).sub(p);
          const dist = dir.length();
          dir.normalize();
          e.sparks.emit({
            x: p.x,
            y: p.y,
            z: p.z,
            vx: dir.x * dist * 0.9,
            vy: dir.y * dist * 0.9,
            vz: dir.z * dist * 0.9,
            life: 1.1,
            size0: rand(2.5, 5),
            size1: 0.6,
            c0: Math.random() < 0.5 ? PAL.crimson : PAL.hot,
            c1: PAL.deepRed,
            a: 0.9,
            fadeIn: 0.2,
          });
        }
        boltTimer -= dt;
        if (t > 1.8 && boltTimer <= 0) {
          boltTimer = 0.2 - 0.12 * prog;
          const a = planePoint(CENTER, rand(0, Math.PI * 2), rand(100, 200));
          const b = new V3(rand(-600, 600), rand(-60, 160), rand(-950, -250));
          e.bolt(a, b, 5.5, PAL.bolt0, PAL.bolt1, 0.1, 0.28);
          e.audio.zap(0.18);
          if (Math.random() < 0.5) e.flash(0xff2030, 0.08, 14);
        }
        e.skyGlow(0xff2030, 0.1 + prog * 0.4, new V3(0, 0.45, -1), 8);
        w.cloudU.uGlowI.value = prog * 0.8;
        w.cloudU.uGlowPos.value.set(0, -85, -520);
      }

      // beam
      if (beam) {
        const grow = clamp((t - T_FIRE) / 0.3);
        const amp = t < 6.2 ? 1 : 1 - smoothstep(6.2, 8.2, t);
        beam.set(grow, amp, t);
        const surge = Math.max(0, 1 - (t - T_HIT) / 1.2);
        beam.widen(1 + 0.12 * Math.sin(t * 41) + 0.6 * surge * surge - 0.35 * smoothstep(6.5, 8.2, t));
        if (sun && t >= T_FIRE) {
          const k = 1 - smoothstep(T_FIRE, 7.5, t);
          sun.obj.scale.setScalar(Math.max(0.001, 55 * k + 10 * Math.sin(t * 30) * k));
          sun.update(dt, t);
        }
        if (t >= T_FIRE && t < 7) {
          // lightning wrapping the beam + beam-top flares
          boltTimer -= dt;
          if (boltTimer <= 0) {
            boltTimer = 0.07;
            const y = rand(-40, 250);
            const a = new V3(rand(-25, 25), y, -520 + rand(-25, 25));
            const b = new V3(rand(-170, 170), y + rand(-120, 20), -520 + rand(-170, 170));
            e.bolt(a, b, 4.5, PAL.bolt0, PAL.bolt1, 0.14, 0.2);
          }
          // beam shell flames
          for (let i = 0; i < 8; i++) {
            const a = rand(0, Math.PI * 2);
            const y = rand(-20, 260);
            e.fire.emit({
              x: Math.cos(a) * 32,
              y,
              z: -520 + Math.sin(a) * 32,
              vx: Math.cos(a) * rand(10, 40),
              vy: rand(-20, 30),
              vz: Math.sin(a) * rand(10, 40),
              life: rand(0.5, 1.1),
              size0: rand(8, 16),
              size1: rand(18, 30),
              c0: PAL.hot,
              c1: PAL.deepRed,
              a: 0.6,
              drag: 1.2,
            });
          }
        }
      }

      // aftermath: destruction
      if (impact) {
        const k = clamp((t - T_HIT) / 2.6);
        const burnR = (ISLAND_RADIUS + 40) * easeOutCubic(k);
        w.city.setBurn(burnR);
        w.groundU.uBurn.value = burnR;
        w.groundU.uHeat.value = 0.4 + 0.6 * Math.min(1, (t - T_HIT) / 1.5) - 0.15 * smoothstep(8.5, 10.8, t);
        w.groundU.uFront.value = (1 - k) * 2.2;
        const since = t - T_HIT;
        w.cloudU.uGlowI.value = 3 * Math.exp(-since * 0.28) + 0.5;
        const rp = clamp(since / 4);
        w.cloudU.uRing.value.set(1500 * easeOutCubic(rp), 80 + rp * 120, 1.5 * Math.pow(1 - rp, 1.5));
        w.cloudU.uRingCol.value.set(2.2, 0.4, 0.25);

        if (t < 8.8) {
          colTimer -= dt;
          const f = 1 - smoothstep(6.5, 8.8, t);
          const nF = Math.floor(30 * f) + 4;
          for (let i = 0; i < nF; i++) {
            const a = rand(0, Math.PI * 2);
            const r = Math.sqrt(Math.random()) * 28;
            e.fire.emit({
              x: ISLAND_CENTER.x + Math.cos(a) * r,
              y: ISLAND_CENTER.y + 10 + rand(0, 20),
              z: ISLAND_CENTER.z + Math.sin(a) * r,
              vx: rand(-6, 6),
              vy: rand(60, 150),
              vz: rand(-6, 6),
              life: rand(2.2, 4.0),
              size0: rand(28, 48),
              size1: rand(70, 110),
              c0: PAL.hot,
              c1: new C(0.3, 0.03, 0.02),
              a: 0.6,
              drag: 0.7,
            });
          }
          for (let i = 0; i < 10; i++) {
            const a = rand(0, Math.PI * 2);
            const r = Math.sqrt(Math.random()) * 34;
            e.smoke.emit({
              x: ISLAND_CENTER.x + Math.cos(a) * r,
              y: ISLAND_CENTER.y + 20 + rand(0, 40),
              z: ISLAND_CENTER.z + Math.sin(a) * r,
              vx: rand(-8, 8),
              vy: rand(40, 100),
              vz: rand(-8, 8),
              life: rand(6, 9),
              size0: rand(40, 60),
              size1: rand(130, 200),
              c0: PAL.redSmoke,
              c1: PAL.smoke1,
              a: 0.9,
              drag: 0.55,
              turb: 3,
            });
          }
          // wildfires on collapsing city
          const p = new V3();
          for (let i = 0; i < 7; i++) {
            const rr = burnR * Math.sqrt(Math.random());
            const a = rand(0, Math.PI * 2);
            p.set(ISLAND_CENTER.x + Math.cos(a) * rr, ISLAND_CENTER.y + rand(0, 8), ISLAND_CENTER.z + Math.sin(a) * rr);
            e.fire.emit({ x: p.x, y: p.y, z: p.z, vx: rand(-3, 3), vy: rand(14, 40), vz: rand(-3, 3), life: rand(1.2, 2.4), size0: rand(7, 12), size1: rand(14, 24), c0: PAL.ember, c1: PAL.deepRed, a: 0.7, drag: 0.5, turb: 6 });
          }
          if (colTimer <= 0) {
            colTimer = 0.1;
            e.setLight(new V3(0, 25, -30), 0xff4020, 220 * f + 60, 1.2);
          }
        }
        // drifting embers for the aftermath
        if (t > 6 && t < 10.5 && Math.random() < 0.8) {
          e.sparks.emit({
            x: rand(-60, 60),
            y: rand(-30, 40),
            z: rand(-200, -20),
            vx: rand(-1, 3),
            vy: rand(2, 8),
            vz: rand(-1, 1),
            life: rand(3, 6),
            size0: rand(0.3, 0.8),
            c0: PAL.ember,
            a: 0.7,
            turb: 4,
          });
        }
      }
    },
    end(e) {
      group.parent?.remove(group);
      circles.forEach((c) => c.dispose());
      beam?.dispose();
      sun?.dispose();
      beam = null;
      sun = null;
      circles = [];
      circleGroups = [];
      e.world.cloudU.uGlowI.value = 0.35;
      e.world.cloudU.uRing.value.z = 0;
      e.world.groundU.uFront.value = 0;
    },
  };
}

/* ====================================================================== */
/*  3. ABYSS — grimoire, seals, spears & trident                           */
/* ====================================================================== */
function abyss(): MoveDef {
  let tl: TL;
  let circleGroup: THREE.Group;
  let circles: MagicCircle[] = [];
  let cg: THREE.Group[] = [];
  let book: THREE.Group;
  let bookGlow: MagicCircle;
  let fwd = new V3(0, 0, -1);
  let origin = new V3();
  let spears: { g: THREE.Group; p: THREE.Vector3; dir: THREE.Vector3; born: number; launch: number; launched: boolean }[] = [];
  let rightV = new V3(1, 0, 0);
  let upV = new V3(0, 1, 0);
  let trident: THREE.Group | null = null;
  let tridentBorn = 0;
  let tridentLaunched = false;
  let tridentDir = new V3(0, 0, -1);
  let circleTex: THREE.Texture[] | null = null;
  let bookTex: THREE.Texture | null = null;
  const DIST = [20, 33, 48];
  const SIZE = [15, 25, 36];
  const up = new V3(0, 1, 0);

  const R_KEYS: Key[] = [
    { t: 0, pose: REST },
    { t: 1.2, pose: P(0.22, -0.28, -0.46, 0.1, 0.1, -1.1, 0.3, 0.3), e: "out" },
    { t: 3.3, pose: P(0.2, -0.25, -0.46, 0.15, 0.1, -1.1, 0.3, 0.3) },
    { t: 3.7, pose: P(0.12, -0.1, -0.56, 0.08, 0.05, -0.9, 0.3, [0.7, 0.0, 0.0, 1, 1]), e: "snap" },
    { t: 6.9, pose: P(0.12, -0.1, -0.56, 0.08, 0.05, -0.9, 0.3, [0.7, 0.0, 0.0, 1, 1]) },
    { t: 8.2, pose: REST },
  ];
  const L_KEYS: Key[] = [
    { t: 0, pose: mirror(REST) },
    { t: 1.0, pose: P(-0.13, -0.22, -0.5, 0.25, -0.15, 0, 0.7, [0.35, 0.3, 0.3, 0.3, 0.35]), e: "out" },
    { t: 6.8, pose: P(-0.13, -0.22, -0.5, 0.25, -0.15, 0, 0.7, [0.35, 0.3, 0.3, 0.3, 0.35]) },
    { t: 8.0, pose: mirror(REST) },
  ];

  const buildBook = () => {
    bookTex = bookTex ?? grimoireTexture();
    const g = new THREE.Group();
    const leather = new THREE.MeshStandardMaterial({ color: 0x0c0710, roughness: 0.6, metalness: 0.4 });
    const front = new THREE.MeshStandardMaterial({ map: bookTex, roughness: 0.4, metalness: 0.5, emissive: 0xffffff, emissiveMap: bookTex, emissiveIntensity: 0.55 });
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.28, 0.035), [leather, leather, leather, leather, front, leather]);
    g.add(cover);
    const pages = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.27, 0.026),
      new THREE.MeshStandardMaterial({ color: 0x3a2d38, roughness: 0.9, emissive: 0x1a0410, emissiveIntensity: 0.6 })
    );
    pages.position.set(0.004, 0, -0.004);
    g.add(pages);
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a13f, metalness: 1, roughness: 0.3, emissive: 0x3d2503 });
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.04), gold);
        c.position.set(sx * 0.095, sy * 0.135, 0);
        g.add(c);
      }
    }
    circleTex = circleTex ?? [magicCircleTexture(0), magicCircleTexture(1)];
    bookGlow = new MagicCircle(circleTex[1], new C(2.0, 0.2, 0.5), 0.46);
    bookGlow.obj.position.z = 0.03;
    bookGlow.obj.renderOrder = 30;
    bookGlow.mat.depthTest = false;
    g.add(bookGlow.obj);
    return g;
  };

  return {
    id: "abyss",
    key: "3",
    name: "KHẾ ƯỚC VỰC THẲM",
    sub: "Abyss · Ma Đạo Thư",
    kanji: "深淵",
    desc: "Ma đạo thư mở ấn — ngàn mũi giáo và đinh ba từ vực sâu.",
    color: "#d946ef",
    duration: 8.9,
    start(e) {
      circleTex = circleTex ?? [magicCircleTexture(0), magicCircleTexture(1)];
      fwd = e.forward(new V3());
      fwd.y = clamp(fwd.y, 0, 0.08);
      fwd.normalize();
      origin = e.camera.position.clone();
      origin.y += 6.5;
      rightV = new V3().crossVectors(fwd, up).normalize();
      upV = new V3().crossVectors(rightV, fwd).normalize();
      circleGroup = new THREE.Group();
      e.scene.add(circleGroup);
      circles = [];
      cg = [];
      const cols = [new C(2.2, 0.15, 0.4), new C(1.6, 0.25, 2.2), new C(2.4, 0.4, 0.5)];
      DIST.forEach((d, i) => {
        const g = new THREE.Group();
        g.position.copy(origin).addScaledVector(fwd, d);
        g.lookAt(origin);
        const c = new MagicCircle(circleTex![i % 2], cols[i], SIZE[i]);
        c.spin = (i % 2 ? -1 : 1) * (0.5 + i * 0.2);
        g.add(c.obj);
        g.scale.setScalar(0.01);
        circleGroup.add(g);
        circles.push(c);
        cg.push(g);
      });
      book = buildBook();
      book.position.set(-0.1, -0.02, -0.52);
      book.scale.setScalar(0.001);
      e.camera.add(book);

      spears = [];
      trident = null;
      tridentLaunched = false;

      e.userWeight = 0.5;
      e.script.pitch = 0.02;
      e.target.storm = 0.6;
      e.target.dark = 0.3;
      e.target.vig = 0.8;

      tl = new TL([
        [
          0.05,
          () => {
            e.audio.stinger(0.5);
            e.audio.choir(6.2, 0.22, 164.8);
            e.audio.riser(3, 0.3, 60, 400);
            e.fx.glitch = 0.9;
            e.flash(0x300040, 0.3, 5);
          },
        ],
        [0.9, () => e.audio.crackle(3, 0.2)],
        [
          3.0,
          () => {
            // spears materialise in the seals
            const order = Array.from({ length: 30 }, (_, i) => i).sort(() => Math.random() - 0.5);
            const right = new V3().crossVectors(fwd, up).normalize();
            const upv = new V3().crossVectors(right, fwd).normalize();
            for (let i = 0; i < 30; i++) {
              const k = i % 3;
              const R = (SIZE[k] / 2) * 0.62;
              const a = rand(0, Math.PI * 2);
              const r = Math.sqrt(Math.random()) * R;
              const p = new V3().copy(cg[k].position).addScaledVector(right, Math.cos(a) * r).addScaledVector(upv, Math.sin(a) * r);
              const g = makeSpear(rand(9, 14), 0.3);
              g.position.copy(p);
              const dir = fwd.clone().addScaledVector(right, Math.cos(a) * 0.7).addScaledVector(upv, Math.sin(a) * 0.7 + 0.1).normalize();
              g.lookAt(p.x + dir.x, p.y + dir.y, p.z + dir.z);
              g.scale.set(1, 1, 0.001);
              e.scene.add(g);
              spears.push({ g, p, dir, born: 3.0 + i * 0.035, launch: 4.05 + order[i] * 0.04, launched: false });
              e.addActor(new ShockRing(p, fwd.clone().negate(), PAL.violet.clone(), 2.6, 0.6, 0.12));
            }
            e.audio.rumble(2, 0.5, 90);
            e.audio.riser(1.0, 0.3, 200, 1200);
            e.fx.glitch = 0.5;
          },
        ],
        [
          5.35,
          () => {
            trident = makeTrident(22);
            const p = cg[1].position.clone();
            trident.position.copy(p);
            tridentDir = fwd.clone().addScaledVector(upV, 0.55).addScaledVector(rightV, 0.3).normalize();
            trident.lookAt(p.x + tridentDir.x, p.y + tridentDir.y, p.z + tridentDir.z);
            trident.scale.set(1, 1, 0.001);
            e.scene.add(trident);
            tridentBorn = 5.35;
            e.audio.riser(1.0, 0.45, 80, 700);
            e.audio.boom(0.5, 60, 2.5);
            e.fx.glitch = 0.8;
            e.shake(0.3);
            e.flash(0x8a30ff, 0.3, 6);
            e.addActor(new ShockRing(p, fwd.clone().negate(), PAL.crimson.clone(), 26, 1.0, 0.08));
          },
        ],
        [6.2, () => e.audio.whoosh(1.0, 150, 3500, 0.9, 0.7)],
      ]);
    },
    update(e, t, dt) {
      setHands(e, t, R_KEYS, L_KEYS);
      tl.run(t);

      // book
      const bk = clamp((t - 0.25) / 0.9);
      const sc = easeOutCubic(bk) * (1 + Math.sin(t * 3) * 0.015);
      const bookFade = 1 - smoothstep(6.8, 7.8, t);
      book.scale.setScalar(Math.max(0.001, sc * bookFade * 0.62));
      book.position.set(-0.17 + Math.sin(t * 1.3) * 0.004, -0.06 + Math.sin(t * 1.8) * 0.01, -0.55);
      book.rotation.set(-0.12 + Math.sin(t * 1.1) * 0.03, 0.22, 0.04);
      bookGlow.mat.opacity = easeOutCubic(bk) * (0.65 + 0.35 * Math.sin(t * 9));
      bookGlow.update(dt);
      e.handGlow(0xff2a6a, 1.2 + Math.sin(t * 8) * 0.3 + (t > 3 ? 1 : 0));
      if (t > 0.6 && t < 6.8 && Math.random() < dt * 40) {
        const bp = book.getWorldPosition(new V3());
        e.sparks.emit({
          x: bp.x + rand(-0.1, 0.1),
          y: bp.y + rand(-0.12, 0.12),
          z: bp.z + rand(-0.03, 0.03),
          vx: rand(-0.1, 0.1),
          vy: rand(0.1, 0.35),
          vz: rand(-0.05, 0.05),
          life: rand(0.7, 1.5),
          size0: 0.012,
          size1: 0.004,
          c0: PAL.crimson,
          a: 0.9,
          turb: 1,
        });
      }

      // seals
      const sealFade = 1 - smoothstep(6.4, 7.8, t);
      const p = new V3();
      circles.forEach((c, i) => {
        const t0 = 1.3 + i * 0.4;
        const k = clamp((t - t0) / 0.9);
        cg[i].scale.setScalar(Math.max(0.01, easeOutCubic(k)));
        c.mat.opacity = easeOutCubic(k) * sealFade * (0.85 + Math.sin(t * 17 + i * 2) * 0.12);
        c.update(dt);
        if (k > 0 && k < 0.06) {
          e.audio.zap(0.35);
          e.shake(0.18);
          e.fx.glitch = Math.max(e.fx.glitch, 0.5);
          e.flash(0x7a30ff, 0.18, 9);
          e.ripple(0.5, 0.5, 0.9, 0.35);
          e.addActor(new ShockRing(cg[i].position, fwd.clone().negate(), PAL.violet.clone(), SIZE[i] * 1.6, 1.1, 0.07));
          const bp = book.getWorldPosition(new V3());
          e.bolt(bp, cg[i].position.clone(), 0.4, PAL.vbolt0, PAL.vbolt1, 0.2, 0.3);
        }
        if (k > 0 && sealFade > 0.05) {
          // dark ooze dripping from the seal + rim sparks
          const right = new V3().crossVectors(fwd, up).normalize();
          const R = SIZE[i] / 2;
          for (let j = 0; j < 3; j++) {
            const a = rand(0, Math.PI * 2);
            p.copy(cg[i].position).addScaledVector(right, Math.cos(a) * R * 0.92).addScaledVector(up, Math.sin(a) * R * 0.92);
            e.smoke.emit({ x: p.x, y: p.y, z: p.z, vx: rand(-0.3, 0.3), vy: -rand(0.5, 3), vz: rand(-0.3, 0.3), life: rand(1.6, 3), size0: R * 0.06, size1: R * 0.16, c0: PAL.smoke0, c1: PAL.smoke1, a: 0.85, grav: -1, turb: 1.2 });
            e.fire.emit({ x: p.x, y: p.y, z: p.z, vx: rand(-1, 1), vy: rand(0.5, 3), vz: rand(-1, 1), life: rand(0.5, 1.1), size0: R * 0.05, size1: R * 0.12, c0: PAL.violet, c1: PAL.deepRed, a: 0.55, turb: 2 });
          }
        }
      });

      // spears
      for (const s of spears) {
        if (s.launched) continue;
        const k = clamp((t - s.born) / 0.55);
        if (t >= s.launch) {
          s.launched = true;
          s.g.scale.set(1, 1, 1);
          const start = s.p.clone();
          const target = origin
            .clone()
            .addScaledVector(fwd, rand(230, 400))
            .add(new V3(rand(-90, 90), rand(-60, 70), rand(-30, 30)).applyQuaternion(e.camera.quaternion));
          const proj = new Projectile(e, start, s.dir, target, rand(300, 360), 1.2, 1.0, (pp) => blackExplosion(e, pp, rand(0.6, 0.95)), "spear", s.g);
          s.g.position.set(0, 0, 0);
          s.g.rotation.set(0, 0, 0);
          e.scene.remove(s.g);
          e.addActor(proj);
          e.audio.whoosh(0.5, 800, 5000, 0.12);
          e.kickCam(-0.002, 0, 0);
          e.shake(0.025);
          e.right.kick(0, 0.004, 0.02);
        } else {
          const e1 = easeOutCubic(k);
          s.g.scale.set(1, 1, Math.max(0.001, e1));
          s.g.position.set(s.p.x + rand(-1, 1) * 0.04 * (1 - k * 0.4), s.p.y + rand(-1, 1) * 0.04, s.p.z + rand(-1, 1) * 0.04);
          e.fire.emit({ x: s.p.x + s.dir.x * 6 * e1, y: s.p.y + s.dir.y * 6 * e1, z: s.p.z + s.dir.z * 6 * e1, vx: rand(-1, 1), vy: rand(-1, 1), vz: rand(-1, 1), life: 0.35, size0: 1.2, size1: 2.4, c0: PAL.violet, c1: PAL.deepRed, a: 0.5, fadeIn: 0.1 });
        }
      }

      // trident
      if (trident && !tridentLaunched) {
        const k = clamp((t - tridentBorn) / 0.7);
        trident.scale.set(1, 1, Math.max(0.001, easeOutCubic(k)));
        const tp = trident.position;
        e.fire.emit({ x: tp.x + tridentDir.x * 22 * k, y: tp.y + tridentDir.y * 22 * k, z: tp.z + tridentDir.z * 22 * k, life: 0.15, size0: 6, size1: 8, c0: PAL.crimson, a: 0.35, fadeIn: 0.3 });
        if (t >= 6.2) {
          tridentLaunched = true;
          const g = trident;
          const start = g.position.clone();
          const target = origin.clone().addScaledVector(fwd, 470).add(new V3(0, -25, 0));
          const proj = new Projectile(
            e,
            start,
            tridentDir,
            target,
            440,
            1.0,
            3.4,
            (pp) => {
              blackExplosion(e, pp, 3.4);
              e.addActor(new Dome(pp, PAL.violet.clone(), 90, 1.4));
              e.addActor(new ShockRing(pp, new V3(0, 1, 0), PAL.crimson.clone(), 240, 2, 0.06));
              e.ripple(0.5, 0.45, 0.85, 0.9);
              e.fx.zoom = 0.9;
              e.kickFov(10);
              e.skyGlow(0x8a30ff, 1.4, pp.clone().sub(e.camera.position), 1);
              for (let i = 0; i < 140; i++) {
                const a = rand(0, Math.PI * 2);
                e.smoke.emit({ x: pp.x + Math.cos(a) * 10, y: pp.y, z: pp.z + Math.sin(a) * 10, vx: Math.cos(a) * rand(5, 25), vy: rand(30, 90), vz: Math.sin(a) * rand(5, 25), life: rand(4, 7), size0: rand(14, 24), size1: rand(50, 90), c0: PAL.smoke0, c1: PAL.smoke1, a: 0.9, drag: 0.6, turb: 3 });
                e.fire.emit({ x: pp.x + Math.cos(a) * 6, y: pp.y, z: pp.z + Math.sin(a) * 6, vx: Math.cos(a) * rand(5, 25), vy: rand(30, 100), vz: Math.sin(a) * rand(5, 25), life: rand(1.5, 3), size0: rand(10, 18), size1: rand(25, 45), c0: PAL.violetHot, c1: PAL.deepRed, a: 0.6, drag: 0.8 });
              }
            },
            "spear",
            g
          );
          g.position.set(0, 0, 0);
          g.rotation.set(0, 0, 0);
          g.scale.set(1, 1, 1);
          e.scene.remove(g);
          e.addActor(proj);
          trident = null;
          e.kickCam(-0.04, 0, 0);
          e.kickPos(0, 0, 0.15);
          e.shake(0.5);
          e.kickFov(10);
          e.fx.zoom = 0.7;
          e.fx.aberr = 1.4;
          e.flash(0xaa60ff, 0.4, 6);
          e.right.kick(0, 0.02, 0.15);
          e.audio.boom(0.8, 55, 3);
        }
      }

      if (t > 5.35 && t < 6.2) e.trauma = Math.max(e.trauma, 0.12 + (t - 5.35) * 0.2);
      e.script.pitch = 0.02 + 0.05 * Math.sin(t * 0.8);
    },
    end(e) {
      e.camera.remove(book);
      book.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      circleGroup.parent?.remove(circleGroup);
      circles.forEach((c) => c.dispose());
      bookGlow.dispose();
      for (const s of spears) e.scene.remove(s.g);
      spears = [];
      if (trident) {
        e.scene.remove(trident);
        trident = null;
      }
    },
  };
}

/* ====================================================================== */
/*  4. SUPREME KING HAKI                                                  */
/* ====================================================================== */
function haki(): MoveDef {
  let tl: TL;
  let boltT = 0;
  let auraAcc = 0;
  let floorT = 0;
  let released = false;
  let beatIdx = 0;
  const BEATS = [0.45, 1.0, 1.5, 1.9, 2.2, 2.45];
  const T_REL = 2.65;
  const PI = Math.PI;

  const R_KEYS: Key[] = [
    { t: 0, pose: REST },
    { t: 1.0, pose: P(0.22, -0.3, -0.5, -0.05, 0.08, PI * 0.95, 0.9, 0.18), e: "out" },
    { t: 2.5, pose: P(0.2, -0.17, -0.5, 0.1, 0.1, PI * 0.95, 1.0, [0.55, 0.65, 0.65, 0.65, 0.65]) },
    { t: 2.72, pose: P(0.33, -0.1, -0.5, 0.3, -0.12, PI * 0.8, 1.0, 0.42), e: "snap" },
    { t: 4.8, pose: P(0.3, -0.12, -0.5, 0.25, -0.1, PI * 0.8, 1.0, 0.45) },
    { t: 6.0, pose: REST },
  ];
  const L_KEYS = R_KEYS.map((k) => ({ ...k, pose: mirror(k.pose) }));

  return {
    id: "haki",
    key: "4",
    name: "BÁ VƯƠNG KHÍ",
    sub: "Supreme King Haki",
    kanji: "覇王色",
    desc: "Uy áp thống trị — trời đất nứt toác, vạn vật khuỵu gối.",
    color: "#ff6b3d",
    duration: 6.4,
    start(e) {
      boltT = 0;
      auraAcc = 0;
      floorT = 0;
      released = false;
      beatIdx = 0;
      e.userWeight = 0.3;
      e.script.pitch = -0.1;
      e.target.storm = 0.85;
      e.target.dark = 0.55;
      e.target.vig = 0.95;
      e.target.desat = 0.45;
      e.world.cloudU.uGlowPos.value.set(0, -85, 0);
      e.world.cloudU.uGlowI.value = 0;
      tl = new TL([
        [
          0.02,
          () => {
            e.audio.stinger(0.4);
            e.audio.riser(2.6, 0.45, 40, 500);
            e.audio.rumble(3, 0.5, 60);
            e.fx.glitch = 0.7;
          },
        ],
        [
          1.0,
          () => {
            e.audio.crackle(2, 0.3);
          },
        ],
        [
          T_REL,
          () => {
            released = true;
            e.fx.invert = 1;
            e.flash(0xffffff, 0.8, 7);
            e.shake(1);
            e.kickFov(26);
            e.kickCam(0.07, 0, 0.03);
            e.kickPos(0, 0, 0.25);
            e.ripple(0.5, 0.5, 1.0, 1.4);
            setTimeout(() => e.ripple(0.5, 0.5, 0.85, 1.0), 180);
            e.fx.aberr = 2.8;
            e.fx.glitch = 1;
            e.fx.zoom = 1.6;
            e.target.desat = 0;
            e.script.pitch = 0.1;
            e.audio.boom(1.7, 42, 6);
            e.audio.rumble(5.5, 1, 50);
            e.audio.whoosh(1.4, 100, 3500, 0.8, 0.6);
            e.skyGlow(0xff2030, 1.6, new V3(0, 0.1, -1), 0.7);
            e.setLight(new V3(0, 6, -6), 0xff3040, 400, 1.5);
            const f = e.forward(new V3());
            const cp = e.camera.position;
            e.addActor(new ShockRing(cp.clone().addScaledVector(f, 7), f.clone().negate(), new C(2.4, 1.2, 1.4), 14, 1.0, 0.1));
            e.addActor(new ShockRing(cp.clone().addScaledVector(f, 16), f.clone().negate(), new C(2.2, 0.2, 0.35), 40, 1.5, 0.08));
            e.addActor(new ShockRing(new V3(cp.x, -1.6, cp.z), new V3(0, 1, 0), new C(2.5, 0.4, 0.5), 260, 2.4, 0.06));
            e.addActor(new ShockRing(new V3(cp.x, -1.5, cp.z), new V3(0, 1, 0), new C(1.4, 0.1, 0.3), 520, 3.4, 0.05));
            e.addActor(new Dome(new V3(cp.x, -1.6, cp.z), new C(1.6, 0.15, 0.35), 60, 1.2, true));
            for (let i = 0; i < 450; i++) {
              const a = rand(0, Math.PI * 2);
              const sp = rand(10, 70);
              e.sparks.emit({
                x: cp.x + Math.cos(a) * 3,
                y: -1.5,
                z: cp.z + Math.sin(a) * 3,
                vx: Math.cos(a) * sp,
                vy: rand(4, 22),
                vz: Math.sin(a) * sp,
                life: rand(1.5, 3.5),
                size0: rand(0.15, 0.45),
                size1: 0.04,
                c0: Math.random() < 0.5 ? PAL.crimson : PAL.hot,
                c1: PAL.deepRed,
                grav: 10,
                drag: 0.3,
              });
            }
            // cracks in the sky
            for (let i = 0; i < 5; i++) {
              const a = new V3(rand(-350, 350), rand(80, 330), rand(-760, -520));
              const b = a.clone().add(new V3(rand(-300, 300), rand(-160, 120), rand(-60, 60)));
              e.bolt(a, b, rand(3, 5), new C(2.6, 0.3, 0.4), new C(0.5, 0.0, 0.15), 0.3, 1.9);
            }
          },
        ],
        [3.15, () => (e.fx.glitch = 0.8)],
        [3.8, () => (e.fx.glitch = 0.6)],
        [
          4.6,
          () => {
            e.target.storm = 0;
            e.target.dark = 0;
            e.target.vig = 0.55;
          },
        ],
      ]);
    },
    update(e, t, dt) {
      setHands(e, t, R_KEYS, L_KEYS);
      tl.run(t);
      const w = e.world;
      const cp = e.camera.position;

      // narrowing gaze, heartbeat
      if (!released) {
        e.fx.eye = 0.55 * smoothstep(0.1, 1.4, t);
        while (beatIdx < BEATS.length && t >= BEATS[beatIdx]) {
          beatIdx++;
          e.audio.boom(0.55, 48, 0.9);
          e.shake(0.12);
          e.fx.vig = 1.2;
          e.fx.aberr = 0.6;
          e.kickCam(-0.004, 0, 0);
          e.flash(0x50000c, 0.18, 10);
        }
        if (t > 1.2) e.trauma = Math.max(e.trauma, 0.1 + 0.4 * smoothstep(1.2, T_REL, t));
      } else {
        e.fx.eye += (0 - e.fx.eye) * Math.min(1, dt * 14);
      }

      e.handGlow(0xff1830, released ? 3 * (1 - smoothstep(T_REL, 5, t)) : 0.4 + t * 0.4);

      // dark aura rising at the edges of the screen
      if (t > 0.6 && t < 5) {
        const rate = released ? 150 : 90 + t * 45;
        auraAcc += rate * dt;
        const n = Math.floor(auraAcc);
        auraAcc -= n;
        const lp = new V3();
        for (let i = 0; i < n; i++) {
          const side = Math.random() < 0.5 ? -1 : 1;
          lp.set(side * rand(0.25, 0.75), -0.45 + rand(-0.05, 0.1), -rand(0.7, 1.4));
          e.camera.localToWorld(lp);
          const sz = rand(0.12, 0.27);
          e.fire.emit({ x: lp.x, y: lp.y, z: lp.z, vx: rand(-0.1, 0.1), vy: rand(0.5, 1.6), vz: rand(-0.1, 0.1), life: rand(0.8, 1.4), size0: sz, size1: sz * 2.2, c0: PAL.crimson, c1: PAL.deepRed, a: 0.4, turb: 1.5, drag: 0.4 });
          e.smoke.emit({ x: lp.x, y: lp.y, z: lp.z, vx: rand(-0.1, 0.1), vy: rand(0.5, 1.6), vz: rand(-0.1, 0.1), life: rand(0.9, 1.5), size0: sz * 0.8, size1: sz * 1.9, c0: PAL.smoke0, c1: PAL.smoke1, a: 0.95, turb: 1.5, drag: 0.4 });
        }
      }

      // crawling floor lightning during build-up
      if (t > 1.1 && t < T_REL) {
        floorT -= dt;
        if (floorT <= 0) {
          floorT = 0.07;
          const a = new V3(rand(-14, 14), -1.55, rand(-30, -3));
          const b = a.clone().add(new V3(rand(-7, 7), 0.02, rand(-7, 7)));
          e.bolt(a, b, 0.12, PAL.bolt0, PAL.bolt1, 0.3, 0.14);
          e.sparks.emit({ x: a.x, y: -1.4, z: a.z, vx: rand(-1, 1), vy: rand(2, 6), vz: rand(-1, 1), life: 0.8, size0: 0.1, c0: PAL.crimson, grav: 6 });
        }
      }

      // sky lightning storm after release
      if (released && t < 5) {
        boltT -= dt;
        if (boltT <= 0) {
          boltT = rand(0.05, 0.12);
          const a = new V3(rand(-450, 450), rand(260, 600), rand(-850, -150));
          const b = new V3(a.x + rand(-200, 200), rand(-70, 60), a.z + rand(-250, 100));
          e.bolt(a, b, rand(3.5, 6), PAL.bolt0, PAL.bolt1, 0.12, rand(0.18, 0.3));
          e.flash(0xff2030, 0.07, 16);
          if (Math.random() < 0.3) e.audio.zap(0.2);
        }
        const rp = clamp((t - T_REL) / 3);
        w.cloudU.uGlowPos.value.set(cp.x, -85, cp.z - 50);
        w.cloudU.uGlowI.value = 1.6 * Math.exp(-(t - T_REL) * 0.6);
        w.cloudU.uRing.value.set(1700 * easeOutCubic(rp), 100 + 160 * rp, 1.3 * Math.pow(1 - rp, 1.3));
        w.cloudU.uRingCol.value.set(2.4, 0.2, 0.3);
        if (t < T_REL + 0.9) e.trauma = Math.max(e.trauma, 0.8 * (1 - (t - T_REL) / 0.9));
      }
    },
    end(e) {
      e.world.cloudU.uGlowI.value = 0;
      e.world.cloudU.uRing.value.z = 0;
      e.fx.eye = 0;
    },
  };
}

export const MOVES: MoveDef[] = [omen(), mother(), abyss(), haki()];

export const CHAIN = {
  id: "chain",
  key: "5",
  name: "HƯ VÔ CHI VƯƠNG",
  sub: "Mu · Chuỗi Tận Thế",
  kanji: "無",
  desc: "Bá Vương Khí → Hắc Viêm → Vực Thẳm → Thiên Phạt.",
  color: "#f5d061",
  order: ["haki", "omen", "abyss", "mother"],
};
