import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, lerp } from './util';

type F3 = [number, number, number];

export interface HandPose {
  pos: F3;
  rot: F3;
  index: F3;
  middle: F3;
  ring: F3;
  pinky: F3;
  thumb: F3; // abduction, curl1, curl2
  spread: number;
  aim?: boolean;
}

const mk = (
  pos: F3, rot: F3, index: F3, middle: F3, ring: F3, pinky: F3, thumb: F3,
  spread = 0.06, aim = false,
): HandPose => ({ pos, rot, index, middle, ring, pinky, thumb, spread, aim });

export const POSES = {
  rest: mk([0.31, -0.34, -0.56], [0.55, 0.3, -0.62], [0.3, 0.45, 0.3], [0.4, 0.5, 0.35], [0.5, 0.55, 0.35], [0.6, 0.6, 0.4], [0.5, 0.25, 0.2], 0.07),
  gun: mk([0.24, -0.2, -0.52], [0, 0, -1.4], [0.0, 0.0, 0.0], [1.45, 1.6, 1.0], [1.5, 1.6, 1.1], [1.55, 1.6, 1.1], [1.0, 0.0, 0.0], 0.0, true),
  blade: mk([0.3, -0.14, -0.55], [0.25, 0.2, -0.9], [0.0, 0.02, 0.0], [0.0, 0.02, 0.0], [0.02, 0.02, 0.0], [0.04, 0.02, 0.0], [0.2, 0.12, 0.1], 0.0),
  open: mk([0.15, -0.08, -0.6], [1.42, 0.1, 0], [0.12, 0.1, 0.05], [0.1, 0.1, 0.05], [0.14, 0.1, 0.05], [0.2, 0.12, 0.06], [0.9, 0.1, 0.05], 0.2),
  fist: mk([0.24, -0.3, -0.46], [0.6, 0.2, -0.4], [1.5, 1.7, 1.2], [1.55, 1.7, 1.2], [1.55, 1.7, 1.2], [1.6, 1.7, 1.2], [0.4, 0.8, 0.7], 0.0),
  two: mk([0.12, -0.1, -0.5], [0.35, 0.12, -0.9], [0.0, 0.0, 0.0], [0.0, 0.0, 0.02], [1.5, 1.6, 1.1], [1.55, 1.6, 1.1], [0.35, 0.9, 0.6], 0.0, true),
} satisfies Record<string, HandPose>;

export type PoseName = keyof typeof POSES;

