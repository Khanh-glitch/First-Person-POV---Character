import * as THREE from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

/** Batched fat-line renderer. Each frame: begin() → add polylines → end(). */
export class StringBatch {
  mesh: LineSegments2;
  geo: LineSegmentsGeometry;
  mat: LineMaterial;
  cap: number;
  n = 0;
  private posArr: Float32Array;
  private colArr: Float32Array;
  private posBuf: THREE.InterleavedBuffer;
  private colBuf: THREE.InterleavedBuffer;

  constructor(cap: number, width: number, additive = true) {
    this.cap = cap;
    this.geo = new LineSegmentsGeometry();
    this.geo.setPositions(new Float32Array(cap * 6));
    this.geo.setColors(new Float32Array(cap * 6));
    this.posBuf = (this.geo.attributes.instanceStart as THREE.InterleavedBufferAttribute).data;
    this.colBuf = (this.geo.attributes.instanceColorStart as THREE.InterleavedBufferAttribute).data;
    this.posArr = this.posBuf.array as Float32Array;
    this.colArr = this.colBuf.array as Float32Array;
    (this.posBuf as any).setUsage?.(THREE.DynamicDrawUsage);
    (this.colBuf as any).setUsage?.(THREE.DynamicDrawUsage);
    this.mat = new LineMaterial({
      linewidth: width,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      worldUnits: false,
    });
    if (additive) this.mat.blending = THREE.AdditiveBlending;
    this.mesh = new LineSegments2(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
  }

  setResolution(w: number, h: number) {
    this.mat.resolution.set(w, h);
  }

  begin() {
    this.n = 0;
  }

  seg(a: THREE.Vector3, b: THREE.Vector3, ca: THREE.Color, ia: number, cb?: THREE.Color, ib?: number) {
    if (this.n >= this.cap) return;
    const i = this.n * 6;
    const p = this.posArr,
      c = this.colArr;
    p[i] = a.x;
    p[i + 1] = a.y;
    p[i + 2] = a.z;
    p[i + 3] = b.x;
    p[i + 4] = b.y;
    p[i + 5] = b.z;
    const cB = cb ?? ca;
    const iB = ib ?? ia;
    c[i] = ca.r * ia;
    c[i + 1] = ca.g * ia;
    c[i + 2] = ca.b * ia;
    c[i + 3] = cB.r * iB;
    c[i + 4] = cB.g * iB;
    c[i + 5] = cB.b * iB;
    this.n++;
  }

  /** polyline with optional per-point intensity function */
  line(pts: THREE.Vector3[], color: THREE.Color, intensity = 1, fade?: (t: number) => number) {
    const L = pts.length - 1;
    for (let k = 0; k < L; k++) {
      const ia = fade ? intensity * fade(k / L) : intensity;
      const ib = fade ? intensity * fade((k + 1) / L) : intensity;
      this.seg(pts[k], pts[k + 1], color, ia, color, ib);
    }
  }

  end() {
    this.geo.instanceCount = this.n;
    this.posBuf.needsUpdate = true;
    this.colBuf.needsUpdate = true;
    this.posBuf.updateRanges.length = 0;
    this.colBuf.updateRanges.length = 0;
    if (this.n > 0) {
      this.posBuf.addUpdateRange(0, this.n * 6);
      this.colBuf.addUpdateRange(0, this.n * 6);
    }
  }
}

/** helper: points along a quadratic bezier with optional sag + wobble */
export function curvePts(
  out: THREE.Vector3[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  segs: number,
  sag = 0,
  wobble = 0,
  time = 0,
  seed = 0,
  upTo = 1
) {
  while (out.length < segs + 1) out.push(new THREE.Vector3());
  out.length = segs + 1;
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * upTo;
    const p = out[i];
    p.lerpVectors(a, b, t);
    const s = 4 * t * (1 - t);
    p.y -= sag * s;
    if (wobble) {
      p.x += Math.sin(t * 13 + time * 9 + seed) * wobble * s;
      p.y += Math.cos(t * 11 + time * 7 + seed * 1.3) * wobble * s;
      p.z += Math.sin(t * 9 + time * 5 + seed * 2.1) * wobble * s * 0.5;
    }
  }
  return out;
}
