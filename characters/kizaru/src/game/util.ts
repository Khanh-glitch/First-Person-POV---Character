import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, k: number, dt: number) => lerp(a, b, 1 - Math.exp(-k * dt));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const pick = <T,>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0];
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t: number) => Math.pow(clamp(t), 3);
export const easeInQuad = (t: number) => clamp(t) * clamp(t);
export const easeOutQuad = (t: number) => 1 - (1 - clamp(t)) * (1 - clamp(t));
export const easeInOutCubic = (t: number) => {
  t = clamp(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));

export function shakeNoise(t: number, seed: number) {
  return (
    Math.sin(t * 1.7 + seed) * 0.5 +
    Math.sin(t * 3.1 + seed * 2.3) * 0.3 +
    Math.sin(t * 5.9 + seed * 0.7) * 0.2
  );
}

/** Orthonormal basis perpendicular to dir. */
export function perpBasis(dir: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3) {
  const h = Math.abs(dir.y) < 0.98 ? _up : _right;
  u.crossVectors(dir, h).normalize();
  v.crossVectors(dir, u).normalize();
}
const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3(1, 0, 0);

export function randomUnit(out: THREE.Vector3) {
  const z = rand(-1, 1);
  const a = rand(0, TAU);
  const r = Math.sqrt(1 - z * z);
  return out.set(Math.cos(a) * r, z, Math.sin(a) * r);
}

export type RGB = readonly [number, number, number];
export const GOLD: RGB = [1.0, 0.78, 0.3];
export const GOLD_HOT: RGB = [1.0, 0.9, 0.55];
export const WHITE: RGB = [1, 1, 1];
export const ORANGE: RGB = [1.0, 0.42, 0.1];
export const CYAN: RGB = [0.45, 0.85, 1.0];
export const PINK: RGB = [1.0, 0.45, 0.75];
export const SMOKE: RGB = [0.14, 0.11, 0.1];
