import * as THREE from 'three';
import type { Engine, AimInfo } from './engine';

/* ------------------------------------------------------------------ helpers */
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const eIn = (x: number) => x * x * x;
const eOut = (x: number) => 1 - Math.pow(1 - x, 3);
const eIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eBack = (x: number) => { const c1 = 1.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Wrist target that makes the fist land *on* the surface rather than inside it. */
function contact(T: THREE.Vector3, fist: number) {
  return T.clone().addScaledVector(T.clone().normalize(), -0.075 * fist);
}

export interface MoveDef {
  id: number;
  key: string;
  jp: string;
  en: string;
  gear: string;
  blurb: string;
  color: string;
  dur: number;
  start: (e: Engine) => unknown;
  update: (e: Engine, t: number, dt: number, s: any) => void;
  end?: (e: Engine) => void;
}

function baseState(e: Engine) {
  const aim: AimInfo = e.aim();
  return { aim, hit: false, flags: {} as Record<string, boolean>, n: 0 as number };
}

function once(s: { flags: Record<string, boolean> }, key: string, cond: boolean, fn: () => void) {
  if (cond && !s.flags[key]) { s.flags[key] = true; fn(); }
}

/** Pulls skin/arm settings from "inflation" values. */
function inflate(a: import('./arm').ArmRig, fist: number, thick: number, thickEnd: number, bulge = 0) {
  a.fist = fist; a.thick = thick; a.thickEnd = thickEnd; a.bulge = bulge; a.thinK = fist > 3 ? 0 : 1;
  a.taper = 1 + 3 * clamp01((fist - 8) / 60);
}

/* ================================================================== 1. PISTOL */
const pistol: MoveDef = {
  id: 0, key: '1', jp: 'ゴムゴムの銃', en: 'GOMU GOMU NO PISTOL', gear: '—', color: '#ff5a3a', dur: 2.35,
  blurb: 'Nắm đấm cao su bắn thẳng',
  start(e) {
    e.banner('ゴムゴムの<br>銃', 'GOMU GOMU NO PISTOL', 'GUM-GUM', '#ff5a3a');
    e.sfx.stretch(0.7);
    return baseState(e);
  },
  update(e, t, _dt, s) {
    const [R, L] = e.arms;
    const T0 = e.toCam(s.aim.point);
    const dist = s.aim.dist;
    const fistMax = 1 + dist * 0.2;
    const T = contact(T0, fistMax);
    const restR = e.restF(1, V()), restL = e.restF(-1, V());
    const wind = V(1.2, -0.12, 0.95);
    const restBend = V(0.16, -0.24, 0.1), windBend = V(0.55, -0.5, 0.4);
    const tFire = 0.72, tHit = 0.8, tRet = 1.55;
    let ext = 0;
    const w = seg(t, 0, 0.6);
    if (t < tFire) {
      const k = eBack(w);
      R.F.lerpVectors(restR, wind, k);
      R.bend.lerpVectors(restBend, windBend, eOut(w));
      R.wobble = 0.015 * seg(t, 0.4, tFire) * Math.sin(t * 60);
    } else if (t < tRet) {
      const k = eIn(seg(t, tFire, tHit));
      ext = k;
      R.F.lerpVectors(wind, T, k);
      R.bend.copy(windBend).multiplyScalar(1 - k);
      R.wobble = k < 1 ? 0.05 : 0.22 * Math.exp(-(t - tHit) * 3.2);
    } else {
      const r = eIO(seg(t, tRet, 2.1));
      ext = 1 - r;
      R.F.lerpVectors(T, restR, r);
      R.bend.copy(restBend).multiplyScalar(r);
      R.wobble = 0.12 * (1 - r);
    }
    R.fist = 1 + (fistMax - 1) * ext;
    R.thickEnd = 1 + dist * 0.09 * ext;
    R.thick = 1 + 0.5 * ext;
    R.roll = -0.22 + 0.7 * ext;
    R.curl = 1;
    // guard hand
    const gl = Math.min(eOut(seg(t, 0, 0.5)), 1 - eIO(seg(t, tRet, 2.1)));
    L.F.lerpVectors(restL, V(-0.12, -0.12, -0.5), gl);
    L.F.z -= 0.08 * Math.sin(Math.PI * seg(t, tFire, 1.1));
    L.wobble = 0;

    // camera / post
    const wind01 = seg(t, 0, 0.6) * (1 - seg(t, tFire, tHit));
    e.fovGoal = 8 * wind01 - 12 * (t >= tFire && t < tRet ? 1 : 0) * (t < tHit + 0.35 ? 1 : 0);
    e.rollBiasGoal = 0.07 * wind01;
    e.g.chroma = 0.0015 + wind01 * 0.003;
    e.g.speed = t >= tFire && t < tHit + 0.06 ? 1 : wind01 * 0.12;
    e.g.radial = t >= tFire && t < tHit + 0.05 ? 1 : 0;
    e.speedColor.set(0xffffff);

    once(s, 'whoosh', t >= tFire, () => { e.sfx.whoosh(0.3, 400, 5000, 0.8); e.sfx.twang(0.5); });
    if (t >= tFire && t < tHit) {
      for (let i = 0; i < 3; i++) {
        R.pointAt(rnd(0.2, 1), e.tmpV3);
        const w3 = e.toWorld(e.tmpV3, V());
        e.glow.emit({ pos: w3, vel: V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(3), life: 0.25, size0: 0.04, size1: 0, len: 1.4, stretch: 0.02, c0: 0xffffff, c1: 0xffd0a0, a0: 0.9, a1: 0, style: 2 });
      }
    }
    once(s, 'hit', t >= tHit, () => {
      const dir = s.aim.dir.clone();
      e.impactFx(s.aim.point, dir, 1.25, 0xff5a3a, { stop: 0.09, frames: 3, shake: 0.65, crater: true, text: ['バキッ!!', 'BAM!'] });
      e.blast(s.aim.point, dir, 26, 3.5, s.aim.target);
      e.sfx.hit(1.2);
    });
    once(s, 'back', t >= tRet, () => { e.sfx.whoosh(0.35, 3500, 300, 0.5); e.sfx.twang(0.35); });
  },
};

/* ================================================================== 2. JET GATLING (Gear 2) */
const GAT_N = 10;
const gatling: MoveDef = {
  id: 1, key: '2', jp: 'ゴムゴムの JET 銃乱打', en: 'GOMU GOMU NO JET GATLING', gear: 'GEAR 2', color: '#ff3b6b', dur: 4.7,
  blurb: 'Gear Second – mưa đấm tốc độ ánh sáng',
  start(e) {
    e.banner('ゴムゴムの<br>JET銃乱打', 'GOMU GOMU NO JET GATLING', 'GEAR SECOND', '#ff3b6b');
    e.setGear(2, 7);
    e.aura = 3.5;
    e.sfx.hiss(1.4);
    e.sfx.thump(0.8);
    e.flash(0.35, 0xff5a70);
    e.text('ギア セカンド', { x: 50, y: 30, size: 8, color: '#ff4a70', rot: -5, sub: 'GEAR SECOND', life: 1.5 });
    const st = baseState(e);
    const cyc = Array.from({ length: GAT_N }, (_, k) => ({ n: -1, u: 0, off: V(), hit: false, base: V(), k }));
    e.arms.forEach((a, i) => {
      if (i >= 2) {
        a.shoulder.set(a.side * rnd(0.36, 0.5), rnd(-0.78, -0.68), rnd(0, 0.12));
        a.thick = 0.9;
      }
      cyc[i].base.set(a.side * rnd(0.22, 0.4), rnd(-0.48, -0.22), rnd(-0.45, -0.3));
    });
    return { ...st, cyc, nextText: 0.7 };
  },
  update(e, t, _dt, s) {
    const A = e.arms;
    const tBar0 = 0.65, tBar1 = 3.1, tFin = 3.5, tHit = 3.62;
    const aim: AimInfo = s.aim;
    const dir: THREE.Vector3 = aim.dir;
    const right = V().crossVectors(dir, V(0, 1, 0)).normalize();
    const up = V().crossVectors(right, dir).normalize();
    const fistMax = 1 + aim.dist * 0.075;
    const restR = e.restF(1, V()), restL = e.restF(-1, V());

    if (t < tBar0) {
      // pumping up
      const k = eOut(seg(t, 0, 0.5));
      for (let i = 0; i < 2; i++) {
        const a = A[i];
        const sd = a.side;
        a.F.set(sd * lerp(0.3, 0.16, k), lerp(-0.3, -0.14, k) + Math.sin(t * 36 + i * Math.PI) * 0.04 * k, lerp(-0.62, -0.48, k));
        a.bend.set(sd * 0.2, -0.3, 0.12);
        a.wobble = 0.012 * k;
        a.thick = 1 + 0.25 * k + 0.06 * Math.sin(t * 36 + i * 3);
        a.roll = sd * -0.22;
      }
      e.addTrauma(0.0);
      e.trauma = Math.max(e.trauma, 0.18 * k);
      e.g.pulse = 0.55 * k * (0.6 + 0.4 * Math.sin(t * 18));
      e.g.chroma = 0.004 * k;
      e.fovGoal = -3 * k;
    } else if (t < tBar1) {
      const bt = t - tBar0;
      once(s, 'vis', true, () => { for (let i = 2; i < A.length; i++) A[i].visible = true; });
      for (let k = 0; k < GAT_N; k++) {
        const a = A[k];
        const c = s.cyc[k];
        const P = k < 2 ? 0.17 : 0.23;
        const x = bt / P + k * 0.173;
        const cycle = Math.floor(x);
        const u = x - cycle;
        if (cycle !== c.n) {
          c.n = cycle;
          c.hit = false;
          const ang = Math.random() * 6.28, rad = Math.sqrt(Math.random()) * Math.min(2.1, aim.dist * 0.1);
          c.off.copy(right).multiplyScalar(Math.cos(ang) * rad).addScaledVector(up, Math.sin(ang) * rad * 0.8);
        }
        const ext = u < 0.28 ? eOut(u / 0.28) : 1 - eIO((u - 0.28) / 0.72);
        const tgtW = aim.point.clone().add(c.off);
        const T = contact(e.toCam(tgtW), fistMax);
        const tmp = V().lerpVectors(c.base, T, ext);
        a.F.copy(tmp);
        a.bend.set(a.side * 0.18, -0.2, 0.1).multiplyScalar(1 - ext);
        a.wobble = 0.03 * ext;
        a.fist = 1 + (fistMax - 1) * ext;
        a.thickEnd = 1 + aim.dist * 0.03 * ext;
        a.thick = k < 2 ? 1.2 : 0.95;
        a.roll = a.side * -0.22 + (k * 0.7);
        if (!c.hit && u >= 0.28) {
          c.hit = true;
          if (k < 2 || Math.random() < 0.5) {
            e.impactFx(tgtW, dir, 0.6, pick([0xff5a70, 0xffc040, 0xffffff]), { mini: true, shake: 0.14, stop: 0 });
          }
          aim.target?.nudge(dir, 0.55);
        }
      }
      e.trauma = Math.max(e.trauma, 0.34);
      e.fovGoal = -6;
      e.g.radial = 0.5;
      e.g.speed = 0.85;
      e.g.chroma = 0.0045;
      e.g.pulse = 0.25;
      e.speedColor.set(0xffd0d8);
      e.pitchBiasGoal = Math.sin(bt * 9) * 0.01;
      if (t > s.nextText) {
        s.nextText = t + 0.13;
        e.text(pick(['オラオラ!!', 'ドドドド!!', 'ババババ!!', 'ORA ORA!!', 'ガトリング!!']), {
          world: aim.point, size: rnd(6.5, 11), color: pick(['#ffe14a', '#ff6a8a', '#ffffff']), life: 0.8,
        });
      }
    } else {
      // finale: Jet Bazooka
      once(s, 'hide', true, () => { for (let i = 2; i < A.length; i++) A[i].visible = false; e.sfx.whoosh(0.5, 300, 2400, 0.7); });
      const wind = seg(t, tBar1, tFin - 0.1);
      const fire = eIn(seg(t, tFin, tHit));
      const ret = eIO(seg(t, 3.95, 4.5));
      const T0 = e.toCam(aim.point);
      const bigFist = 1 + aim.dist * 0.13;
      for (let i = 0; i < 2; i++) {
        const a = A[i];
        const sd = a.side;
        const T = contact(T0.clone().add(V(sd * 0.55, 0, 0)), bigFist);
        const windP = V(sd * 1.05, -0.1, 0.8);
        const start = i === 0 ? restR : restL;
        const pre = V().lerpVectors(a.F.clone().lerp(start, 0), windP, 0);
        void pre;
        if (t < tFin) a.F.lerpVectors(V(sd * 0.16, -0.14, -0.48), windP, eOut(wind));
        else if (t < 3.95) a.F.lerpVectors(windP, T, fire);
        else a.F.lerpVectors(T, start, ret);
        a.bend.set(sd * 0.5, -0.4, 0.4).multiplyScalar(t < tFin ? eOut(wind) : Math.max(0, 1 - fire) + ret * 0);
        const ext = t < tFin ? 0 : t < 3.95 ? fire : 1 - ret;
        a.fist = 1 + (bigFist - 1) * ext;
        a.thickEnd = 1 + aim.dist * 0.07 * ext;
        a.thick = 1.2 + 0.3 * ext;
        a.curl = lerp(1, 0.1, ext * ext);
        a.roll = sd * (-0.22 - 1.15 * ext);
        a.wobble = t < tHit ? 0.02 : 0.2 * Math.exp(-(t - tHit) * 3) * (1 - ret);
      }
      e.fovGoal = t < tFin ? 8 * wind : t < 3.95 ? -14 : 0;
      e.trauma = Math.max(e.trauma, t < tFin ? 0.3 * wind : 0);
      e.g.radial = t >= tFin && t < tHit + 0.05 ? 1 : 0;
      e.g.speed = t >= tFin && t < tHit + 0.05 ? 1 : 0.25;
      e.g.pulse = 0.3 * (1 - wind) * 0 + 0.2;
      e.speedColor.set(0xffd0d8);
      once(s, 'fin', t >= tHit, () => {
        e.impactFx(aim.point, dir, 2.3, 0xff3b6b, { stop: 0.13, frames: 3, shake: 0.95, crater: true, text: ['ドォォン!!', 'JET BAZOOKA'], slow: [0.4, 0.3] });
        e.blast(aim.point, dir, 54, 8, aim.target);
      });
      once(s, 'ungear', t >= 4.0, () => { e.setGear(0, 2.5); e.sfx.hiss(0.9); e.aura = 1; });
    }
  },
};

/* ================================================================== 3. BAZOOKA */
const bazooka: MoveDef = {
  id: 2, key: '3', jp: 'ゴムゴムの回転弾', en: 'GOMU GOMU NO BAZOOKA', gear: '—', color: '#ffb02a', dur: 2.9,
  blurb: 'Hai lòng bàn tay – sóng xung kích diện rộng',
  start(e) {
    e.banner('ゴムゴムの<br>バズーカ', 'GOMU GOMU NO BAZOOKA', 'GUM-GUM', '#ffb02a');
    e.sfx.stretch(0.9);
    return baseState(e);
  },
  update(e, t, _dt, s) {
    const [R, L] = e.arms;
    const aim: AimInfo = s.aim;
    const T0 = e.toCam(aim.point);
    const fistMax = 1 + aim.dist * 0.16;
    const tFire = 0.95, tHit = 1.07, tRet = 1.8;
    const w = eBack(seg(t, 0, 0.7));
    const k = eIn(seg(t, tFire, tHit));
    const r = eIO(seg(t, tRet, 2.45));
    let ext = 0;
    for (let i = 0; i < 2; i++) {
      const a = i === 0 ? R : L;
      const sd = a.side;
      const rest = e.restF(sd, V());
      const windP = V(sd * 1.2, -0.05, 0.85);
      const T = contact(T0.clone().add(V(sd * 0.55, -0.05, 0)), fistMax);
      if (t < tFire) {
        a.F.lerpVectors(rest, windP, w);
        a.wobble = 0.012 * seg(t, 0.5, tFire) * Math.sin(t * 55);
        a.bend.set(sd * 0.16, -0.24, 0.1).lerp(V(sd * 0.55, -0.45, 0.4), eOut(seg(t, 0, 0.7)));
      } else if (t < tRet) {
        a.F.lerpVectors(windP, T, k);
        ext = k;
        a.bend.set(sd * 0.55, -0.45, 0.4).multiplyScalar(1 - k);
        a.wobble = k < 1 ? 0.05 : 0.25 * Math.exp(-(t - tHit) * 3);
      } else {
        a.F.lerpVectors(T, rest, r);
        ext = 1 - r;
        a.bend.set(sd * 0.16, -0.24, 0.1).multiplyScalar(r);
        a.wobble = 0.14 * (1 - r);
      }
      a.fist = 1 + (fistMax - 1) * ext;
      a.thickEnd = 1 + aim.dist * 0.09 * ext;
      a.thick = 1 + 0.4 * ext;
      a.curl = lerp(1, 0.08, ext < 0.99 ? ext * ext : 1);
      a.roll = sd * (-0.22 - 1.15 * ext);
    }
    const wind01 = seg(t, 0, 0.7) * (1 - k);
    e.fovGoal = 10 * wind01 - (t >= tFire && t < 1.5 ? 15 : 0);
    e.pitchBiasGoal = -0.05 * wind01;
    e.trauma = Math.max(e.trauma, 0.22 * wind01);
    e.g.speed = t >= tFire && t < tHit + 0.06 ? 1 : wind01 * 0.15;
    e.g.radial = t >= tFire && t < tHit + 0.05 ? 1 : 0;
    e.g.chroma = 0.0015 + wind01 * 0.004;
    e.speedColor.set(0xfff0d0);
    once(s, 'wind', t > 0.05, () => e.sfx.whoosh(0.7, 200, 1600, 0.5));
    once(s, 'fire', t >= tFire, () => e.sfx.whoosh(0.3, 500, 6000, 0.9));
    once(s, 'hit', t >= tHit, () => {
      const dir = aim.dir.clone();
      e.impactFx(aim.point, dir, 2.6, 0xffb02a, { stop: 0.14, frames: 3, shake: 0.95, crater: true, slow: [0.35, 0.4], text: ['ドゴォン!!', 'BAZOOKA!!'], frameTint: 0xff8a00 });
      e.blast(aim.point, dir, 46, 10, aim.target);
      e.rings.spawn(aim.point, V(0, 1, 0), 1, 15, 0.8, 0xfff0c0, 0, true);
    });
    once(s, 'ret', t >= tRet, () => e.sfx.twang(0.4));
  },
};

/* ================================================================== 4. ELEPHANT GUN (Gear 3) */
const elephant: MoveDef = {
  id: 3, key: '4', jp: 'ゴムゴムの象銃', en: 'GOMU GOMU NO ELEPHANT GUN', gear: 'GEAR 3', color: '#ff8a2a', dur: 4.4,
  blurb: 'Gear Third – cắn ngón cái, thổi phồng nắm đấm khổng lồ',
  start(e) {
    e.banner('ゴムゴムの<br>象銃', 'GOMU GOMU NO ELEPHANT GUN', 'GEAR THIRD', '#ff8a2a');
    e.setGear(3, 4);
    e.sfx.thump(0.6);
    return baseState(e);
  },
  update(e, t, _dt, s) {
    const [R, L] = e.arms;
    const aim: AimInfo = s.aim;
    const T0 = e.toCam(aim.point);
    const FIST_HIT = 30;
    const T = contact(T0, FIST_HIT);
    const restR = e.restF(1, V()), restL = e.restF(-1, V());
    const mouth = V(0.06, -0.09, -0.21), belly = V(0.62, -0.52, -0.8), back = V(1.8, 0.35, 1.3);
    const tFire = 2.3, tHit = 2.42, tRel = 3.05;

    // inflation amount 0..1 (with pulsing) before the strike
    const k = eIO(seg(t, 0.6, 1.8));
    const pump = Math.sin(seg(t, 0.6, 1.8) * Math.PI * 7) * 0.05 * seg(t, 0.6, 0.7) * (1 - seg(t, 1.6, 1.8));
    const kk = k + pump;
    let ext = 0;
    if (t < 0.6) {
      R.F.lerpVectors(restR, mouth, eOut(seg(t, 0.05, 0.45)));
      R.bend.set(0.1, -0.35, 0.25);
      R.roll = lerp(-0.22, -0.5, seg(t, 0, 0.5));
      inflate(R, 1, 1, 1);
    } else if (t < 1.85) {
      R.F.lerpVectors(mouth, belly, eOut(seg(t, 0.6, 1.5)));
      R.bend.set(0.2, -0.35, 0.2).lerp(V(0.35, -0.3, 0.1), seg(t, 0.8, 1.5));
      inflate(R, 1 + 8 * kk, 1 + 2.6 * kk, 1 + 4 * kk, kk);
      R.roll = -0.5 + 0.3 * k;
      R.wobble = 0.015 * k * Math.sin(t * 50);
    } else if (t < tFire) {
      const w = eBack(seg(t, 1.85, tFire - 0.05));
      R.F.lerpVectors(belly, back, w);
      R.bend.set(0.5, -0.5, 0.4);
      inflate(R, 9, 3.6, 5, 1);
      R.wobble = 0.02 * Math.sin(t * 45);
    } else if (t < tRel) {
      const f = eIn(seg(t, tFire, tHit));
      ext = f;
      R.F.lerpVectors(back, T, f);
      R.bend.set(0.5, -0.5, 0.4).multiplyScalar(1 - f);
      inflate(R, lerp(9, FIST_HIT, f), lerp(3.6, 4.2, f), lerp(5, 14, f), lerp(1, 0.4, f));
      R.wobble = f < 1 ? 0.04 : 0.3 * Math.exp(-(t - tHit) * 2.5);
      R.roll = lerp(-0.2, 0.1, f);
    } else {
      const d = 1 - eIO(seg(t, tRel + 0.05, tRel + 0.85));
      const r = eIO(seg(t, tRel, tRel + 0.65));
      ext = 1 - r;
      R.F.lerpVectors(T, restR, r);
      R.bend.set(0.16, -0.24, 0.1).multiplyScalar(r);
      inflate(R, 1 + (FIST_HIT - 1) * d, 1 + 3.2 * d, 1 + 13 * d, 0.4 * d);
      R.wobble = 0.1 * (1 - r);
      R.roll = lerp(0.1, -0.22, r);
    }
    R.curl = 1;
    void ext;
    // balance arm
    const lb = Math.min(eOut(seg(t, 0.3, 0.9)), 1 - eIO(seg(t, 3.2, 3.9)));
    L.F.lerpVectors(restL, V(-0.62, -0.2, -0.5), lb);
    L.wobble = 0;

    // atmosphere
    const infl = t < 1.85 ? kk : 1;
    e.aura = 1 + infl * 2.5;
    const wind = seg(t, 1.85, tFire - 0.05) * (1 - seg(t, tFire, tHit));
    e.fovGoal = 10 * infl * (t < tFire ? 1 : 0) + 8 * wind - (t >= tFire && t < 2.8 ? 14 : 0);
    e.rollBiasGoal = 0.09 * wind;
    e.pitchBiasGoal = -0.05 * wind;
    if (t > 0.6 && t < tFire) e.trauma = Math.max(e.trauma, 0.14 + 0.2 * infl);
    e.g.pulse = t < tFire ? 0.3 * Math.max(0, Math.sin(seg(t, 0.6, 1.8) * Math.PI * 7)) * infl : 0;
    e.g.speed = t >= tFire && t < tHit + 0.07 ? 1 : 0;
    e.g.radial = t >= tFire && t < tHit + 0.05 ? 1 : 0;
    e.g.chroma = 0.0015 + wind * 0.004;
    e.speedColor.set(0xffe0c0);

    once(s, 'bite', t >= 0.45, () => { e.sfx.hit(0.6); e.addTrauma(0.35); e.text('ガブッ', { x: 66, y: 62, size: 7, color: '#ffffff', rot: -8, life: 0.9 }); });
    once(s, 'inhale', t >= 0.62, () => { e.sfx.hiss(1.4); e.sfx.stretch(1.2); e.text('ふぅぅぅぅ…!!', { x: 50, y: 30, size: 8, color: '#ffd9a0', rot: 3, life: 1.5 }); });
    once(s, 'slow', t >= 1.9, () => { e.slowmo(0.55, 0.55); e.sfx.whoosh(0.5, 150, 2000, 0.6); e.text('ゴゴゴゴゴ', { x: 50, y: 40, size: 12, color: '#ff8a2a', cls: 'rumble', life: 1.2 }); });
    once(s, 'fire', t >= tFire, () => { e.sfx.whoosh(0.35, 300, 7000, 1.0); e.sfx.boom(0.4); });
    once(s, 'hit', t >= tHit, () => {
      const dir = aim.dir.clone();
      e.impactFx(aim.point, dir, 4.2, 0xff8a2a, { stop: 0.22, frames: 4, slow: [0.28, 0.75], shake: 1, flash: 0.75, crater: true, debris: 90, text: ['ドッカーン!!', 'ELEPHANT GUN!!'], frameTint: 0xff5a00 });
      e.blast(aim.point, dir, 110, 18, aim.target);
      e.rings.spawn(V(aim.point.x, 0.2, aim.point.z), V(0, 1, 0), 1, 38, 1.4, 0xffd0a0, 0.15);
    });
    once(s, 'deflate', t >= tRel + 0.05, () => { e.sfx.hiss(1.0); e.aura = 3; for (let i = 0; i < 24; i++) e.puffs.emit({ pos: e.toWorld(V(0.3, -0.3, -0.9), V()).add(V(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1))), vel: V(rnd(-1, 1), rnd(1, 3), rnd(-1, 1)), life: 1.1, size0: 0.4, size1: 1.4, c0: 0xffffff, c1: 0xffd8c0, a0: 0.8, a1: 0, drag: 1, style: 1 }); });
    once(s, 'ungear', t >= 3.7, () => e.setGear(0, 2.5));
  },
};

