import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rand, randS } from "./util";

export const REST = 0, FREE = 1, ATTRACT = 2, LOCKED = 3;
const GRAV = -24;

/* ---------------- geometry library (long axis = Z, flat normal = Y) ---------------- */
function gearGeo() {
  const sh = new THREE.Shape();
  const teeth = 10, ro = 0.62, ri = 0.48;
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 < 2 ? ro : ri;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.17, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -0.08);
  g.rotateX(Math.PI / 2);
  return g;
}
function swordGeo() {
  const blade = new THREE.BoxGeometry(0.11, 0.025, 1.6);
  blade.translate(0, 0, 0.35);
  const guard = new THREE.BoxGeometry(0.42, 0.05, 0.07);
  guard.translate(0, 0, -0.47);
  const grip = new THREE.BoxGeometry(0.06, 0.06, 0.36);
  grip.translate(0, 0, -0.68);
  return mergeGeometries([blade, guard, grip])!;
}
function ibeamGeo() {
  const a = new THREE.BoxGeometry(0.3, 0.05, 2.8);
  a.translate(0, 0.14, 0);
  const b = new THREE.BoxGeometry(0.3, 0.05, 2.8);
  b.translate(0, -0.14, 0);
  const c = new THREE.BoxGeometry(0.05, 0.26, 2.8);
  return mergeGeometries([a, b, c])!;
}
function plateGeo() {
  const a = new THREE.BoxGeometry(1.35, 0.07, 0.95);
  const r1 = new THREE.BoxGeometry(0.1, 0.12, 0.1);
  r1.translate(0.55, 0.02, 0.35);
  const r2 = r1.clone().translate(-1.1, 0, 0);
  const r3 = r1.clone().translate(0, 0, -0.7);
  const r4 = r2.clone().translate(0, 0, -0.7);
  return mergeGeometries([a, r1, r2, r3, r4])!;
}
function alongZ(g: THREE.BufferGeometry) {
  g.rotateX(Math.PI / 2);
  return g;
}

const PALETTE = [0x8d939c, 0x8d939c, 0x5d6068, 0x5d6068, 0x3b3e45, 0x7c4a2c, 0x8a5a36, 0xa8873a, 0x6d2420, 0x9aa3ad, 0x4b4f58];

export interface Formation {
  idx: Int32Array;
  bone: THREE.Object3D;
  locked: number;
}

