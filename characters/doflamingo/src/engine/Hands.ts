import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type Curl = [number, number, number, number, number]; // thumb, index, middle, ring, pinky

export interface Pose {
  pos: [number, number, number];
  rot: [number, number, number];
  curl: Curl;
  spread: number;
}

export const POSES: Record<string, Pose> = {
  idle: { pos: [0.27, -0.27, -0.56], rot: [0.15, 0.25, -0.15], curl: [0.25, 0.22, 0.3, 0.38, 0.45], spread: 0.15 },
  ready: { pos: [0.26, -0.2, -0.58], rot: [0.5, 0.15, -0.35], curl: [0.15, 0.1, 0.15, 0.2, 0.25], spread: 0.5 },
  point: { pos: [0.2, -0.14, -0.64], rot: [0.32, 0.08, -0.1], curl: [0.0, 0.0, 0.92, 0.95, 0.95], spread: 0.0 },
  gun2: { pos: [0.18, -0.14, -0.66], rot: [0.3, 0.06, -0.6], curl: [0.0, 0.0, 0.0, 0.95, 0.95], spread: -0.1 },
  claw: { pos: [0.2, -0.12, -0.5], rot: [0.6, 0.1, -0.2], curl: [0.45, 0.45, 0.45, 0.45, 0.45], spread: 0.9 },
  clawHigh: { pos: [0.3, 0.16, -0.68], rot: [1.35, 0.05, -0.15], curl: [0.4, 0.5, 0.5, 0.5, 0.5], spread: 1.0 },
  clawDown: { pos: [0.16, -0.24, -0.66], rot: [0.15, 0.05, -0.15], curl: [0.55, 0.6, 0.6, 0.6, 0.6], spread: 0.9 },
  open: { pos: [0.24, -0.16, -0.62], rot: [0.45, 0.05, -0.2], curl: [0, 0, 0, 0, 0], spread: 0.9 },
  palmFwd: { pos: [0.18, -0.12, -0.6], rot: [1.25, 0.0, 0.0], curl: [0.05, 0.05, 0.05, 0.08, 0.1], spread: 0.7 },
  puppeteer: { pos: [0.24, -0.04, -0.68], rot: [0.55, 0.12, -0.05], curl: [0.3, 0.3, 0.3, 0.3, 0.3], spread: 0.6 },
  fist: { pos: [0.24, -0.16, -0.6], rot: [0.5, 0.1, -0.3], curl: [0.8, 1, 1, 1, 1], spread: 0 },
  sky: { pos: [0.26, 0.1, -0.66], rot: [1.45, 0.0, -0.1], curl: [0.5, 0.0, 0.0, 0.95, 0.95], spread: 0.1 },
  slam: { pos: [0.22, -0.2, -0.6], rot: [0.25, 0.0, -0.1], curl: [0.1, 0.1, 0.1, 0.1, 0.1], spread: 0.8 },
  spreadWide: { pos: [0.5, -0.12, -0.55], rot: [0.35, -0.45, -0.9], curl: [0.05, 0.05, 0.05, 0.05, 0.05], spread: 1.0 },
  raise: { pos: [0.58, 0.02, -0.62], rot: [1.15, -0.35, -0.7], curl: [0.1, 0.1, 0.1, 0.15, 0.2], spread: 1.0 },
  thrust: { pos: [0.3, -0.16, -0.72], rot: [1.2, 0.35, 0.35], curl: [0.1, 0.1, 0.1, 0.1, 0.1], spread: 0.8 },
  gather: { pos: [0.1, -0.14, -0.5], rot: [1.1, 0.25, 0.25], curl: [0.35, 0.35, 0.35, 0.35, 0.35], spread: 0.7 },
  laugh: { pos: [0.15, -0.05, -0.42], rot: [1.3, 0.3, 0.6], curl: [0.2, 0.15, 0.2, 0.25, 0.3], spread: 0.6 },
};

const SKIN = 0xc98a62;