const FINGERS = [
  { name: 'index', x: -0.03, z: -0.088, len: [0.038, 0.024, 0.02], r: 0.01, spread: 1.0 },
  { name: 'middle', x: -0.01, z: -0.092, len: [0.042, 0.027, 0.021], r: 0.0102, spread: 0.15 },
  { name: 'ring', x: 0.01, z: -0.089, len: [0.038, 0.025, 0.02], r: 0.0095, spread: -0.6 },
  { name: 'pinky', x: 0.029, z: -0.08, len: [0.03, 0.02, 0.017], r: 0.0086, spread: -1.2 },
] as const;

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#c9a23e');
  grd.addColorStop(1, '#b58b2c');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  // fabric weave noise
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${Math.random() > 0.5 ? '255,240,180' : '120,85,20'},${Math.random() * 0.07})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  // pinstripes
  for (let x = 6; x < 256; x += 21) {
    g.fillStyle = 'rgba(120,82,22,0.75)';
    g.fillRect(x, 0, 1.6, 256);
    g.fillStyle = 'rgba(255,245,200,0.18)';
    g.fillRect(x + 2, 0, 1, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Hand {
  side: 1 | -1;
  root = new THREE.Group();
  mirror = new THREE.Group();
  sleeve = new THREE.Group();
  tips: Record<string, THREE.Object3D> = {};
  skin: THREE.MeshStandardMaterial;
  glow = 0;
  kPos = 15;
  kQuat = 17;
  kFinger = 22;

  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private tPos = new THREE.Vector3();
  private tQuat = new THREE.Quaternion();
  private curls = new Float32Array(16);
  private tCurls = new Float32Array(16);
  private fingerJoints: THREE.Group[][] = [];
  private thumbJoints: THREE.Group[] = [];
  private fingerRoots: THREE.Group[] = [];
  private thumbRoot = new THREE.Group();
  private sleeveMesh: THREE.Mesh;
  private cuff: THREE.Mesh;
  private link: THREE.Mesh;
  private qa = new THREE.Quaternion();
  private qp = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private fwd = new THREE.Vector3(0, 0, -1);
  private yAxis = new THREE.Vector3(0, 1, 0);
  private dirV = new THREE.Vector3();
  private shoulder = new THREE.Vector3();
  private seed: number;

  constructor(side: 1 | -1, stripe: THREE.Texture) {
    this.side = side;
    this.seed = side * 1.7;
    this.skin = new THREE.MeshStandardMaterial({
      color: 0xc98f68,
      roughness: 0.55,
      metalness: 0,
      emissive: new THREE.Color(1.0, 0.62, 0.2),
      emissiveIntensity: 0.0,
    });
    const nailMat = new THREE.MeshStandardMaterial({ color: 0xf4d8c8, roughness: 0.3 });
    this.root.add(this.mirror);
    this.mirror.scale.set(side * 1.35, 1.35, 1.35);

    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.092, 0.028, 0.098, 3, 0.012), this.skin);
    palm.position.set(0, 0, -0.045);
    this.mirror.add(palm);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.034, 0.06, 16), this.skin);
    wrist.rotation.x = Math.PI / 2;
    wrist.position.z = 0.02;
    this.mirror.add(wrist);

    FINGERS.forEach((f, fi) => {
      const root = new THREE.Group();
      root.position.set(f.x, 0, f.z);
      this.mirror.add(root);
      this.fingerRoots.push(root);
      const joints: THREE.Group[] = [];
      let parent: THREE.Object3D = root;
      f.len.forEach((len, si) => {
        const j = new THREE.Group();
        if (si > 0) j.position.z = -f.len[si - 1];
        parent.add(j);
        joints.push(j);
        const r = f.r * (1 - si * 0.1);
        const cap = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - r * 0.4, 5, 10), this.skin);
        cap.rotation.x = Math.PI / 2;
        cap.position.z = -len / 2;
        j.add(cap);
        if (si === 2) {
          const nail = new THREE.Mesh(new THREE.BoxGeometry(r * 1.3, 0.0012, len * 0.62), nailMat);
          nail.position.set(0, r * 0.96, -len * 0.5);
          j.add(nail);
          const tip = new THREE.Object3D();
          tip.position.set(0, 0, -len - r * 0.6);
          j.add(tip);
          this.tips[f.name] = tip;
        }
        parent = j;
      });
      this.fingerJoints[fi] = joints;
    });

    // thumb
    this.thumbRoot.position.set(-0.04, -0.003, -0.028);
    this.mirror.add(this.thumbRoot);
    const tl = [0.036, 0.029, 0.024];
    let tp: THREE.Object3D = this.thumbRoot;
    tl.forEach((len, si) => {
      const j = new THREE.Group();
      if (si > 0) j.position.z = -tl[si - 1];
      tp.add(j);
      this.thumbJoints.push(j);
      const r = 0.0118 * (1 - si * 0.1);
      const cap = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - r * 0.4, 5, 10), this.skin);
      cap.rotation.x = Math.PI / 2;
      cap.position.z = -len / 2;
      j.add(cap);
      if (si === 2) {
        const nail = new THREE.Mesh(new THREE.BoxGeometry(r * 1.4, 0.0012, len * 0.6), nailMat);
        nail.position.set(0, r * 0.96, -len * 0.5);
        j.add(nail);
        const tip = new THREE.Object3D();
        tip.position.set(0, 0, -len - r * 0.6);
        j.add(tip);
        this.tips.thumb = tip;
      }
      tp = j;
    });

    // sleeve (jacket) + shirt cuff + cufflink, living in camera space
    const sleeveMat = new THREE.MeshStandardMaterial({
      map: stripe,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0.2, 0.13, 0.03),
      emissiveIntensity: 0.1,
    });
    const sg = new THREE.CylinderGeometry(0.072, 0.053, 1, 28, 1, true);
    this.sleeveMesh = new THREE.Mesh(sg, sleeveMat);
    (sleeveMat.map as THREE.Texture).repeat.set(3, 3);
    const cuffMat = new THREE.MeshStandardMaterial({ color: 0xf6f0e4, roughness: 0.6, side: THREE.DoubleSide, emissive: new THREE.Color(0.25, 0.22, 0.18), emissiveIntensity: 0.25 });
    this.cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.054, 0.06, 24, 1, true), cuffMat);
    this.link = new THREE.Mesh(
      new THREE.SphereGeometry(0.0075, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd36a, metalness: 1, roughness: 0.18 }),
    );
    this.sleeve.add(this.sleeveMesh, this.cuff, this.link);
    this.shoulder.set(side * 0.6, -1.0, 0.12);
  }

  setPose(p: HandPose, xScale = 1, aimDir?: THREE.Vector3) {
    this.tPos.set(p.pos[0] * xScale, p.pos[1], p.pos[2]);
    this.e.set(p.rot[0], p.rot[1], p.rot[2], 'XYZ');
    this.qp.setFromEuler(this.e);
    if (p.aim && aimDir) {
      this.v.set(aimDir.x * this.side, aimDir.y, aimDir.z).normalize();
      this.qa.setFromUnitVectors(this.fwd, this.v);
      this.tQuat.copy(this.qa).multiply(this.qp);
    } else {
      this.tQuat.copy(this.qp);
    }
    const t = this.tCurls;
    t.set(p.index, 0);
    t.set(p.middle, 3);
    t.set(p.ring, 6);
    t.set(p.pinky, 9);
    t.set(p.thumb, 12);
    t[15] = p.spread;
  }

  recoil(v: number) {
    this.pos.z += v;
    this.pos.y += v * 0.45;
  }

  /** Immediate placement in right-hand-frame camera space. */
  place(pos: THREE.Vector3, quat: THREE.Quaternion) {
    this.pos.copy(pos);
    this.tPos.copy(pos);
    this.quat.copy(quat);
    this.tQuat.copy(quat);
  }

  update(dt: number, time: number) {
    const kp = 1 - Math.exp(-this.kPos * dt);
    const kq = 1 - Math.exp(-this.kQuat * dt);
    const kf = 1 - Math.exp(-this.kFinger * dt);
    this.pos.lerp(this.tPos, kp);
    this.quat.slerp(this.tQuat, kq);
    for (let i = 0; i < 16; i++) this.curls[i] += (this.tCurls[i] - this.curls[i]) * kf;

    const s = this.seed;
    const sx = Math.sin(time * 1.3 + s) * 0.0035;
    const sy = Math.sin(time * 1.7 + s * 2) * 0.004;
    this.root.position.set(this.side * this.pos.x + this.side * sx, this.pos.y + sy, this.pos.z);
    this.root.quaternion.set(this.quat.x, this.side * this.quat.y, this.side * this.quat.z, this.quat.w);

    const spread = this.curls[15];
    FINGERS.forEach((f, fi) => {
      const j = this.fingerJoints[fi];
      const micro = Math.sin(time * 1.6 + fi * 0.9 + s) * 0.025;
      this.fingerRoots[fi].rotation.y = spread * f.spread;
      j[0].rotation.x = -(this.curls[fi * 3] + micro);
      j[1].rotation.x = -(this.curls[fi * 3 + 1] + micro);
      j[2].rotation.x = -(this.curls[fi * 3 + 2] + micro * 0.5);
    });
    this.thumbRoot.rotation.y = this.curls[12];
    this.thumbRoot.rotation.z = -0.25 * clamp(this.curls[13], 0, 1);
    this.thumbJoints[0].rotation.x = -this.curls[13] * 0.6;
    this.thumbJoints[1].rotation.x = -this.curls[13] * 0.5 - this.curls[14] * 0.5;
    this.thumbJoints[2].rotation.x = -this.curls[14];

    this.skin.emissiveIntensity = this.glow;

    // sleeve
    const wrist = this.root.position;
    this.dirV.copy(this.shoulder).sub(wrist);
    const len = this.dirV.length();
    this.dirV.divideScalar(len);
    const L = Math.max(0.1, len - 0.03);
    this.sleeveMesh.position.copy(wrist).addScaledVector(this.dirV, 0.04 + L / 2);
    this.sleeveMesh.quaternion.setFromUnitVectors(this.yAxis, this.dirV);
    this.sleeveMesh.scale.set(1, L, 1);
    this.cuff.position.copy(wrist).addScaledVector(this.dirV, 0.02);
    this.cuff.quaternion.copy(this.sleeveMesh.quaternion);
    this.link.position.copy(wrist).addScaledVector(this.dirV, 0.045).addScaledVector(this.v.set(this.side * 0.056, 0.0, 0), 1);
  }

  tipWorld(name: string, out: THREE.Vector3) {
    return this.tips[name].getWorldPosition(out);
  }

  /** world direction of pointing finger */
  pointDir(out: THREE.Vector3) {
    this.root.getWorldQuaternion(this.qa);
    return out.set(0, 0, -1).applyQuaternion(this.qa);
  }
}

