import * as THREE from "three";
import { heartGeometry } from "./textures";

type V3 = [number, number, number];
interface ArmPose {
  p: V3;
  r: V3;
  w: V3;
  c: number;
}
export interface Pose {
  R: ArmPose;
  L: ArmPose;
}

const mirror = (a: ArmPose): ArmPose => ({ p: [-a.p[0], a.p[1], a.p[2]], r: [a.r[0], -a.r[1], -a.r[2]], w: [a.w[0], -a.w[1], -a.w[2]], c: a.c });
const sym = (r: ArmPose): Pose => ({ R: r, L: mirror(r) });

const IDLE_R: ArmPose = { p: [0.3, -0.3, 0.02], r: [0.42, 0.22, -0.55], w: [0.15, 0, 0], c: 0.35 };

export const POSES: Record<string, Pose> = {
  idle: sym(IDLE_R),
  run: sym({ p: [0.3, -0.36, 0.08], r: [0.2, 0.15, -0.6], w: [0.1, 0, 0], c: 0.6 }),
  kissPrep: {
    R: { p: [0.17, -0.28, 0.05], r: [0.8, 0.55, -1.25], w: [0.65, 0, 0], c: 0.55 },
    L: mirror({ p: [0.32, -0.36, 0.05], r: [0.3, 0.15, -0.6], w: [0.1, 0, 0], c: 0.4 }),
  },
  kissRelease: {
    R: { p: [0.2, -0.27, -0.02], r: [0.32, 0.3, -2.7], w: [0.35, 0, 0], c: 0.02 },
    L: mirror({ p: [0.32, -0.36, 0.05], r: [0.3, 0.15, -0.6], w: [0.1, 0, 0], c: 0.4 }),
  },
  heart: sym({ p: [0.2, -0.3, 0.0], r: [0.66, 0.46, -0.35], w: [1.05, 0, 0.1], c: 0.62 }),
  mellowFire: sym({ p: [0.2, -0.27, -0.1], r: [0.6, 0.42, -0.3], w: [1.1, 0, 0.1], c: 0.55 }),
  arrowDraw: {
    L: { p: [-0.22, -0.28, 0.0], r: [0.36, -0.36, 1.45], w: [0.0, 0, 0], c: 0.12 },
    R: { p: [0.38, -0.2, 0.16], r: [0.2, 0.86, -1.5], w: [0.1, 0, 0], c: 0.85 },
  },
  arrowRelease: {
    L: { p: [-0.22, -0.28, -0.04], r: [0.38, -0.34, 1.45], w: [-0.2, 0, 0], c: 0.02 },
    R: { p: [0.45, -0.22, 0.22], r: [0.35, 0.1, -1.1], w: [0.2, 0, 0], c: 0.0 },
  },
  kick: sym({ p: [0.44, -0.24, 0.08], r: [0.65, -0.35, -1.3], w: [0.3, 0, 0], c: 0.1 }),
  haki: {
    R: { p: [0.18, -0.27, -0.02], r: [0.38, 0.12, -1.45], w: [1.25, 0, 0], c: 0.05 },
    L: mirror({ p: [0.34, -0.4, 0.08], r: [0.2, 0.15, -0.7], w: [0.1, 0, 0], c: 0.5 }),
  },
};

class Arm {
  root = new THREE.Group();
  wrist = new THREE.Group();
  fingers: { a: THREE.Group; b: THREE.Group }[] = [];
  thumb: { a: THREE.Group; b: THREE.Group };
  cur: ArmPose;

