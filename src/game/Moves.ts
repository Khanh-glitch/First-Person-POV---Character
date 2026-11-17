import * as THREE from "three";
import type { Engine } from "./Engine";
import { type Formation, boxSlots, curveSlots, cylSlots, ellipsoidSlots, torusSlots } from "./Scrap";
import { MAGENTA, PURPLE, WHITE } from "./FX";
import { Colossus } from "./Environment";
import {
  damp, easeInCubic, easeInOut, easeInQuad, easeOutBack, easeOutCubic, easeOutExpo, lerp, rand, randS, seg,
  solveTwoBone, taperedTube,
} from "./util";

export interface MoveInfo {
  id: string; key: string; name: string; jp: string; kana: string; vi: string; cd: number; duration: number;
}

export const MOVES: MoveInfo[] = [
  { id: "repel", key: "1", name: "REPEL", jp: "反発", kana: "リペル", vi: "Sóng đẩy từ trường", cd: 3.2, duration: 2.4 },
  { id: "gibson", key: "2", name: "PUNK GIBSON", jp: "磁気弦", kana: "パンクギブソン", vi: "Cánh tay sắt vụn khổng lồ", cd: 7, duration: 5.4 },
  { id: "vise", key: "3", name: "PUNK VISE", jp: "磁気万力", kana: "パンクヴァイス", vi: "Gọng kìm từ tính", cd: 8, duration: 5.6 },
  { id: "corna", key: "4", name: "PUNK CORNA DIO", jp: "磁気大魔牛", kana: "パンク・コルナ・ディオ", vi: "Đại ma ngưu từ tính", cd: 9, duration: 6.4 },
  { id: "assign", key: "5", name: "ASSIGN · PUNK CLASH", jp: "付与・磁気激突", kana: "アサイン・パンククラッシュ", vi: "Thức tỉnh — gán cực từ", cd: 9, duration: 6.0 },
  { id: "damned", key: "6", name: "DAMNED PUNK", jp: "電磁砲", kana: "ダムド・パンク", vi: "Pháo điện từ tối thượng", cd: 12, duration: 8.8 },
];

interface Run { tick(t: number, dt: number): void; end(): void }

/* ------------------------------ helpers ------------------------------ */
const coreMat = new THREE.MeshStandardMaterial({ color: 0x18181e, metalness: 0.9, roughness: 0.55, flatShading: true });
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0.15, 1).normalize(); // towards the player from the colossus
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

function onceMaker() {
  const fired: Record<number, boolean> = {};
  return (id: number, t: number, time: number, fn: () => void) => {
    if (t >= time && !fired[id]) {
      fired[id] = true;
      fn();
    }
  };
}
function zCyl(rFar: number, rNear: number, len: number, radial = 8) {
  const g = new THREE.CylinderGeometry(rFar, rNear, len, radial);
  g.rotateX(Math.PI / 2);
  return g;
}
function core(geo: THREE.BufferGeometry, parent: THREE.Object3D, x = 0, y = 0, z = 0, mat: THREE.Material = coreMat) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.frustumCulled = false;
  parent.add(m);
  return m;
}
function disposeRig(scene: THREE.Scene, root: THREE.Object3D) {
  scene.remove(root);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
}
function every(rate: number, dt: number, fn: () => void) {
  let n = rate * dt;
  while (n > 0) {
    if (Math.random() < n) fn();
    n -= 1;
  }
}
function crackle(E: Engine, f: Formation | null, rate: number, dt: number, width = 0.12, color = PURPLE) {
  if (!f) return;
  every(rate, dt, () => {
    if (E.scrap.pair(f, _a, _b)) E.fx.bolt(_a, _b, color, width, rand(0.06, 0.14), 0.2);
  });
}
function handArcs(E: Engine, left: boolean, rate: number, dt: number, reach = 0.22) {
  every(rate, dt, () => {
    E.arms.handWorld(left ? E.arms.L : E.arms.R, _a);
    _b.set(randS(reach), randS(reach), randS(reach)).add(_a);
    E.fx.bolt(_a, _b, PURPLE, 0.004, rand(0.05, 0.1), 0.25);
  });
}
function tether(E: Engine, rate: number, dt: number, target: THREE.Vector3, width = 0.05) {
  every(rate, dt, () => {
    E.arms.handWorld(E.arms.L, _a);
    E.fx.bolt(_a, target, PURPLE, width, rand(0.07, 0.13), 0.07);
    E.audio.zap(0.12);
  });
}

/* =====================================================================
 * 1. REPEL — 反発
 * ===================================================================== */
function repel(E: Engine): Run {
  const { arms, fx, scrap, audio, colossus } = E;
  const at = onceMaker();
  audio.charge(0.5, 0.28);
  return {
    tick(t, dt) {
      if (t < 0.5) {
        arms.L.to({ x: -0.05, y: -0.15, z: -0.33, rx: 0.9, ry: -0.9, rz: 0.4, curl: 0.95, spread: 0 }, 13);
        arms.R.to({ x: 0.07, y: -0.2, z: -0.3, rx: 0.9, ry: 0.9, rz: -0.4, curl: 0.95, spread: 0 }, 13);
        arms.L.tremble = arms.R.tremble = 1.2;
        E.chargeT = 4;
        E.cam.fovT = 61;
        E.fxT.darken = 0.6;
        E.holdTrauma(0.25);
        handArcs(E, true, 40, dt);
        handArcs(E, false, 25, dt);
      }
      at(1, t, 0.5, () => {
        arms.L.to({ x: -0.52, y: 0.0, z: -0.44, rx: 1.45, ry: 0.55, rz: 0.2, curl: 0, spread: 1 }, 32);
        arms.R.to({ x: 0.52, y: 0.0, z: -0.44, rx: 1.45, ry: -0.55, rz: -0.2, curl: 0, spread: 1 }, 32);
        arms.L.tremble = arms.R.tremble = 0.4;
        const c = _a.copy(E.rig).setY(1.6);
        fx.shell(c, 3, 75, 0.95, PURPLE);
        fx.shell(c, 3, 42, 0.6, MAGENTA);
        _b.copy(E.rig).setY(0.25);
        fx.ring(_b, UP, 1, 80, 1.05, PURPLE);
        fx.ring(_b, UP, 0.5, 46, 0.7, MAGENTA);
        fx.ring(_b, UP, 0.5, 24, 0.45, WHITE);
        fx.light(_c.set(E.rig.x, 5, E.rig.z - 10), PURPLE, 90, 0.6);
        fx.glow(c.setZ(c.z - 6), 3, 16, 0.3, PURPLE, 0.45);
        scrap.radialImpulse(E.rig, 78, 44);
        fx.dust(E.rig, 46, 7, 26, 5.5);
        fx.burst(_b, 160, 30, 0.14, 0.8);
        E.flash(0.55, 0.3, 0.95);
        E.addTrauma(0.8);
        E.kickChroma(1.4);
        E.fovKick(24);
        E.impactFrame(0.08);
        E.cam.fovT = 70;
        E.fxT.darken = 0;
        E.fxT.blur = 0.9;
        E.chargeT = 1.5;
        audio.boom(0.85);
        audio.whoosh(0.7, 0.5);
      });
      if (t > 0.7) E.fxT.blur = 0;
      at(2, t, 1.02, () => {
        fx.impact(colossus.core, FWD, 1.3, PURPLE);
        E.damage(1100, false, 0.6);
        E.addTrauma(0.3);
        audio.boom(0.45);
      });
      at(3, t, 1.5, () => {
        arms.idle(4.5);
        E.chargeT = 0.3;
      });
    },
    end() {},
  };
}

/* =====================================================================
 * 2. PUNK GIBSON — 磁気弦
 * ===================================================================== */
