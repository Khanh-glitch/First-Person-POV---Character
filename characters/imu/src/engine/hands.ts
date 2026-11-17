import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { damp, easeInCubic, easeInOut, easeOutCubic, easeOutExpo } from "./util";

/** pose layout: [px,py,pz, pitch,yaw,roll, spread, thumb,index,middle,ring,pinky] (camera space) */
export type Pose = number[];
export interface Key {
  t: number;
  pose: Pose;
  e?: "inout" | "out" | "in" | "snap" | "lin";
}

export const P = (x: number, y: number, z: number, pitch: number, yaw: number, roll: number, spread: number, f: number | number[]): Pose => {
  const fs = typeof f === "number" ? [f * 0.7, f, f, f, f] : f;
  return [x, y, z, pitch, yaw, roll, spread, ...fs];
};

export const mirror = (p: Pose): Pose => {
  const q = p.slice();
  q[0] = -q[0];
  q[4] = -q[4];
  q[5] = -q[5];
  return q;
};
export const mirrorKeys = (k: Key[]): Key[] => k.map((x) => ({ ...x, pose: mirror(x.pose) }));

export function sample(keys: Key[], t: number): Pose {
  if (t <= keys[0].t) return keys[0].pose;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.pose;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].t < t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  let u = (t - a.t) / (b.t - a.t);
  switch (b.e ?? "inout") {
    case "out":
      u = easeOutCubic(u);
      break;
    case "in":
      u = easeInCubic(u);
      break;
    case "snap":
      u = easeOutExpo(u);
      break;
    case "lin":
      break;
    default:
      u = easeInOut(u);
  }
  return a.pose.map((v, k) => v + (b.pose[k] - v) * u);
}

export const REST: Pose = P(0.24, -0.26, -0.46, 0.12, 0.1, -1.05, 0.25, [0.25, 0.3, 0.3, 0.32, 0.36]);

interface Digit {
  base: THREE.Group;
  j2: THREE.Group;
  j3: THREE.Group;
}

const skinMat = () =>
  new THREE.MeshStandardMaterial({ color: 0xd8c4c0, roughness: 0.52, metalness: 0.0, emissive: 0x1a0610, emissiveIntensity: 0.6 });

export class Hand {
  root = new THREE.Group();
  model = new THREE.Group();
  palmAnchor = new THREE.Object3D();
  tipAnchor = new THREE.Object3D();
  cur: Pose;
  tgt: Pose;
  follow = 15;
  private digits: Digit[] = [];
  private thumb!: Digit;
  private off = new THREE.Vector3();
  private offV = new THREE.Vector3();
  private qBase = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private qRoll = new THREE.Quaternion();
  private yAxis = new THREE.Vector3(0, 1, 0);
  private seed: number;
  skin = skinMat();
  side: number;

  constructor(side: 1 | -1) {
    this.side = side;
    this.seed = side > 0 ? 0 : 3.3;
    this.cur = side > 0 ? REST.slice() : mirror(REST);
    this.tgt = this.cur.slice();
    this.build(side);
    this.root.add(this.model);
    this.root.rotation.order = "YXZ";
  }

  private seg(parent: THREE.Object3D, r: number, l: number) {
    const geo = new THREE.CapsuleGeometry(r, Math.max(0.002, l - 2 * r), 4, 10);
    geo.translate(0, l / 2, 0);
    const m = new THREE.Mesh(geo, this.skin);
    parent.add(m);
    return m;
  }