export class ScrapSystem {
  N: number;
  meshes: THREE.InstancedMesh[] = [];
  type: Uint8Array; inst: Uint16Array;
  p: Float32Array; v: Float32Array; q: Float32Array; w: Float32Array; sc: Float32Array;
  mode: Uint8Array; boneIdx: Int16Array;
  lp: Float32Array; lq: Float32Array;
  delay: Float32Array; age: Float32Array; settle: Float32Array; gain: Float32Array;
  form: (Formation | null)[];
  bones: THREE.Object3D[] = [];
  boneQ: THREE.Quaternion[] = [];
  onLock: ((i: number, x: number, y: number, z: number) => void) | null = null;
  onLift: ((x: number, y: number, z: number) => void) | null = null;
  onGround: ((x: number, y: number, z: number, speed: number) => void) | null = null;
  material: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene) {
    const geos: [THREE.BufferGeometry, number][] = [
      [ibeamGeo(), 250],
      [plateGeo(), 340],
      [gearGeo(), 190],
      [swordGeo(), 220],
      [new THREE.IcosahedronGeometry(0.36, 1), 130],
      [alongZ(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 8)), 200],
      [alongZ(new THREE.CylinderGeometry(0.3, 0.44, 2.0, 10)), 80],
      [alongZ(new THREE.TorusGeometry(0.44, 0.11, 6, 12)), 90],
    ];
    this.N = geos.reduce((s, g) => s + g[1], 0);
    const N = this.N;
    this.type = new Uint8Array(N); this.inst = new Uint16Array(N);
    this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3);
    this.q = new Float32Array(N * 4); this.w = new Float32Array(N * 3); this.sc = new Float32Array(N);
    this.mode = new Uint8Array(N); this.boneIdx = new Int16Array(N).fill(-1);
    this.lp = new Float32Array(N * 3); this.lq = new Float32Array(N * 4);
    this.delay = new Float32Array(N); this.age = new Float32Array(N); this.settle = new Float32Array(N);
    this.gain = new Float32Array(N).fill(1);
    this.form = new Array(N).fill(null);

    this.material = new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.52, flatShading: true });
    const heaps: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + randS(0.25);
      const r = rand(9, 44);
      heaps.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const col = new THREE.Color();
    const qq = new THREE.Quaternion();
    const eu = new THREE.Euler();
    let k = 0;
    geos.forEach(([geo, count], t) => {
      const mesh = new THREE.InstancedMesh(geo, this.material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      for (let j = 0; j < count; j++, k++) {
        this.type[k] = t; this.inst[k] = j;
        this.sc[k] = Math.random() < 0.06 ? rand(1.9, 2.8) : rand(0.75, 1.6);
        let x: number, z: number, y: number;
        if (Math.random() < 0.62) {
          const h = heaps[(Math.random() * heaps.length) | 0];
          const rr = Math.abs(randS(1) + randS(1)) * 3.2;
          const a = Math.random() * Math.PI * 2;
          x = h[0] + Math.cos(a) * rr; z = h[1] + Math.sin(a) * rr;
          y = Math.max(0.12, (3.4 - rr) * rand(0.1, 0.75));
          eu.set(randS(1.2), rand(6.28), randS(1.2));
        } else {
          const a = Math.random() * Math.PI * 2;
          const rr = rand(5, 70);
          x = Math.cos(a) * rr; z = Math.sin(a) * rr; y = 0.1 * this.sc[k];
          eu.set(randS(0.12), rand(6.28), randS(0.12));
        }
        if (z < -40 && Math.abs(x) < 16) x += x < 0 ? -18 : 18;
        if (x * x + z * z < 16) { x *= 3; z = z * 3 + 4; }
        this.p[k * 3] = x; this.p[k * 3 + 1] = y; this.p[k * 3 + 2] = z;
        qq.setFromEuler(eu);
        this.q[k * 4] = qq.x; this.q[k * 4 + 1] = qq.y; this.q[k * 4 + 2] = qq.z; this.q[k * 4 + 3] = qq.w;
        col.setHex(PALETTE[(Math.random() * PALETTE.length) | 0]).multiplyScalar(rand(0.7, 1.15));
        mesh.setColorAt(j, col);
      }
      mesh.instanceColor!.needsUpdate = true;
      this.meshes.push(mesh);
      scene.add(mesh);
    });
    for (let i = 0; i < N; i++) this.write(i);
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }

  private _m = new THREE.Matrix4();
  private _pos = new THREE.Vector3();
  private _quat = new THREE.Quaternion();
  private _scl = new THREE.Vector3();
  private _tq = new THREE.Quaternion();

  private write(i: number) {
    const i3 = i * 3, i4 = i * 4;
    this._pos.set(this.p[i3], this.p[i3 + 1], this.p[i3 + 2]);
    this._quat.set(this.q[i4], this.q[i4 + 1], this.q[i4 + 2], this.q[i4 + 3]);
    this._scl.setScalar(this.sc[i]);
    this._m.compose(this._pos, this._quat, this._scl);
    this.meshes[this.type[i]].setMatrixAt(this.inst[i], this._m);
  }

  private boneIndex(b: THREE.Object3D) {
    let i = this.bones.indexOf(b);
    if (i < 0) {
      i = this.bones.length;
      this.bones.push(b);
      this.boneQ.push(new THREE.Quaternion());
    }
    return i;
  }

  /** Pick up to n pieces that are not part of a formation. */
  pick(n: number): Int32Array {
    const pool: number[] = [];
    for (let i = 0; i < this.N; i++) if (this.mode[i] <= FREE) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return Int32Array.from(pool.slice(0, n));
  }

  /**
   * Magnetise pieces onto slots of a bone. slots = [x,y,z,nx,ny,nz]*n in bone space.
   * delay_i = d0 + (i/n)*span + rand*jit
   */
  assign(idx: Int32Array, bone: THREE.Object3D, slots: Float32Array, d0: number, span: number, jit: number, gain = 1): Formation {
    const bi = this.boneIndex(bone);
    const n = Math.min(idx.length, slots.length / 6);
    const f: Formation = { idx: idx.subarray(0, n), bone, locked: 0 };
    const nrm = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion();
    for (let s = 0; s < n; s++) {
      const i = idx[s];
      const s6 = s * 6;
      this.lp[i * 3] = slots[s6]; this.lp[i * 3 + 1] = slots[s6 + 1]; this.lp[i * 3 + 2] = slots[s6 + 2];
      if (Math.random() < 0.14) q1.set(randS(1), randS(1), randS(1), randS(1)).normalize();
      else {
        nrm.set(slots[s6 + 3], slots[s6 + 4], slots[s6 + 5]).normalize();
        q1.setFromUnitVectors(Y, nrm);
        q2.setFromAxisAngle(Y, rand(6.283));
        q1.multiply(q2);
      }
      this.lq[i * 4] = q1.x; this.lq[i * 4 + 1] = q1.y; this.lq[i * 4 + 2] = q1.z; this.lq[i * 4 + 3] = q1.w;
      this.mode[i] = ATTRACT;
      this.boneIdx[i] = bi;
      this.delay[i] = d0 + (s / n) * span + Math.random() * jit;
      this.age[i] = 0;
      this.gain[i] = gain;
      this.form[i] = f;
    }
    return f;
  }

  /** Release every piece on a bone. fn fills velocity. frac<1 releases a random subset. */
  release(bone: THREE.Object3D, fn: (pos: THREE.Vector3, vel: THREE.Vector3) => void, frac = 1) {
    const bi = this.bones.indexOf(bone);
    if (bi < 0) return;
    const pos = new THREE.Vector3(), vel = new THREE.Vector3();
    for (let i = 0; i < this.N; i++) {
      if (this.boneIdx[i] !== bi || this.mode[i] < ATTRACT) continue;
      if (frac < 1 && Math.random() > frac) continue;
      const i3 = i * 3;
      pos.set(this.p[i3], this.p[i3 + 1], this.p[i3 + 2]);
      vel.set(0, 0, 0);
      fn(pos, vel);
      this.v[i3] = vel.x; this.v[i3 + 1] = vel.y; this.v[i3 + 2] = vel.z;
      this.w[i3] = randS(7); this.w[i3 + 1] = randS(7); this.w[i3 + 2] = randS(7);
      this.mode[i] = FREE;
      this.boneIdx[i] = -1;
      this.form[i] = null;
    }
  }

  dropBone(bone: THREE.Object3D) {
    this.release(bone, (_p, v) => v.set(randS(3), rand(1, 4), randS(3)));
    const bi = this.bones.indexOf(bone);
    if (bi >= 0) this.bones[bi] = new THREE.Object3D(); // keep indices stable
  }

  radialImpulse(c: THREE.Vector3, radius: number, strength: number) {
    for (let i = 0; i < this.N; i++) {
      if (this.mode[i] > FREE) continue;
      const i3 = i * 3;
      const dx = this.p[i3] - c.x, dz = this.p[i3 + 2] - c.z;
      const d = Math.sqrt(dx * dx + dz * dz) + 0.001;
      if (d > radius) continue;
      const f = strength * (1 - (d / radius) * 0.75) * rand(0.6, 1.2);
      this.v[i3] += (dx / d) * f; this.v[i3 + 2] += (dz / d) * f;
      this.v[i3 + 1] += f * rand(0.25, 0.75);
      this.w[i3] = randS(9); this.w[i3 + 1] = randS(9); this.w[i3 + 2] = randS(9);
      this.mode[i] = FREE;
    }
  }

  /** Small upward jolt (ground stomps, charge-up levitation). */
  jolt(c: THREE.Vector3, radius: number, up: number) {
    for (let i = 0; i < this.N; i++) {
      if (this.mode[i] > FREE) continue;
      const i3 = i * 3;
      const dx = this.p[i3] - c.x, dz = this.p[i3 + 2] - c.z;
      if (dx * dx + dz * dz > radius * radius) continue;
      this.v[i3 + 1] += up * rand(0.4, 1); this.v[i3] += randS(up * 0.2); this.v[i3 + 2] += randS(up * 0.2);
      this.w[i3] = randS(5); this.w[i3 + 2] = randS(5);
      this.mode[i] = FREE;
    }
  }

  getPos(i: number, out: THREE.Vector3) {
    return out.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
  }

  /** Random pair of neighbouring locked pieces (for crawling lightning). */
  pair(f: Formation, a: THREE.Vector3, b: THREE.Vector3, reach = 24): boolean {
    const n = f.idx.length;
    if (n < 4) return false;
    const k = (Math.random() * n) | 0;
    const j = Math.min(n - 1, k + 2 + ((Math.random() * reach) | 0));
    const i0 = f.idx[k], i1 = f.idx[j];
    if (this.mode[i0] !== LOCKED || this.mode[i1] !== LOCKED) return false;
    this.getPos(i0, a); this.getPos(i1, b);
    return true;
  }

  private _wq = new THREE.Quaternion();
  private _lv = new THREE.Vector3();

  update(dt: number) {
    if (dt <= 0) return;
    const { p, v, q, w, mode } = this;
    for (let b = 0; b < this.bones.length; b++) this.bones[b].getWorldQuaternion(this.boneQ[b]);
    const dirty = [false, false, false, false, false, false, false, false];
    const wq = this._wq, tq = this._tq, lv = this._lv;
    for (let i = 0; i < this.N; i++) {
      const m = mode[i];
      if (m === REST) continue;
      const i3 = i * 3, i4 = i * 4;
      if (m === FREE) {
        v[i3 + 1] += GRAV * dt;
        p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
        const h = 0.14 * this.sc[i];
        if (p[i3 + 1] < h) {
          p[i3 + 1] = h;
          const vy = v[i3 + 1];
          if (vy < -13 && this.onGround && Math.random() < 0.3) this.onGround(p[i3], h, p[i3 + 2], -vy);
          v[i3 + 1] = -vy * 0.3;
          v[i3] *= 0.62; v[i3 + 2] *= 0.62;
          w[i3] *= 0.5; w[i3 + 1] *= 0.5; w[i3 + 2] *= 0.5;
          if (Math.abs(vy) < 2.2 && v[i3] * v[i3] + v[i3 + 2] * v[i3 + 2] < 0.6) {
            mode[i] = REST;
            v[i3] = v[i3 + 1] = v[i3 + 2] = 0;
          }
        }
        this.spin(i, dt);
      } else {
        // bone-space slot -> world
        const bone = this.bones[this.boneIdx[i]];
        lv.set(this.lp[i3], this.lp[i3 + 1], this.lp[i3 + 2]).applyMatrix4(bone.matrixWorld);
        if (m === ATTRACT) {
          this.age[i] += dt;
          const t = this.age[i] - this.delay[i];
          if (t < 0) {
            // still waiting: keep any ballistic motion alive so nothing freezes mid-air
            if (p[i3 + 1] > 0.14 * this.sc[i] + 0.01 || v[i3 + 1] > 0) {
              v[i3 + 1] += GRAV * dt;
              p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
              if (p[i3 + 1] < 0.14 * this.sc[i]) { p[i3 + 1] = 0.14 * this.sc[i]; v[i3] = v[i3 + 1] = v[i3 + 2] = 0; }
              this.spin(i, dt);
              dirty[this.type[i]] = true;
              this.write(i);
            }
            continue;
          }
          if (t - dt < 0) {
            // lift-off kick
            v[i3] += randS(5); v[i3 + 1] += rand(5, 13); v[i3 + 2] += randS(5);
            w[i3] = randS(10); w[i3 + 1] = randS(10); w[i3 + 2] = randS(10);
            if (this.onLift) this.onLift(p[i3], p[i3 + 1], p[i3 + 2]);
          }
          const dx = lv.x - p[i3], dy = lv.y - p[i3 + 1], dz = lv.z - p[i3 + 2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const g = (1.4 + t * t * 11) * this.gain[i];
          let sx = dx * g, sy = dy * g, sz = dz * g;
          const sp = Math.sqrt(sx * sx + sy * sy + sz * sz);
          const cap = 150 * this.gain[i];
          if (sp > cap) { const kk = cap / sp; sx *= kk; sy *= kk; sz *= kk; }
          // swirl around the vertical for the first moments -> magnetic vortex feel
          const sw = Math.max(0, 1 - t * 1.6) * 0.9;
          sx += -dz * sw; sz += dx * sw;
          const st = Math.min(1, dt * (3 + t * 7) * this.gain[i]);
          v[i3] += (sx - v[i3]) * st; v[i3 + 1] += (sy - v[i3 + 1]) * st; v[i3 + 2] += (sz - v[i3 + 2]) * st;
          p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
          this.spin(i, dt);
          const vm = Math.sqrt(v[i3] * v[i3] + v[i3 + 1] * v[i3 + 1] + v[i3 + 2] * v[i3 + 2]);
          if (dist < Math.max(0.7, vm * dt * 1.6) || t > 2.4 / this.gain[i]) {
            mode[i] = LOCKED;
            // store the residual offset in v, relax it to 0
            v[i3] = p[i3] - lv.x; v[i3 + 1] = p[i3 + 1] - lv.y; v[i3 + 2] = p[i3 + 2] - lv.z;
            this.settle[i] = 1;
            const f = this.form[i];
            if (f) f.locked++;
            if (this.onLock) this.onLock(i, lv.x, lv.y, lv.z);
          }
        } else {
          // LOCKED
          let s = this.settle[i];
          if (s > 0.003) {
            s *= Math.exp(-22 * dt);
            this.settle[i] = s;
          } else s = 0;
          p[i3] = lv.x + v[i3] * s; p[i3 + 1] = lv.y + v[i3 + 1] * s; p[i3 + 2] = lv.z + v[i3 + 2] * s;
          tq.set(this.lq[i4], this.lq[i4 + 1], this.lq[i4 + 2], this.lq[i4 + 3]);
          wq.copy(this.boneQ[this.boneIdx[i]]).multiply(tq);
          if (s > 0) {
            this._quat.set(q[i4], q[i4 + 1], q[i4 + 2], q[i4 + 3]).slerp(wq, 0.35);
            q[i4] = this._quat.x; q[i4 + 1] = this._quat.y; q[i4 + 2] = this._quat.z; q[i4 + 3] = this._quat.w;
          } else {
            q[i4] = wq.x; q[i4 + 1] = wq.y; q[i4 + 2] = wq.z; q[i4 + 3] = wq.w;
          }
        }
      }
      dirty[this.type[i]] = true;
      this.write(i);
    }
    for (let t = 0; t < this.meshes.length; t++) if (dirty[t]) this.meshes[t].instanceMatrix.needsUpdate = true;
  }

  private spin(i: number, dt: number) {
    const i3 = i * 3, i4 = i * 4;
    const wx = this.w[i3], wy = this.w[i3 + 1], wz = this.w[i3 + 2];
    if (wx === 0 && wy === 0 && wz === 0) return;
    const q = this.q;
    const qx = q[i4], qy = q[i4 + 1], qz = q[i4 + 2], qw = q[i4 + 3];
    const h = dt * 0.5;
    let nx = qx + h * (wx * qw + wy * qz - wz * qy);
    let ny = qy + h * (wy * qw + wz * qx - wx * qz);
    let nz = qz + h * (wz * qw + wx * qy - wy * qx);
    let nw = qw + h * (-wx * qx - wy * qy - wz * qz);
    const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
    nx *= l; ny *= l; nz *= l; nw *= l;
    q[i4] = nx; q[i4 + 1] = ny; q[i4 + 2] = nz; q[i4 + 3] = nw;
  }
}