/* ================================================================== 5. KONG GUN (Gear 4) */
const kong: MoveDef = {
  id: 4, key: '5', jp: 'ギア４ 猿王銃', en: 'GEAR FOURTH — KONG GUN', gear: 'GEAR 4', color: '#ff1f3a', dur: 5.2,
  blurb: 'Boundman – Haki vũ trang, cú đấm xoáy phá hủy',
  start(e) {
    e.banner('ギア４<br>猿王銃', 'GEAR FOURTH — KONG GUN', 'BOUNDMAN', '#ff1f3a');
    e.setGear(4, 2.2);
    e.aura = 2.5;
    e.sfx.drumroll(14, 0.07);
    return baseState(e);
  },
  update(e, t, _dt, s) {
    const [R, L] = e.arms;
    const aim: AimInfo = s.aim;
    const T0 = e.toCam(aim.point);
    const FIST_HIT = 24;
    const T = contact(T0, FIST_HIT);
    const restR = e.restF(1, V()), restL = e.restF(-1, V());
    const tWind = 1.7, tFire = 2.65, tHit = 2.79, tRel = 3.7;
    const grow = eOut(seg(t, 0.1, 1.5));
    // heartbeat pumps
    let pulse = 0;
    for (const p of [0.18, 0.68, 1.18]) {
      const x = t - p;
      if (x >= 0 && x < 0.45) pulse += Math.exp(-x * 7);
      once(s, `p${p}`, t >= p, () => {
        e.sfx.thump(1);
        e.trauma = Math.max(e.trauma, 0.7);
        e.kickFov(-22);
        e.flash(0.22, 0xff0020);
        if (p === 0.18) e.text('ドクン!!', { x: 50, y: 40, size: 12, color: '#ff2a3a', rot: -4, life: 1 });
        if (p === 0.68) e.text('ドクン!!', { x: 36, y: 56, size: 14, color: '#ff2a3a', rot: 5, life: 1 });
        if (p === 1.18) e.text('ドクン!!', { x: 62, y: 46, size: 16, color: '#ff2a3a', rot: -6, life: 1 });
      });
    }
    pulse = Math.min(1.2, pulse);

    const thickBase = 1 + 1.0 * grow;
    if (t < tWind) {
      const clash = eIn(seg(t, 1.4, 1.52));
      for (let i = 0; i < 2; i++) {
        const a = i === 0 ? R : L;
        const sd = a.side;
        const rest = i === 0 ? restR : restL;
        const raise = V(sd * lerp(0.22, 0.045, clash), -0.2 + Math.sin(t * 22 + i * 3) * 0.012, -0.52);
        a.F.lerpVectors(rest, raise, eOut(seg(t, 0, 0.5)));
        a.bend.set(sd * 0.25, -0.3, 0.16);
        inflate(a, 1 + 0.7 * grow + pulse * 0.1, thickBase + 0.28 * pulse, thickBase * 0.95 + 0.2 * pulse, 0.5 * grow + 0.3 * pulse);
        a.thinK = 1;
        a.roll = sd * -0.22;
        a.wobble = 0.008;
        a.curl = 1;
      }
      once(s, 'clash', t >= 1.52, () => {
        const w = e.toWorld(V(0, -0.12, -5), V());
        e.impactFx(w, V(0, 0, -1), 0.8, 0xff1a30, { stop: 0.06, shake: 0.6, mini: true, debris: 0 });
        e.flash(0.3, 0xff2a3a);
        e.text('ガシッ!!', { x: 50, y: 70, size: 9, color: '#ffffff', rot: 5, life: 0.8 });
      });
      e.g.pulse = pulse * 0.85;
      e.g.halftone = 0.6;
      e.trauma = Math.max(e.trauma, 0.14 * grow);
      e.fovGoal = -2 * grow;
      e.g.chroma = 0.0015 + pulse * 0.004;
    } else if (t < tFire) {
      const w = seg(t, tWind, tFire - 0.08);
      const spin = -0.22 - eIn(w) * Math.PI * 2;
      R.F.lerpVectors(V(0.045, -0.2, -0.52), V(1.35, 0.1, 1.25), eOut(w));
      R.bend.set(0.6, -0.55, 0.45).multiplyScalar(eOut(w));
      inflate(R, 1.7, 2.0, 1.9, 0.5);
      R.roll = spin;
      R.wobble = 0.015 * Math.sin(t * 60);
      L.F.lerpVectors(V(-0.045, -0.2, -0.52), V(-0.3, -0.16, -0.52), eOut(w));
      L.bend.set(-0.25, -0.3, 0.16);
      inflate(L, 1.7, 2.0, 1.9, 0.5);
      e.fovGoal = 16 * eOut(w);
      e.rollBiasGoal = 0.13 * eOut(w);
      e.pitchBiasGoal = -0.06 * eOut(w);
      e.trauma = Math.max(e.trauma, 0.3 + 0.2 * w);
      e.aura = 3 + 3 * w;
      e.g.pulse = 0.25 + 0.2 * Math.sin(t * 25);
      e.g.speed = 0.25 * w;
      e.g.chroma = 0.003 + 0.004 * w;
      e.g.halftone = 0.6;
      e.speedColor.set(0xff6070);
    } else {
      const f = eIn(seg(t, tFire, tHit));
      const r = eIO(seg(t, tRel, 4.3));
      const d = 1 - eIO(seg(t, tRel + 0.1, 4.5));
      if (t < tRel) {
        R.F.lerpVectors(V(1.35, 0.1, 1.25), T, f);
        R.bend.set(0.6, -0.55, 0.45).multiplyScalar(1 - f);
        inflate(R, lerp(1.7, FIST_HIT, f), lerp(2, 2.4, f), lerp(1.9, 11, f), lerp(0.5, 0.35, f));
        R.roll = -0.22 - Math.PI * 2 - f * Math.PI * 7;
        R.wobble = f < 1 ? 0.05 : 0.35 * Math.exp(-(t - tHit) * 2.2);
      } else {
        R.F.lerpVectors(T, restR, r);
        R.bend.set(0.16, -0.24, 0.1).multiplyScalar(r);
        inflate(R, 1 + (FIST_HIT - 1) * d + 0.7 * (1 - d) * 0 + 0.7 * (1 - d), 1 + 1.4 * d + 1.0 * (1 - d), 1 + 10 * d + 0.9 * (1 - d), 0.35 * d);
        R.roll = lerp(R.roll, -0.22, 0.1);
        R.wobble = 0.12 * (1 - r);
      }
      R.curl = 1;
      L.F.lerpVectors(V(-0.3, -0.16, -0.52), restL, seg(t, tHit, 4.4));
      L.wobble = 0;
      e.fovGoal = t < tHit + 0.05 ? -16 : t < tRel ? -4 : 0;
      e.g.speed = t >= tFire && t < tHit + 0.07 ? 1 : 0;
      e.g.radial = t >= tFire && t < tHit + 0.05 ? 1 : 0;
      e.g.chroma = 0.004;
      e.g.halftone = t < tRel ? 0.5 : 0;
      e.speedColor.set(0xff3040);
      e.aura = t < tRel ? 5 : 2;
      // spiral lightning along the arm in flight
      if (t >= tFire && t < tHit + 0.3) {
        for (let i = 0; i < 4; i++) {
          R.pointAt(rnd(0.1, 1), e.tmpV3);
          const a0 = e.toWorld(e.tmpV3, V());
          e.lightning(a0, a0.clone().add(V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(rnd(1, 3))), pick([0xff1030, 0xff5060]), 0.05, 0.4, 5, 0.12);
        }
      }
    }
    once(s, 'wind', t >= tWind, () => { e.slowmo(0.6, 0.9); e.sfx.whoosh(0.9, 120, 2500, 0.7); e.text('ゴゴゴゴゴ', { x: 50, y: 35, size: 14, color: '#ff2a3a', cls: 'rumble', life: 1.4 }); });
    once(s, 'fire', t >= tFire, () => { e.sfx.whoosh(0.4, 200, 8000, 1.1); e.sfx.boom(0.5); });
    once(s, 'hit', t >= tHit, () => {
      const dir = aim.dir.clone();
      e.impactFx(aim.point, dir, 5.4, 0xff1a30, { stop: 0.28, frames: 6, slow: [0.22, 0.95], shake: 1, flash: 0.9, crater: true, debris: 140, text: ['ドゴォォォン!!', 'KONG GUN!!'], frameTint: 0xff0018 });
      e.blast(aim.point, dir, 140, 32, aim.target);
      e.rings.spawn(V(aim.point.x, 0.2, aim.point.z), V(0, 1, 0), 1, 60, 1.6, 0xff4050, 0.14);
      e.rings.spawn(aim.point, dir, 1, 24, 1.1, 0x300008, 0.5);
      e.text('ギア４', { x: 24, y: 24, size: 10, color: '#ffffff', rot: -9, life: 1.8 });
    });
    once(s, 'deflate', t >= tRel + 0.1, () => { e.sfx.hiss(1.2); e.aura = 3; });
    once(s, 'ungear', t >= 4.3, () => e.setGear(0, 2.5));
  },
};

