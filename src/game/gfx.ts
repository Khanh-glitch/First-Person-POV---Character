import * as THREE from 'three';
import type { RGB } from './util';

/* ------------------------------------------------------------------ */
/*  Streaks — camera-facing light ribbons, instanced (beams / sparks)   */
/* ------------------------------------------------------------------ */

const STREAK_VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec4 aColor;
attribute vec3 aParams; // width, alpha, shape
varying vec2 vUv;
varying vec4 vColor;
varying float vAlpha;
varying float vShape;
void main() {
  vec3 dir = aEnd - aStart;
  vec3 p = mix(aStart, aEnd, position.y);
  vec3 toCam = p - cameraPosition;
  vec3 side = cross(dir, toCam);
  float sl = length(side);
  side = sl > 1e-5 ? side / sl : vec3(0.0);
  float shape = aParams.z;
  float w0 = shape > 0.0 ? 1.0 - shape * 0.92 : 1.0;
  float w1 = shape < 0.0 ? 1.0 + shape * 0.92 : 1.0;
  float wm = mix(w0, w1, position.y);
  p += side * position.x * aParams.x * wm;
  vUv = vec2(position.x, position.y);
  vColor = aColor;
  vAlpha = aParams.y;
  vShape = shape;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const STREAK_FRAG = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
varying float vAlpha;
varying float vShape;
void main() {
  float a = abs(vUv.x);
  float core = exp(-a * a * 20.0);
  float glow = exp(-a * a * 3.2);
  float ends = smoothstep(0.0, 0.05, vUv.y) * (1.0 - smoothstep(0.93, 1.0, vUv.y));
  float br = vShape < 0.0 ? mix(1.0, 0.12, vUv.y) : 1.0;
  vec3 hot = mix(vColor.rgb, vec3(1.0), core * 0.85);
  vec3 col = hot * (core * 1.25 + glow * 0.5) * vColor.a * br * ends;
  gl_FragColor = vec4(min(col, vec3(60.0)), vAlpha);
}`;

export class Streaks {
  mesh: THREE.Mesh;
  count = 0;
  private cap: number;
  private aStart: THREE.InstancedBufferAttribute;
  private aEnd: THREE.InstancedBufferAttribute;
  private aColor: THREE.InstancedBufferAttribute;
  private aParams: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor(cap = 5000) {
    this.cap = cap;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0]), 3),
    );
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const mk = (n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aStart = mk(3);
    this.aEnd = mk(3);
    this.aColor = mk(4);
    this.aParams = mk(3);
    g.setAttribute('aStart', this.aStart);
    g.setAttribute('aEnd', this.aEnd);
    g.setAttribute('aColor', this.aColor);
    g.setAttribute('aParams', this.aParams);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      vertexShader: STREAK_VERT,
      fragmentShader: STREAK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }

  begin() {
    this.count = 0;
  }

  add(
    sx: number, sy: number, sz: number,
    ex: number, ey: number, ez: number,
    width: number, r: number, g: number, b: number, intensity: number,
    alpha = 1, shape = 0,
  ) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    const s = this.aStart.array as Float32Array;
    const e = this.aEnd.array as Float32Array;
    const c = this.aColor.array as Float32Array;
    const p = this.aParams.array as Float32Array;
    s[i * 3] = sx; s[i * 3 + 1] = sy; s[i * 3 + 2] = sz;
    e[i * 3] = ex; e[i * 3 + 1] = ey; e[i * 3 + 2] = ez;
    c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = intensity;
    p[i * 3] = width; p[i * 3 + 1] = alpha; p[i * 3 + 2] = shape;
  }

  end() {
    this.geo.instanceCount = this.count;
    this.aStart.needsUpdate = true;
    this.aEnd.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.aParams.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/*  Particles — instanced billboards with CPU simulation                */
/* ------------------------------------------------------------------ */

const PART_VERT = /* glsl */ `
attribute vec3 aPos;
attribute float aSize;
attribute vec4 aColor;
varying vec2 vUv;
varying vec4 vColor;
void main() {
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  mv.xy += position.xy * aSize;
  vUv = position.xy;
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}`;
const PART_FRAG_ADD = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main() {
  float d = length(vUv);
  float a = exp(-d * d * 4.2) * smoothstep(1.0, 0.75, d);
  gl_FragColor = vec4(min(vColor.rgb, vec3(40.0)), vColor.a * a);
}`;
const PART_FRAG_NORMAL = /* glsl */ `
varying vec2 vUv;
varying vec4 vColor;
void main() {
  float d = length(vUv);
  float a = smoothstep(1.0, 0.15, d);
  gl_FragColor = vec4(vColor.rgb, vColor.a * a * a);
}`;

export interface EmitOpts {
  x: number; y: number; z: number;
  vx?: number; vy?: number; vz?: number;
  life: number;
  s0: number; s1?: number;
  c0: RGB; c1?: RGB;
  a0?: number; a1?: number;
  drag?: number; grav?: number;
}

export class Particles {
  mesh: THREE.Mesh;
  private cap: number;
  private head = 0;
  private px: Float32Array; private py: Float32Array; private pz: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private age: Float32Array; private life: Float32Array;
  private s0: Float32Array; private s1: Float32Array;
  private c0: Float32Array; private c1: Float32Array; // rgba
  private drag: Float32Array; private grav: Float32Array;
  private alive: Uint8Array;
  private iPos: THREE.InstancedBufferAttribute;
  private iSize: THREE.InstancedBufferAttribute;
  private iColor: THREE.InstancedBufferAttribute;
  private geo: THREE.InstancedBufferGeometry;

  constructor(cap: number, additive: boolean) {
    this.cap = cap;
    const f = () => new Float32Array(cap);
    this.px = f(); this.py = f(); this.pz = f();
    this.vx = f(); this.vy = f(); this.vz = f();
    this.age = f(); this.life = f(); this.s0 = f(); this.s1 = f();
    this.drag = f(); this.grav = f();
    this.c0 = new Float32Array(cap * 4);
    this.c1 = new Float32Array(cap * 4);
    this.alive = new Uint8Array(cap);
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3),
    );
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const mk = (n: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.iPos = mk(3);
    this.iSize = mk(1);
    this.iColor = mk(4);
    g.setAttribute('aPos', this.iPos);
    g.setAttribute('aSize', this.iSize);
    g.setAttribute('aColor', this.iColor);
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      vertexShader: PART_VERT,
      fragmentShader: additive ? PART_FRAG_ADD : PART_FRAG_NORMAL,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 8 : 5;
  }

  emit(o: EmitOpts) {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    this.alive[i] = 1;
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = o.vx ?? 0; this.vy[i] = o.vy ?? 0; this.vz[i] = o.vz ?? 0;
    this.age[i] = 0;
    this.life[i] = o.life;
    this.s0[i] = o.s0;
    this.s1[i] = o.s1 ?? o.s0;
    this.drag[i] = o.drag ?? 0;
    this.grav[i] = o.grav ?? 0;
    const c1 = o.c1 ?? o.c0;
    this.c0[i * 4] = o.c0[0]; this.c0[i * 4 + 1] = o.c0[1]; this.c0[i * 4 + 2] = o.c0[2]; this.c0[i * 4 + 3] = o.a0 ?? 1;
    this.c1[i * 4] = c1[0]; this.c1[i * 4 + 1] = c1[1]; this.c1[i * 4 + 2] = c1[2]; this.c1[i * 4 + 3] = o.a1 ?? 0;
  }

  update(dt: number) {
    let n = 0;
    const pos = this.iPos.array as Float32Array;
    const size = this.iSize.array as Float32Array;
    const col = this.iColor.array as Float32Array;
    for (let i = 0; i < this.cap; i++) {
      if (!this.alive[i]) continue;
      this.age[i] += dt;
      const k = this.age[i] / this.life[i];
      if (k >= 1) {
        this.alive[i] = 0;
        continue;
      }
      const dr = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= dr; this.vy[i] *= dr; this.vz[i] *= dr;
      this.vy[i] -= this.grav[i] * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      pos[n * 3] = this.px[i]; pos[n * 3 + 1] = this.py[i]; pos[n * 3 + 2] = this.pz[i];
      size[n] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      const j = i * 4;
      col[n * 4] = this.c0[j] + (this.c1[j] - this.c0[j]) * k;
      col[n * 4 + 1] = this.c0[j + 1] + (this.c1[j + 1] - this.c0[j + 1]) * k;
      col[n * 4 + 2] = this.c0[j + 2] + (this.c1[j + 2] - this.c0[j + 2]) * k;
      col[n * 4 + 3] = this.c0[j + 3] + (this.c1[j + 3] - this.c0[j + 3]) * k;
      n++;
    }
    this.geo.instanceCount = n;
    this.iPos.needsUpdate = true;
    this.iSize.needsUpdate = true;
    this.iColor.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/*  Shader sprites — flare / star / ring / halo / crescent / mirror     */
/* ------------------------------------------------------------------ */

export enum SpriteType {
  Flare = 0,
  Star = 1,
  Ring = 2,
  Halo = 3,
  Crescent = 4,
  Mirror = 5,
}

const SPRITE_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SPRITE_FRAG = /* glsl */ `
uniform float uType;
uniform float uProg;
uniform float uTime;
uniform float uInt;
uniform float uSeed;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float fade = 1.0 - uProg;
  float v = 0.0;
  if (uType < 0.5) {
    float core = exp(-r * r * 45.0);
    float glow = exp(-r * r * 5.5);
    float sh = exp(-abs(p.y) * 38.0) * exp(-abs(p.x) * 1.9);
    float sv = exp(-abs(p.x) * 50.0) * exp(-abs(p.y) * 3.2) * 0.45;
    v = core * 2.2 + glow * 0.7 + sh + sv;
    v *= smoothstep(1.0, 0.55, abs(p.x)) * smoothstep(1.0, 0.55, abs(p.y));
    v *= fade;
  } else if (uType < 1.5) {
    float ang = atan(p.y, p.x);
    float s1 = pow(abs(cos(ang * 2.5 + uSeed * 6.283)), 16.0);
    float s2 = pow(abs(cos(ang * 4.5 + uSeed * 17.0)), 40.0) * 0.7;
    float s3 = pow(abs(cos(ang * 7.0 + uSeed * 31.0)), 60.0) * 0.5;
    float rad = exp(-r * 3.0);
    v = ((s1 + s2 + s3) * rad * 2.4 + exp(-r * r * 16.0) * 2.0) * smoothstep(1.0, 0.45, r);
    v *= fade;
  } else if (uType < 2.5) {
    float rad = (1.0 - pow(1.0 - uProg, 2.4)) * 0.94;
    float w = mix(0.15, 0.022, uProg);
    float x = (r - rad) / w;
    float ring = exp(-x * x);
    float inner = smoothstep(rad, 0.0, r) * 0.1;
    v = (ring * 1.7 + inner) * fade * smoothstep(1.0, 0.92, r);
  } else if (uType < 3.5) {
    float ang = atan(p.y, p.x) + uTime * 0.7;
    float ring1 = exp(-pow((r - 0.86) / 0.014, 2.0));
    float tick = 0.35 + 0.65 * step(0.0, sin(ang * 60.0));
    float ring2 = exp(-pow((r - 0.66) / 0.022, 2.0)) * tick;
    float ring3 = exp(-pow((r - 0.42) / 0.01, 2.0));
    float ring4 = exp(-pow((r - 0.25) / 0.02, 2.0)) * (0.4 + 0.6 * step(0.0, sin(-ang * 24.0)));
    float rays = pow(abs(cos(ang * 6.0)), 40.0) * exp(-r * 2.2) * smoothstep(0.05, 0.25, r);
    float rays2 = pow(abs(cos(ang * 12.0 + 0.5)), 80.0) * exp(-r * 3.0) * smoothstep(0.1, 0.3, r) * 0.7;
    float glow = exp(-r * r * 7.0) * 0.9;
    v = ring1 * 1.4 + ring2 + ring3 * 1.2 + ring4 + rays * 1.2 + rays2 + glow;
    v *= smoothstep(1.0, 0.9, r) * fade;
  } else if (uType < 4.5) {
    float th = uSeed;
    float d1 = length(p) - 0.96;
    float d2 = length(p - vec2(0.0, -th * 2.0)) - 0.96;
    float inside = smoothstep(0.02, -0.02, d1) * smoothstep(-0.02, 0.02, d2);
    float ca = clamp(d2 / (th * 2.0), 0.0, 1.0);
    float prof = pow(ca, 1.4);
    float glow = exp(-max(d1, 0.0) * 26.0) * step(0.0, d2) * 0.55;
    v = inside * (0.35 + 2.2 * prof) + glow;
    v *= fade;
  } else {
    vec2 q = abs(p) - vec2(0.78, 0.9);
    float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.06;
    float frame = exp(-pow(sd / 0.025, 2.0));
    float inside = smoothstep(0.0, -0.03, sd);
    float diag = exp(-pow((p.x - p.y * 0.55 - (uProg * 3.2 - 1.6)) / 0.16, 2.0));
    float lines = 0.5 + 0.5 * sin((p.x + p.y) * 22.0);
    float flash = exp(-uProg * 9.0);
    v = frame * 1.6 + inside * (0.14 + diag * 1.3 + lines * 0.05) + inside * flash * 2.2;
    v *= pow(fade, 1.3);
  }
  gl_FragColor = vec4(min(uColor * v * uInt, vec3(60.0)), 1.0);
}`;

export class Sprite {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age = 0;
  life = 1;
  active = false;
  onUpdate?: (s: Sprite, dt: number) => void;
  s0 = new THREE.Vector2(1, 1);
  s1 = new THREE.Vector2(1, 1);
  billboard = true;
  spin = 0;
  spinRate = 0;
  intBase = 1;
  intFade = true;
  constructor(geo: THREE.PlaneGeometry) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERT,
      fragmentShader: SPRITE_FRAG,
      uniforms: {
        uType: { value: 0 },
        uProg: { value: 0 },
        uTime: { value: 0 },
        uInt: { value: 1 },
        uSeed: { value: 0 },
        uColor: { value: new THREE.Color(1, 1, 1) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 10;
  }
  get prog() {
    return Math.min(1, this.age / this.life);
  }
}

export interface SpriteOpts {
  type: SpriteType;
  pos: THREE.Vector3;
  size: number | [number, number];
  size1?: number | [number, number];
  life: number;
  color?: RGB;
  intensity?: number;
  seed?: number;
  billboard?: boolean;
  quat?: THREE.Quaternion;
  spin?: number;
  spinRate?: number;
  near?: boolean;
  intFade?: boolean;
}

export class Sprites {
  group = new THREE.Group();
  private pool: Sprite[] = [];
  private geo = new THREE.PlaneGeometry(1, 1);
  private qSpin = new THREE.Quaternion();
  private zAxis = new THREE.Vector3(0, 0, 1);
  private cursor = 0;

  constructor(count = 96) {
    for (let i = 0; i < count; i++) {
      const s = new Sprite(this.geo);
      this.pool.push(s);
      this.group.add(s.mesh);
    }
  }

  spawn(o: SpriteOpts): Sprite {
    let s: Sprite | null = null;
    for (let k = 0; k < this.pool.length; k++) {
      const c = this.pool[(this.cursor + k) % this.pool.length];
      if (!c.active) {
        s = c;
        this.cursor = (this.cursor + k + 1) % this.pool.length;
        break;
      }
    }
    if (!s) {
      s = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.pool.length;
    }
    s.active = true;
    s.age = 0;
    s.life = o.life;
    s.onUpdate = undefined;
    s.mesh.visible = true;
    s.mesh.position.copy(o.pos);
    const sz0 = typeof o.size === 'number' ? ([o.size, o.size] as [number, number]) : o.size;
    const sz1 = o.size1 === undefined ? sz0 : typeof o.size1 === 'number' ? ([o.size1, o.size1] as [number, number]) : o.size1;
    s.s0.set(sz0[0], sz0[1]);
    s.s1.set(sz1[0], sz1[1]);
    s.billboard = o.billboard ?? true;
    s.spin = o.spin ?? 0;
    s.spinRate = o.spinRate ?? 0;
    s.intBase = o.intensity ?? 1;
    s.intFade = o.intFade ?? true;
    s.mesh.layers.set(o.near ? 1 : 0);
    if (!s.billboard && o.quat) s.mesh.quaternion.copy(o.quat);
    const u = s.mat.uniforms;
    u.uType.value = o.type;
    u.uSeed.value = o.seed ?? Math.random();
    const c = o.color ?? [1, 0.85, 0.5];
    (u.uColor.value as THREE.Color).setRGB(c[0], c[1], c[2]);
    u.uInt.value = s.intBase;
    u.uProg.value = 0;
    u.uTime.value = 0;
    s.mesh.scale.set(s.s0.x, s.s0.y, 1);
    return s;
  }

  update(dt: number, camera: THREE.Camera) {
    for (const s of this.pool) {
      if (!s.active) continue;
      s.age += dt;
      if (s.age >= s.life) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }
      s.onUpdate?.(s, dt);
      const k = s.prog;
      const e = 1 - Math.pow(1 - k, 2.2);
      s.mesh.scale.set(
        s.s0.x + (s.s1.x - s.s0.x) * e,
        s.s0.y + (s.s1.y - s.s0.y) * e,
        1,
      );
      s.spin += s.spinRate * dt;
      if (s.billboard) {
        this.qSpin.setFromAxisAngle(this.zAxis, s.spin);
        s.mesh.quaternion.copy(camera.quaternion).multiply(this.qSpin);
      }
      const u = s.mat.uniforms;
      u.uProg.value = k;
      u.uTime.value = s.age;
      u.uInt.value = s.intBase;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Light columns — giant beams, pillars, domes                         */
/* ------------------------------------------------------------------ */

const COL_VERT = /* glsl */ `
uniform float uMode;
uniform float uR0;
uniform float uR1;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec3 pp = position;
  if (uMode < 0.5) {
    pp.xz *= mix(uR0, uR1, uv.y);
  }
  vec4 mv = modelViewMatrix * vec4(pp, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const COL_FRAG = /* glsl */ `
uniform float uTime;
uniform float uInt;
uniform float uLen;
uniform float uMode;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  vec3 col;
  if (uMode < 0.5) {
    float prof = pow(facing, 1.5);
    float y = vUv.y * uLen;
    float n1 = fbm(vec2(vUv.x * 9.0, y * 0.05 - uTime * 7.0));
    float n2 = fbm(vec2(vUv.x * 17.0 + 7.0, y * 0.11 - uTime * 13.0));
    float streak = 0.55 + 1.1 * n1 * n2 * 2.0;
    float helix = smoothstep(0.55, 1.0, sin(y * 0.22 - uTime * 26.0 + vUv.x * 12.566));
    float bands = smoothstep(0.82, 1.0, sin(y * 0.09 - uTime * 18.0)) * 0.7;
    vec3 hot = mix(uColor, vec3(1.0), pow(facing, 2.6));
    col = hot * (prof * streak + helix * 0.65 * (1.0 - prof * 0.4) + bands * prof);
    col *= 1.0 + 0.5 * smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.0, 0.08, vUv.y));
  } else {
    float rim = pow(1.0 - facing, 2.2);
    float n = fbm(vUv * vec2(12.0, 6.0) + vec2(uTime * 0.6, -uTime * 1.4));
    vec3 hot = mix(uColor, vec3(1.0), 0.35 + 0.4 * facing);
    col = hot * (0.25 + rim * 1.6 + n * 0.8);
  }
  gl_FragColor = vec4(min(col * uInt, vec3(60.0)), 1.0);
}`;

export class LightColumn {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  active = false;
  age = 0;
  life = 1;
  attack = 0.05;
  decay = 0.3;
  intensity = 1;
  from = new THREE.Vector3();
  to = new THREE.Vector3();
  r0 = 1;
  r1 = 1;
  mode: 0 | 1 = 0;
  hold = false; // if true, caller drives `env` manually
  env = 1;
  onUpdate?: (c: LightColumn, dt: number) => void;
  constructor(geo: THREE.BufferGeometry) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: COL_VERT,
      fragmentShader: COL_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uInt: { value: 1 },
        uLen: { value: 100 },
        uMode: { value: 0 },
        uR0: { value: 1 },
        uR1: { value: 1 },
        uColor: { value: new THREE.Color(1, 0.75, 0.3) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 7;
  }
}

export class Columns {
  group = new THREE.Group();
  private cylGeo = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true);
  private sphGeo = new THREE.SphereGeometry(1, 40, 24);
  private cyl: LightColumn[] = [];
  private sph: LightColumn[] = [];
  private up = new THREE.Vector3(0, 1, 0);
  private dir = new THREE.Vector3();

  constructor(nCyl = 24, nSph = 8) {
    // Cylinder: radiusTop = 1 (far end, y=+0.5), radiusBottom set via scale per-end → use custom taper
    this.cylGeo.translate(0, 0.5, 0); // y from 0..1
    for (let i = 0; i < nCyl; i++) {
      const c = new LightColumn(this.cylGeo);
      this.cyl.push(c);
      this.group.add(c.mesh);
    }
    for (let i = 0; i < nSph; i++) {
      const c = new LightColumn(this.sphGeo);
      c.mode = 1;
      c.mat.uniforms.uMode.value = 1;
      this.sph.push(c);
      this.group.add(c.mesh);
    }
  }

  private acquire(list: LightColumn[]) {
    let c = list.find((x) => !x.active);
    if (!c) {
      c = list.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    }
    c.active = true;
    c.age = 0;
    c.hold = false;
    c.env = 1;
    c.onUpdate = undefined;
    c.mesh.visible = true;
    return c;
  }

  beam(
    from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, life: number,
    color: RGB = [1, 0.75, 0.3], intensity = 1, attack = 0.05, decay = 0.3,
  ) {
    const c = this.acquire(this.cyl);
    c.from.copy(from);
    c.to.copy(to);
    c.r0 = r0;
    c.r1 = r1;
    c.life = life;
    c.attack = attack;
    c.decay = decay;
    c.intensity = intensity;
    (c.mat.uniforms.uColor.value as THREE.Color).setRGB(color[0], color[1], color[2]);
    this.place(c);
    return c;
  }

  dome(pos: THREE.Vector3, r0: number, r1: number, life: number, color: RGB = [1, 0.7, 0.3], intensity = 1) {
    const c = this.acquire(this.sph);
    c.from.copy(pos);
    c.to.copy(pos);
    c.r0 = r0;
    c.r1 = r1;
    c.life = life;
    c.attack = 0.02;
    c.decay = life * 0.7;
    c.intensity = intensity;
    (c.mat.uniforms.uColor.value as THREE.Color).setRGB(color[0], color[1], color[2]);
    this.place(c);
    return c;
  }

  place(c: LightColumn) {
    const m = c.mesh;
    if (c.mode === 1) {
      m.position.copy(c.from);
      const k = Math.min(1, c.age / c.life);
      const r = c.r0 + (c.r1 - c.r0) * (1 - Math.pow(1 - k, 3));
      m.scale.setScalar(Math.max(0.001, r));
      return;
    }
    this.dir.subVectors(c.to, c.from);
    const len = this.dir.length();
    if (len < 1e-4) {
      m.visible = false;
      return;
    }
    this.dir.divideScalar(len);
    m.position.copy(c.from);
    m.quaternion.setFromUnitVectors(this.up, this.dir);
    m.scale.set(1, len, 1);
    c.mat.uniforms.uR0.value = c.r0;
    c.mat.uniforms.uR1.value = c.r1;
    c.mat.uniforms.uLen.value = len;
  }

  update(dt: number, time: number) {
    const upd = (c: LightColumn) => {
      if (!c.active) return;
      c.age += dt;
      if (c.age >= c.life) {
        c.active = false;
        c.mesh.visible = false;
        return;
      }
      c.onUpdate?.(c, dt);
      if (!c.hold) {
        const a = Math.min(1, c.age / Math.max(1e-3, c.attack));
        const d = Math.min(1, (c.life - c.age) / Math.max(1e-3, c.decay));
        c.env = a * a * (d * d * (3 - 2 * d));
      }
      this.place(c);
      c.mat.uniforms.uTime.value = time;
      c.mat.uniforms.uInt.value = c.intensity * c.env;
    };
    this.cyl.forEach(upd);
    this.sph.forEach(upd);
  }
}

/* ------------------------------------------------------------------ */
/*  Ribbon — swept trail between two moving points (sword trail)        */
/* ------------------------------------------------------------------ */

const RIB_VERT = /* glsl */ `
attribute float aAge;
varying vec2 vUv;
varying float vAge;
void main() {
  vUv = uv;
  vAge = aAge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const RIB_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uInt;
varying vec2 vUv;
varying float vAge;
void main() {
  float a = pow(1.0 - vAge, 2.0);
  float edge = pow(vUv.y, 2.2);
  float hot = pow(vUv.y, 6.0);
  vec3 col = mix(uColor, vec3(1.0), hot) * (0.12 + edge * 1.5 + hot * 2.0);
  gl_FragColor = vec4(min(col * uInt * a, vec3(60.0)), 1.0);
}`;

export class Ribbon {
  mesh: THREE.Mesh;
  private cap: number;
  private samples: { b: THREE.Vector3; t: THREE.Vector3; age: number }[] = [];
  private pos: Float32Array;
  private uv: Float32Array;
  private ageA: Float32Array;
  private geo: THREE.BufferGeometry;
  maxAge = 0.45;
  intensity = 1;
  mat: THREE.ShaderMaterial;

  constructor(cap = 48) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 2 * 3);
    this.uv = new Float32Array(cap * 2 * 2);
    this.ageA = new Float32Array(cap * 2);
    const idx: number[] = [];
    for (let i = 0; i < cap - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAge', new THREE.BufferAttribute(this.ageA, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: RIB_VERT,
      fragmentShader: RIB_FRAG,
      uniforms: { uColor: { value: new THREE.Color(1, 0.8, 0.35) }, uInt: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
  }

  push(b: THREE.Vector3, t: THREE.Vector3) {
    this.samples.unshift({ b: b.clone(), t: t.clone(), age: 0 });
    if (this.samples.length > this.cap) this.samples.pop();
  }

  clear() {
    this.samples.length = 0;
    this.geo.setDrawRange(0, 0);
  }

  update(dt: number) {
    for (const s of this.samples) s.age += dt;
    while (this.samples.length && this.samples[this.samples.length - 1].age > this.maxAge) this.samples.pop();
    const n = this.samples.length;
    this.mat.uniforms.uInt.value = this.intensity;
    if (n < 2) {
      this.geo.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const k = Math.min(1, s.age / this.maxAge);
      const u = i / (n - 1);
      this.pos.set([s.b.x, s.b.y, s.b.z, s.t.x, s.t.y, s.t.z], i * 6);
      this.uv.set([u, 0, u, 1], i * 4);
      this.ageA[i * 2] = k;
      this.ageA[i * 2 + 1] = k;
    }
    this.geo.setDrawRange(0, (n - 1) * 6);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.uv as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAge as THREE.BufferAttribute).needsUpdate = true;
  }
}