function gibson(E: Engine): Run {
  const { scene, scrap, fx, arms, audio, colossus } = E;
  const at = onceMaker();
  const LU = 14, LF = 14;
  const root = new THREE.Group();
  scene.add(root);
  const upper = new THREE.Object3D(), fore = new THREE.Object3D(), fist = new THREE.Object3D();
  root.add(upper, fore);
  fore.add(fist);
  fist.position.z = LF;
  const cores = [
    core(zCyl(1.8, 2.05, LU), upper, 0, 0, LU / 2),
    core(new THREE.IcosahedronGeometry(2.5, 0), fore),
    core(zCyl(2.6, 1.8, LF), fore, 0, 0, LF / 2),
    core(new THREE.IcosahedronGeometry(3.3, 1), fist, 0, 0, 2.6),
  ];
  cores.forEach((c) => c.scale.setScalar(0.001));
  const sU = [...ellipsoidSlots(50, 3, 3, 3), ...cylSlots(235, 2.35, 2.05, LU)];
  const sF = [...ellipsoidSlots(50, 2.8, 2.8, 2.8), ...cylSlots(300, 2.05, 2.95, LF)];
  const sK = [...ellipsoidSlots(300, 4.0, 3.6, 3.9, 0, 0, 2.6, 0.12)];
  for (let k = 0; k < 4; k++) sK.push(...ellipsoidSlots(16, 1.3, 1.3, 1.6, (k - 1.5) * 1.9, 1.1, 6.3));
  let fU: Formation | null = null, fF: Formation | null = null, fK: Formation | null = null;
  const S = new THREE.Vector3(), El = new THREE.Vector3(), W = new THREE.Vector3(), F = new THREE.Vector3();
  const pole = new THREE.Vector3(-1, -0.35, 0.25);
  const Pc = new THREE.Vector3(-6.2, 10.5, -16), Pw = new THREE.Vector3(-9, 15, -8);
  const Ps = colossus.core.clone().add(new THREE.Vector3(-0.5, -1, 4.2));
  const fistW = new THREE.Vector3();
  let coreK = 0, released = false;
  audio.charge(1.7, 0.3);
  E.cam.aimT = 1;
  E.focusOn = true;

  return {
    tick(t, dt) {
      // --- player body motion: leap in, leap back
      const go = seg(t, 2.35, 2.78), back = seg(t, 3.7, 4.9);
      E.rig.z = -26 * (easeInCubic(go) - easeInOut(back));
      E.rig.y = 2.2 * Math.sin(Math.PI * go) + 3.2 * Math.sin(Math.PI * back);

      // --- giant arm IK
      S.set(E.rig.x - 4.4, E.rig.y + 3.4, E.rig.z + 2.2);
      if (t < 1.7) F.copy(Pc).add(E.rig).y += Math.sin(t * 3) * 0.4;
      else if (t < 2.45) F.copy(Pc).lerp(Pw, easeOutCubic(seg(t, 1.7, 2.3))).add(E.rig);
      else {
        _c.copy(Pw).add(E.rig);
        F.copy(_c).lerp(Ps, easeInQuad(seg(t, 2.45, 2.8)));
        F.z -= 2.2 * easeOutCubic(seg(t, 2.8, 3.1));
      }
      solveTwoBone(S, F, LU, LF, pole, El, W);
      upper.position.copy(S); upper.lookAt(El);
      fore.position.copy(El); fore.lookAt(W);
      root.updateMatrixWorld(true);
      fist.getWorldPosition(fistW);
      E.focus.copy(fistW);
      coreK = damp(coreK, t > 0.8 && !released ? 1 : 0, released ? 7 : 3, dt);
      cores.forEach((c) => c.scale.setScalar(Math.max(0.001, coreK)));

      at(0, t, 0.12, () => {
        const idx = scrap.pick(sU.length / 6 + sF.length / 6 + sK.length / 6);
        const nU = sU.length / 6, nF = sF.length / 6;
        fU = scrap.assign(idx.subarray(0, nU), upper, new Float32Array(sU), 0, 0.55, 0.3);
        fF = scrap.assign(idx.subarray(nU, nU + nF), fore, new Float32Array(sF), 0.35, 0.55, 0.3);
        fK = scrap.assign(idx.subarray(nU + nF), fist, new Float32Array(sK), 0.7, 0.5, 0.3);
        audio.rumble(1.6, 0.4);
      });

      if (t < 1.7) {
        // summon: metal hand raised, palm up, slowly clenching
        const cl = seg(t, 0.7, 1.6);
        arms.L.to({ x: -0.42, y: 0.02, z: -0.42, rx: 0.25, ry: -0.2, rz: 2.9, curl: 0.15 + cl * 0.85, spread: 1 - cl }, 9);
        arms.R.to({ x: 0.26, y: -0.24, z: -0.36, rx: 0.3, ry: 0.4, rz: -1.2, curl: 0.95, spread: 0 }, 7);
        arms.L.tremble = 0.8;
        E.chargeT = 2 + cl * 2;
        E.fxT.darken = 0.3;
        E.cam.fovT = 68;
        E.cam.yawT = 0.14; E.cam.pitchT = 0.1;
        E.holdTrauma(0.12 + cl * 0.1);
        handArcs(E, true, 30, dt);
        tether(E, 7, dt, fistW);
      } else if (t < 2.35) {
        // wind-up
        arms.L.to({ x: -0.5, y: -0.1, z: -0.16, rx: 0.1, ry: 0.15, rz: 0.4, curl: 1, spread: 0 }, 10);
        arms.R.to({ x: 0.16, y: -0.12, z: -0.52, rx: 0.2, ry: 0.5, rz: -1.4, curl: 1, spread: 0 }, 10);
        E.cam.rollT = 0.13; E.cam.yawT = 0.24; E.cam.pitchT = 0.16; E.cam.fovT = 62;
        E.fxT.darken = 0.45;
        E.holdTrauma(0.2);
      } else if (t < 2.8) {
        // lunge + strike
        arms.L.to({ x: -0.08, y: -0.1, z: -0.68, rx: 0.05, ry: -0.1, rz: 0.1, curl: 1, spread: 0 }, 26);
        arms.R.to({ x: 0.38, y: -0.32, z: -0.2, rx: 0.2, ry: 0.3, rz: -1.2, curl: 1, spread: 0 }, 18);
        E.cam.rollT = -0.09; E.cam.yawT = -0.03; E.cam.pitchT = 0.04; E.cam.fovT = 102; E.cam.fovSpeed = 11;
        E.fxT.speed = 1; E.fxT.blur = 0.8; E.fxT.darken = 0;
        E.holdTrauma(0.3);
      }
      crackle(E, fK, t < 2.8 ? 16 : 30, dt, 0.16);
      crackle(E, fF, 10, dt, 0.12);
      crackle(E, fU, 6, dt, 0.1);

      at(1, t, 1.7, () => audio.whoosh(0.6, 0.3));
      at(2, t, 2.35, () => { audio.whoosh(0.45, 0.7); audio.rumble(0.5, 0.6); });
      at(3, t, 2.8, () => {
        _a.copy(colossus.core).add(_b.set(0, -1, 1.5));
        fx.impact(_a, FWD, 3.2, PURPLE);
        fx.ring(_b.set(0, 0.3, colossus.core.z + 6), UP, 2, 60, 0.9, MAGENTA);
        fx.dust(_b, 30, 10, 20, 7);
        E.hitstop(0.17); E.impactFrame(0.15);
        E.flash(1.0, 0.85, 1.0);
        E.addTrauma(1); E.kickChroma(2.2);
        E.damage(5200, true, 1.3);
        audio.boom(1.25); audio.clank(0.9);
        E.fxT.speed = 0; E.fxT.blur = 0; E.cam.fovT = 80; E.cam.fovSpeed = 7; E.cam.rollT = 0.04; E.cam.pitchT = 0.2;
        scrap.release(fist, (p, v) => v.copy(p).sub(fistW).normalize().multiplyScalar(rand(14, 34)).add(_c.set(0, rand(4, 16), rand(6, 20))), 0.3);
      });
      if (t > 2.8 && t < 3.5) {
        every(50, dt, () => fx.burst(_a.copy(colossus.core).add(_b.set(randS(4), randS(4), 2)), 3, 22, 0.16, 0.4, FWD, 1.2));
        E.holdTrauma(0.3);
      }
      at(4, t, 3.5, () => {
        released = true;
        const fling = (p: THREE.Vector3, v: THREE.Vector3) => v.set(randS(9), rand(2, 12), randS(9) + 5).addScaledVector(_c.copy(p).sub(El).normalize(), 5);
        scrap.release(upper, fling); scrap.release(fore, fling); scrap.release(fist, fling);
        arms.L.to({ x: -0.3, y: -0.2, z: -0.5, rx: 0.3, ry: -0.2, rz: 0.8, curl: 0.2, spread: 0.8 }, 6);
        audio.clank(0.5);
        E.focusOn = false;
        E.cam.rollT = 0; E.cam.yawT = 0; E.cam.pitchT = 0.04; E.cam.fovT = 74; E.chargeT = 0.6;
      });
      at(5, t, 3.7, () => audio.whoosh(0.9, 0.3));
      at(6, t, 4.7, () => { arms.idle(5); E.cam.fovT = 70; E.cam.aimT = 0; E.cam.pitchT = 0; });
      at(7, t, 4.9, () => { fx.dust(E.rig, 14, 2, 8, 3); E.addTrauma(0.25); audio.boom(0.3); });
    },
    end() {
      scrap.dropBone(upper); scrap.dropBone(fore); scrap.dropBone(fist);
      disposeRig(scene, root);
      E.rig.set(0, 0, 0);
    },
  };
}