export class Leg {
  group = new THREE.Group();
  sole: THREE.Mesh;
  foot = new THREE.Group();
  k = 0;
  glow = 0;
  private pantMat: THREE.MeshStandardMaterial;

  constructor(stripe: THREE.Texture) {
    const tex = stripe.clone();
    tex.needsUpdate = true;
    tex.repeat.set(3, 4);
    this.pantMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.8,
      emissive: new THREE.Color(0.22, 0.14, 0.04),
      emissiveIntensity: 0.25,
    });
    const pant = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.072, 1.4, 20, 1, true), this.pantMat);
    pant.rotation.x = -Math.PI / 2;
    pant.position.z = -0.7;
    this.group.add(pant);
    // sock + shoe
    const sock = new THREE.Mesh(
      new THREE.CylinderGeometry(0.058, 0.058, 0.14, 14),
      new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.9 }),
    );
    sock.rotation.x = -Math.PI / 2;
    sock.position.z = -1.42;
    this.group.add(sock);
    this.foot.position.set(0, 0, -1.5);
    const shoe = new THREE.Mesh(
      new RoundedBoxGeometry(0.125, 0.34, 0.105, 4, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.28, metalness: 0.35 }),
    );
    shoe.position.set(0, 0.1, 0);
    this.foot.add(shoe);
    this.sole = new THREE.Mesh(
      new THREE.PlaneGeometry(0.115, 0.3),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 1.6), side: THREE.DoubleSide, toneMapped: false }),
    );
    this.sole.rotation.y = Math.PI;
    this.sole.position.set(0, 0.1, -0.056);
    this.foot.add(this.sole);
    this.group.add(this.foot);
    this.group.visible = false;
  }

  /** k: 0 hidden below view → 1 fully extended forward */
  set(k: number, glow: number) {
    this.k = k;
    this.glow = glow;
    this.group.visible = k > 0.01;
    const e = k * k * (3 - 2 * k);
    this.group.position.set(lerp(0.24, 0.17, e), lerp(-1.5, -0.5, e), lerp(0.7, 0.4, e));
    this.group.rotation.set(lerp(-1.5, 0.16, e), lerp(0.1, -0.03, e), 0);
    const g = this.sole.material as THREE.MeshBasicMaterial;
    g.color.setRGB(5 * (0.35 + glow), 3.6 * (0.35 + glow), 1.6 * (0.35 + glow));
    this.pantMat.emissiveIntensity = 0.25 + glow * 1.5;
  }

  /** world position of the sole centre */
  soleWorld(out: THREE.Vector3) {
    return this.sole.getWorldPosition(out);
  }
}

export class Hands {
  group = new THREE.Group();
  left: Hand;
  right: Hand;
  leg: Leg;
  xScale = 1;

  constructor() {
    const stripe = stripeTexture();
    this.left = new Hand(-1, stripe);
    this.right = new Hand(1, stripe);
    this.leg = new Leg(stripe);
    this.group.add(this.left.root, this.right.root, this.left.sleeve, this.right.sleeve, this.leg.group);
    this.group.traverse((o) => {
      o.layers.set(1);
      o.frustumCulled = false;
    });
    this.both('rest');
  }

  both(name: PoseName, aim?: THREE.Vector3) {
    this.left.setPose(POSES[name], this.xScale, aim);
    this.right.setPose(POSES[name], this.xScale, aim);
  }

  update(dt: number, time: number) {
    this.left.update(dt, time);
    this.right.update(dt, time);
  }

  setAspect(aspect: number) {
    this.xScale = clamp(aspect / 1.7, 0.45, 1);
  }
}