  private build(side: number) {
    const m = this.model;
    // palm
    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.086, 0.1, 0.026, 4, 0.011), this.skin);
    m.add(palm);
    // wrist + forearm
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.032, 0.34, 16), this.skin);
    wrist.position.y = -0.05 - 0.17;
    m.add(wrist);

    // sleeve: bell shaped black robe with gold and crimson trim
    const sleeveGeo = new THREE.CylinderGeometry(0.066, 0.1, 0.62, 40, 10, true);
    const sp = sleeveGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i);
      const z = sp.getZ(i);
      const y = sp.getY(i);
      const a = Math.atan2(z, x);
      const f = (0.31 - y) / 0.62; // 0 at cuff, 1 at far end
      const fold = 1 + Math.sin(a * 7 + f * 3) * 0.07 * f + Math.sin(a * 13) * 0.02 * f;
      sp.setX(i, x * fold);
      sp.setZ(i, z * fold);
    }
    sleeveGeo.computeVertexNormals();
    const sleeve = new THREE.Mesh(
      sleeveGeo,
      new THREE.MeshStandardMaterial({ color: 0x08060c, roughness: 0.78, metalness: 0.15, side: THREE.DoubleSide, emissive: 0x08020a, emissiveIntensity: 0.8 })
    );
    sleeve.position.y = -0.1 - 0.31;
    m.add(sleeve);
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a13f, roughness: 0.28, metalness: 1, emissive: 0x3d2503, emissiveIntensity: 0.7 });
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.0085, 10, 40), goldMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.1;
    m.add(cuff);
    const cuff2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.079, 0.006, 8, 40),
      new THREE.MeshStandardMaterial({ color: 0x7a0f24, roughness: 0.4, emissive: 0x4a0414, emissiveIntensity: 1 })
    );
    cuff2.rotation.x = Math.PI / 2;
    cuff2.position.y = -0.135;
    m.add(cuff2);
    const cuff3 = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.005, 8, 40), goldMat);
    cuff3.rotation.x = Math.PI / 2;
    cuff3.position.y = -0.185;
    m.add(cuff3);

    // fingers
    const specs = [
      { x: 0.032, y: 0.05, l: [0.047, 0.03, 0.025], r: 0.0092 },
      { x: 0.011, y: 0.052, l: [0.052, 0.033, 0.027], r: 0.0095 },
      { x: -0.011, y: 0.05, l: [0.047, 0.03, 0.025], r: 0.0088 },
      { x: -0.031, y: 0.045, l: [0.038, 0.023, 0.021], r: 0.0078 },
    ];
    const nailMat = new THREE.MeshStandardMaterial({ color: 0x0a0408, roughness: 0.15, metalness: 0.6 });
    specs.forEach((s) => {
      const base = new THREE.Group();
      base.position.set(s.x * side, s.y, 0);
      m.add(base);
      this.seg(base, s.r, s.l[0]);
      const j2 = new THREE.Group();
      j2.position.y = s.l[0];
      base.add(j2);
      this.seg(j2, s.r * 0.94, s.l[1]);
      const j3 = new THREE.Group();
      j3.position.y = s.l[1];
      j2.add(j3);
      this.seg(j3, s.r * 0.88, s.l[2]);
      const nail = new THREE.Mesh(new THREE.SphereGeometry(s.r * 0.82, 8, 6), nailMat);
      nail.scale.set(0.95, 1.5, 0.35);
      nail.position.set(0, s.l[2] * 0.72, -s.r * 0.72);
      j3.add(nail);
      this.digits.push({ base, j2, j3 });
    });

    // gold ring on the ring finger (a touch of royalty)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0098, 0.0025, 8, 16), goldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.022;
    this.digits[2].base.children[0].add(ring);

    // thumb
    const tb = new THREE.Group();
    tb.position.set(0.04 * side, -0.022, 0);
    m.add(tb);
    this.seg(tb, 0.0108, 0.04);
    const t2 = new THREE.Group();
    t2.position.y = 0.04;
    tb.add(t2);
    this.seg(t2, 0.0098, 0.033);
    const t3 = new THREE.Group();
    t3.position.y = 0.033;
    t2.add(t3);
    this.seg(t3, 0.009, 0.027);
    const tn = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 8, 6), nailMat);
    tn.scale.set(0.95, 1.5, 0.35);
    tn.position.set(0, 0.02, -0.0065);
    t3.add(tn);
    this.thumb = { base: tb, j2: t2, j3: t3 };

    this.palmAnchor.position.set(0, 0.015, 0.03);
    m.add(this.palmAnchor);
    this.tipAnchor.position.set(specs[0].x * side, 0.17, 0);
    m.add(this.tipAnchor);
  }

  kick(x: number, y: number, z: number) {
    this.offV.x += x;
    this.offV.y += y;
    this.offV.z += z;
  }

  set(p: Pose) {
    for (let i = 0; i < 12; i++) this.tgt[i] = p[i];
  }

  snapTo(p: Pose) {
    for (let i = 0; i < 12; i++) {
      this.tgt[i] = p[i];
      this.cur[i] = p[i];
    }
  }

  update(dt: number, t: number) {
    const k = damp(this.follow, dt);
    for (let i = 0; i < 12; i++) this.cur[i] += (this.tgt[i] - this.cur[i]) * k;

    // spring offset (recoil)
    const stiff = 160;
    const damping = 14;
    this.offV.addScaledVector(this.off, -stiff * dt).multiplyScalar(Math.exp(-damping * dt));
    this.off.addScaledVector(this.offV, dt);

    const c = this.cur;
    const s = this.seed;
    const bob = Math.sin(t * 1.3 + s) * 0.004;
    this.root.position.set(c[0] + this.off.x + Math.sin(t * 0.9 + s) * 0.003, c[1] + this.off.y + bob, c[2] + this.off.z);
    this.root.rotation.set(c[3] + Math.sin(t * 1.1 + s) * 0.01, c[4], 0);
    this.qRoll.setFromAxisAngle(this.yAxis, c[5]);
    this.model.quaternion.copy(this.qBase).multiply(this.qRoll);

    const spread = c[6];
    const fan = [0.12, 0.03, -0.05, -0.13];
    for (let i = 0; i < 4; i++) {
      const d = this.digits[i];
      const cv = Math.max(0, Math.min(1.1, c[8 + i] + Math.sin(t * 1.7 + i + s) * 0.025));
      d.base.rotation.x = cv * 1.45;
      d.base.rotation.z = -this.side * spread * fan[i];
      d.j2.rotation.x = cv * 1.7;
      d.j3.rotation.x = cv * 1.15;
    }
    const tc = c[7];
    const sd = this.side;
    this.thumb.base.rotation.set(tc * 0.5, tc * 0.2 * sd, (-0.55 + tc * 0.75 - spread * 0.35) * sd);
    this.thumb.j2.rotation.x = tc * 0.9;
    this.thumb.j3.rotation.x = tc * 0.8;
  }

  palmWorld(out: THREE.Vector3) {
    return this.palmAnchor.getWorldPosition(out);
  }
  tipWorld(out: THREE.Vector3) {
    return this.tipAnchor.getWorldPosition(out);
  }
}