/* =====================================================================
 * 3. PUNK VISE — 磁気万力
 * ===================================================================== */
function vise(E: Engine): Run {
  const { scene, scrap, fx, arms, audio, colossus } = E;
  const at = onceMaker();
  const root = new THREE.Group();
  scene.add(root);
  const mk = (s: number) => {
    const inward = -s;
    const hand = new THREE.Object3D(), fingers = new THREE.Object3D();
    hand.add(fingers);
    fingers.position.set(0, 0, 6);
    root.add(hand);
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(inward, 0, 0), new THREE.Vector3(0, 0, -inward), new THREE.Vector3(0, 1, 0));
    const baseQ = new THREE.Quaternion().setFromRotationMatrix(m);
    const ty = -7.8 * inward;
    const sp = [...boxSlots(230, 4.5, 13, 12), ...cylSlots(40, 2.1, 1.5, 7.5, -3, 2.5, ty)];
    const sf: number[] = [];
    const cores = [core(new THREE.BoxGeometry(3.7, 12, 11), hand), core(zCyl(1.1, 1.7, 7.5), hand, 2.5, ty, 0.75)];
    for (let f = 0; f < 4; f++) {
      sf.push(...cylSlots(46, 1.95, 1.3, 9.5, 0, 1.0, (f - 1.5) * 3.3));
      cores.push(core(zCyl(0.95, 1.55, 9.5), fingers, 1.0, (f - 1.5) * 3.3, 4.75));
    }
    cores.forEach((c) => c.scale.setScalar(0.001));
    return { s, hand, fingers, baseQ, sp, sf, cores, fp: null as Formation | null, ff: null as Formation | null };
  };
  const hands = [mk(-1), mk(1)];
  let coreK = 0, released = false, squashT = 0;
  const mid = new THREE.Vector3(0, 18, Colossus.Z + 4);
  const q2 = new THREE.Quaternion();
  audio.charge(1.9, 0.3);
  E.cam.aimT = 1;

  return {
    tick(t, dt) {
      const pull = easeOutCubic(seg(t, 1.9, 2.45));
      const slam = easeInCubic(seg(t, 2.45, 2.75));
      const grind = seg(t, 2.75, 3.7);
      let X = 40 + pull * 8 - slam * 33.6 - grind * 1.3;
      if (t > 3.7) X += easeOutCubic(seg(t, 3.7, 4.2)) * 6;
      const curl = lerp(-0.4, 0.8, easeOutCubic(seg(t, 2.5, 2.8)));
      for (const h of hands) {
        const shake = t > 2.75 && t < 3.7 ? 0.25 : 0;
        h.hand.position.set(h.s * X + randS(shake), 17.5 + Math.sin(t * 2.2 + h.s) * 0.6 * (1 - slam) + randS(shake), Colossus.Z + 1.5);
        q2.setFromAxisAngle(UP, h.s * (pull * 0.25 - slam * 0.25));
        h.hand.quaternion.copy(q2).multiply(h.baseQ);
        h.fingers.rotation.y = curl;
      }
      root.updateMatrixWorld(true);
      coreK = damp(coreK, t > 0.8 && !released ? 1 : 0, released ? 7 : 3, dt);
      for (const h of hands) h.cores.forEach((c) => c.scale.setScalar(Math.max(0.001, coreK)));
      colossus.squash = damp(colossus.squash, squashT, 14, dt);

      at(0, t, 0.12, () => {
        const per = (hands[0].sp.length + hands[0].sf.length) / 6;
        const idx = scrap.pick(per * 2);
        hands.forEach((h, k) => {
          const mine = idx.subarray(k * per, (k + 1) * per);
          const np = h.sp.length / 6;
          h.fp = scrap.assign(mine.subarray(0, np), h.hand, new Float32Array(h.sp), 0, 0.9, 0.35);
          h.ff = scrap.assign(mine.subarray(np), h.fingers, new Float32Array(h.sf), 0.7, 0.6, 0.3);
        });
        audio.rumble(1.8, 0.4);
      });

      if (t < 1.9) {
        const k = seg(t, 0, 1.6);
        arms.L.to({ x: -0.56, y: -0.04 + k * 0.05, z: -0.36, rx: 0.5, ry: 0.2, rz: 1.57, curl: 0.25, spread: 1 }, 8);
        arms.R.to({ x: 0.56, y: -0.04 + k * 0.05, z: -0.36, rx: 0.5, ry: -0.2, rz: -1.57, curl: 0.25, spread: 1 }, 8);
        arms.L.tremble = arms.R.tremble = 0.8;
        E.chargeT = 2 + k * 2;
        E.cam.fovT = 58; E.cam.pitchT = 0.05;
        E.fxT.darken = 0.3;
        E.holdTrauma(0.12);
        handArcs(E, true, 26, dt);
        handArcs(E, false, 14, dt);
        E.focusOn = true;
        E.focus.copy(hands[t % 0.4 < 0.2 ? 0 : 1].hand.position);
      } else if (t < 2.45) {
        arms.L.to({ x: -0.66, y: 0.0, z: -0.22, rx: 0.5, ry: 0.5, rz: 1.57, curl: 0.5, spread: 0.6 }, 9);
        arms.R.to({ x: 0.66, y: 0.0, z: -0.22, rx: 0.5, ry: -0.5, rz: -1.57, curl: 0.5, spread: 0.6 }, 9);
        arms.L.tremble = arms.R.tremble = 1.6;
        E.cam.fovT = 54; E.fxT.darken = 0.5;
        E.holdTrauma(0.22);
        E.focusOn = false;
      } else if (t < 3.7) {
        const pr = Math.sin(t * 40) * 0.006;
        arms.L.to({ x: -0.075 + pr, y: -0.08, z: -0.5, rx: 0.55, ry: -0.3, rz: 1.57, curl: 0.12 + grind * 0.5, spread: 0.3 }, 30);
        arms.R.to({ x: 0.075 - pr, y: -0.085, z: -0.5, rx: 0.55, ry: 0.3, rz: -1.57, curl: 0.12 + grind * 0.5, spread: 0.3 }, 30);
        arms.L.tremble = arms.R.tremble = t > 2.75 ? 2 : 0;
      }
      for (const h of hands) {
        crackle(E, h.fp, 12, dt, 0.2);
        crackle(E, h.ff, 8, dt, 0.16);
      }

      at(1, t, 2.45, () => { audio.whoosh(0.35, 0.8); E.fxT.blur = 0.5; E.fxT.darken = 0; });
      at(2, t, 2.75, () => {
        for (const s of [-1, 1]) {
          _a.set(s * 11, 18, Colossus.Z + 5);
          fx.impact(_a, _b.set(s * 0.3, 0.5, 1).normalize(), 2.3, PURPLE);
          fx.burst(_a, 120, 46, 0.22, 0.3, UP, 0.7);
        }
        fx.ring(mid, _b.set(0, 0, 1), 3, 70, 0.9, WHITE);
        fx.ring(_a.set(0, 0.3, Colossus.Z), UP, 4, 70, 1.0, MAGENTA);
        fx.dust(_a, 36, 14, 24, 8);
        squashT = 1;
        E.hitstop(0.16); E.impactFrame(0.13);
        E.flash(0.9, 0.75, 1.0);
        E.addTrauma(1); E.kickChroma(2.0); E.fovKick(10);
        E.fxT.blur = 0;
        E.damage(4200, true, 0.4);
        audio.boom(1.2); audio.clank(1);
      });
      if (t > 2.75 && t < 3.7) {
        E.holdTrauma(0.38);
        every(70, dt, () => {
          const s = Math.random() < 0.5 ? -1 : 1;
          fx.burst(_a.set(s * rand(9, 12), rand(8, 27), Colossus.Z + rand(-2, 7)), 3, 26, 0.17, 0.3, _b.set(0, 0.6, 0.8), 1.0);
        });
        every(9, dt, () => audio.clank(0.25));
      }
      for (let k = 0; k < 4; k++) at(10 + k, t, 2.95 + k * 0.19, () => E.damage(520, false, 0.1));
      at(3, t, 3.7, () => {
        fx.impact(mid, FWD, 3.2, MAGENTA);
        fx.shell(mid, 4, 46, 0.7, PURPLE);
        E.hitstop(0.1); E.impactFrame(0.09);
        E.flash(0.8, 0.5, 0.9); E.addTrauma(0.9); E.kickChroma(1.6);
        E.damage(3000, true, 0.9);
        audio.boom(1.1);
        squashT = 0;
        released = true;
        for (const h of hands) {
          const fl = (_p: THREE.Vector3, v: THREE.Vector3) => v.set(h.s * rand(4, 26), rand(4, 24), randS(14) + 6);
          scrap.release(h.hand, fl); scrap.release(h.fingers, fl);
        }
        arms.L.to({ x: -0.4, y: -0.12, z: -0.4, rx: 0.4, ry: 0.2, rz: 1.3, curl: 0.3, spread: 0.8 }, 9);
        arms.R.to({ x: 0.4, y: -0.12, z: -0.4, rx: 0.4, ry: -0.2, rz: -1.3, curl: 0.3, spread: 0.8 }, 9);
        arms.L.tremble = arms.R.tremble = 0;
        E.cam.fovT = 68; E.cam.pitchT = 0; E.chargeT = 0.6;
      });
      at(4, t, 4.5, () => { arms.idle(4.5); E.cam.fovT = 70; E.cam.aimT = 0; });
    },
    end() {
      colossus.squash = 0;
      for (const h of hands) { scrap.dropBone(h.hand); scrap.dropBone(h.fingers); }
      disposeRig(scene, root);
    },
  };
}

