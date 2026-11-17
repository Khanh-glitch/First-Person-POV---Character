import * as THREE from 'three';
import { clamp, rand, TAU } from './util';

/* ---------------- procedural hull loft ---------------- */

function section(z: number) {
  const t = clamp((z + 18) / 36);
  let wf: number;
  if (t < 0.12) wf = 0.78 + (t / 0.12) * 0.22;
  else if (t < 0.62) wf = 1;
  else wf = 1 - Math.pow((t - 0.62) / 0.38, 1.7) * 0.95;
  const w = 5.4 * wf;
  const sheer = t > 0.72 ? Math.pow((t - 0.72) / 0.28, 2) * 2.6 : 0;
  const stern = t < 0.22 ? ((0.22 - t) / 0.22) * 1.9 : 0;
  const top = 3.2 + sheer + stern;
  const keel = -2.6 + (t > 0.75 ? Math.pow((t - 0.75) / 0.25, 1.6) * 4.6 : 0) + (t < 0.1 ? (0.1 - t) * 10 : 0);
  return { w, top, keel };
}

function poly(z: number): [number, number][] {
  const { w, top, keel } = section(z);
  return [
    [-w, top],
    [-w, top - 0.8],
    [-w * 0.99, 0.2],
    [-w * 0.72, keel * 0.5],
    [-w * 0.25, keel],
    [w * 0.25, keel],
    [w * 0.72, keel * 0.5],
    [w * 0.99, 0.2],
    [w, top - 0.8],
    [w, top],
  ];
}

const EDGE_COL = [0xc79a45, 0x5d3a22, 0x3f2819, 0x20150e, 0x1b110b, 0x20150e, 0x3f2819, 0x5d3a22, 0xc79a45, 0xa6845a];