class Hand {
  side: number;
  root = new THREE.Group(); // wrist pivot
  fingers: THREE.Group[][] = []; // [finger][segment]
  tips: THREE.Object3D[] = [];
  feathers: THREE.InstancedMesh;
  featherData: { pos: THREE.Vector3; quat: THREE.Quaternion; scale: number; phase: number }[] = [];
  // spring state
  pos = new THREE.Vector3();
  posV = new THREE.Vector3();
  rot = new THREE.Vector3();
  rotV = new THREE.Vector3();
  curl = [0, 0, 0, 0, 0];
  spread = 0;
  target: Pose;
  stiff = 90;
  twitch = [0, 0, 0, 0, 0];
  offset = new THREE.Vector3(); // impulse offset (recoil)
  offsetV = new THREE.Vector3();
  rotOffset = new THREE.Vector3();
  rotOffsetV = new THREE.Vector3();
  shake = 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private sv = new THREE.Vector3();

  constructor(side: number, skin: THREE.Material, nail: THREE.Material, featherMat: THREE.Material, sleeveMat: THREE.Material) {
    this.side = side;
    this.target = POSES.idle;
    const s = side;
    // palm
    const palmGeo = new RoundedBoxGeometry(0.086, 0.028, 0.094, 3, 0.012);
    const palm = new THREE.Mesh(palmGeo, skin);
    palm.position.z = -0.045;
    this.root.add(palm);
    // knuckle bulge
    const kn = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.06, 4, 8).rotateZ(Math.PI / 2), skin);
    kn.position.set(0, 0.004, -0.088);
    this.root.add(kn);
    // wrist
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.08, 14).rotateX(Math.PI / 2), skin);
    wrist.scale.set(1.25, 0.8, 1);
    wrist.position.z = 0.02;
    this.root.add(wrist);

    const lens = [
      [0.034, 0.028, 0.022],
      [0.042, 0.026, 0.02],
      [0.046, 0.029, 0.021],
      [0.043, 0.027, 0.02],
      [0.034, 0.021, 0.018],
    ];
    const radii = [0.0125, 0.0105, 0.011, 0.0105, 0.0092];
    const xs = [0, -0.031, -0.0105, 0.0105, 0.031];
    for (let f = 0; f < 5; f++) {
      const segs: THREE.Group[] = [];
      let parent: THREE.Object3D = this.root;
      const base = new THREE.Group();
      if (f === 0) {
        base.position.set(-0.04 * s, -0.008, -0.02);
        base.rotation.set(-0.2, 0.75 * s, -0.6 * s, "YXZ");
      } else {
        base.position.set(xs[f] * s, 0, -0.09);
      }
      this.root.add(base);
      parent = base;
      for (let k = 0; k < 3; k++) {
        const g = new THREE.Group();
        if (k > 0) g.position.z = -lens[f][k - 1];
        const L = lens[f][k];
        const r = radii[f] * (1 - k * 0.08);
        const cap = new THREE.Mesh(new THREE.CapsuleGeometry(r, L, 4, 10).rotateX(Math.PI / 2).translate(0, 0, -L / 2), skin);
        g.add(cap);
        if (k === 2) {
          const n = new THREE.Mesh(new RoundedBoxGeometry(r * 1.5, r * 0.5, L * 0.75, 2, r * 0.25), nail);
          n.position.set(0, r * 0.8, -L * 0.55);
          g.add(n);
          const tip = new THREE.Object3D();
          tip.position.z = -L - r * 0.6;
          g.add(tip);
          this.tips.push(tip);
        }
        parent.add(g);
        parent = g;
        segs.push(g);
      }
      this.fingers.push(segs);
    }

    // forearm & under-sleeve
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.068, 0.7, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.4), sleeveMat);
    this.root.add(fore);

    // feather cuff
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.32, 0.4, 0.08, 1.0);
    shape.lineTo(0, 0.92);
    shape.lineTo(-0.08, 1.0);
    shape.quadraticCurveTo(-0.32, 0.4, 0, 0);
    const fgeo = new THREE.ShapeGeometry(shape, 6);
    const N = 460;
    this.feathers = new THREE.InstancedMesh(fgeo, featherMat, N);
    const pinks = [0xff5fae, 0xff3d97, 0xff86c2, 0xe83f8c, 0xff9fd0, 0xd92f7f];
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const z = 0.07 + Math.pow(Math.random(), 1.2) * 0.3;
      const th = Math.random() * Math.PI * 2;
      const rad = 0.055 + z * 0.05 + Math.random() * 0.015;
      const radial = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
      const pos = radial.clone().multiplyScalar(rad).setZ(z);
      const dir = radial.clone().multiplyScalar(0.75 + Math.random() * 0.4).add(new THREE.Vector3(0, 0, 0.55 + Math.random() * 0.5)).normalize();
      if (z < 0.14) dir.add(new THREE.Vector3(0, 0, -0.9)).normalize(); // cuff flares forward around wrist
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
      const roll = new THREE.Quaternion().setFromAxisAngle(dir, Math.random() * Math.PI);
      quat.premultiply(roll);
      const scale = (z < 0.14 ? 0.026 : 0.032) + Math.random() * 0.028;
      this.featherData.push({ pos, quat, scale, phase: Math.random() * 10 });
      this.feathers.setColorAt(i, c.set(pinks[Math.floor(Math.random() * pinks.length)]));
    }
    this.feathers.frustumCulled = false;
    this.root.add(this.feathers);
  }

  setPose(p: Pose, stiff = 90) {
    this.target = p;
    this.stiff = stiff;
  }

  snapTo(p: Pose) {
    this.target = p;
    this.pos.set(p.pos[0] * this.side, p.pos[1], p.pos[2]);
    this.rot.set(p.rot[0], p.rot[1] * this.side, p.rot[2] * this.side);
    for (let i = 0; i < 5; i++) this.curl[i] = p.curl[i];
    this.spread = p.spread;
  }

  kick(pos: THREE.Vector3, rot: THREE.Vector3) {
    this.offsetV.add(pos);
    this.rotOffsetV.add(rot);
  }

  update(dt: number, time: number) {
    const p = this.target;
    const k = this.stiff;
    const d = 2 * Math.sqrt(k);
    const tx = p.pos[0] * this.side,
      ty = p.pos[1],
      tz = p.pos[2];
    this.posV.x += ((tx - this.pos.x) * k - this.posV.x * d) * dt;
    this.posV.y += ((ty - this.pos.y) * k - this.posV.y * d) * dt;
    this.posV.z += ((tz - this.pos.z) * k - this.posV.z * d) * dt;
    this.pos.addScaledVector(this.posV, dt);
    const rx = p.rot[0],
      ry = p.rot[1] * this.side,
      rz = p.rot[2] * this.side;
    this.rotV.x += ((rx - this.rot.x) * k - this.rotV.x * d) * dt;
    this.rotV.y += ((ry - this.rot.y) * k - this.rotV.y * d) * dt;
    this.rotV.z += ((rz - this.rot.z) * k - this.rotV.z * d) * dt;
    this.rot.addScaledVector(this.rotV, dt);
    const ck = Math.min(1, dt * Math.sqrt(k) * 1.6);
    for (let i = 0; i < 5; i++) this.curl[i] += (p.curl[i] - this.curl[i]) * ck;
    this.spread += (p.spread - this.spread) * ck;

    // impulse springs
    const ik = 260,
      id = 2 * Math.sqrt(ik) * 0.7;
    this.offsetV.addScaledVector(this.offset, -ik * dt).multiplyScalar(Math.max(0, 1 - id * dt));
    this.offset.addScaledVector(this.offsetV, dt);
    this.rotOffsetV.addScaledVector(this.rotOffset, -ik * dt).multiplyScalar(Math.max(0, 1 - id * dt));
    this.rotOffset.addScaledVector(this.rotOffsetV, dt);

    const breath = Math.sin(time * 1.6 + this.side) * 0.004;
    const sh = this.shake;
    this.root.position.set(
      this.pos.x + this.offset.x + (Math.random() - 0.5) * sh * 0.02,
      this.pos.y + this.offset.y + breath + (Math.random() - 0.5) * sh * 0.02,
      this.pos.z + this.offset.z
    );
    this.root.rotation.set(this.rot.x + this.rotOffset.x, this.rot.y + this.rotOffset.y, this.rot.z + this.rotOffset.z, "YXZ");

    // fingers
    const segA = [1.25, 1.55, 1.1];
    for (let f = 0; f < 5; f++) {
      const c = Math.max(-0.2, Math.min(1.2, this.curl[f] + this.twitch[f]));
      const segs = this.fingers[f];
      if (f === 0) {
        segs[0].rotation.set(-c * 0.5, 0, 0);
        segs[1].rotation.set(-c * 0.8, 0, 0);
        segs[2].rotation.set(-c * 0.9, 0, 0);
        segs[0].rotation.y = (-0.15 - c * 0.5) * this.side;
      } else {
        const sp = (f - 2.5) * 0.12 * this.spread * this.side;
        segs[0].rotation.set(-c * segA[0], sp, 0);
        segs[1].rotation.set(-c * segA[1], 0, 0);
        segs[2].rotation.set(-c * segA[2], 0, 0);
      }
    }

    // feather flutter
    for (let i = 0; i < this.featherData.length; i++) {
      const fd = this.featherData[i];
      const a = Math.sin(time * 3 + fd.phase) * 0.12 + Math.sin(time * 7.3 + fd.phase * 2) * 0.05 + sh * (Math.random() - 0.5) * 0.4;
      this.e.set(a, 0, a * 0.6);
      this.q.setFromEuler(this.e).premultiply(fd.quat);
      this.sv.setScalar(fd.scale);
      this.m4.compose(fd.pos, this.q, this.sv);
      this.feathers.setMatrixAt(i, this.m4);
    }
    this.feathers.instanceMatrix.needsUpdate = true;
  }
}