/* =====================================================================
 * 4. PUNK CORNA DIO — 磁気大魔牛
 * ===================================================================== */
function corna(E: Engine): Run {
  const { scene, scrap, fx, arms, audio, colossus } = E;
  const at = onceMaker();
  const bull = new THREE.Group();
  scene.add(bull);
  const head = new THREE.Object3D();
  head.position.set(0, 3.5, -8);
  bull.add(head);
  const RIDE = 5.6;
  const horn = (s: number) =>
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(s * 4.0, 2.5, -4.5), new THREE.Vector3(s * 9.6, 5.0, -6.0),
      new THREE.Vector3(s * 11.6, 9.6, -12), new THREE.Vector3(s * 8.4, 13.6, -19.5),
    ]);
  const hl = horn(-1), hr = horn(1);
  const hump = core(new THREE.IcosahedronGeometry(1, 1), bull, 0, 0.5, 0);
  hump.scale.set(5.9, 4.5, 8.8);
  const hd = core(new THREE.IcosahedronGeometry(1, 1), head, 0, -0.5, -5.5);
  hd.scale.set(4.1, 3.7, 5.0);
  const hornMat = new THREE.MeshStandardMaterial({ color: 0x9aa0ac, metalness: 0.92, roughness: 0.32, flatShading: true });
  const coreList = [hump, hd, core(taperedTube(hl, 18, 2.1, 0.12, 7), head, 0, 0, 0, hornMat), core(taperedTube(hr, 18, 2.1, 0.12, 7), head, 0, 0, 0, hornMat)];
  const baseScale = coreList.map((c) => c.scale.clone());
  coreList.forEach((c) => c.scale.setScalar(0.001));
  const sHump = ellipsoidSlots(330, 6.5, 5, 9.5, 0, 0.5, 0);
  const sHead = [...ellipsoidSlots(250, 4.6, 4.2, 5.5, 0, -0.5, -5.5), ...curveSlots(185, hl, 2.45, 0.35), ...curveSlots(185, hr, 2.45, 0.35)];
  let fHump: Formation | null = null, fHead: Formation | null = null;
  let coreK = 0, released = false;
  const tipL = new THREE.Vector3(), tipR = new THREE.Vector3();
  const END_Z = -27;
  let stompPhase = 0;
  audio.charge(1.9, 0.3);
  audio.rumble(2.4, 0.6);
  E.cam.aimT = 1;

  return {
    tick(t, dt) {
      const rise = easeOutCubic(seg(t, 0.3, 1.9));
      const run = seg(t, 2.7, 3.55);
      const back = seg(t, 4.5, 5.7);
      const z = END_Z * (easeInQuad(run) - easeInOut(back));
      const gallop = run > 0 && run < 1 ? Math.abs(Math.sin(run * Math.PI * 4.5)) * 0.55 : 0;
      const down = 1 - easeInOut(back);
      const lift = t < 4.5 ? rise : down;
      bull.position.set(0, -9.5 * (1 - (t < 4.3 ? rise : 1)) + gallop, z);
      E.rig.set(0, RIDE * lift + gallop + 2.6 * Math.sin(Math.PI * back), z);
      // head: lower in anticipation, toss on impact
      const lower = easeInOut(seg(t, 1.9, 2.5));
      const toss = easeOutBack(seg(t, 3.55, 3.85));
      head.rotation.x = -0.24 * lower + 0.75 * toss + Math.sin(run * Math.PI * 9) * 0.03;
      bull.rotation.x = Math.sin(run * Math.PI * 9) * 0.02 + 0.06 * toss;
      bull.updateMatrixWorld(true);
      tipL.set(-8.4, 13.6, -19.5).applyMatrix4(head.matrixWorld);
      tipR.set(8.4, 13.6, -19.5).applyMatrix4(head.matrixWorld);
      coreK = damp(coreK, t > 0.9 && !released ? 1 : 0, released ? 7 : 3, dt);
      coreList.forEach((c, i) => c.scale.copy(baseScale[i]).multiplyScalar(Math.max(0.001, coreK)));

      at(0, t, 0.12, () => {
        const nh = sHump.length / 6, nd = sHead.length / 6;
        const idx = scrap.pick(nh + nd);
        fHump = scrap.assign(idx.subarray(0, nh), bull, new Float32Array(sHump), 0, 0.8, 0.35);
        fHead = scrap.assign(idx.subarray(nh), head, new Float32Array(sHead), 0.4, 1.0, 0.3);
      });

      if (t < 2.7) {
        const k = seg(t, 0, 1.9);
        arms.L.to({ x: -0.24, y: -0.3 + k * 0.04, z: -0.5, rx: -0.35, ry: -0.15, rz: 0.5, curl: 0.3 + k * 0.7, spread: 1 - k }, 8);
        arms.R.to({ x: 0.24, y: -0.3 + k * 0.04, z: -0.5, rx: -0.35, ry: 0.15, rz: -0.5, curl: 0.3 + k * 0.7, spread: 1 - k }, 8);
        arms.L.tremble = arms.R.tremble = 1;
        E.chargeT = 2 + k * 2.5;
        E.cam.fovT = t < 1.9 ? 72 : 62;
        E.cam.pitchT = -0.16 + lower * 0.05;
        E.fxT.darken = 0.25 + lower * 0.3;
        E.holdTrauma(t < 1.9 ? 0.26 : 0.16);
        handArcs(E, true, 22, dt);
        if (t < 1.9) {
          every(26, dt, () => fx.dust(_a.set(randS(9), 0, randS(11) - 3), 1, 2, 5, 5, 0.6, 2));
          every(10, dt, () => fx.burst(_a.set(randS(8), 0.3, randS(10) - 4), 4, 14, 0.14, 0.7, UP, 0.6));
          E.focusOn = true;
          E.focus.set(randS(4), 1, -6 + randS(6));
        } else {
          E.focusOn = false;
          // snorting steam
          every(30, dt, () => {
            _a.set(randS(1.6), 2.2, -19.5).applyMatrix4(bull.matrixWorld);
            fx.smoke.spawn(_a.x, _a.y, _a.z, randS(4), rand(-3, 0), rand(-14, -8), rand(0.6, 1.2), 1.2, 5, 0.5, 0.42, 0.55, 0.3, 0, 2);
          });
        }
      } else if (t < 3.55) {
        arms.L.to({ x: -0.2, y: -0.2, z: -0.56, rx: -0.2, ry: -0.1, rz: 0.4, curl: 1, spread: 0 }, 14);
        arms.R.to({ x: 0.2, y: -0.2, z: -0.56, rx: -0.2, ry: 0.1, rz: -0.4, curl: 1, spread: 0 }, 14);
        arms.L.tremble = arms.R.tremble = 2;
        arms.offset.y = -gallop * 0.05;
        E.cam.fovT = 104; E.cam.fovSpeed = 6; E.cam.pitchT = -0.08;
        E.fxT.speed = 1; E.fxT.blur = 0.85; E.fxT.darken = 0;
        E.holdTrauma(0.34);
        every(60, dt, () => {
          const s = Math.random() < 0.5 ? -1 : 1;
          fx.dust(_a.set(s * rand(4, 8), 0, z + rand(-8, 4)), 1, 2, 9, 5, 0.6, 2.4);
          fx.burst(_a.setY(0.3), 3, 20, 0.14, 0.2, UP, 0.8);
        });
        const ph = Math.floor(run * 4.5);
        if (ph !== stompPhase) {
          stompPhase = ph;
          audio.boom(0.35);
          E.addTrauma(0.2);
          scrap.jolt(E.rig, 26, 9);
        }
      }
      // arcs between the horns
      if (t > 1.2 && t < 4.3) every(t < 2.7 ? 9 + lower * 16 : 26, dt, () => fx.bolt(tipL, tipR, PURPLE, 0.22, rand(0.07, 0.14), 0.1));
      crackle(E, fHead, 18, dt, 0.16);
      crackle(E, fHump, 8, dt, 0.14);

      at(1, t, 2.05, () => { E.addTrauma(0.45); audio.boom(0.5); fx.dust(_a.set(-6, 0, -8), 16, 3, 12, 5); scrap.jolt(E.rig, 34, 10); fx.ring(_a.setY(0.3), UP, 1, 22, 0.5, MAGENTA); });
      at(2, t, 2.4, () => { E.addTrauma(0.5); audio.boom(0.55); fx.dust(_a.set(6, 0, -8), 16, 3, 12, 5); scrap.jolt(E.rig, 34, 11); fx.ring(_a.setY(0.3), UP, 1, 22, 0.5, MAGENTA); });
      at(3, t, 2.7, () => { audio.whoosh(0.9, 0.8); audio.rumble(0.9, 0.9); E.fovKick(-6); });
      at(4, t, 3.55, () => {
        _a.copy(colossus.core).add(_b.set(0, -2, 1));
        fx.impact(_a, FWD, 3.6, PURPLE);
        fx.impact(_b.copy(tipL).setZ(tipL.z + 3), FWD, 1.4, MAGENTA);
        fx.impact(_b.copy(tipR).setZ(tipR.z + 3), FWD, 1.4, MAGENTA);
        fx.ring(_b.set(0, 0.3, colossus.core.z + 8), UP, 3, 75, 1.0, MAGENTA);
        fx.dust(_b, 40, 12, 26, 8);
        E.hitstop(0.19); E.impactFrame(0.16);
        E.flash(1.0, 0.85, 1.0);
        E.addTrauma(1); E.kickChroma(2.4);
        E.damage(6500, true, 1.9);
        audio.boom(1.35); audio.clank(1);
        E.fxT.speed = 0; E.fxT.blur = 0; E.cam.fovT = 82; E.cam.fovSpeed = 7; E.cam.pitchT = 0.08;
        arms.offset.y = 0;
        scrap.release(head, (_p, v) => v.set(randS(22), rand(6, 26), rand(-4, 22)), 0.25);
      });
      if (t > 3.55 && t < 4.3) {
        E.holdTrauma(0.3);
        every(40, dt, () => fx.burst(_a.copy(colossus.core).add(_b.set(randS(6), randS(5), 2)), 3, 24, 0.16, 0.4, FWD, 1.2));
      }
      at(5, t, 4.3, () => {
        released = true;
        const fl = (_p: THREE.Vector3, v: THREE.Vector3) => v.set(randS(16), rand(3, 16), randS(12) - 2);
        scrap.release(bull, fl); scrap.release(head, fl);
        audio.clank(0.5);
        arms.L.tremble = arms.R.tremble = 0;
        E.cam.fovT = 74; E.cam.pitchT = 0; E.chargeT = 0.6;
      });
      at(6, t, 4.5, () => audio.whoosh(1.0, 0.3));
      at(7, t, 5.5, () => { arms.idle(5); E.cam.fovT = 70; E.cam.aimT = 0; });
      at(8, t, 5.7, () => { fx.dust(E.rig, 14, 2, 8, 3); E.addTrauma(0.25); audio.boom(0.3); });
    },
    end() {
      arms.offset.set(0, 0, 0);
      scrap.dropBone(bull); scrap.dropBone(head);
      disposeRig(scene, bull);
      E.rig.set(0, 0, 0);
    },
  };
}

