import * as THREE from "three";

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInQuad = (t: number) => t * t;
export const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const rand = (a = 1, b?: number) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randS = (a = 1) => (Math.random() * 2 - 1) * a;
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-lambda * dt));

/** cheap smooth 1D noise in [-1,1] */
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  return h(i) * (1 - u) + h(i + 1) * u;
}

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Analytic two-bone IK. Writes elbow + (reach-clamped) wrist. */
export function solveTwoBone(
  S: THREE.Vector3,
  T: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
  outE: THREE.Vector3,
  outW: THREE.Vector3
) {
  _d.subVectors(T, S);
  let d = _d.length();
  const maxD = (l1 + l2) * 0.999;
  const minD = Math.abs(l1 - l2) + 0.001;
  if (d < 1e-5) {
    _d.set(0, 0, -1);
    d = minD;
  } else _d.multiplyScalar(1 / d);
  d = Math.min(maxD, Math.max(minD, d));
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, -1, 0);
  _p.normalize();
  outE.copy(S).addScaledVector(_d, l1 * cosA).addScaledVector(_p, l1 * sinA);
  outW.copy(S).addScaledVector(_d, d);
}

/** Tube that tapers from r0 to r1 along a curve (horns, tusks, cables). */
export function taperedTube(curve: THREE.Curve<THREE.Vector3>, tubular: number, r0: number, r1: number, radial = 8) {
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const P = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    curve.getPointAt(i / tubular, P);
    const r = lerp(r0, r1, i / tubular);
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, idx).sub(P).multiplyScalar(r).add(P);
      pos.setXYZ(idx, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

const _Y = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
/** Place a +Y aligned mesh so it spans from A to B. */
export function spanY(obj: THREE.Object3D, A: THREE.Vector3, B: THREE.Vector3) {
  _dir.subVectors(B, A);
  const len = _dir.length() || 1e-6;
  _dir.multiplyScalar(1 / len);
  obj.position.copy(A).addScaledVector(_dir, len * 0.5);
  obj.quaternion.setFromUnitVectors(_Y, _dir);
}
