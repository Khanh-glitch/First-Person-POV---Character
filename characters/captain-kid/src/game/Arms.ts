import * as THREE from "three";
import { damp, noise1, solveTwoBone, spanY } from "./util";

export interface HandPose {
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  curl: number; spread: number;
}
export type PoseIn = Partial<HandPose>;

const L1 = 0.36, L2 = 0.34;

interface Finger { root: THREE.Object3D; j: THREE.Object3D[]; off: number }

class Arm {
  side: number; // -1 left, +1 right
  root = new THREE.Group();
  upper: THREE.Object3D;
  fore: THREE.Object3D;
  hand = new THREE.Group();
  fingers: Finger[] = [];
  thumb!: Finger;
  cur: HandPose;
  tgt: HandPose;
  speed = 8;
  tremble = 0;
  wrist = new THREE.Vector3();
  private S = new THREE.Vector3();
  private T = new THREE.Vector3();
  private E = new THREE.Vector3();
  private pole = new THREE.Vector3();
  private eu = new THREE.Euler(0, 0, 0, "YXZ");

  constructor(side: number, metal: boolean, mats: ArmMats) {
    this.side = side;
    const idle = Arms.idlePose(side);
    this.cur = { ...idle };
    this.tgt = { ...idle };
    const m = -side; // thumb side (+x for left hand)

    if (!metal) {
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, L1 - 0.06, 6, 12), mats.skin);
      this.upper = up;
      const fore = new THREE.Group();
      const fm = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.054, L2, 14), mats.skin);
      fore.add(fm);
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.056, 12, 10), mats.skin);
      elbow.position.y = -L2 / 2;
      fore.add(elbow);
      // gold bangles
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(new THREE.TorusGeometry(0.041 - i * 0.0015, 0.0075, 8, 20), mats.gold);
        b.rotation.x = Math.PI / 2;
        b.position.y = L2 / 2 - 0.045 - i * 0.021;
        b.rotation.z = i * 0.2;
        fore.add(b);
      }
      // leather wrap
      const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.07, 12), mats.leather);
      wrap.position.y = L2 / 2 - 0.15;
      fore.add(wrap);
      this.fore = fore;
      // hand
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.03, 0.09), mats.skin);
      palm.position.set(0, 0, -0.05);
      this.hand.add(palm);
      const heel = new THREE.Mesh(new THREE.SphereGeometry(0.036, 10, 8), mats.skin);
      heel.scale.set(1.1, 0.5, 0.9);
      heel.position.set(0, 0, -0.01);
      this.hand.add(heel);
      const lens = [0.084, 0.094, 0.086, 0.07];
      for (let f = 0; f < 4; f++) {
        const off = f - 1.5;
        this.fingers.push(this.buildFinger(m * off * -0.0215, 0, -0.095, lens[f], 0.0098, mats.skin, mats.nail, false, off));
      }
      this.thumb = this.buildFinger(m * 0.04, -0.003, -0.022, 0.075, 0.0115, mats.skin, mats.nail, false, 0, true);
    } else {
      const up = new THREE.Group();
      const um = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.07, L1, 8), mats.steel);
      up.add(um);
      const pist = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, L1 * 0.8, 6), mats.brass);
      pist.position.set(0.06, 0, 0.03);
      up.add(pist);
      this.upper = up;
      const fore = new THREE.Group();
      fore.add(new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.066, L2, 8), mats.steel));
      const elbow = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.1, 10), mats.brass);
      elbow.rotation.z = Math.PI / 2;
      elbow.position.y = -L2 / 2;
      fore.add(elbow);
      // armour plates, pipes, rivets, glow seams
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        const pl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.19 - (i % 2) * 0.05, 0.014), mats.dark);
        pl.position.set(Math.cos(a) * 0.058, -0.03 + (i % 2) * 0.05, Math.sin(a) * 0.058);
        pl.rotation.y = -a + Math.PI / 2;
        fore.add(pl);
        const seam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.2, 0.006), mats.glow);
        const a2 = a + Math.PI / 4;
        seam.position.set(Math.cos(a2) * 0.054, 0.0, Math.sin(a2) * 0.054);
        fore.add(seam);
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.26, 6), mats.brass);
        pipe.position.set(Math.cos(a2 + 0.3) * 0.062, -0.02, Math.sin(a2 + 0.3) * 0.062);
        pipe.rotation.z = 0.06;
        fore.add(pipe);
        for (let r = 0; r < 3; r++) {
          const rv = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), mats.brass);
          rv.position.set(Math.cos(a) * 0.066, -0.09 + r * 0.06, Math.sin(a) * 0.066);
          fore.add(rv);
        }
      }
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.035, 10), mats.brass);
      cuff.position.y = L2 / 2 - 0.02;
      fore.add(cuff);
      const cuff2 = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.008, 6, 14), mats.dark);
      cuff2.rotation.x = Math.PI / 2;
      cuff2.position.y = L2 / 2 - 0.07;
      fore.add(cuff2);
      this.fore = fore;
      // hand
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.036, 0.094), mats.steel);
      palm.position.set(0, 0, -0.05);
      this.hand.add(palm);
      const kn = new THREE.Mesh(new THREE.BoxGeometry(0.098, 0.02, 0.028), mats.brass);
      kn.position.set(0, 0.014, -0.088);
      this.hand.add(kn);
      const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 16), mats.brass);
      coreRing.rotation.x = Math.PI / 2;
      coreRing.position.set(0, 0.019, -0.045);
      this.hand.add(coreRing);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.006, 16), mats.glow);
      core.position.set(0, 0.02, -0.045);
      this.hand.add(core);
      const core2 = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.006, 16), mats.glow);
      core2.position.set(0, -0.02, -0.05);
      this.hand.add(core2);
      const lens = [0.088, 0.098, 0.09, 0.074];
      for (let f = 0; f < 4; f++) {
        const off = f - 1.5;
        this.fingers.push(this.buildFinger(m * off * -0.0235, 0, -0.098, lens[f], 0.0105, mats.steel, mats.dark, true, off));
      }
      this.thumb = this.buildFinger(m * 0.045, -0.003, -0.022, 0.08, 0.0125, mats.steel, mats.dark, true, 0, true);
    }
    this.root.add(this.upper, this.fore, this.hand);
  }

  private buildFinger(
    x: number, y: number, z: number, len: number, r: number,
    mat: THREE.Material, tipMat: THREE.Material, metal: boolean, off: number, isThumb = false
  ): Finger {
    const root = new THREE.Object3D();
    root.position.set(x, y, z);
    this.hand.add(root);
    const props = isThumb ? [0.55, 0.45] : [0.44, 0.31, 0.25];
    const j: THREE.Object3D[] = [];
    let parent: THREE.Object3D = root;
    let zoff = 0;
    props.forEach((pr, s) => {
      const L = len * pr;
      const joint = new THREE.Object3D();
      joint.position.z = zoff;
      parent.add(joint);
      const rr = r * (1 - s * 0.1);
      let geo: THREE.BufferGeometry;
      if (metal) {
        geo = new THREE.BoxGeometry(rr * 1.9, rr * 1.7, L * 0.86);
        geo.translate(0, 0, -L / 2);
        const kn = new THREE.Mesh(new THREE.SphereGeometry(rr * 1.05, 6, 5), tipMat);
        joint.add(kn);
      } else {
        geo = new THREE.CapsuleGeometry(rr, Math.max(0.001, L - rr), 4, 8);
        geo.rotateX(Math.PI / 2);
        geo.translate(0, 0, -L / 2);
      }
      joint.add(new THREE.Mesh(geo, mat));
      if (s === props.length - 1) {
        if (metal) {
          const tip = new THREE.Mesh(new THREE.ConeGeometry(rr * 1.05, L * 0.5, 5), tipMat);
          tip.rotation.x = -Math.PI / 2;
          tip.position.z = -L * 1.05;
          joint.add(tip);
        } else {
          const nail = new THREE.Mesh(new THREE.BoxGeometry(rr * 1.5, rr * 0.5, L * 0.62), tipMat);
          nail.position.set(0, rr * 0.82, -L * 0.62);
          joint.add(nail);
        }
      }
      j.push(joint);
      parent = joint;
      zoff = -L;
    });
    return { root, j, off };
  }

  to(p: PoseIn, speed?: number) {
    Object.assign(this.tgt, p);
    if (speed !== undefined) this.speed = speed;
  }

  update(dt: number, time: number, offset: THREE.Vector3) {
    const c = this.cur, t = this.tgt, sp = this.speed;
    c.x = damp(c.x, t.x, sp, dt); c.y = damp(c.y, t.y, sp, dt); c.z = damp(c.z, t.z, sp, dt);
    c.rx = damp(c.rx, t.rx, sp, dt); c.ry = damp(c.ry, t.ry, sp, dt); c.rz = damp(c.rz, t.rz, sp, dt);
    c.curl = damp(c.curl, t.curl, sp * 1.2, dt); c.spread = damp(c.spread, t.spread, sp, dt);
    const s = this.side;
    const tr = this.tremble;
    const seed = s * 3.7;
    this.S.set(s * 0.27, -0.36, 0.14).add(offset);
    this.T.set(
      c.x + noise1(time * 31, seed) * tr * 0.012 + noise1(time * 0.7, seed + 1) * 0.006,
      c.y + noise1(time * 29, seed + 2) * tr * 0.012 + Math.sin(time * 1.6 + s) * 0.006,
      c.z + noise1(time * 27, seed + 3) * tr * 0.01
    ).add(offset);
    this.pole.set(s * 0.75, -1, 0.35);
    solveTwoBone(this.S, this.T, L1, L2, this.pole, this.E, this.wrist);
    spanY(this.upper, this.S, this.E);
    spanY(this.fore, this.E, this.wrist);
    this.hand.position.copy(this.wrist);
    this.eu.set(c.rx, c.ry, c.rz);
    this.hand.quaternion.setFromEuler(this.eu);
    const m = -s;
    for (const f of this.fingers) {
      const lag = 1 - Math.abs(f.off) * 0.04;
      f.root.rotation.y = m * f.off * (0.05 + c.spread * 0.2) * (1 - c.curl * 0.8);
      f.j[0].rotation.x = -c.curl * 1.45 * lag;
      f.j[1].rotation.x = -c.curl * 1.65;
      f.j[2].rotation.x = -c.curl * 1.05;
    }
    const th = this.thumb;
    th.root.rotation.set(0, -m * (0.85 - c.curl * 0.35 + c.spread * 0.25), m * (0.5 + c.curl * 0.5));
    th.j[0].rotation.x = -c.curl * 0.55;
    th.j[1].rotation.x = -c.curl * 1.0;
  }
}

