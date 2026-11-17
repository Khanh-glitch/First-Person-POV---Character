import * as THREE from "three";

export interface EmitOpts {
  pos: THREE.Vector3;
  vel?: THREE.Vector3;
  color?: THREE.Color | number;
  size?: number;
  sizeEnd?: number;
  life?: number;
  gravity?: number;
  drag?: number;
  spin?: number;
  alpha?: number;
}

const tmpC = new THREE.Color();

export class Particles {
  max: number;
  points: THREE.Points;
  geo: THREE.BufferGeometry;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  alpha: Float32Array;
  rot: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  s0: Float32Array;
  s1: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  spin: Float32Array;
  a0: Float32Array;
  cursor = 0;

  constructor(max: number, tex: THREE.Texture, blending: THREE.Blending = THREE.AdditiveBlending) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.spin = new Float32Array(max);
    this.a0 = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aRot", new THREE.BufferAttribute(this.rot, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = geo;

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: tex }, uScale: { value: window.innerHeight * 0.5 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aRot;
        varying vec3 vColor; varying float vAlpha; varying float vRot;
        uniform float uScale;
        void main(){
          vColor = aColor; vAlpha = aAlpha; vRot = aRot;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        varying vec3 vColor; varying float vAlpha; varying float vRot;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          p = mat2(c,-s,s,c) * p + 0.5;
          vec4 t = texture2D(uTex, vec2(p.x, 1.0 - p.y));
          if (t.a < 0.01) discard;
          gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  emit(o: EmitOpts) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = o.pos.x;
    this.pos[i3 + 1] = o.pos.y;
    this.pos[i3 + 2] = o.pos.z;
    const v = o.vel;
    this.vel[i3] = v ? v.x : 0;
    this.vel[i3 + 1] = v ? v.y : 0;
    this.vel[i3 + 2] = v ? v.z : 0;
    if (o.color instanceof THREE.Color) tmpC.copy(o.color);
    else tmpC.set(o.color ?? 0xffffff);
    this.col[i3] = tmpC.r;
    this.col[i3 + 1] = tmpC.g;
    this.col[i3 + 2] = tmpC.b;
    this.s0[i] = o.size ?? 0.3;
    this.s1[i] = o.sizeEnd ?? 0;
    this.maxLife[i] = this.life[i] = o.life ?? 1;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.spin[i] = o.spin ?? 0;
    this.rot[i] = Math.random() * 6.28 * (o.spin ? 1 : 0);
    this.a0[i] = o.alpha ?? 1;
    this.size[i] = this.s0[i];
    this.alpha[i] = this.a0[i];
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        this.pos[i3 + 1] = -9999;
        continue;
      }
      const k = 1 - this.life[i] / this.maxLife[i];
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.grav[i] * dt;
      this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k;
      this.alpha[i] = this.a0[i] * Math.min(1, (1 - k) * 2.5) * Math.min(1, k * 12 + 0.2);
      this.rot[i] += this.spin[i] * dt;
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = true;
    a.aColor.needsUpdate = true;
    a.aSize.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
    a.aRot.needsUpdate = true;
  }

  resize() {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = window.innerHeight * 0.5;
  }
}