  constructor(s: number, skin: THREE.Material, nail: THREE.Material, gold: THREE.Material) {
    const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.044, 0.42, 20, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.21), skin);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.052, 0.4, 20).rotateX(-Math.PI / 2).translate(0, 0, 0.2), skin);
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 12), skin);
    this.root.add(fore, upper, elbow);
    // gold bangles
    for (const [z, r] of [
      [-0.36, 0.034],
      [-0.335, 0.035],
      [-0.3, 0.036],
    ] as const) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0055, 8, 28), gold);
      b.position.z = z;
      this.root.add(b);
    }
    this.wrist.position.z = -0.42;
    this.root.add(this.wrist);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin);
    palm.scale.set(0.04, 0.016, 0.05);
    palm.position.z = -0.045;
    this.wrist.add(palm);
    const fx = [-0.025, -0.0085, 0.0085, 0.024];
    const fl = [
      [0.03, 0.026],
      [0.034, 0.028],
      [0.031, 0.026],
      [0.024, 0.02],
    ];
    const seg = (len: number, r: number, withNail: boolean) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10).rotateX(-Math.PI / 2).translate(0, 0, -len / 2), skin);
      g.add(m);
      if (withNail) {
        const n = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), nail);
        n.scale.set(r * 0.95, r * 0.45, r * 1.5);
        n.position.set(0, r * 0.62, -len - r * 0.15);
        g.add(n);
      }
      return g;
    };
    for (let i = 0; i < 4; i++) {
      const r = i === 3 ? 0.0078 : 0.0088;
      const a = seg(fl[i][0], r, false);
      const b = seg(fl[i][1], r * 0.92, true);
      b.position.z = -fl[i][0];
      a.add(b);
      a.position.set(fx[i] * s, 0, -0.088 + Math.abs(i - 1.3) * 0.004);
      a.rotation.y = -fx[i] * s * 2.2;
      this.wrist.add(a);
      this.fingers.push({ a, b });
    }
    const ta = seg(0.026, 0.0105, false);
    const tb = seg(0.022, 0.0098, true);
    tb.position.z = -0.026;
    ta.add(tb);
    ta.position.set(-0.034 * s, -0.006, -0.02);
    ta.rotation.set(-0.2, 0.75 * s, 0.5 * s);
    this.wrist.add(ta);
    this.thumb = { a: ta, b: tb };
    this.cur = JSON.parse(JSON.stringify(IDLE_R));
    this.root.traverse((o) => {
      o.frustumCulled = false;
      if ((o as THREE.Mesh).isMesh) {
        (o as THREE.Mesh).renderOrder = 2;
      }
    });
  }

  apply(target: ArmPose, k: number, s: number) {
    const c = this.cur;
    for (let i = 0; i < 3; i++) {
      c.p[i] += (target.p[i] - c.p[i]) * k;
      c.r[i] += (target.r[i] - c.r[i]) * k;
      c.w[i] += (target.w[i] - c.w[i]) * k;
    }
    c.c += (target.c - c.c) * k;
    this.root.position.set(c.p[0], c.p[1], c.p[2]);
    this.root.rotation.set(c.r[0], c.r[1], c.r[2]);
    this.wrist.rotation.set(c.w[0], c.w[1], c.w[2]);
    this.fingers.forEach((f, i) => {
      const cc = c.c * (1 + i * 0.08);
      f.a.rotation.x = -cc * 1.35;
      f.b.rotation.x = -cc * 1.6;
    });
    this.thumb.a.rotation.x = -0.2 - c.c * 0.5;
    this.thumb.b.rotation.x = -c.c * 0.9;
    void s;
  }
}

export class ViewModel {
  group = new THREE.Group();
  R: Arm;
  L: Arm;
  leg = new THREE.Group();
  legInner = new THREE.Group();
  pose: Pose = POSES.idle;
  speed = 10;
  heart: THREE.Mesh;
  heartGlow: THREE.Sprite;
  bowHeart: THREE.Mesh;
  bowGlow: THREE.Sprite;
  heartAmt = 0;
  heartTarget = 0;
  bowAmt = 0;
  bowTarget = 0;
  kickT = -1;
  sway = new THREE.Vector2();
  bobT = 0;
  recoil = 0;
  hakiAura = 0;
  skin: THREE.MeshPhysicalMaterial;

