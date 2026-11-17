import * as THREE from 'three';

const N = 44; // segments along arm
const R = 18; // radial segments

export const outlineVert = /* glsl */ `
uniform float uThick;
void main(){
  vec3 p = position + normalize(normal) * uThick;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
export const outlineFrag = /* glsl */ `
uniform vec3 uColor;
void main(){ gl_FragColor = vec4(uColor, 1.0); }`;

export function makeOutlineMat(thick: number, color = 0x120a08) {
  return new THREE.ShaderMaterial({
    vertexShader: outlineVert,
    fragmentShader: outlineFrag,
    uniforms: { uThick: { value: thick }, uColor: { value: new THREE.Color(color) } },
    side: THREE.BackSide,
  });
}

const capsuleCache = new Map<string, THREE.BufferGeometry>();
function segGeo(radius: number, length: number) {
  const key = `${radius}-${length}`;
  let g = capsuleCache.get(key);
  if (!g) {
    g = new THREE.CapsuleGeometry(radius, length, 6, 12);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -length / 2);
    capsuleCache.set(key, g);
  }
  return g;
}

const sphereGeo = new THREE.SphereGeometry(1, 20, 14);

function part(geo: THREE.BufferGeometry, skin: THREE.Material, outline: THREE.Material | null) {
  const m = new THREE.Mesh(geo, skin);
  m.castShadow = false;
  if (outline) {
    const o = new THREE.Mesh(geo, outline);
    m.add(o);
  }
  return m;
}

export class ArmRig {
  side: number;
  group = new THREE.Group();
  mesh: THREE.Mesh;
  hand = new THREE.Group();
  handInner = new THREE.Group();
  fingers: THREE.Group[][] = [];
  thumb: THREE.Group[] = [];
  outlineMat: THREE.ShaderMaterial | null;
  handOutline: THREE.ShaderMaterial | null = null;
  ghost: boolean;

  // pose (all in camera space)
  shoulder = new THREE.Vector3();
  F = new THREE.Vector3(); // wrist
  bend = new THREE.Vector3();
  thick = 1;
  thickEnd = 1;
  thinK = 1; // how much the arm thins when stretched
  bulge = 0;
  taper = 1;
  fist = 1;
  curl = 1;
  roll = 0;
  wobble = 0;
  wobblePhase = 0;
  visible = true;
  len = 0;
  restLen = 0.8;

  pts: THREE.Vector3[] = [];
  nrm: THREE.Vector3[] = [];
  private pos: Float32Array;
  private nor: Float32Array;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpT = new THREE.Vector3();
  private tmpM = new THREE.Matrix4();
  private tmpX = new THREE.Vector3();
  private tmpY = new THREE.Vector3();
  private tmpZ = new THREE.Vector3();

  constructor(side: number, skin: THREE.Material, ghost = false) {
    this.side = side;
    this.ghost = ghost;
    for (let i = 0; i <= N; i++) {
      this.pts.push(new THREE.Vector3());
      this.nrm.push(new THREE.Vector3());
    }
    this.outlineMat = ghost ? null : makeOutlineMat(0.004);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array((N + 1) * R * 3);
    this.nor = new Float32Array((N + 1) * R * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < R; j++) {
        const a = i * R + j, b = i * R + ((j + 1) % R), c = (i + 1) * R + j, d = (i + 1) * R + ((j + 1) % R);
        idx.push(a, b, c, b, d, c);
      }
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, skin);
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    if (this.outlineMat) {
      const o = new THREE.Mesh(geo, this.outlineMat);
      o.frustumCulled = false;
      this.group.add(o);
    }
    this.buildHand(skin);
    this.group.add(this.hand);
  }

  private buildHand(skin: THREE.Material) {
    const s = this.side;
    const ol = this.ghost ? null : makeOutlineMat(0.0042);
    this.handOutline = ol;
    this.hand.add(this.handInner);
    this.handInner.position.z = -0.06;
    const palm = part(sphereGeo, skin, ol);
    palm.scale.set(0.046, 0.021, 0.054);
    palm.position.set(0, 0.012, 0.004);
    this.handInner.add(palm);
    // heel/back-of-hand bulk
    const back = part(sphereGeo, skin, ol);
    back.scale.set(0.04, 0.02, 0.04);
    back.position.set(0, 0.02, -0.005);
    this.handInner.add(back);

    const L = [0.03, 0.025, 0.02];
    const lenMul = [0.95, 1.08, 1.0, 0.82];
    for (let i = 0; i < 4; i++) {
      const x = (-0.0345 + i * 0.023) * s;
      const m = lenMul[i];
      const g1 = new THREE.Group();
      g1.position.set(x, 0.02, -0.046);
      g1.add(part(segGeo(0.0118, L[0] * m), skin, ol));
      const g2 = new THREE.Group();
      g2.position.z = -L[0] * m;
      g2.add(part(segGeo(0.0112, L[1] * m), skin, ol));
      const g3 = new THREE.Group();
      g3.position.z = -L[1] * m;
      g3.add(part(segGeo(0.0105, L[2] * m), skin, ol));
      g2.add(g3);
      g1.add(g2);
      this.handInner.add(g1);
      this.fingers.push([g1, g2, g3]);
    }
    // thumb
    const t1 = new THREE.Group();
    t1.position.set(-0.044 * s, 0.002, 0.012);
    t1.add(part(segGeo(0.0135, 0.034), skin, ol));
    const t2 = new THREE.Group();
    t2.position.z = -0.034;
    t2.add(part(segGeo(0.0125, 0.028), skin, ol));
    t1.add(t2);
    this.handInner.add(t1);
    this.thumb = [t1, t2];
  }

  /** world-ish helper: point along spine in camera space */
  pointAt(t: number, out: THREE.Vector3) {
    const f = Math.min(N, Math.max(0, t * N));
    const i = Math.floor(f);
    const j = Math.min(N, i + 1);
    return out.lerpVectors(this.pts[i], this.pts[j], f - i);
  }

  update(time: number) {
    this.group.visible = this.visible;
    if (!this.visible) return;
    const S = this.shoulder, F = this.F;
    const d = this.tmpA.subVectors(F, S);
    const len = d.length();
    this.len = len;
    const P1 = this.tmpB.copy(S).addScaledVector(d, 0.33).addScaledVector(this.bend, 1);
    const p1x = P1.x, p1y = P1.y, p1z = P1.z;
    const p2x = S.x + d.x * 0.72 + this.bend.x * 0.55;
    const p2y = S.y + d.y * 0.72 + this.bend.y * 0.55;
    const p2z = S.z + d.z * 0.72 + this.bend.z * 0.55;
    const wob = this.wobble;
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      const b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
      const p = this.pts[i];
      p.set(
        b0 * S.x + b1 * p1x + b2 * p2x + b3 * F.x,
        b0 * S.y + b1 * p1y + b2 * p2y + b3 * F.y,
        b0 * S.z + b1 * p1z + b2 * p2z + b3 * F.z,
      );
      if (wob > 0.0001) {
        const env = Math.sin(Math.PI * t);
        const ph = this.wobblePhase;
        p.x += wob * env * Math.sin(t * 13 - time * 34 + ph);
        p.y += wob * env * Math.cos(t * 10 - time * 29 + ph * 1.3);
      }
    }
    // frames (projection transport)
    const T = this.tmpT;
    const nm = this.nrm;
    for (let i = 0; i <= N; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(N, i + 1)];
      T.subVectors(b, a).normalize();
      const n = nm[i];
      if (i === 0) {
        n.set(0, 1, 0);
        if (Math.abs(T.y) > 0.95) n.set(1, 0, 0);
      } else n.copy(nm[i - 1]);
      n.addScaledVector(T, -n.dot(T)).normalize();
    }
    // radii
    const thinBase = Math.min(1, Math.max(0.42, Math.sqrt(this.restLen / Math.max(len, 0.01))));
    const thin = 1 + (thinBase - 1) * this.thinK;
    const rS = 0.062 * this.thick, rE = 0.043 * this.thickEnd;
    let rAvg = 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const e = t * t * (3 - 2 * t);
      let r = (rS + (rE - rS) * Math.pow(e, this.taper)) * thin;
      if (this.bulge > 0) r *= 1 + this.bulge * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 2) * 0.8;
      // taper into the wrist cuff so the hand always covers the tube end
      const T2 = this.tmpX.subVectors(this.pts[Math.min(N, i + 1)], this.pts[Math.max(0, i - 1)]).normalize();
      void T2;
      if (i === N) rAvg = r;
      const p = this.pts[i], n = this.nrm[i];
      const bx = this.tmpY.crossVectors(
        this.tmpZ.subVectors(this.pts[Math.min(N, i + 1)], this.pts[Math.max(0, i - 1)]).normalize(),
        n,
      );
      for (let j = 0; j < R; j++) {
        const a = (j / R) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        const nx = n.x * c + bx.x * s, ny = n.y * c + bx.y * s, nz = n.z * c + bx.z * s;
        const k = (i * R + j) * 3;
        this.pos[k] = p.x + nx * r; this.pos[k + 1] = p.y + ny * r; this.pos[k + 2] = p.z + nz * r;
        this.nor[k] = nx; this.nor[k + 1] = ny; this.nor[k + 2] = nz;
      }
    }
    const g = this.mesh.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
    if (this.outlineMat) this.outlineMat.uniforms.uThick.value = Math.max(0.0035, rAvg * 0.16 + (rS * thin) * 0.03);

    // hand
    const tEnd = this.tmpT.subVectors(this.pts[N], this.pts[N - 2]).normalize();
    const yv = this.tmpY.copy(this.nrm[N]);
    const cr = Math.cos(this.roll), sr = Math.sin(this.roll);
    const cx = this.tmpZ.crossVectors(tEnd, yv);
    yv.multiplyScalar(cr).addScaledVector(cx, sr);
    const zv = this.tmpA.copy(tEnd).negate();
    const xv = this.tmpX.crossVectors(yv, zv).normalize();
    this.tmpM.makeBasis(xv, yv, zv);
    this.hand.quaternion.setFromRotationMatrix(this.tmpM);
    this.hand.position.copy(this.pts[N]);
    this.hand.scale.setScalar(this.fist);

    const c = this.curl;
    for (let i = 0; i < 4; i++) {
      const f = this.fingers[i];
      const cc = c * (1 - i * 0.0);
      f[0].rotation.x = -cc * 1.45;
      f[1].rotation.x = -cc * 1.68;
      f[2].rotation.x = -cc * 1.2;
      f[0].rotation.y = (1 - c) * (i - 1.5) * 0.09 * this.side * 1.0;
    }
    const s = this.side;
    this.thumb[0].rotation.set(-c * 0.55, s * (0.55 - c * 0.95), 0, 'YXZ');
    this.thumb[1].rotation.set(-c * 0.1, -s * c * 1.05, 0, 'YXZ');
  }
}