/* =====================================================================
 * 5. ASSIGN → PUNK CLASH — 付与・磁気激突
 * ===================================================================== */
function assign(E: Engine): Run {
  const { scrap, fx, arms, audio, colossus } = E;
  const at = onceMaker();
  const slots = [
    ...ellipsoidSlots(640, 13.5, 12.5, 10, 0, 17, 0.5, 0.1),
    ...ellipsoidSlots(190, 6, 11, 6.5, -17.5, 10, 4, 0.1),
    ...ellipsoidSlots(190, 6, 11, 6.5, 17.5, 10, 4, 0.1),
    ...ellipsoidSlots(180, 6.2, 6.2, 6.2, 0, 29.5, 2.5, 0.1),
    ...ellipsoidSlots(300, 16, 9, 12, 0, 12, 1, 0.2),
  ];
  // shuffle slots so the storm hits everywhere at once
  const n = slots.length / 6;
  for (let i = n - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    for (let k = 0; k < 6; k++) { const tmp = slots[i * 6 + k]; slots[i * 6 + k] = slots[j * 6 + k]; slots[j * 6 + k] = tmp; }
  }
  let form: Formation | null = null;
  let lastLocked = 0, tick = 0, auraT = 0, markT = 0, released = false;
  const palm = new THREE.Vector3();
  audio.charge(0.7, 0.3);
  E.cam.aimT = 1;

  return {
    tick(t, dt) {
      arms.handWorld(arms.L, palm);
      colossus.aura = damp(colossus.aura, auraT, 6, dt);
      colossus.markOn = damp(colossus.markOn, markT, 9, dt);

      if (t < 0.7) {
        const k = seg(t, 0, 0.7);
        arms.L.to({ x: -0.1, y: 0.0, z: -0.6, rx: 1.4, ry: 0.0, rz: 0.0, curl: 0, spread: 1 }, 10);
        arms.R.to({ x: 0.34, y: -0.3, z: -0.24, rx: 0.3, ry: 0.4, rz: -1.2, curl: 1, spread: 0 }, 8);
        arms.L.tremble = 1.2;
        E.chargeT = 2 + k * 4;
        E.cam.fovT = 62; E.fxT.darken = 0.35 + k * 0.4;
        E.holdTrauma(0.12 + k * 0.15);
        handArcs(E, true, 50, dt, 0.3);
        fx.setOrb(0, palm, 0.08 + k * k * 0.5 + randS(0.03), PURPLE, 0.9);
        fx.setOrb(1, palm, 0.03 + k * 0.14, WHITE, 0.9);
      }
      at(0, t, 0.7, () => {
        fx.hideOrbs();
        for (let i = 0; i < 6; i++) fx.bolt(palm, _a.copy(colossus.core).add(_b.set(randS(3), randS(3), 1)), i < 2 ? WHITE : PURPLE, 0.45, 0.28, 0.035);
        fx.glow(palm, 0.5, 3, 0.25, PURPLE, 1);
        E.flash(0.4, 0.2, 0.7); E.kickChroma(1.5); E.addTrauma(0.5); E.fovKick(8);
        arms.L.to({ x: -0.12, y: 0.03, z: -0.48, rx: 1.5, ry: 0, rz: 0, curl: 0, spread: 1 }, 30);
        audio.zap(0.6); audio.boom(0.4); audio.whoosh(0.3, 0.5);
        E.fxT.darken = 0.2;
      });
      at(1, t, 0.86, () => {
        auraT = 0.85; markT = 1;
        fx.shell(colossus.core, 2, 34, 0.7, PURPLE);
        fx.ring(colossus.core, _b.set(0, 0, 1), 2, 40, 0.8, MAGENTA);
        fx.glow(colossus.core, 10, 50, 0.4, PURPLE, 0.9);
        fx.light(colossus.core, PURPLE, 420, 0.6);
        E.damage(400, false, 0.3);
        E.impactFrame(0.06);
        audio.hum(3.0, 0.4); audio.boom(0.5);
        E.cam.fovT = 58; E.cam.pitchT = 0.05;
      });
      at(2, t, 1.15, () => {
        const idx = scrap.pick(n);
        form = scrap.assign(idx, colossus.group, new Float32Array(slots), 0, 1.7, 0.25, 1.7);
        audio.rumble(2.2, 0.7);
        audio.whoosh(1.6, 0.5);
      });
      if (t > 0.86 && t < 3.4) {
        // metal hand slowly crushing the air
        const k = seg(t, 1.15, 3.3);
        arms.L.to({ x: -0.12, y: 0.0, z: -0.54, rx: 1.25 - k * 0.5, ry: 0, rz: 0, curl: k * 0.82, spread: 1 - k }, 9);
        arms.L.tremble = 1 + k * 1.5;
        E.chargeT = 4 + k * 2;
        handArcs(E, true, 30, dt, 0.25);
        E.holdTrauma(0.15 + k * 0.25);
        E.fxT.speed = 0.25 * k;
        every(5, dt, () => fx.bolt(palm, _a.copy(colossus.core).add(_b.set(randS(8), randS(8), 2)), PURPLE, 0.12, 0.1, 0.06));
        // damage per volley
        tick += dt;
        if (form && tick > 0.2) {
          tick = 0;
          const add = form.locked - lastLocked;
          lastLocked = form.locked;
          if (add > 0) {
            E.damage(add * 5, false, 0.12);
            every(1, 1, () => fx.shell(colossus.core, 12, 26, 0.35, MAGENTA));
          }
        }
      }
      crackle(E, form, 26, dt, 0.25);
      at(3, t, 3.4, () => {
        arms.L.to({ x: -0.2, y: -0.22, z: -0.36, rx: 0.2, ry: -0.2, rz: 0.4, curl: 1, spread: 0 }, 32);
        fx.impact(colossus.core, FWD, 3.6, MAGENTA);
        fx.shell(colossus.core, 30, 6, 0.3, WHITE);
        fx.shell(colossus.core, 4, 60, 0.9, PURPLE);
        fx.ring(_a.set(0, 0.3, Colossus.Z), UP, 4, 80, 1.0, PURPLE);
        fx.dust(_a, 40, 14, 26, 8);
        colossus.squash = 0.55;
        E.hitstop(0.16); E.impactFrame(0.14);
        E.flash(0.9, 0.6, 1.0); E.addTrauma(1); E.kickChroma(2.2); E.fovKick(12);
        E.damage(5200, true, 1.1);
        audio.boom(1.3); audio.clank(1);
        E.fxT.speed = 0; E.fxT.darken = 0;
        markT = 0;
      });
      if (t > 3.4) colossus.squash = damp(colossus.squash, 0, 3, dt);
      at(4, t, 4.1, () => {
        auraT = 0;
        released = true;
        scrap.release(colossus.group, (p, v) => v.set(p.x * 0.5 + randS(6), rand(0, 8), (p.z - Colossus.Z) * 0.6 + randS(6) + 3));
        E.cam.fovT = 68; E.cam.pitchT = 0; E.chargeT = 0.6;
        arms.L.tremble = 0;
      });
      at(5, t, 4.7, () => { arms.idle(4.5); E.cam.fovT = 70; E.cam.aimT = 0; });
    },
    end() {
      if (!released) scrap.release(colossus.group, (_p, v) => v.set(randS(6), rand(0, 8), randS(6)));
      colossus.aura = 0; colossus.markOn = 0; colossus.squash = 0;
      fx.hideOrbs();
    },
  };
}