/* ================================================================== 6. BAJRANG GUN (Gear 5) */
const bajrang: MoveDef = {
  id: 5, key: '6', jp: 'ギア５ 猿神銃', en: 'GEAR 5 — BAJRANG GUN', gear: 'GEAR 5', color: '#8ec8ff', dur: 7.4,
  blurb: 'Nika – Thần Mặt Trời, nắm đấm khổng lồ từ trời giáng xuống',
  start(e) {
    e.banner('ギア５<br>猿神銃', 'GEAR 5 — BAJRANG GUN', 'SUN GOD NIKA', '#8ec8ff');
    e.sfx.drumroll(26, 0.07);
    e.aura = 1.5;
    return baseState(e);
  },
  update(e, t, _dt, s) {
    const [R, L] = e.arms;
    const aim: AimInfo = s.aim;
    const restR = e.restF(1, V()), restL = e.restF(-1, V());
    const H = new THREE.Vector3(2.5, 25, -25).add(e.camBase); // overhead, in world space
    const Hc = e.toCam(H);
    const FIST_HIT = 96;
    const T0 = e.toCam(aim.point);
    const T = contact(T0, FIST_HIT * 0.55);
    const tUp0 = 1.95, tUp1 = 3.25, tHit = 4.7, tRel = 5.85;

    // ---- heartbeat
    let pulse = 0;
    for (const [p, st] of [[0.2, 0.7], [0.75, 0.85], [1.3, 1.1]] as [number, number][]) {
      const x = t - p;
      if (x >= 0 && x < 0.5) pulse += Math.exp(-x * 6) * st;
      once(s, `p${p}`, t >= p, () => {
        e.sfx.thump(1);
        e.trauma = Math.max(e.trauma, 0.55 * st);
        e.kickFov(-18 * st);
        e.flash(0.2, 0xcfe6ff);
        e.text('ドン!!', { x: 30 + p * 30, y: 38 + p * 10, size: 11 + p * 4, color: '#ffffff', rot: p * 8 - 6, cls: 'g5', life: 0.9 });
      });
    }
    pulse = Math.min(1.3, pulse);

    if (t < tUp0) {
      // awakening – floppy rubber arms
      const aw = seg(t, 1.3, 1.9);
      for (let i = 0; i < 2; i++) {
        const a = i === 0 ? R : L;
        const sd = a.side;
        const rest = i === 0 ? restR : restL;
        a.F.copy(rest);
        a.F.x += Math.sin(t * 4 + i * 2) * 0.08 * (0.3 + aw);
        a.F.y += Math.sin(t * 5.5 + i) * 0.08 * (0.3 + aw) + 0.1 * aw;
        a.F.z += -0.25 * aw * (0.5 + 0.5 * Math.sin(t * 6 + i));
        a.bend.set(sd * 0.16, -0.24, 0.1);
        a.wobble = 0.02 + 0.07 * aw;
        a.thick = 1 + 0.18 * pulse;
        a.thickEnd = 1 + 0.1 * pulse;
        a.fist = 1 + 0.2 * pulse;
        a.roll = sd * -0.22 + Math.sin(t * 7 + i) * 0.3 * aw;
        a.curl = 1 - 0.7 * aw * (0.5 + 0.5 * Math.sin(t * 9 + i));
      }
      e.g.pulse = pulse * 0.8;
      e.g.halftone = 0.5 * (1 - aw);
      e.g.speed = 0.15 * aw;
      e.speedColor.set(0xddeeff);
      e.fovGoal = -4 * pulse;
      once(s, 'awake', t >= 1.3, () => {
        e.setGear(5, 3);
        e.aura = 4;
        e.flash(1, 0xffffff);
        e.sfx.zap(0.6);
        e.sfx.boom(0.6);
        e.text('ニカ!!', { x: 50, y: 34, size: 18, color: '#ffffff', rot: -6, cls: 'g5', sub: 'SUN GOD NIKA', life: 1.7 });
        for (let i = 0; i < 26; i++) e.puffs.emit({ pos: e.toWorld(V(rnd(-1.4, 1.4), rnd(-0.8, 0.5), rnd(-3, -1.2)), V()), vel: V(rnd(-2, 2), rnd(0, 2.5), rnd(-2, 2)), life: rnd(1, 1.8), size0: 0.3, size1: rnd(1.2, 2.4), c0: 0xffffff, c1: 0xcfe2ff, a0: 0.95, a1: 0, drag: 1.1, style: 1 });
      });
      once(s, 'laugh', t >= 1.7, () => e.sfx.laugh());
    } else if (t < tUp1) {
      const k = eIO(seg(t, tUp0, tUp1));
      R.F.lerpVectors(restR, Hc, k);
      R.bend.set(0.16, -0.24, 0.1).multiplyScalar(1 - k);
      inflate(R, 1 + 240 * k * k, 1 + 2.2 * k, 1 + 110 * k * k, 0.6 * k);
      R.roll = lerp(-0.22, 0, k);
      R.wobble = 0.06 * (1 - k) + 0.02;
      R.curl = 1;
      L.F.copy(restL);
      L.F.x += Math.sin(t * 4) * 0.1;
      L.F.y += 0.12 * k + Math.sin(t * 5) * 0.06;
      L.wobble = 0.05;
      L.curl = 1 - 0.5 * Math.abs(Math.sin(t * 5));
      e.pitchBiasGoal = 0.6 * eOut(seg(t, tUp0 + 0.15, tUp1));
      e.fovGoal = 8 * k;
      e.trauma = Math.max(e.trauma, 0.2 + 0.15 * k);
      e.aura = 4;
      e.g.speed = 0.2;
      e.speedColor.set(0xeaf4ff);
    } else if (t < tHit - 0.28) {
      // overhead hold – thunder
      R.F.copy(Hc);
      R.bend.set(0, 0, 0);
      inflate(R, 240 + Math.sin(t * 6) * 5, 3.2, 111, 0.6);
      R.roll = Math.sin(t * 3) * 0.04;
      R.wobble = 0.1;
      R.curl = 1;
      L.F.copy(restL); L.F.y += 0.14; L.wobble = 0.05;
      e.pitchBiasGoal = 0.6;
      e.fovGoal = 10;
      e.trauma = Math.max(e.trauma, 0.22);
      e.g.speed = 0.1;
      e.speedColor.set(0xeaf4ff);
      if (Math.random() < 0.28) {
        const gp = V(aim.point.x + rnd(-14, 14), 0, aim.point.z + rnd(-10, 12));
        const from = H.clone().add(V(rnd(-14, 14), rnd(-12, 4), rnd(-12, 6)));
        e.lightning(from, gp, 0xa8d4ff, 0.22, 4, 12, 0.14);
        e.flash(0.12, 0xd0e8ff);
        e.sfx.zap(0.3);
      }
      // billowing clouds around the fist
      if (Math.random() < 0.25) {
        e.puffs.emit({ pos: H.clone().add(V(rnd(-16, 16), rnd(-14, 12), rnd(-12, 12))), vel: V(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)).multiplyScalar(2), life: rnd(1.4, 2.4), size0: 4, size1: rnd(8, 12), c0: 0xffffff, c1: 0xcfe0ff, a0: 0.55, a1: 0, drag: 0.5, style: 1 });
      }
      once(s, 'txt', t >= tUp1 + 0.1, () => {
        e.sfx.boom(0.8);
        e.text('BAJRANG GUN!!', { x: 50, y: 62, size: 11, color: '#ffffff', cls: 'g5', rot: -3, life: 1.6, sub: 'ゴムゴムの猿神銃' });
      });
    } else {
      // slam
      const f = eIn(seg(t, tHit - 0.28, tHit));
      const r = eIO(seg(t, tRel, 6.7));
      const d = 1 - eIO(seg(t, tRel + 0.1, 6.5));
      if (t < tRel) {
        R.F.lerpVectors(Hc, T, f);
        inflate(R, lerp(240, FIST_HIT, f), lerp(3.2, 3.4, f), lerp(111, 44, f), 0.5);
        R.wobble = f < 1 ? 0.1 : 0.3 * Math.exp(-(t - tHit) * 2);
        R.bend.set(0, 0, 0);
        R.roll = 0;
      } else {
        R.F.lerpVectors(T, restR, r);
        R.bend.set(0.16, -0.24, 0.1).multiplyScalar(r);
        inflate(R, 1 + (FIST_HIT - 1) * d * d, 1 + 2.4 * d, 1 + 43 * d * d, 0.4 * d);
        R.wobble = 0.12 * (1 - r);
        R.roll = lerp(0, -0.22, r);
      }
      R.curl = 1;
      L.F.copy(restL); L.F.y += 0.14 * (1 - r); L.wobble = 0.04; L.curl = 1;
      e.pitchBiasGoal = t < tHit + 0.1 ? 0.6 * (1 - f) - 0.03 * f : 0;
      e.fovGoal = t < tHit + 0.05 ? -16 : t < tRel ? -3 : 0;
      e.g.speed = t >= tHit - 0.28 && t < tHit + 0.08 ? 1 : 0;
      e.g.radial = t >= tHit - 0.28 && t < tHit + 0.06 ? 1 : 0;
      e.g.chroma = 0.004;
      e.speedColor.set(0xffffff);
      e.aura = 3;
    }
    once(s, 'slam', t >= tHit - 0.28, () => { e.sfx.whoosh(0.4, 200, 9000, 1.2); e.sfx.boom(0.7); e.slowmo(0.5, 0.18); });
    once(s, 'hit', t >= tHit, () => {
      const dir = aim.dir.clone();
      e.impactFx(aim.point, dir, 7.2, 0x9fd0ff, { stop: 0.3, frames: 8, slow: [0.18, 1.1], shake: 1, flash: 1, crater: true, debris: 170, text: ['ドドーン!!', 'BAJRANG GUN!!'], frameTint: 0x2a60ff });
      e.blast(aim.point, dir, 210, 50, aim.target);
      const g0 = V(aim.point.x, 0.2, aim.point.z);
      e.rings.spawn(g0, V(0, 1, 0), 1, 95, 1.9, 0xffffff, 0.12);
      e.rings.spawn(g0, V(0, 1, 0), 1, 60, 1.4, 0x9fd0ff, 0.25);
      e.rings.spawn(aim.point, dir, 1, 40, 1.3, 0xffffff, 0.3);
      e.rings.spawn(aim.point, dir, 1, 36, 1.2, 0xbfe0ff, 0, true);
      for (let i = 0; i < 24; i++) e.puffs.emit({ pos: aim.point.clone().add(V(rnd(-5, 5), rnd(-1, 6), rnd(-5, 5))), vel: V(rnd(-1, 1), rnd(0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(8, 26)), life: rnd(1.2, 2.0), size0: 2, size1: rnd(5, 9), c0: 0xffffff, c1: 0xc9dcff, a0: 0.7, a1: 0, drag: 1.6, style: 1 });
    });
    once(s, 'shishi', t >= tHit + 0.9, () => { e.sfx.laugh(); e.text('ししし!!', { x: 50, y: 28, size: 12, color: '#ffffff', cls: 'g5', rot: 4, life: 1.5, sub: 'SHISHISHI!' }); });
    once(s, 'poof', t >= tRel + 0.1, () => {
      e.sfx.hiss(1.2);
      for (let i = 0; i < 16; i++) e.puffs.emit({ pos: aim.point.clone().add(V(rnd(-6, 6), rnd(0, 7), rnd(-6, 6))), vel: V(rnd(-1, 1), rnd(0.2, 1.2), rnd(-1, 1)).multiplyScalar(rnd(2, 8)), life: rnd(1.2, 2), size0: 3, size1: rnd(6, 10), c0: 0xffffff, c1: 0xdbe8ff, a0: 0.6, a1: 0, drag: 1.2, style: 1 });
    });
    once(s, 'ungear', t >= 6.5, () => e.setGear(0, 1.2));
  },
};

export const MOVES: MoveDef[] = [pistol, gatling, bazooka, elephant, kong, bajrang];