export class Hands {
  group = new THREE.Group();
  R: Hand;
  L: Hand;
  sway = new THREE.Vector2();
  swayV = new THREE.Vector2();
  time = 0;
  light: THREE.PointLight;

  constructor() {
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.55, metalness: 0.0 });
    skin.onBeforeCompile = (sh) => {
      // cheap subsurface-ish rim
      sh.fragmentShader = sh.fragmentShader.replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float rim_ = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.5);
        gl_FragColor.rgb += vec3(1.0,0.35,0.3) * rim_ * 0.35;`
      );
    };
    const nail = new THREE.MeshStandardMaterial({ color: 0xf0c4b0, roughness: 0.25 });
    const feather = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0x5a0a30),
      emissiveIntensity: 0.6,
    });
    const sleeve = new THREE.MeshStandardMaterial({ color: 0xd8317e, roughness: 0.9, side: THREE.DoubleSide });
    this.R = new Hand(1, skin, nail, feather, sleeve);
    this.L = new Hand(-1, skin, nail, feather, sleeve);
    this.R.snapTo(POSES.idle);
    this.L.snapTo(POSES.idle);
    this.group.add(this.R.root, this.L.root);
    this.light = new THREE.PointLight(0xffd0c0, 1.5, 3, 1.5);
    this.light.position.set(0.1, 0.3, 0.1);
    this.group.add(this.light);
  }

  pose(name: keyof typeof POSES | Pose, which: "R" | "L" | "both" = "both", stiff = 90) {
    const p = typeof name === "string" ? POSES[name] : name;
    if (which !== "L") this.R.setPose(p, stiff);
    if (which !== "R") this.L.setPose(p, stiff);
  }

  tipsWorld(which: "R" | "L", out: THREE.Vector3[]) {
    const h = which === "R" ? this.R : this.L;
    while (out.length < 5) out.push(new THREE.Vector3());
    for (let i = 0; i < 5; i++) h.tips[i].getWorldPosition(out[i]);
    return out;
  }

  update(dt: number, mouseDelta: THREE.Vector2) {
    this.time += dt;
    // sway spring
    this.swayV.x += (-mouseDelta.x * 0.6 - this.sway.x * 60 - this.swayV.x * 12) * dt;
    this.swayV.y += (mouseDelta.y * 0.6 - this.sway.y * 60 - this.swayV.y * 12) * dt;
    this.sway.addScaledVector(this.swayV, dt);
    this.group.position.set(this.sway.x * 0.05, this.sway.y * 0.05, 0);
    this.group.rotation.set(this.sway.y * 0.1, this.sway.x * 0.15, 0);
    this.R.update(dt, this.time);
    this.L.update(dt, this.time);
  }
}