function loft(z0: number, z1: number, n: number) {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const pushTri = (a: number[], b: number[], d: number[], color: number, jitter: number) => {
    c.setHex(color);
    const j = 1 + (Math.random() - 0.5) * jitter;
    for (const p of [a, b, d]) {
      pos.push(p[0], p[1], p[2]);
      col.push(c.r * j, c.g * j, c.b * j);
    }
  };
  for (let i = 0; i < n; i++) {
    const za = z0 + ((z1 - z0) * i) / n;
    const zb = z0 + ((z1 - z0) * (i + 1)) / n;
    const pa = poly(za);
    const pb = poly(zb);
    for (let k = 0; k < 10; k++) {
      const k2 = (k + 1) % 10;
      const a = [pa[k][0], pa[k][1], za];
      const b = [pa[k2][0], pa[k2][1], za];
      const d = [pb[k][0], pb[k][1], zb];
      const e = [pb[k2][0], pb[k2][1], zb];
      pushTri(a, b, d, EDGE_COL[k], 0.18);
      pushTri(b, e, d, EDGE_COL[k], 0.18);
    }
  }
  const cap = (z: number, flip: boolean) => {
    const p = poly(z);
    let cy = 0;
    for (const q of p) cy += q[1];
    cy /= p.length;
    for (let k = 0; k < 10; k++) {
      const q1 = p[k];
      const q2 = p[(k + 1) % 10];
      const a = [0, cy, z];
      const b = [q1[0], q1[1], z];
      const d = [q2[0], q2[1], z];
      if (flip) pushTri(a, d, b, 0x4a2f1c, 0.1);
      else pushTri(a, b, d, 0x4a2f1c, 0.1);
    }
  };
  cap(z0, false);
  cap(z1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/* ---------------- textures ---------------- */

function skull(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineCap = 'round';
  // crossbones
  g.lineWidth = s * 0.11;
  g.beginPath();
  g.moveTo(-s * 0.7, s * 0.55); g.lineTo(s * 0.7, -s * 0.05);
  g.moveTo(s * 0.7, s * 0.55); g.lineTo(-s * 0.7, -s * 0.05);
  g.stroke();
  for (const [x, y] of [[-0.74, 0.58], [0.74, 0.58], [-0.74, -0.08], [0.74, -0.08]]) {
    g.beginPath(); g.arc(x * s, y * s, s * 0.09, 0, TAU); g.fill();
  }
  // cranium + jaw
  g.beginPath(); g.ellipse(0, -s * 0.15, s * 0.42, s * 0.4, 0, 0, TAU); g.fill();
  g.beginPath(); g.roundRect(-s * 0.24, s * 0.12, s * 0.48, s * 0.3, s * 0.07); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.ellipse(-s * 0.16, -s * 0.12, s * 0.1, s * 0.12, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(s * 0.16, -s * 0.12, s * 0.1, s * 0.12, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(0, s * 0.02); g.lineTo(-s * 0.05, s * 0.12); g.lineTo(s * 0.05, s * 0.12); g.fill();
  for (let i = -2; i <= 2; i++) g.fillRect(i * s * 0.09 - s * 0.012, s * 0.2, s * 0.024, s * 0.2);
  g.restore();
}

function sailTexture(emblem: boolean, flag = false) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = flag ? '#14110f' : '#e9dcc0';
  g.fillRect(0, 0, 256, 256);
  if (!flag) {
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 60},${60 + Math.random() * 40},30,${Math.random() * 0.1})`;
      g.fillRect(Math.random() * 256, Math.random() * 256, Math.random() * 18, Math.random() * 3);
    }
    g.strokeStyle = 'rgba(110,80,40,0.35)';
    g.lineWidth = 1.2;
    for (let y = 32; y < 256; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke();
    }
    g.fillStyle = 'rgba(120,70,40,0.35)';
    g.fillRect(30, 180, 40, 36);
    g.fillRect(190, 40, 30, 30);
  }
  if (emblem) {
    g.globalCompositeOperation = 'source-over';
    const tmp = document.createElement('canvas');
    tmp.width = 256; tmp.height = 256;
    const tg = tmp.getContext('2d')!;
    skull(tg, 128, 118, 112, flag ? '#efe6d0' : '#1b1612');
    g.drawImage(tmp, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ---------------- ship ---------------- */

let shared: {
  wood: THREE.MeshStandardMaterial;
  hull: THREE.MeshStandardMaterial;
  cabin: THREE.MeshStandardMaterial;
  sailPlain: THREE.MeshStandardMaterial;
  sailSkull: THREE.MeshStandardMaterial;
  flag: THREE.MeshStandardMaterial;
  lamp: THREE.MeshBasicMaterial;
  box: THREE.BoxGeometry;
  cyl: THREE.CylinderGeometry;
} | null = null;

function getShared() {
  if (shared) return shared;
  const sailMat = (map: THREE.Texture) =>
    new THREE.MeshStandardMaterial({
      map,
      roughness: 0.92,
      side: THREE.DoubleSide,
      emissive: new THREE.Color(0.55, 0.3, 0.12),
      emissiveMap: map,
      emissiveIntensity: 0.55,
    });
  shared = {
    wood: new THREE.MeshStandardMaterial({ color: 0x5a3b26, roughness: 0.9 }),
    hull: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, side: THREE.DoubleSide }),
    cabin: new THREE.MeshStandardMaterial({ color: 0x74502f, roughness: 0.85 }),
    sailPlain: sailMat(sailTexture(false)),
    sailSkull: sailMat(sailTexture(true)),
    flag: new THREE.MeshStandardMaterial({ map: sailTexture(true, true), side: THREE.DoubleSide, roughness: 0.9 }),
    lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 2.1, 0.8), toneMapped: false }),
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  };
  return shared;
}

function sailGeo(w: number, h: number, bulge: number) {
  const g = new THREE.PlaneGeometry(w, h, 8, 8);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / w + 0.5;
    const y = p.getY(i) / h + 0.5;
    const z = Math.sin(Math.PI * x) * Math.sin(Math.PI * Math.min(1, y * 1.05)) * bulge + Math.sin(x * 14 + y * 5) * 0.08;
    p.setZ(i, z);
  }
  g.computeVertexNormals();
  return g;
}

function mast(z: number, height: number, sails: { w: number; h: number; y: number; skull?: boolean }[]) {
  const s = getShared();
  const g = new THREE.Group();
  g.position.z = z;
  const m = new THREE.Mesh(s.cyl, s.wood);
  m.scale.set(0.46, height, 0.46);
  m.position.y = height / 2 + 2;
  g.add(m);
  for (const sl of sails) {
    const sail = new THREE.Mesh(sailGeo(sl.w, sl.h, 1.5), sl.skull ? s.sailSkull : s.sailPlain);
    sail.position.set(0, sl.y + sl.h / 2, 0.9);
    g.add(sail);
    const yard = new THREE.Mesh(s.cyl, s.wood);
    yard.scale.set(0.26, sl.w + 1.6, 0.26);
    yard.rotation.z = Math.PI / 2;
    yard.position.set(0, sl.y + sl.h, 0.9);
    g.add(yard);
  }
  return g;
}

export interface ShipParts {
  hullStern: THREE.Object3D;
  hullBow: THREE.Object3D;
  extras: THREE.Object3D[];
}

export function buildShip() {
  const s = getShared();
  const group = new THREE.Group();
  const hullStern = new THREE.Mesh(loft(-18, 0, 7), s.hull);
  const hullBow = new THREE.Mesh(loft(0, 18, 7), s.hull);
  group.add(hullStern, hullBow);
  const extras: THREE.Object3D[] = [];

  const cabin = new THREE.Group();
  const cb = new THREE.Mesh(s.box, s.cabin);
  cb.scale.set(8.4, 3.6, 7.5);
  cb.position.set(0, 5.4, -13);
  cabin.add(cb);
  const roof = new THREE.Mesh(s.box, s.wood);
  roof.scale.set(9, 0.4, 8.2);
  roof.position.set(0, 7.4, -13);
  cabin.add(roof);
  for (let i = -1; i <= 1; i++) {
    const w = new THREE.Mesh(s.box, s.lamp);
    w.scale.set(1.1, 1.1, 0.2);
    w.position.set(i * 2.4, 5.6, -9.2);
    cabin.add(w);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), s.lamp);
  lamp.position.set(0, 8.4, -16.6);
  cabin.add(lamp);
  group.add(cabin);
  extras.push(cabin);

  const mainMast = mast(3, 26, [
    { w: 11.5, h: 9.5, y: 8, skull: true },
    { w: 8.5, h: 6.5, y: 18.5 },
  ]);
  const foreMast = mast(11.5, 20, [
    { w: 9.5, h: 7.5, y: 7 },
    { w: 6.5, h: 5, y: 15.5 },
  ]);
  const mizzen = mast(-7, 17, [{ w: 7.5, h: 6.5, y: 7.5 }]);
  group.add(mainMast, foreMast, mizzen);
  extras.push(mainMast, foreMast, mizzen);

  const flagPole = new THREE.Group();
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.2, 6, 1), s.flag);
  flag.position.set(0, 30.2, 3 - 2.5);
  flag.rotation.y = Math.PI / 2;
  const fp = flag.geometry.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 1.6) * 0.35);
  flagPole.add(flag);
  group.add(flagPole);
  extras.push(flagPole);

  const bow = new THREE.Mesh(s.cyl, s.wood);
  bow.scale.set(0.5, 11, 0.5);
  bow.position.set(0, 5.4, 22);
  bow.rotation.x = Math.PI / 2 - 0.35;
  group.add(bow);
  extras.push(bow);

  group.scale.setScalar(1.6);
  return { group, parts: { hullStern, hullBow, extras } as ShipParts };
}

export class Ship {
  root = new THREE.Group();
  group: THREE.Group;
  parts: ShipParts;
  hp = 100;
  alive = true;
  heading = 0;
  phase = rand(0, 10);
  slot: number;
  home = new THREE.Vector3();
  enter = 0; // 0 → 1 sailing in
  enterFrom = new THREE.Vector3();
  inv = new THREE.Matrix4();
  box = new THREE.Box3(new THREE.Vector3(-8, -3, -21), new THREE.Vector3(8, 29, 24));
  shake = 0;
  burnAcc = 0;

  constructor(slot: number, home: THREE.Vector3, heading: number, enterFrom: THREE.Vector3) {
    const b = buildShip();
    this.group = b.group;
    this.parts = b.parts;
    this.slot = slot;
    this.home.copy(home);
    this.heading = heading;
    this.enterFrom.copy(enterFrom);
    this.root.add(this.group);
    this.root.position.copy(enterFrom);
    this.root.rotation.y = heading;
  }

  get center() {
    return this.root.position.clone().add(new THREE.Vector3(0, 12, 0));
  }

  update(dt: number, t: number) {
    if (this.enter < 1) {
      this.enter = Math.min(1, this.enter + dt / 7);
      const e = 1 - Math.pow(1 - this.enter, 2.2);
      this.root.position.lerpVectors(this.enterFrom, this.home, e);
    }
    this.shake = Math.max(0, this.shake - dt * 3);
    const sh = this.shake;
    const p = this.phase;
    this.root.position.y = Math.sin(t * 0.9 + p) * 0.7 + (Math.random() - 0.5) * sh * 0.6;
    this.root.rotation.z = Math.sin(t * 0.7 + p) * 0.035 + (Math.random() - 0.5) * sh * 0.02;
    this.root.rotation.x = Math.sin(t * 0.6 + p * 1.3) * 0.022;
    this.root.updateMatrixWorld(true);
    this.inv.copy(this.group.matrixWorld).invert();
  }

  /** ray vs ship box. returns distance or null */
  intersect(origin: THREE.Vector3, dir: THREE.Vector3, ray: THREE.Ray, out: THREE.Vector3): number | null {
    ray.origin.copy(origin).applyMatrix4(this.inv);
    ray.direction.copy(dir).transformDirection(this.inv);
    const hit = ray.intersectBox(this.box, out);
    if (!hit) return null;
    out.applyMatrix4(this.group.matrixWorld);
    return out.distanceTo(origin);
  }
}