interface ArmMats {
  skin: THREE.Material; nail: THREE.Material; gold: THREE.Material; leather: THREE.Material;
  steel: THREE.Material; brass: THREE.Material; dark: THREE.Material; glow: THREE.MeshBasicMaterial;
}

export class Arms {
  group = new THREE.Group();
  L: Arm;
  R: Arm;
  offset = new THREE.Vector3();
  glow: THREE.MeshBasicMaterial;
  charge = 0.3; // magnetic core intensity
  private _w = new THREE.Vector3();

  static idlePose(side: number): HandPose {
    return side < 0
      ? { x: -0.25, y: -0.2, z: -0.43, rx: 0.35, ry: -0.3, rz: 1.0, curl: 0.5, spread: 0.2 }
      : { x: 0.27, y: -0.22, z: -0.41, rx: 0.3, ry: 0.3, rz: -1.05, curl: 0.55, spread: 0.2 };
  }

  constructor() {
    this.glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.4, 2.8), toneMapped: false });
    const mats: ArmMats = {
      skin: new THREE.MeshStandardMaterial({ color: 0xd49a76, roughness: 0.6, metalness: 0.0 }),
      nail: new THREE.MeshStandardMaterial({ color: 0x1c0610, roughness: 0.25, metalness: 0.3 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xe0a93a, roughness: 0.28, metalness: 1.0 }),
      leather: new THREE.MeshStandardMaterial({ color: 0x3a1512, roughness: 0.8, metalness: 0.1 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x70757f, roughness: 0.36, metalness: 0.95, flatShading: true }),
      brass: new THREE.MeshStandardMaterial({ color: 0xb38a3e, roughness: 0.34, metalness: 1.0, flatShading: true }),
      dark: new THREE.MeshStandardMaterial({ color: 0x25262c, roughness: 0.5, metalness: 0.9, flatShading: true }),
      glow: this.glow,
    };
    this.L = new Arm(-1, true, mats);
    this.R = new Arm(1, false, mats);
    this.group.add(this.L.root, this.R.root);
  }

  idle(speed = 5) {
    this.L.to(Arms.idlePose(-1), speed);
    this.R.to(Arms.idlePose(1), speed);
    this.L.tremble = 0;
    this.R.tremble = 0;
  }

  /** world position of a hand (palm centre) */
  handWorld(arm: Arm, out: THREE.Vector3) {
    this._w.set(0, 0, -0.06);
    return out.copy(this._w).applyQuaternion(arm.hand.quaternion).add(arm.hand.position).applyMatrix4(this.group.matrixWorld);
  }

  update(dt: number, time: number) {
    this.L.update(dt, time, this.offset);
    this.R.update(dt, time, this.offset);
    const k = (0.3 + Math.min(this.charge, 4) * 0.3) * (0.85 + 0.15 * Math.sin(time * 23));
    this.glow.color.setRGB(1.5 * k, 0.38 * k, 2.8 * k);
  }
}
