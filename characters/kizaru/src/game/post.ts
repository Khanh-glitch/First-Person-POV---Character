import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { damp } from './util';

const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uAspect;
uniform float uRadial;
uniform float uChroma;
uniform float uVignette;
uniform float uFlash;
uniform float uInvert;
uniform float uDim;
uniform float uWarp;
uniform float uGrain;
uniform float uSat;
uniform vec2 uCenter;
uniform vec4 uShock0;
uniform vec4 uShock1;
varying vec2 vUv;

vec2 shock(vec2 uv, vec4 s) {
  if (s.w < 0.0005) return uv;
  vec2 d = uv - s.xy;
  d.x *= uAspect;
  float r = length(d);
  float x = r - s.z;
  float f = exp(-x * x / 0.0016);
  vec2 dir = d / max(r, 1e-4);
  dir.x /= uAspect;
  return uv - dir * f * s.w;
}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec2 uv = vUv;
  uv = shock(uv, uShock0);
  uv = shock(uv, uShock1);
  vec2 c = uv - 0.5;
  uv = 0.5 + c * (1.0 + uWarp * dot(c, c));
  vec2 dir = uv - uCenter;
  vec3 col;
  if (uRadial < 0.002) {
    vec2 ca = dir * uChroma * 0.02;
    col = vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
  } else {
    col = vec3(0.0);
    float tot = 0.0;
    for (int i = 0; i < 14; i++) {
      float t = float(i) / 13.0;
      float w = 1.0 - t * 0.6;
      vec2 p = uCenter + dir * (1.0 - uRadial * 0.3 * t);
      vec2 ca = (p - uCenter) * (uChroma * 0.035);
      col += vec3(texture2D(tDiffuse, p + ca).r, texture2D(tDiffuse, p).g, texture2D(tDiffuse, p - ca).b) * w;
      tot += w;
    }
    col /= tot;
  }
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col *= mix(1.0 - uDim, 1.0, smoothstep(0.8, 3.5, lum));
  vec2 q = (vUv - 0.5) * vec2(uAspect * 0.7, 1.0);
  float vg = smoothstep(0.25, 0.95, length(q));
  col *= 1.0 - vg * (0.5 + uVignette);
  col = mix(col, col * vec3(1.06, 0.97, 0.82), 0.5 + vg * 0.4);
  float l2 = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l2), col, uSat);
  col += uFlash * vec3(1.0, 0.94, 0.8) * 1.7;
  col = mix(col, vec3(1.0) - clamp(col * 0.6, 0.0, 1.0), uInvert);
  col += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

type Key = 'flash' | 'radial' | 'chroma' | 'invert' | 'dim' | 'warp' | 'vignette' | 'sat';

interface Shock {
  x: number;
  y: number;
  r: number;
  s: number;
  age: number;
  life: number;
  speed: number;
  s0: number;
}

export class PostFx {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  pass: ShaderPass;
  p: Record<Key, number> = { flash: 0, radial: 0, chroma: 0.08, invert: 0, dim: 0, warp: 0, vignette: 0, sat: 1 };
  t: Record<Key, number> = { flash: 0, radial: 0, chroma: 0.08, invert: 0, dim: 0, warp: 0, vignette: 0, sat: 1 };
  k: Record<Key, number> = { flash: 5.5, radial: 7, chroma: 5, invert: 40, dim: 2.5, warp: 6, vignette: 3, sat: 4 };
  center = new THREE.Vector2(0.5, 0.5);
  bloomBase = 0.42;
  bloomBoost = 0;
  private shocks: Shock[] = [];
  private cursor = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number, pr: number) {
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), this.bloomBase, 0.55, 1.15);
    this.composer.addPass(this.bloom);
    this.pass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uAspect: { value: w / h },
        uRadial: { value: 0 },
        uChroma: { value: 0.08 },
        uVignette: { value: 0 },
        uFlash: { value: 0 },
        uInvert: { value: 0 },
        uDim: { value: 0 },
        uWarp: { value: 0 },
        uGrain: { value: 0.035 },
        uSat: { value: 1 },
        uCenter: { value: this.center },
        uShock0: { value: new THREE.Vector4() },
        uShock1: { value: new THREE.Vector4() },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: FRAG,
    });
    this.composer.addPass(this.pass);
    this.composer.addPass(new OutputPass());
    for (let i = 0; i < 2; i++) this.shocks.push({ x: 0.5, y: 0.5, r: 0, s: 0, age: 1, life: 1, speed: 1, s0: 0 });
  }

  setSize(w: number, h: number, pr: number) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.pass.uniforms.uAspect.value = w / h;
  }

  pulse(key: Key, v: number) {
    if (Math.abs(v) > Math.abs(this.p[key])) this.p[key] = v;
  }
  hold(key: Key, v: number) {
    this.t[key] = v;
  }
  release(key: Key) {
    this.t[key] = key === 'sat' ? 1 : key === 'chroma' ? 0.08 : 0;
  }
  shock(x: number, y: number, strength: number, speed: number, life = 0.9) {
    const s = this.shocks[this.cursor];
    this.cursor = (this.cursor + 1) % this.shocks.length;
    s.x = x; s.y = y; s.r = 0; s.s = strength; s.s0 = strength; s.age = 0; s.life = life; s.speed = speed;
  }

  update(dt: number, time: number) {
    const u = this.pass.uniforms;
    (Object.keys(this.p) as Key[]).forEach((key) => {
      this.p[key] = damp(this.p[key], this.t[key], this.k[key], dt);
    });
    u.uTime.value = time;
    u.uRadial.value = this.p.radial;
    u.uChroma.value = this.p.chroma;
    u.uVignette.value = this.p.vignette;
    u.uFlash.value = this.p.flash;
    u.uInvert.value = this.p.invert;
    u.uDim.value = this.p.dim;
    u.uWarp.value = this.p.warp;
    u.uSat.value = this.p.sat;
    this.shocks.forEach((s, i) => {
      s.age += dt;
      s.r += s.speed * dt;
      const k = Math.min(1, s.age / s.life);
      const str = k >= 1 ? 0 : s.s0 * Math.pow(1 - k, 1.5);
      (u[i === 0 ? 'uShock0' : 'uShock1'].value as THREE.Vector4).set(s.x, s.y, s.r, str);
    });
    this.bloom.strength = this.bloomBase + this.bloomBoost;
    this.bloomBoost = damp(this.bloomBoost, 0, 4, dt);
  }

  draw(dt: number) {
    this.composer.render(dt);
  }

  render(dt: number, time: number) {
    this.update(dt, time);
    this.draw(dt);
  }
}
