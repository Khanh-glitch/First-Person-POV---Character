import * as THREE from "three";

export interface EmitOpts {
  pos: THREE.Vector3;
  count?: number;
  speed?: number;
  speedVar?: number;
  dir?: THREE.Vector3; // bias direction
  spread?: number; // 0 = along dir, 1 = sphere
  color?: THREE.Color | number;
  color2?: THREE.Color | number;
  size?: number;
  sizeVar?: number;
  life?: number;
  lifeVar?: number;
  gravity?: number;
  drag?: number;
  posJitter?: number;
  grow?: number; // size growth multiplier over life
  stretch?: number;
}

const vert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main(){
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), 90.0);
  if(-mv.z < 0.6) vAlpha = aAlpha * smoothstep(0.15, 0.6, -mv.z); else vAlpha = aAlpha;
  vColor = aColor;
}`;

const fragGlow = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  a = a*a;
  float core = smoothstep(0.18,0.0,d);
  gl_FragColor = vec4(vColor * (a + core*1.5) * vAlpha, 1.0);
}`;

const fragSmoke = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.1, d);
  gl_FragColor = vec4(vColor, a * vAlpha * 0.55);
}`;

export class ParticlePool {
  points: THREE.Points;
  cap: number;
  pos: Float32Array;
  vel: Float32Array;
  col: Float32Array;
  col0: Float32Array;
  col1: Float32Array;
  size: Float32Array;
  size0: Float32Array;
  alpha: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  grow: Float32Array;
  cursor = 0;
  geo: THREE.BufferGeometry;
  mat: THREE.ShaderMaterial;
  private tmp = new THREE.Vector3();
  private c0 = new THREE.Color();
  private c1 = new THREE.Color();

  constructor(cap: number, kind: "glow" | "smoke") {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.col0 = new Float32Array(cap * 3);
    this.col1 = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.size0 = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    for (let i = 0; i < cap; i++) this.pos[i * 3 + 1] = -9999;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: kind === "glow" ? fragGlow : fragSmoke,
      uniforms: { uScale: { value: 300 } },
      transparent: true,
      depthWrite: false,
      blending: kind === "glow" ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = kind === "glow" ? 10 : 5;
  }

  emit(o: EmitOpts) {
    const count = o.count ?? 20;
    const speed = o.speed ?? 5;
    const sv = o.speedVar ?? 0.5;
    const spread = o.spread ?? 1;
    this.c0.set(o.color ?? 0xffffff);
    this.c1.set(o.color2 ?? o.color ?? 0xffffff);
    const life = o.life ?? 1;
    const lv = o.lifeVar ?? 0.4;
    const size = o.size ?? 1;
    const szv = o.sizeVar ?? 0.5;
    const pj = o.posJitter ?? 0;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.cap;
      const t = this.tmp.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (t.lengthSq() > 1) t.normalize();
      t.normalize();
      if (o.dir) {
        t.multiplyScalar(spread).add(o.dir).normalize();
      }
      const s = speed * (1 - sv + Math.random() * sv * 2);
      this.vel[i * 3] = t.x * s;
      this.vel[i * 3 + 1] = t.y * s;
      this.vel[i * 3 + 2] = t.z * s;
      this.pos[i * 3] = o.pos.x + (Math.random() - 0.5) * pj;
      this.pos[i * 3 + 1] = o.pos.y + (Math.random() - 0.5) * pj;
      this.pos[i * 3 + 2] = o.pos.z + (Math.random() - 0.5) * pj;
      const k = Math.random();
      this.col0[i * 3] = this.c0.r + (this.c1.r - this.c0.r) * k;
      this.col0[i * 3 + 1] = this.c0.g + (this.c1.g - this.c0.g) * k;
      this.col0[i * 3 + 2] = this.c0.b + (this.c1.b - this.c0.b) * k;
      this.size0[i] = size * (1 - szv + Math.random() * szv * 2);
      const l = life * (1 - lv + Math.random() * lv * 2);
      this.life[i] = l;
      this.maxLife[i] = l;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1;
      this.grow[i] = o.grow ?? 0;
    }
  }

  update(dt: number) {
    const p = this.pos,
      v = this.vel;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          p[i * 3 + 1] = -9999;
        }
        continue;
      }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.pow(this.drag[i] === 1 ? 1 : this.drag[i], dt * 60);
      v[i * 3] *= dr;
      v[i * 3 + 1] = v[i * 3 + 1] * dr - this.grav[i] * dt;
      v[i * 3 + 2] *= dr;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < -2 && this.grav[i] > 0) {
        v[i * 3 + 1] *= -0.3;
      }
      const fadeIn = Math.min(1, (1 - k) * 12);
      this.alpha[i] = k * fadeIn;
      this.size[i] = this.size0[i] * (1 + this.grow[i] * (1 - k));
      this.col[i * 3] = this.col0[i * 3];
      this.col[i * 3 + 1] = this.col0[i * 3 + 1];
      this.col[i * 3 + 2] = this.col0[i * 3 + 2];
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}
