import * as THREE from 'three';

export type PStyle = 0 | 1 | 2 | 3; // 0 soft glow, 1 toon puff, 2 streak, 3 hard disc

export interface EmitOpts {
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  life?: number;
  size0?: number;
  size1?: number;
  c0?: THREE.Color | number;
  c1?: THREE.Color | number;
  a0?: number;
  a1?: number;
  drag?: number;
  grav?: number;
  style?: PStyle;
  len?: number; // streak base length (world units)
  stretch?: number; // streak extra length per unit speed
  rot?: number;
  spin?: number;
}

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec3 iDir;
attribute vec4 iColor;
attribute vec2 iSize;
attribute vec3 iMisc;
varying vec4 vColor;
varying vec2 vUv;
varying float vStyle;
varying float vSeed;
void main(){
  vColor = iColor;
  vUv = position.xy + 0.5;
  vStyle = iMisc.x;
  vSeed = iMisc.y;
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  if (iMisc.x > 1.5 && iMisc.x < 2.5) {
    vec2 d = (modelViewMatrix * vec4(iDir, 0.0)).xy;
    float dl = length(d);
    d = dl > 1e-5 ? d / dl : vec2(1.0, 0.0);
    vec2 pr = vec2(-d.y, d.x);
    mv.xy += d * position.x * iSize.y + pr * position.y * iSize.x;
  } else {
    float c = cos(iMisc.z), s = sin(iMisc.z);
    vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
    mv.xy += p * iSize.x;
  }
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
varying vec2 vUv;
varying float vStyle;
varying float vSeed;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 c = vUv - 0.5;
  float d = length(c) * 2.0;
  vec4 col = vColor;
  if (vStyle < 0.5) {
    float a = pow(clamp(1.0 - d, 0.0, 1.0), 1.7);
    col.a *= a;
    col.rgb *= 1.0 + a * 0.6;
  } else if (vStyle < 1.5) {
    float ang = atan(c.y, c.x);
    float n = vn(vec2(ang * 1.7 + vSeed * 9.0, vSeed * 13.0)) * 0.22 + vn(c * 5.0 + vSeed * 31.0) * 0.1;
    float r = d + n - 0.14;
    float edge = 1.0 - smoothstep(0.82, 0.88, r);
    float ink = smoothstep(0.7, 0.76, r);
    float lit = clamp(0.5 + dot(normalize(c + 1e-4), normalize(vec2(-0.5, 0.8))) * 0.5 * d, 0.0, 1.0);
    vec3 base = col.rgb * (0.62 + 0.45 * smoothstep(0.35, 0.55, lit));
    base = mix(base, col.rgb * 0.35, ink * 0.55);
    col = vec4(base, col.a * edge);
  } else if (vStyle < 2.5) {
    float along = abs(vUv.x - 0.5) * 2.0;
    float across = abs(vUv.y - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.55, 1.0, along)) * (1.0 - smoothstep(0.0, 1.0, across));
    col.a *= a;
    col.rgb *= 1.0 + (1.0 - along) * 0.8;
  } else {
    float a = 1.0 - smoothstep(0.9, 1.0, d);
    col.a *= a;
  }
  if (col.a < 0.003) discard;
  gl_FragColor = col;
}`;

const tmpC = new THREE.Color();

export class Particles {
  mesh: THREE.Mesh;
  max: number;
  n = 0;
  // sim arrays
  px: Float32Array; py: Float32Array; pz: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  life: Float32Array; maxLife: Float32Array;
  s0: Float32Array; s1: Float32Array;
  c0: Float32Array; c1: Float32Array; // rgb
  a0: Float32Array; a1: Float32Array;
  drag: Float32Array; grav: Float32Array;
  style: Float32Array; seed: Float32Array; rot: Float32Array; spin: Float32Array;
  len: Float32Array; stretch: Float32Array;
  // gpu
  aPos: THREE.InstancedBufferAttribute;
  aDir: THREE.InstancedBufferAttribute;
  aColor: THREE.InstancedBufferAttribute;
  aSize: THREE.InstancedBufferAttribute;
  aMisc: THREE.InstancedBufferAttribute;
  geo: THREE.InstancedBufferGeometry;

  constructor(max: number, additive: boolean) {
    this.max = max;
    const f = (k = 1) => new Float32Array(max * k);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.life = f(); this.maxLife = f();
    this.s0 = f(); this.s1 = f();
    this.c0 = f(3); this.c1 = f(3);
    this.a0 = f(); this.a1 = f();
    this.drag = f(); this.grav = f();
    this.style = f(); this.seed = f(); this.rot = f(); this.spin = f();
    this.len = f(); this.stretch = f();

    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    const mk = (k: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * k), k);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos = mk(3); this.aDir = mk(3); this.aColor = mk(4); this.aSize = mk(2); this.aMisc = mk(3);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iDir', this.aDir);
    geo.setAttribute('iColor', this.aColor);
    geo.setAttribute('iSize', this.aSize);
    geo.setAttribute('iMisc', this.aMisc);
    geo.instanceCount = 0;
    this.geo = geo;

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
  }

  emit(o: EmitOpts) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.px[i] = o.pos.x; this.py[i] = o.pos.y; this.pz[i] = o.pos.z;
    const v = o.vel;
    this.vx[i] = v ? v.x : 0; this.vy[i] = v ? v.y : 0; this.vz[i] = v ? v.z : 0;
    this.life[i] = 0;
    this.maxLife[i] = o.life ?? 1;
    this.s0[i] = o.size0 ?? 0.3;
    this.s1[i] = o.size1 ?? this.s0[i];
    tmpC.set(o.c0 ?? 0xffffff);
    this.c0[i * 3] = tmpC.r; this.c0[i * 3 + 1] = tmpC.g; this.c0[i * 3 + 2] = tmpC.b;
    tmpC.set(o.c1 ?? o.c0 ?? 0xffffff);
    this.c1[i * 3] = tmpC.r; this.c1[i * 3 + 1] = tmpC.g; this.c1[i * 3 + 2] = tmpC.b;
    this.a0[i] = o.a0 ?? 1;
    this.a1[i] = o.a1 ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.grav[i] = o.grav ?? 0;
    this.style[i] = o.style ?? 0;
    this.seed[i] = Math.random();
    this.rot[i] = o.rot ?? Math.random() * 6.28;
    this.spin[i] = o.spin ?? 0;
    this.len[i] = o.len ?? 0.5;
    this.stretch[i] = o.stretch ?? 0.04;
  }

  private copy(dst: number, src: number) {
    const arrs = [this.px, this.py, this.pz, this.vx, this.vy, this.vz, this.life, this.maxLife, this.s0, this.s1,
      this.a0, this.a1, this.drag, this.grav, this.style, this.seed, this.rot, this.spin, this.len, this.stretch];
    for (const a of arrs) a[dst] = a[src];
    for (let k = 0; k < 3; k++) {
      this.c0[dst * 3 + k] = this.c0[src * 3 + k];
      this.c1[dst * 3 + k] = this.c1[src * 3 + k];
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.n; ) {
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        this.n--;
        if (i !== this.n) this.copy(i, this.n);
        continue;
      }
      const dr = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= dr; this.vy[i] = this.vy[i] * dr - this.grav[i] * dt; this.vz[i] *= dr;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.spin[i] * dt;
      i++;
    }
    const P = this.aPos.array as Float32Array, D = this.aDir.array as Float32Array,
      C = this.aColor.array as Float32Array, S = this.aSize.array as Float32Array,
      M = this.aMisc.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const u = this.life[i] / this.maxLife[i];
      const e = u * u * (3 - 2 * u);
      P[i * 3] = this.px[i]; P[i * 3 + 1] = this.py[i]; P[i * 3 + 2] = this.pz[i];
      const sp = Math.hypot(this.vx[i], this.vy[i], this.vz[i]) + 1e-5;
      D[i * 3] = this.vx[i] / sp; D[i * 3 + 1] = this.vy[i] / sp; D[i * 3 + 2] = this.vz[i] / sp;
      for (let k = 0; k < 3; k++) C[i * 4 + k] = this.c0[i * 3 + k] + (this.c1[i * 3 + k] - this.c0[i * 3 + k]) * e;
      // fast fade-in avoids popping
      const fadeIn = Math.min(1, u * 12);
      C[i * 4 + 3] = (this.a0[i] + (this.a1[i] - this.a0[i]) * u) * fadeIn;
      S[i * 2] = this.s0[i] + (this.s1[i] - this.s0[i]) * (style(this.style[i]) === 1 ? Math.sqrt(u) : u);
      S[i * 2 + 1] = this.len[i] + sp * this.stretch[i];
      M[i * 3] = this.style[i]; M[i * 3 + 1] = this.seed[i]; M[i * 3 + 2] = this.rot[i];
    }
    this.geo.instanceCount = this.n;
    this.aPos.needsUpdate = true; this.aDir.needsUpdate = true; this.aColor.needsUpdate = true;
    this.aSize.needsUpdate = true; this.aMisc.needsUpdate = true;
  }
}

function style(s: number) {
  return Math.round(s);
}