  constructor(glowTex: THREE.Texture) {
    this.skin = new THREE.MeshPhysicalMaterial({
      color: 0xf6d2bb,
      roughness: 0.42,
      metalness: 0,
      sheen: 0.6,
      sheenColor: new THREE.Color(0xffb0c8),
      sheenRoughness: 0.5,
      clearcoat: 0.15,
      clearcoatRoughness: 0.6,
      emissive: new THREE.Color(0xff3080),
      emissiveIntensity: 0,
    });
    const nail = new THREE.MeshPhysicalMaterial({ color: 0xc8102e, roughness: 0.15, clearcoat: 1, metalness: 0.1 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc94d, metalness: 1, roughness: 0.22, emissive: 0x442200, emissiveIntensity: 0.4 });
    this.R = new Arm(1, this.skin, nail, gold);
    this.L = new Arm(-1, this.skin, nail, gold);
    this.group.add(this.R.root, this.L.root);

    // Heart between hands (Mellow)
    const hm = new THREE.MeshStandardMaterial({ color: 0xff4f9a, emissive: 0xff2d7a, emissiveIntensity: 3, roughness: 0.2, transparent: true, opacity: 0.95 });
    this.heart = new THREE.Mesh(heartGeometry(0.16, 0.25), hm);
    this.heart.position.set(0, -0.06, -0.36);
    this.heart.renderOrder = 3;
    this.heartGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3f8e, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.heartGlow.position.copy(this.heart.position);
    this.group.add(this.heart, this.heartGlow);
    // Heart on bow hand (Slave Arrow)
    this.bowHeart = new THREE.Mesh(heartGeometry(0.22, 0.2), hm.clone());
    this.bowHeart.position.set(-0.05, -0.08, -0.5);
    this.bowGlow = new THREE.Sprite(this.heartGlow.material.clone());
    this.bowGlow.position.copy(this.bowHeart.position);
    this.group.add(this.bowHeart, this.bowGlow);

    // Leg for Perfume Femur
    const legLen = 1.2;
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, legLen * 0.5, 6, 16).translate(0, -legLen * 0.3, 0), this.skin);
    thigh.scale.set(1, 1, 0.95);
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, legLen * 0.45, 6, 16).translate(0, -legLen * 0.25, 0), this.skin);
    const shinG = new THREE.Group();
    shinG.position.y = -legLen * 0.58;
    shinG.add(shin);
    const shoeM = new THREE.MeshPhysicalMaterial({ color: 0xb3001e, roughness: 0.18, clearcoat: 1, metalness: 0.2 });
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.17, 4, 12).rotateX(Math.PI / 2 - 0.35), shoeM);
    shoe.position.set(0, -legLen * 0.52, -0.07);
    const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.007, 0.13, 8), shoeM);
    heel.position.set(0, -legLen * 0.58, 0.04);
    const anklet = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 24).rotateX(Math.PI / 2), gold);
    anklet.position.y = -legLen * 0.44;
    shinG.add(shoe, heel, anklet);
    // silk skirt slit drape
    const silk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.2, 0.55, 20, 1, true, 0, Math.PI * 1.1).translate(0, -0.2, 0),
      new THREE.MeshPhysicalMaterial({ color: 0x9a0f2f, roughness: 0.3, sheen: 1, sheenColor: new THREE.Color(0xff6699), side: THREE.DoubleSide })
    );
    silk.rotation.y = Math.PI * 0.45;
    this.legInner.add(thigh, shinG, silk);
    this.leg.add(this.legInner);
    this.leg.position.set(0.14, -0.78, 0.2);
    this.leg.visible = false;
    this.group.add(this.leg);
    this.leg.traverse((o) => (o.frustumCulled = false));
  }

  setPose(name: string, speed = 10) {
    this.pose = POSES[name];
    this.speed = speed;
  }

  startKick() {
    this.kickT = 0;
    this.leg.visible = true;
  }

  update(dt: number, time: number, moving: number, mouseDX: number, mouseDY: number) {
    const k = 1 - Math.exp(-this.speed * dt);
    // sway lag from mouse look
    this.sway.x += (-mouseDX * 0.0006 - this.sway.x) * Math.min(1, dt * 8);
    this.sway.y += (mouseDY * 0.0006 - this.sway.y) * Math.min(1, dt * 8);
    this.sway.clampLength(0, 0.06);
    this.bobT += dt * (4 + moving * 7);
    const bobA = 0.004 + moving * 0.014;
    this.R.apply(this.pose.R, k, 1);
    this.L.apply(this.pose.L, k, -1);
    this.recoil *= Math.exp(-dt * 10);
    this.group.position.set(
      this.sway.x + Math.cos(this.bobT) * bobA,
      this.sway.y - Math.abs(Math.sin(this.bobT)) * bobA + Math.sin(time * 1.6) * 0.004,
      this.recoil * 0.08
    );
    this.group.rotation.z = this.sway.x * 1.5;

    // heart gizmos
    this.heartAmt += (this.heartTarget - this.heartAmt) * Math.min(1, dt * 8);
    const ha = this.heartAmt;
    this.heart.visible = ha > 0.01;
    this.heartGlow.visible = ha > 0.01;
    const pulse = 1 + Math.sin(time * 18) * 0.06;
    this.heart.scale.setScalar(ha * pulse);
    this.heart.rotation.y = Math.sin(time * 3) * 0.3;
    this.heartGlow.scale.setScalar(0.5 * ha * pulse);
    this.bowAmt += (this.bowTarget - this.bowAmt) * Math.min(1, dt * 10);
    const ba = this.bowAmt;
    this.bowHeart.visible = this.bowGlow.visible = ba > 0.01;
    this.bowHeart.scale.setScalar(Math.max(0.01, ba) * pulse);
    this.bowHeart.rotation.z = time * 2;
    this.bowGlow.scale.setScalar(0.6 * ba * pulse);
    this.skin.emissiveIntensity = Math.max(ha, ba) * 0.25 + this.hakiAura * 0.3;
    this.skin.emissive.set(this.hakiAura > 0.05 ? 0xff1030 : 0xff3080);

    // kick
    if (this.kickT >= 0) {
      this.kickT += dt;
      const t = this.kickT;
      let rx = 0,
        ry = 0,
        rz = 0;
      if (t < 0.1) {
        const a = t / 0.1;
        rx = 0.4 * a;
        ry = -0.7 * a;
        rz = -0.3 * a;
      } else if (t < 0.26) {
        const a = (t - 0.1) / 0.16;
        const e = 1 - Math.pow(1 - a, 3);
        rx = 0.4 + 1.9 * e;
        ry = -0.7 + 1.1 * e;
        rz = -0.3 + 0.2 * e;
      } else if (t < 0.4) {
        rx = 2.3;
        ry = 0.4 + (t - 0.26) * 0.8;
        rz = -0.1;
      } else if (t < 0.65) {
        const a = (t - 0.4) / 0.25;
        rx = 2.3 * (1 - a * a);
        ry = 0.5 * (1 - a);
        rz = -0.1 * (1 - a);
      } else {
        this.kickT = -1;
        this.leg.visible = false;
      }
      this.leg.rotation.set(rx, ry, rz, "YXZ");
    }
  }
}