/* ---------------- slot generators: [x,y,z,nx,ny,nz] ---------------- */
const GA = 2.399963;

export function cylSlots(n: number, r0: number, r1: number, len: number, z0 = 0, cx = 0, cy = 0): number[] {
  const o: number[] = [];
  for (let k = 0; k < n; k++) {
    const t = (k + Math.random()) / n;
    const a = k * GA;
    const r = (r0 + (r1 - r0) * t) * rand(0.94, 1.1);
    o.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z0 + t * len, Math.cos(a), Math.sin(a), 0);
  }
  return o;
}

export function ellipsoidSlots(n: number, rx: number, ry: number, rz: number, cx = 0, cy = 0, cz = 0, bump = 0.08): number[] {
  const o: number[] = [];
  for (let k = 0; k < n; k++) {
    const y = 1 - ((k + 0.5) / n) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = k * GA;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const b = 1 + randS(bump);
    o.push(cx + x * rx * b, cy + y * ry * b, cz + z * rz * b, x / rx, y / ry, z / rz);
  }
  return o;
}

export function boxSlots(n: number, sx: number, sy: number, sz: number, cx = 0, cy = 0, cz = 0): number[] {
  const o: number[] = [];
  const axy = sx * sy, ayz = sy * sz, axz = sx * sz;
  const tot = axy + ayz + axz;
  for (let k = 0; k < n; k++) {
    const r = Math.random() * tot;
    const s = Math.random() < 0.5 ? -1 : 1;
    let x = randS(sx / 2), y = randS(sy / 2), z = randS(sz / 2);
    let nx = 0, ny = 0, nz = 0;
    if (r < axy) { z = (s * sz) / 2; nz = s; }
    else if (r < axy + ayz) { x = (s * sx) / 2; nx = s; }
    else { y = (s * sy) / 2; ny = s; }
    o.push(cx + x, cy + y, cz + z, nx, ny, nz);
  }
  // order along Z so build-up sweeps forward
  const rows: number[][] = [];
  for (let k = 0; k < n; k++) rows.push(o.slice(k * 6, k * 6 + 6));
  rows.sort((a, b) => a[2] - b[2]);
  return rows.flat();
}