/* =====================================================================
 * 6. DAMNED PUNK — 電磁砲
 * ===================================================================== */
function damned(E: Engine): Run {
  const { scene, scrap, fx, arms, audio, colossus } = E;
  const at = onceMaker();
  const gun = new THREE.Group();
  scene.add(gun);
  const RX = 1.5, R0 = 5, RL = 13, MUZ = 20;
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false, fog: false });
  const cores = [
    core(new THREE.BoxGeometry(3.9, 3.9, 6), gun, 0, 0, 2),
    core(new THREE.BoxGeometry(0.95, 2.1, RL), gun, -RX, 0, R0 + RL / 2),
    core(new THREE.BoxGeometry(0.95, 2.1, RL), gun, RX, 0, R0 + RL / 2),
    core(zCyl(1.6, 2.0, 4, 7), gun, 0, 0, -3),
  ];
  const ringZ = [6.5, 10.5, 14.5, 17.6];
  const sl = [...cylSlots(60, 2.3, 1.9, 4, -5), ...boxSlots(170, 4.4, 4.4, 6.4, 0, 0, 2)];
  sl.push(...boxSlots(190, 1.25, 2.5, RL, -RX, 0, R0 + RL / 2), ...boxSlots(190, 1.25, 2.5, RL, RX, 0, R0 + RL / 2));
  for (const z of ringZ) {
    const g = new THREE.TorusGeometry(2.8, 0.45, 6, 18);
    cores.push(core(g, gun, 0, 0, z));
    sl.push(...torusSlots(50, 2.8, 0.65, z));
  }
  sl.push(...boxSlots(34, 0.8, 1.6, 3.6, -RX - 0.4, 0, 18.6), ...boxSlots(34, 0.8, 1.6, 3.6, RX + 0.4, 0, 18.6));
  cores.forEach((c) => c.scale.setScalar(0.001));
  const bore = core(new THREE.BoxGeometry(0.9, 0.7, RL + 2.5), gun, 0, 0, R0 + RL / 2, glowMat);
  bore.visible = false;
  let form: Formation | null = null;
  let coreK = 0, released = false, dmgT = 0, joltT = 0, lightT = 0;
  const base = new THREE.Vector3(), muzzle = new THREE.Vector3(), dir = new THREE.Vector3(), far = new THREE.Vector3();
  const railA = new THREE.Vector3(), railB = new THREE.Vector3();
  const FIRE = 4.78, OFF = 6.5;
  audio.charge(2.3, 0.25);
  E.cam.aimT = 1;
  E.focusOn = true;

  return {
    tick(t, dt) {
      // recoil slide
      const rec = 6 * easeOutCubic(seg(t, FIRE, FIRE + 0.3)) + 2.5 * seg(t, FIRE + 0.3, OFF);
      E.rig.z = rec * (1 - easeInOut(seg(t, 7.3, 8.5)));
      // muzzle sits in view (low-left) so the beam rakes across the frame in perspective
      muzzle.set(E.rig.x - 6.5, 4.5 + Math.sin(t * 1.7) * 0.1, E.rig.z - 11);
      dir.subVectors(colossus.core, muzzle).normalize();
      base.copy(muzzle).addScaledVector(dir, -MUZ);
      gun.position.copy(base);
      gun.lookAt(colossus.core);
      if (t > FIRE && t < OFF) gun.rotateX(-0.02 + randS(0.006));
      gun.updateMatrixWorld(true);
      muzzle.set(0, 0, MUZ).applyMatrix4(gun.matrixWorld);
      dir.set(0, 0, 1).transformDirection(gun.matrixWorld);
      far.copy(muzzle).addScaledVector(dir, 100);
      E.focus.set(0, 0, 10).applyMatrix4(gun.matrixWorld);
      coreK = damp(coreK, t > 0.8 && !released ? 1 : 0, released ? 6 : 3, dt);
      cores.forEach((c) => c.scale.setScalar(Math.max(0.001, coreK)));

      at(0, t, 0.12, () => {
        const idx = scrap.pick(sl.length / 6);
        form = scrap.assign(idx, gun, new Float32Array(sl), 0, 1.75, 0.3);
        audio.rumble(2.2, 0.5);
      });

      const c = seg(t, 2.5, 4.6);
      if (t < 2.5) {
        const k = seg(t, 0, 2.2);
        arms.L.to({ x: -0.38, y: -0.05, z: -0.62, rx: 0.15, ry: 0.42, rz: 0.5, curl: 0.3 + k * 0.7, spread: 1 - k }, 8);
        arms.R.to({ x: -0.1, y: -0.2, z: -0.4, rx: 0.3, ry: 1.0, rz: -0.7, curl: 0.72, spread: 0.3 }, 7);
        arms.L.tremble = 0.8;
        E.chargeT = 2 + k * 2;
        E.cam.fovT = 68; E.cam.yawT = 0.2;
        E.fxT.darken = 0.3;
        E.holdTrauma(0.13);
        handArcs(E, true, 28, dt);
        tether(E, 6, dt, E.focus);
      } else if (t < FIRE) {
        // CHARGE
        E.focusOn = false;
        arms.L.tremble = 1 + c * 2.5; arms.R.tremble = 0.6 + c * 1.6;
        E.chargeT = 4 + c * 5;
        E.cam.fovT = lerp(66, 56, c); E.cam.yawT = 0.17; E.cam.pitchT = 0.03;
        E.fxT.darken = t < 4.6 ? 0.3 + c * 0.45 : 0.95;
        E.holdTrauma(0.14 + c * 0.42);
        const hold = t > 4.6 ? 1 - seg(t, 4.6, FIRE) * 0.9 : 1;
        bore.visible = true;
        const gk = c * c * (0.8 + 0.2 * Math.sin(t * 60)) * 2.6;
        glowMat.color.setRGB(2.2 * gk, 0.5 * gk, 3.4 * gk);
        fx.setOrb(0, muzzle, (1.5 + 7 * c * c + randS(0.5 * c)) * hold, PURPLE, 0.95);
        fx.setOrb(1, muzzle, (0.4 + 2.6 * c + randS(0.2)) * hold, WHITE, 1);
        // arcs racing up the rails
        every(8 + c * 46, dt, () => {
          const z = R0 + ((E.time * (4 + c * 10) + Math.random() * 0.2) % 1) * RL;
          railA.set(-RX, randS(0.9), z).applyMatrix4(gun.matrixWorld);
          railB.set(RX, randS(0.9), z).applyMatrix4(gun.matrixWorld);
          fx.bolt(railA, railB, c > 0.6 && Math.random() < 0.3 ? WHITE : PURPLE, 0.12 + c * 0.14, rand(0.05, 0.11), 0.16);
        });
        every(c * 14, dt, () => {
          _a.set(randS(1), randS(1), randS(1)).normalize().multiplyScalar(rand(5, 13)).add(muzzle);
          fx.bolt(muzzle, _a, PURPLE, 0.14, 0.09, 0.14);
          audio.zap(0.15 + c * 0.15);
        });
        // energy drawn into the muzzle
        every(60 + c * 220, dt, () => {
          _a.set(randS(1), randS(1), randS(1)).normalize();
          const r = rand(8, 20);
          const life = rand(0.35, 0.6);
          const sp = -r / life;
          fx.sparks.spawn(muzzle.x + _a.x * r, muzzle.y + _a.y * r, muzzle.z + _a.z * r, _a.x * sp, _a.y * sp, _a.z * sp,
            life, 0.1, 0.3, 2.4, 0.7, 3.6, 1, 0, 0);
        });
        joltT -= dt;
        if (joltT <= 0) { joltT = 0.3; scrap.jolt(E.rig, 34, 4 + c * 5); fx.dust(_a.set(randS(10), 0, randS(10)), 3, 6, 4, 5, 0.6, 3); }
        crackle(E, form, 20 + c * 50, dt, 0.16);
      }
      crackle(E, form, 12, dt, 0.14);

      at(1, t, 2.5, () => { audio.charge(2.1, 0.55); audio.rumble(2.4, 0.8); });
      [3.0, 3.6, 4.05, 4.35, 4.55].forEach((tt, i) =>
        at(20 + i, t, tt, () => {
          fx.ring(_a.set(E.rig.x - 3, 0.25, E.rig.z), UP, 1, 30 + i * 6, 0.6, i % 2 ? MAGENTA : PURPLE);
          fx.ring(muzzle, dir, 1, 10 + i * 3, 0.4, PURPLE);
          E.kickChroma(0.5 + i * 0.15);
        })
      );
      at(2, t, FIRE, () => {
        fx.hideOrbs();
        E.impactFrame(0.17); E.hitstop(0.06);
        E.flash(1.3, 1.1, 1.35);
        E.addTrauma(1); E.kickChroma(2.0); E.fovKick(46);
        E.cam.fovT = 86; E.cam.fovSpeed = 4; E.cam.pitchT = 0.05; E.cam.yawT = 0.12;
        E.fxT.darken = 0.35; E.fxT.blur = 0.8; E.fxT.speed = 0.5;
        audio.beam(OFF - FIRE); audio.boom(1.45);
        arms.L.to({ x: -0.38, y: 0.02, z: -0.44, rx: 0.3, ry: 0.42, rz: 0.5, curl: 1, spread: 0 }, 34);
        arms.R.to({ x: -0.1, y: -0.14, z: -0.3, rx: 0.4, ry: 1.0, rz: -0.7, curl: 0.8, spread: 0.2 }, 30);
        for (let i = 0; i < 5; i++) fx.ring(_a.copy(muzzle).addScaledVector(dir, 2 + i * 7), dir, 2, 9 + i * 3, 0.35 + i * 0.07, i % 2 ? MAGENTA : PURPLE);
        fx.glow(muzzle, 6, 22, 0.3, PURPLE, 0.8);
        fx.light(muzzle, PURPLE, 900, 0.8, 260);
        fx.ring(_a.set(muzzle.x, 0.25, muzzle.z), UP, 2, 70, 0.9, MAGENTA);
        fx.dust(_a, 46, 10, 30, 7);
        scrap.radialImpulse(_a, 46, 34);
        fx.impact(colossus.core, FWD, 1.8, MAGENTA);
        E.damage(2500, true, 1.0);
      });
      if (t >= FIRE && t < OFF + 0.35) {
        const grow = easeOutExpo(seg(t, FIRE, FIRE + 0.16));
        const fade = 1 - easeInCubic(seg(t, OFF - 0.1, OFF + 0.35));
        const rad = 2.1 * grow * fade * (1 + 0.09 * Math.sin(t * 95) + randS(0.04));
        fx.setBeam(muzzle, far, rad, Math.min(1, fade * 1.4), E.time);
        fx.setOrb(0, muzzle, 4.6 * fade + randS(0.6), PURPLE, 0.7);
        fx.setOrb(1, muzzle, 2.0 * fade, WHITE, 0.8);
        fx.setOrb(2, colossus.core, (11 + randS(2.5)) * fade, MAGENTA, 0.7);
        fx.setOrb(3, colossus.core, 4.2 * fade, WHITE, 0.8);
        const gk = 3 * fade;
        glowMat.color.setRGB(3 * gk, 1.4 * gk, 3.4 * gk);
        // helix lightning hugging the beam
        every(46 * fade, dt, () => {
          const s0 = rand(0, 58), a0 = rand(6.28);
          const perp = (out: THREE.Vector3, s: number, a: number) => {
            _c.crossVectors(dir, UP).normalize();
            out.copy(muzzle).addScaledVector(dir, s).addScaledVector(_c, Math.cos(a) * rad * 1.25);
            _c.crossVectors(dir, _c);
            return out.addScaledVector(_c, Math.sin(a) * rad * 1.25);
          };
          perp(railA, s0, a0); perp(railB, s0 + rand(8, 16), a0 + rand(1.2, 2.6));
          fx.bolt(railA, railB, Math.random() < 0.3 ? WHITE : PURPLE, 0.28, rand(0.06, 0.12), 0.18);
        });
        // blast spray at the target + scorched dust along the path
        every(140 * fade, dt, () => fx.burst(_a.copy(colossus.core).add(_b.set(randS(5), randS(5), 1)), 2, 46, 0.24, 0.6, FWD, 1.3));
        every(26 * fade, dt, () => {
          const s = rand(0, 50);
          _a.copy(muzzle).addScaledVector(dir, s).setY(0);
          fx.dust(_a, 1, 3, 12, 6, 0.6, 3);
        });
        E.holdTrauma(0.72 * fade);
        E.fxT.blur = 0.4 * fade; E.fxT.speed = 0.28 * fade;
        E.chroma = Math.max(E.chroma, 0.55 * fade);
        arms.L.tremble = arms.R.tremble = 3 * fade;
        lightT -= dt;
        if (lightT <= 0) { lightT = 0.12; fx.light(muzzle, PURPLE, 420, 0.3, 240); }
        dmgT -= dt;
        if (dmgT <= 0 && t < OFF) { dmgT = 0.14; E.damage(880, false, 0.28); }
      }
      at(3, t, OFF, () => {
        fx.impact(colossus.core, FWD, 4.6, MAGENTA);
        fx.shell(colossus.core, 6, 80, 1.1, PURPLE);
        fx.shell(colossus.core, 3, 50, 0.8, WHITE);
        fx.ring(_a.set(0, 0.3, Colossus.Z), UP, 5, 110, 1.3, MAGENTA);
        fx.dust(_a, 50, 16, 30, 10);
        E.hitstop(0.14); E.impactFrame(0.13);
        E.flash(1.2, 0.9, 1.2); E.addTrauma(1); E.kickChroma(2.5); E.fovKick(14);
        E.damage(9000, true, 2.4);
        audio.boom(1.5);
        E.cam.fovT = 74; E.cam.fovSpeed = 6;
      });
      at(4, t, OFF + 0.36, () => {
        fx.setBeam(muzzle, far, 0, 0, 0);
        fx.hideOrbs();
        bore.visible = false;
        E.fxT.blur = 0; E.fxT.speed = 0; E.fxT.darken = 0;
        E.chargeT = 1;
        arms.L.tremble = arms.R.tremble = 0.3;
      });
      if (t > OFF && t < 7.4) {
        // smoking barrel
        every(30, dt, () => {
          _a.set(randS(1.5), randS(1), rand(6, MUZ)).applyMatrix4(gun.matrixWorld);
          fx.smoke.spawn(_a.x, _a.y, _a.z, randS(1.5), rand(2, 5), randS(1.5), rand(1.2, 2.4), 2, 7, 0.4, 0.3, 0.42, 0.3, 0, 0.6);
        });
        every(20, dt, () => fx.burst(_a.set(randS(2), randS(1.4), rand(5, MUZ)).applyMatrix4(gun.matrixWorld), 1, 8, 0.12, 0.2));
      }
      at(5, t, 7.2, () => {
        released = true;
        scrap.release(gun, (_p, v) => v.set(randS(7) - 3, rand(-2, 7), randS(7)));
        audio.clank(0.5);
        arms.idle(4);
        E.cam.fovT = 70; E.cam.pitchT = 0; E.chargeT = 0.4;
      });
      at(6, t, 8.0, () => { E.cam.aimT = 0; });
    },
    end() {
      fx.setBeam(muzzle, far, 0, 0, 0);
      fx.hideOrbs();
      scrap.dropBone(gun);
      disposeRig(scene, gun);
      glowMat.dispose();
      E.rig.set(0, 0, 0);
    },
  };
}

const BUILD: Record<string, (E: Engine) => Run> = { repel, gibson, vise, corna, assign, damned };

export class MoveDirector {
  active: { info: MoveInfo; run: Run; t: number } | null = null;
  ready: Record<string, number> = {};
  private E: Engine;

  constructor(E: Engine) {
    this.E = E;
  }

  canCast(id: string) {
    return !this.active && (this.ready[id] ?? -1) <= this.E.realTime;
  }

  cast(id: string): boolean {
    const info = MOVES.find((m) => m.id === id);
    if (!info || !this.canCast(id)) return false;
    this.active = { info, run: BUILD[id](this.E), t: 0 };
    this.ready[id] = this.E.realTime + info.cd;
    return true;
  }

  update(dt: number) {
    const a = this.active;
    if (!a) return;
    a.t += dt;
    a.run.tick(a.t, dt);
    if (a.t >= a.info.duration) {
      a.run.end();
      this.active = null;
      this.E.resetAfterMove(a.info.id);
    }
  }
}

