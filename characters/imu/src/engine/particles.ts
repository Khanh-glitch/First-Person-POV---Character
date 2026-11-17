import * as THREE from "three";

export interface Emit {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size0: number;
  size1?: number;
  c0: THREE.Color;
  c1?: THREE.Color;
  a?: number;
  drag?: number;
  grav?: number;
  turb?: number;
  spin?: number;
  fadeIn?: number;
  fadePow?: number;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
attribute float aRot;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
varying float vRot;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = aSize * uScale / max(0.001, -mv.z);
  gl_PointSize = clamp(s, 0.0, 700.0);
  vAlpha = aAlpha;
  vColor = aColor;
  vRot = aRot;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
varying float vRot;
void main(){
  if (vAlpha < 0.002) discard;
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  p = mat2(c, -s, s, c) * p + 0.5;
  float t = texture2D(uMap, p).a;
  gl_FragColor = vec4(vColor, t * vAlpha);
}`;

export class ParticleSystem {
  readonly points: THREE.Points;
  private n: number;
  private cursor = 0;
  private time = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private drag: Float32Array;
  private grav: Float32Array;
  private turb: Float32Array;
  private a0: Float32Array;
  private fin: Float32Array;
  private fpow: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private aSize: THREE.BufferAttribute;
  private aAlpha: THREE.BufferAttribute;
  private aColor: THREE.BufferAttribute;
  private aRot: THREE.BufferAttribute;
  private aPos: THREE.BufferAttribute;
  private mat: THREE.ShaderMaterial;

  constructor(n: number, map: THREE.Texture, additive: boolean, renderOrder = 0) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(1e9);
    this.life = new Float32Array(n).fill(1);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.turb = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.fin = new Float32Array(n);
    this.fpow = new Float32Array(n);
    this.c0 = new Float32Array(n * 3);
    this.c1 = new Float32Array(n * 3);

    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", this.aPos);
    g.setAttribute("aSize", this.aSize);
    g.setAttribute("aAlpha", this.aAlpha);
    g.setAttribute("aColor", this.aColor);
    g.setAttribute("aRot", this.aRot);

    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: map }, uScale: { value: 800 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
  }

  setScale(s: number) {
    this.mat.uniforms.uScale.value = s;
  }

  emit(o: Emit) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = o.x;
    this.pos[i3 + 1] = o.y;
    this.pos[i3 + 2] = o.z;
    this.vel[i3] = o.vx ?? 0;
    this.vel[i3 + 1] = o.vy ?? 0;
    this.vel[i3 + 2] = o.vz ?? 0;
    this.age[i] = 0;
    this.life[i] = o.life;
    this.s0[i] = o.size0;
    this.s1[i] = o.size1 ?? o.size0;
    this.rot[i] = Math.random() * 6.283;
    this.spin[i] = o.spin ?? (Math.random() - 0.5) * 1.2;
    this.drag[i] = o.drag ?? 0;
    this.grav[i] = o.grav ?? 0;
    this.turb[i] = o.turb ?? 0;
    this.a0[i] = o.a ?? 1;
    this.fin[i] = o.fadeIn ?? 0.08;
    this.fpow[i] = o.fadePow ?? 1.3;
    const c1 = o.c1 ?? o.c0;
    this.c0[i3] = o.c0.r;
    this.c0[i3 + 1] = o.c0.g;
    this.c0[i3 + 2] = o.c0.b;
    this.c1[i3] = c1.r;
    this.c1[i3 + 1] = c1.g;
    this.c1[i3 + 2] = c1.b;
  }

  clear() {
    this.age.fill(1e9);
    this.aSize.array.fill(0);
    this.aAlpha.array.fill(0);
    this.aSize.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
  }

  update(dt: number) {
    this.time += dt;
    const t = this.time;
    const n = this.n;
    const sz = this.aSize.array as Float32Array;
    const al = this.aAlpha.array as Float32Array;
    const co = this.aColor.array as Float32Array;
    const ro = this.aRot.array as Float32Array;
    const po = this.aPos.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const life = this.life[i];
      if (this.age[i] >= life) {
        if (sz[i] !== 0) {
          sz[i] = 0;
          al[i] = 0;
        }
        continue;
      }
      this.age[i] += dt;
      const k = Math.min(1, this.age[i] / life);
      const i3 = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      let vx = this.vel[i3] * d;
      let vy = this.vel[i3 + 1] * d - this.grav[i] * dt;
      let vz = this.vel[i3 + 2] * d;
      const tb = this.turb[i];
      if (tb > 0) {
        const px = this.pos[i3];
        const py = this.pos[i3 + 1];
        const pz = this.pos[i3 + 2];
        vx += Math.sin(py * 0.9 + t * 2.3 + i) * tb * dt;
        vy += Math.sin(pz * 0.7 + t * 1.7 + i * 0.3) * tb * 0.6 * dt;
        vz += Math.sin(px * 0.8 + t * 2.9 + i * 0.7) * tb * dt;
      }
      this.vel[i3] = vx;
      this.vel[i3 + 1] = vy;
      this.vel[i3 + 2] = vz;
      this.pos[i3] += vx * dt;
      this.pos[i3 + 1] += vy * dt;
      this.pos[i3 + 2] += vz * dt;
      this.rot[i] += this.spin[i] * dt;

      const e = 1 - Math.pow(1 - k, 2);
      sz[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * e;
      const fi = this.fin[i];
      const fadeIn = fi > 0 ? Math.min(1, k / fi) : 1;
      al[i] = this.a0[i] * fadeIn * Math.pow(1 - k, this.fpow[i]);
      co[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * k;
      co[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * k;
      co[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * k;
      ro[i] = this.rot[i];
      po[i3] = this.pos[i3];
      po[i3 + 1] = this.pos[i3 + 1];
      po[i3 + 2] = this.pos[i3 + 2];
    }
    this.aSize.needsUpdate = true;
    this.aAlpha.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aRot.needsUpdate = true;
    this.aPos.needsUpdate = true;
  }
}