export function curveSlots(n: number, curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number): number[] {
  const o: number[] = [];
  const P = new THREE.Vector3(), T = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < n; k++) {
    const t = Math.min(0.999, (k + Math.random()) / n);
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    A.crossVectors(T, Math.abs(T.y) > 0.9 ? up.set(1, 0, 0) : up.set(0, 1, 0)).normalize();
    B.crossVectors(T, A);
    const a = k * GA;
    const r = (r0 + (r1 - r0) * t) * rand(0.92, 1.1);
    const nx = A.x * Math.cos(a) + B.x * Math.sin(a);
    const ny = A.y * Math.cos(a) + B.y * Math.sin(a);
    const nz = A.z * Math.cos(a) + B.z * Math.sin(a);
    o.push(P.x + nx * r, P.y + ny * r, P.z + nz * r, nx, ny, nz);
  }
  return o;
}

/** torus around the Z axis */
export function torusSlots(n: number, R: number, r: number, z: number): number[] {
  const o: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const b = k * GA;
    const nx = Math.cos(a) * Math.cos(b), ny = Math.sin(a) * Math.cos(b), nz = Math.sin(b);
    o.push(Math.cos(a) * R + nx * r, Math.sin(a) * R + ny * r, z + nz * r, nx, ny, nz);
  }
  return o;
}

/** offset / mirror helper */
export function xform(s: number[], dx: number, dy: number, dz: number, mx = 1): number[] {
  const o = s.slice();
  for (let i = 0; i < o.length; i += 6) {
    o[i] = o[i] * mx + dx; o[i + 1] += dy; o[i + 2] += dz; o[i + 3] *= mx;
  }
  return o;
}
