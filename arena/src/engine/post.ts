/**
 * HẬU KỲ — port nguyên văn từ 7 dự án gốc.
 *
 * Mỗi dự án gốc có một pipeline riêng: RenderPass → UnrealBloom → shader
 * riêng → OutputPass. Module này dựng lại **đúng** từng pipeline đó, giữ
 * nguyên:
 *   - mã GLSL của fragment shader (chép nguyên văn, không rút gọn)
 *   - tên và giá trị khởi tạo của mọi uniform
 *   - tham số UnrealBloomPass (strength, radius, threshold)
 *   - thứ tự các pass
 *
 * Khác biệt duy nhất so với bản gốc: các uniform được điều khiển bằng sự
 * kiện của đấu trường (ra đòn, trúng đòn, trạng thái) thay vì input bàn
 * phím của từng game.
 *
 * Nguồn từng pipeline:
 *   boa-hancock  characters/boa-hancock/src/game/post.ts   (FinalShader)
 *   captain-kid  characters/captain-kid/src/game/PostFX.ts (FinalShader)
 *   doflamingo   characters/doflamingo/src/engine/Post.ts  (AnimeGradeShader)
 *   imu          characters/imu/src/engine/post.ts         (FinalShader)
 *   kizaru       characters/kizaru/src/game/post.ts        (FRAG + PostFx)
 *   luffy        characters/luffy/src/game/post.ts         (FinalShader)
 *   zoro         characters/zoro/src/engine/shaders.ts     (AnimeSakugaPostShader)
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { CharId } from '../data/roster';

/* ==================================================================== types */

/** Bộ điều khiển chung: mỗi nhân vật hiện thực hoá theo cách của nó */
export interface PostRig {
  render(dt: number, time: number): void;
  resize(w: number, h: number): void;
  /** hiệu ứng lúc bắt đầu niệm chiêu */
  onCastStart(move: { ultimate?: boolean; color: string }, power: number): void;
  /** hiệu ứng lúc đòn trúng đích */
  onHit(move: { ultimate?: boolean; color: string }, power: number): void;
  /** hiệu ứng khi người chơi bị đánh */
  onHurt(intensity: number): void;
  /** cập nhật liên tục (máu còn lại, đang chạy, đang niệm chiêu) */
  tick(ctx: PostContext): void;
  dispose(): void;
}

export interface PostContext {
  hpRatio: number;
  moving: boolean;
  casting: boolean;
  /** 0..1 tiến trình niệm chiêu hiện tại */
  castK: number;
}

const damp = (a: number, b: number, k: number, dt: number): number =>
  THREE.MathUtils.lerp(a, b, 1 - Math.exp(-k * dt));

/* ============================================================== 1. HANCOCK */

/** characters/boa-hancock/src/game/post.ts — chép nguyên văn */
const HANCOCK_FINAL = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAberr: { value: 0.002 },
    uRadial: { value: 0 },
    uLines: { value: 0 },
    uLineCol: { value: new THREE.Color(1, 0.9, 0.96) },
    uHaki: { value: 0 },
    uInvert: { value: 0 },
    uHurt: { value: 0 },
    uFlash: { value: 0 },
    uFlashCol: { value: new THREE.Color(1, 0.5, 0.8) },
    uVig: { value: 0.55 },
    uLove: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAberr, uRadial, uLines, uHaki, uInvert, uHurt, uFlash, uVig, uLove;
    uniform vec3 uFlashCol, uLineCol;
    varying vec2 vUv;
    float hash(float n){ return fract(sin(n)*43758.5453123); }
    float hash2(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 dc = vUv - 0.5;
      float r = length(dc);
      vec2 off = dc * uAberr * (0.5 + r*2.0);
      vec3 col;
      if (uRadial > 0.001) {
        col = vec3(0.0);
        for (int i = 0; i < 12; i++) {
          float f = float(i) / 12.0;
          vec2 u = 0.5 + dc * (1.0 - uRadial * f * 0.16);
          col.r += texture2D(tDiffuse, u + off).r;
          col.g += texture2D(tDiffuse, u + off * 0.0).g;
          col.b += texture2D(tDiffuse, u - off).b;
        }
        col /= 12.0;
      } else {
        col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      }
      // anime speed lines
      if (uLines > 0.001) {
        float ang = atan(dc.y, dc.x);
        float id = floor((ang + 3.14159) / 6.28318 * 220.0);
        float rnd = hash(id * 1.37 + floor(uTime * 22.0) * 17.13);
        float ln = step(0.78, rnd) * smoothstep(0.22 + rnd * 0.18, 0.75, r);
        col = mix(col, uLineCol * 1.6, ln * uLines * 0.85);
      }
      // love tint (soft pink bloom haze)
      col = mix(col, col * vec3(1.15, 0.85, 1.05) + vec3(0.08, 0.0, 0.05), uLove);
      // haoshoku: ink + blood
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 hk = vec3(lum * 1.7, lum * 0.1, lum * 0.16);
      hk = mix(vec3(0.0), hk, smoothstep(0.06, 0.22, lum));
      hk += vec3(1.0, 0.1, 0.15) * smoothstep(0.85, 1.4, lum);
      col = mix(col, hk, uHaki);
      col = mix(col, vec3(1.0) - clamp(col, 0.0, 1.0), uInvert);
      // vignette / hurt
      col *= 1.0 - smoothstep(0.35, 0.95, r) * uVig;
      col = mix(col, vec3(0.7, 0.0, 0.04), smoothstep(0.25, 0.85, r) * uHurt);
      col += uFlashCol * uFlash;
      col += (hash2(vUv * 913.0 + uTime) - 0.5) * 0.035;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

class HancockPost implements PostRig {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private final: ShaderPass;
  private u: typeof HANCOCK_FINAL.uniforms;
  private loveFx = 0;
  private flash = 0;
  private hurtFx = 0;
  private radialFx = 0;
  private linesFx = 0;

  constructor(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, w: number, h: number) {
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, cam));
    // đúng tham số gốc: (0.9, 0.55, 0.82)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(HANCOCK_FINAL);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.u = this.final.uniforms as typeof HANCOCK_FINAL.uniforms;
  }

  onCastStart(m: { ultimate?: boolean; color: string }, power: number) {
    const k = Math.min(1, 0.35 + power / 120);
    this.linesFx = k;
    this.radialFx = k * 0.9;
    this.loveFx = Math.min(1, this.loveFx + 0.6 * k);
    if (m.ultimate) this.flash = 1;
  }

  onHit(_m: { ultimate?: boolean; color: string }, power: number) {
    this.flash = Math.max(this.flash, Math.min(1, 0.25 + power / 200));
  }

  onHurt(v: number) {
    this.hurtFx = Math.max(this.hurtFx, v);
  }

  tick(ctx: PostContext) {
    // gốc: uLove tăng khi cast, giảm dần; hurt khi máu thấp
    this.loveFx = damp(this.loveFx, ctx.casting ? 0.9 : 0, 2.4, 1 / 60);
    this.radialFx = damp(this.radialFx, 0, 3.2, 1 / 60);
    this.linesFx = damp(this.linesFx, ctx.moving ? 0.25 : 0, 2.2, 1 / 60);
    this.flash = Math.max(0, this.flash - 4 * (1 / 60));
    this.hurtFx = damp(this.hurtFx, Math.max(0, (0.35 - ctx.hpRatio) / 0.35), 3, 1 / 60);
  }

  render(_dt: number, time: number) {
    const u = this.u;
    u.uTime.value = time;
    u.uAberr.value = 0.0015 + this.radialFx * 0.01 + this.linesFx * 0.008;
    u.uRadial.value = this.radialFx;
    u.uLines.value = Math.min(1, this.linesFx);
    u.uHaki.value = this.loveFx > 0.85 ? 0.35 : 0;
    u.uInvert.value = 0;
    u.uHurt.value = this.hurtFx * 0.8;
    u.uFlash.value = this.flash;
    u.uLove.value = this.loveFx;
    (u.uLineCol.value as THREE.Color).set(this.linesFx > 0.3 ? 0xffe6f3 : 0xffe6f3);
    // gốc: bloom.strength = 0.85 + love*0.5 + haki*0.4
    this.bloom.strength = 0.85 + this.loveFx * 0.5;
    this.composer.render();
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  dispose() {
    this.composer.dispose();
  }
}

/* ================================================================== 2. KID */

/** characters/captain-kid/src/game/PostFX.ts — chép nguyên văn */
const KID_FINAL = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uChroma: { value: 0 },
    uBlur: { value: 0 },
    uSpeed: { value: 0 },
    uImpact: { value: 0 },
    uImpactMode: { value: 0 },
    uDarken: { value: 0 },
    uVignette: { value: 0.55 },
    uAspect: { value: 1.6 },
    uFlash: { value: new THREE.Vector3(0, 0, 0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uChroma, uBlur, uSpeed, uImpact, uImpactMode, uDarken, uVignette, uAspect;
    uniform vec3 uFlash;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
    }
    void main(){
      vec2 c = vUv - 0.5;
      vec2 ca = c * vec2(uAspect, 1.0);
      float r = length(ca);
      vec3 col = vec3(0.0);
      const int N = 8;
      vec2 off = c * uChroma * 0.026 * (0.25 + r);
      for (int i = 0; i < N; i++) {
        float s = 1.0 - uBlur * 0.14 * (float(i) / float(N - 1));
        vec2 u = 0.5 + c * s;
        col.r += texture2D(tDiffuse, u + off).r;
        col.g += texture2D(tDiffuse, u).g;
        col.b += texture2D(tDiffuse, u - off).b;
      }
      col /= float(N);
      col = clamp(col, 0.0, 48.0);

      // anime speed lines (stepped time for a hand-drawn feel)
      vec2 nd = normalize(ca + 1e-5);
      float st = floor(uTime * 24.0);
      float ln = noise(nd * 26.0 + st * 7.31);
      float ln2 = noise(nd * 61.0 - st * 3.17);
      float lines = smoothstep(0.60, 0.92, ln) * 0.8 + smoothstep(0.70, 0.95, ln2) * 0.5;
      float mask = smoothstep(0.22 + 0.25 * (1.0 - uSpeed), 0.95, r);
      col += vec3(1.0, 0.9, 1.0) * lines * mask * uSpeed * 0.85;

      // charge-up darkening: crush the shadows, keep the glow
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col *= mix(1.0, 0.28 + 0.72 * smoothstep(0.25, 1.1, luma), uDarken);

      // impact frame: posterised ink / inverted flash
      float ink = step(0.16 + 0.22 * ln, luma);
      vec3 impA = vec3(1.0 - ink) * vec3(1.0, 0.96, 0.98);
      vec3 impB = mix(vec3(0.03, 0.0, 0.07), vec3(1.6, 0.35, 0.9), ink);
      vec3 imp = mix(impA, impB, uImpactMode);
      imp += lines * smoothstep(0.15, 0.7, r) * mix(-0.9, 0.9, uImpactMode);
      col = mix(col, max(imp, 0.0), uImpact);

      col += uFlash;
      col *= 1.0 - uVignette * smoothstep(0.42, 1.18, r);
      col += (hash(vUv * vec2(1387.0, 941.0) + uTime) - 0.5) * 0.018;
      // grade: cold violet shadows, hot highlights
      col = mix(col, col * vec3(0.92, 0.9, 1.12), smoothstep(0.35, 0.0, luma) * 0.6);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

class KidPost implements PostRig {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private final: ShaderPass;
  private u: typeof KID_FINAL.uniforms;
  private chroma = 0;
  private speed = 0;
  private impact = 0;
  private darken = 0;
  private flash = new THREE.Vector3();

  constructor(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, w: number, h: number) {
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, cam));
    // đúng tham số gốc: (0.6, 0.55, 0.9)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.6, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(KID_FINAL);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.u = this.final.uniforms as typeof KID_FINAL.uniforms;
    this.u.uAspect.value = w / h;
  }

  onCastStart(m: { ultimate?: boolean; color: string }, power: number) {
    this.darken = Math.min(1, 0.45 + power / 200);
    this.chroma = Math.min(1, 0.3 + power / 150);
    if (m.ultimate) {
      this.impact = 1;
      this.u.uImpactMode.value = 1;
    }
  }

  onHit(m: { ultimate?: boolean; color: string }, power: number) {
    const c = new THREE.Color(m.color);
    this.flash.set(c.r * 0.25, c.g * 0.25, c.b * 0.25).multiplyScalar(Math.min(1, power / 90));
    this.speed = Math.min(1, this.speed + 0.5);
  }

  onHurt(v: number) {
    this.flash.set(v * 0.35, 0, v * 0.1);
  }

  tick(ctx: PostContext) {
    this.darken = damp(this.darken, ctx.casting ? 0.35 : 0, 3, 1 / 60);
    this.chroma = damp(this.chroma, ctx.casting ? 0.25 : 0, 3, 1 / 60);
    this.speed = damp(this.speed, ctx.moving ? 0.35 : 0, 2.5, 1 / 60);
    this.impact = damp(this.impact, 0, 6, 1 / 60);
    this.flash.multiplyScalar(0.86);
  }

  render(_dt: number, time: number) {
    void time;
    const u = this.u;
    u.uTime.value = time;
    u.uChroma.value = this.chroma;
    u.uBlur.value = this.chroma * 0.6;
    u.uSpeed.value = this.speed;
    u.uImpact.value = this.impact;
    u.uDarken.value = this.darken;
    (u.uFlash.value as THREE.Vector3).copy(this.flash);
    this.composer.render();
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.u.uAspect.value = w / h;
  }

  dispose() {
    this.composer.dispose();
  }
}

/* =========================================================== 3. DOFLAMINGO */

/** characters/doflamingo/src/engine/Post.ts — chép nguyên văn */
const DOFLAMINGO_GRADE = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uChroma: { value: 0 },
    uZoom: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uImpact: { value: 0 },
    uImpactInvert: { value: 1 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmt: { value: 0 },
    uVig: { value: 0.35 },
    uSat: { value: 1.08 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uChroma, uZoom, uFlash, uImpact, uImpactInvert, uTintAmt, uVig, uSat, uAspect;
    uniform vec2 uCenter; uniform vec3 uFlashColor, uTint;
    varying vec2 vUv;
    float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    vec3 samp(vec2 uv){
      vec2 dir = uv - uCenter;
      float dist = length(dir * vec2(uAspect,1.0));
      vec2 off = dir * uChroma * (0.6 + dist);
      vec3 c;
      c.r = texture2D(tDiffuse, uv + off).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - off).b;
      return c;
    }
    void main(){
      vec2 uv = vUv;
      vec3 col = vec3(0.0);
      if(uZoom > 0.001){
        vec2 dir = uv - uCenter;
        float tot = 0.0;
        for(int i=0;i<14;i++){
          float k = float(i)/13.0;
          float w = 1.0 - k*0.6;
          col += samp(uv - dir * uZoom * k * 0.25) * w;
          tot += w;
        }
        col /= tot;
      } else {
        col = samp(uv);
      }
      // saturation
      float l = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * 1.1 + 0.5;
      col = max(col, 0.0);
      // tint
      col = mix(col, col*uTint, uTintAmt);
      // impact frame: high-contrast mono
      if(uImpact > 0.001){
        float lum = dot(col, vec3(0.299,0.587,0.114));
        float t = smoothstep(0.42, 0.5, lum);
        vec3 mono = uImpactInvert > 0.5 ? vec3(1.0 - t) : vec3(t);
        mono = mix(mono, mono*vec3(1.0,0.25,0.45), uImpactInvert > 0.5 ? 0.0 : 0.6);
        col = mix(col, mono, uImpact);
      }
      // vignette
      vec2 vc = (vUv - 0.5) * vec2(uAspect, 1.0);
      col *= 1.0 - uVig * smoothstep(0.35, 1.0, length(vc));
      // flash
      col = mix(col, uFlashColor, clamp(uFlash,0.0,1.0));
      // grain
      col += (hash(vUv*vec2(1920.0,1080.0) + fract(uTime)*100.0) - 0.5) * 0.035;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

class DoflamingoPost implements PostRig {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private u: typeof DOFLAMINGO_GRADE.uniforms;
  private zoom = 0;
  private impact = 0;
  private flash = 0;
  private flashCol = new THREE.Color(1, 1, 1);

  constructor(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, w: number, h: number) {
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, cam));
    // đúng thứ tự gốc: bloom → Output → grade
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.7, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(DOFLAMINGO_GRADE);
    this.composer.addPass(this.grade);
    this.u = this.grade.uniforms as typeof DOFLAMINGO_GRADE.uniforms;
    this.u.uAspect.value = w / h;
  }

  onCastStart(m: { ultimate?: boolean; color: string }, power: number) {
    this.zoom = Math.min(1, 0.3 + power / 160);
    if (m.ultimate) {
      this.impact = 1;
      this.u.uImpactInvert.value = 1;
    }
  }

  onHit(m: { ultimate?: boolean; color: string }, power: number) {
    this.flashCol.set(m.color);
    this.flash = Math.min(1, 0.2 + power / 220);
  }

  onHurt(v: number) {
    this.flashCol.setRGB(0.7, 0, 0.05);
    this.flash = v * 0.5;
  }

  tick(ctx: PostContext) {
    this.zoom = damp(this.zoom, ctx.casting ? 0.35 : 0, 3, 1 / 60);
    this.impact = damp(this.impact, 0, 7, 1 / 60);
    this.flash = Math.max(0, this.flash - 3.5 * (1 / 60));
  }

  render(_dt: number, time: number) {
    const u = this.u;
    u.uTime.value = time;
    u.uZoom.value = this.zoom;
    u.uImpact.value = this.impact;
    u.uFlash.value = this.flash;
    (u.uFlashColor.value as THREE.Color).copy(this.flashCol);
    this.composer.render();
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.u.uAspect.value = w / h;
  }

  dispose() {
    this.composer.dispose();
  }
}

/* ================================================================== 4. IMU */

/** characters/imu/src/engine/post.ts — chép nguyên văn */
const IMU_FINAL = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: 1 },
    uAberr: { value: 0.0 },
    uRipple0: { value: new THREE.Vector4(0.5, 0.5, -1, 0) },
    uRipple1: { value: new THREE.Vector4(0.5, 0.5, -1, 0) },
    uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
    uInvert: { value: 0 },
    uVig: { value: 0.55 },
    uVigColor: { value: new THREE.Color(0, 0, 0) },
    uGrain: { value: 0.022 },
    uGlitch: { value: 0 },
    uZoom: { value: 0 },
    uDesat: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uEye: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uAberr, uInvert, uVig, uGrain, uGlitch, uZoom, uDesat, uEye;
    uniform vec4 uRipple0, uRipple1, uFlash;
    uniform vec3 uVigColor, uTint;
    varying vec2 vUv;

    float hash(float n){ return fract(sin(n*127.1)*43758.5453); }
    float hash2(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }

    vec2 ripple(vec2 uv, vec4 r){
      if (r.z < 0.0 || r.w == 0.0) return vec2(0.0);
      vec2 d = uv - r.xy; d.x *= uAspect;
      float dist = length(d);
      float w = exp(-pow((dist - r.z) / 0.085, 2.0));
      vec2 dir = d / max(dist, 1e-4);
      dir.x /= uAspect;
      return dir * w * r.w * 0.09;
    }

    void main(){
      vec2 uv = vUv;
      uv -= ripple(uv, uRipple0);
      uv -= ripple(uv, uRipple1);

      // eye-closing letterbox (Imu's narrowed gaze)
      float eyeMask = 0.0;
      if (uEye > 0.0) {
        float e = abs(uv.y - 0.5) * 2.0;
        eyeMask = smoothstep(1.0 - uEye, 1.0 - uEye + 0.08, e);
      }

      // glitch slices (distorted eyes flicker)
      if (uGlitch > 0.0) {
        float band = floor(uv.y * 38.0) + floor(uTime * 18.0);
        float h = hash(band);
        if (h > 1.0 - 0.28 * uGlitch) uv.x += (hash(band + 3.0) - 0.5) * 0.12 * uGlitch;
        if (hash(band + 9.0) > 1.0 - 0.06 * uGlitch) uv.y += (hash(band + 4.0) - 0.5) * 0.05 * uGlitch;
      }

      vec2 c = uv - 0.5;
      float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
      vec2 dir = c * (0.6 + r2 * 3.0);

      vec3 col = vec3(0.0);
      if (uZoom > 0.001) {
        float tot = 0.0;
        for (int i = 0; i < 10; i++) {
          float f = float(i) / 9.0;
          float w = 1.0 - f * 0.6;
          vec2 o = -c * f * uZoom * 0.28;
          vec3 s;
          s.r = texture2D(tDiffuse, uv + o + dir * uAberr * 0.02).r;
          s.g = texture2D(tDiffuse, uv + o).g;
          s.b = texture2D(tDiffuse, uv + o - dir * uAberr * 0.02).b;
          col += s * w;
          tot += w;
        }
        col /= tot;
      } else {
        float ab = (uAberr + 0.12) * 0.02;
        col.r = texture2D(tDiffuse, uv + dir * ab).r;
        col.g = texture2D(tDiffuse, uv).g;
        col.b = texture2D(tDiffuse, uv - dir * ab).b;
      }

      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lum), uDesat);
      col *= uTint;

      // flash
      col = mix(col, uFlash.rgb * 3.0, clamp(uFlash.a, 0.0, 1.0));
      col = mix(col, vec3(1.0) - clamp(col, 0.0, 1.0), uInvert);

      // vignette
      float v = smoothstep(0.18, 0.78, r2 * 1.6);
      col = mix(col, uVigColor, clamp(v * uVig, 0.0, 1.0));

      col = mix(col, vec3(0.0), eyeMask);

      // grain
      float g = hash2(uv * 900.0 + fract(uTime) * 100.0) - 0.5;
      col *= 1.0 + g * uGrain * 7.0;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

class ImuPost implements PostRig {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private final: ShaderPass;
  private u: typeof IMU_FINAL.uniforms;
  private ripple0 = { r: -1, s: 0 };
  private ripple1 = { r: -1, s: 0 };
  private zoom = 0;
  private glitch = 0;
  private flash = 0;
  private eye = 0;

  constructor(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, w: number, h: number) {
    const pr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(scene, cam));
    // đúng tham số gốc: (0.85, 0.75, 0.62)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.85, 0.75, 0.62);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(IMU_FINAL);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.u = this.final.uniforms as typeof IMU_FINAL.uniforms;
    this.u.uAspect.value = w / h;
  }

  private fireRipple() {
    if (this.ripple0.r < 0 || this.ripple0.s <= 0.02) {
      this.ripple0 = { r: 0, s: 0.55 };
    } else {
      this.ripple1 = { r: 0, s: 0.55 };
    }
  }

  onCastStart(m: { ultimate?: boolean; color: string }, power: number) {
    this.zoom = Math.min(1, 0.35 + power / 150);
    this.glitch = Math.min(1, 0.3 + power / 180);
    if (m.ultimate) {
      this.eye = 0.55;
      this.fireRipple();
    }
  }

  onHit(m: { ultimate?: boolean; color: string }, power: number) {
    this.fireRipple();
    this.flash = Math.min(1, 0.15 + power / 200);
    if (m.ultimate) this.u.uInvert.value = 1;
  }

  onHurt(v: number) {
    this.glitch = Math.max(this.glitch, v);
  }

  tick(ctx: PostContext, dt = 1 / 60) {
    this.zoom = damp(this.zoom, ctx.casting ? 0.3 : 0, 3, dt);
    this.glitch = damp(this.glitch, ctx.casting ? 0.25 : 0, 3, dt);
    this.flash = Math.max(0, this.flash - 3 * dt);
    this.eye = damp(this.eye, 0, 2, dt);
    this.u.uInvert.value = Math.max(0, (this.u.uInvert.value as number) - 5 * dt);
    this.ripple0.r = this.ripple0.r < 0 ? -1 : this.ripple0.r + dt * 1.6;
    this.ripple1.r = this.ripple1.r < 0 ? -1 : this.ripple1.r + dt * 1.6;
    if (this.ripple0.r > 1.4) this.ripple0 = { r: -1, s: 0 };
    if (this.ripple1.r > 1.4) this.ripple1 = { r: -1, s: 0 };
  }

  render(_dt: number, time: number) {
    const u = this.u;
    u.uTime.value = time;
    u.uZoom.value = this.zoom;
    u.uGlitch.value = this.glitch;
    u.uEye.value = this.eye;
    (u.uFlash.value as THREE.Vector4).set(1, 1, 1, this.flash);
    (u.uRipple0.value as THREE.Vector4).set(0.5, 0.5, this.ripple0.r, this.ripple0.s);
    (u.uRipple1.value as THREE.Vector4).set(0.5, 0.5, this.ripple1.r, this.ripple1.s);
    this.composer.render();
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.u.uAspect.value = w / h;
  }

  dispose() {
    this.composer.dispose();
  }
}

/* =============================================================== 5. KIZARU */

/** characters/kizaru/src/game/post.ts — chép nguyên văn */
const KIZARU_FRAG = /* glsl */ `
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

type KizKey = 'flash' | 'radial' | 'chroma' | 'invert' | 'dim' | 'warp' | 'vignette' | 'sat';

class KizaruPost implements PostRig {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private pass: ShaderPass;
  private shockVec = [new THREE.Vector4(), new THREE.Vector4()];
  private shocks = [
    { x: 0.5, y: 0.5, r: 0, s: 0, age: 1, life: 1, speed: 1, s0: 0 },
    { x: 0.5, y: 0.5, r: 0, s: 0, age: 1, life: 1, speed: 1, s0: 0 },
  ];
  private cursor = 0;

  /** giá trị hiện tại / mục tiêu / tốc độ bám — đúng như bản gốc */
  p: Record<KizKey, number> = { flash: 0, radial: 0, chroma: 0.08, invert: 0, dim: 0, warp: 0, vignette: 0, sat: 1 };
  t: Record<KizKey, number> = { flash: 0, radial: 0, chroma: 0.08, invert: 0, dim: 0, warp: 0, vignette: 0, sat: 1 };
  k: Record<KizKey, number> = { flash: 5.5, radial: 7, chroma: 5, invert: 40, dim: 2.5, warp: 6, vignette: 3, sat: 4 };
  bloomBase = 0.42;
  bloomBoost = 0;

  constructor(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, w: number, h: number) {
    const pr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.composer.addPass(new RenderPass(scene, cam));
    // đúng tham số gốc: (0.42, 0.55, 1.15)
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
        uCenter: { value: new THREE.Vector2(0.5, 0.5) },
        uShock0: { value: new THREE.Vector4() },
        uShock1: { value: new THREE.Vector4() },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: KIZARU_FRAG,
    });
    this.composer.addPass(this.pass);
    this.composer.addPass(new OutputPass());
  }

  pulse(key: KizKey, v: number) {
    if (Math.abs(v) > Math.abs(this.p[key])) this.p[key] = v;
  }
  hold(key: KizKey, v: number) {
    this.t[key] = v;
  }
  release(key: KizKey) {
    this.t[key] = key === 'sat' ? 1 : key === 'chroma' ? 0.08 : 0;
  }
  private shock(x: number, y: number, strength: number, speed: number, life = 0.9) {
    const s = this.shocks[this.cursor];
    this.cursor = (this.cursor + 1) % this.shocks.length;
    s.x = x; s.y = y; s.r = 0; s.s = strength; s.s0 = strength; s.age = 0; s.life = life; s.speed = speed;
  }

  onCastStart(m: { ultimate?: boolean; color: string }, power: number) {
    this.pulse('chroma', 0.4 + power / 200);
    this.bloomBoost = Math.min(0.6, 0.2 + power / 200);
    if (m.ultimate) {
      this.hold('radial', 1);
      this.hold('chroma', 1);
      this.hold('warp', 0.7);
      this.hold('vignette', 0.25);
      this.hold('sat', 1.15);
    }
  }

  onHit(m: { ultimate?: boolean; color: string }, power: number) {
    this.shock(0.5, 0.5, 0.04 + power / 900, 1.5, 0.5);
    this.pulse('flash', Math.min(1.3, 0.4 + power / 200));
    if (m.ultimate) this.pulse('invert', 0.8);
  }

  onHurt(v: number) {
    this.pulse('flash', v * 0.6);
    this.pulse('chroma', v * 0.8);
  }

  tick(_ctx: PostContext, dt = 1 / 60) {
    (Object.keys(this.p) as KizKey[]).forEach((key) => {
      this.p[key] = damp(this.p[key], this.t[key], this.k[key], dt);
    });
    this.bloomBoost = damp(this.bloomBoost, 0, 4, dt);
  }

  render(_dt: number, time: number) {
    const u = this.pass.uniforms;
    u.uTime.value = time;
    u.uRadial.value = this.p.radial;
    u.uChroma.value = this.p.chroma;
    u.uVignette.value = this.p.vignette;
    u.uFlash.value = this.p.flash;
    u.uInvert.value = this.p.invert;
    u.uDim.value = this.p.dim;
    u.uWarp.value = this.p.warp;
    u.uSat.value = this.p.sat;
    const dt = 1 / 60;
    this.shocks.forEach((s, i) => {
      s.age += dt;
      s.r += s.speed * dt;
      const k = Math.min(1, s.age / s.life);
      const str = k >= 1 ? 0 : s.s0 * Math.pow(1 - k, 1.5);
      this.shockVec[i].set(s.x, s.y, s.r, str);
    });
    (u.uShock0.value as THREE.Vector4).copy(this.shockVec[0]);
    (u.uShock1.value as THREE.Vector4).copy(this.shockVec[1]);
    this.bloom.strength = this.bloomBase + this.bloomBoost;
    this.composer.render();
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.pass.uniforms.uAspect.value = w / h;
  }

  dispose() {
    this.composer.dispose();
  }
}

/* ================================================================ 6. LUFFY */

/** characters/luffy/src/game/post.ts — chép nguyên văn */
const LUFFY_FINAL = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uAspect: { value: 1.6 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uRadial: { value: 0 },
    uChroma: { value: 0.0015 },
    uVignette: { value: 0.55 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uInvert: { value: 0 },
    uInvertTint: { value: new THREE.Color(1, 0.1, 0.1) },
    uSpeed: { value: 0 },
    uSpeedColor: { value: new THREE.Color(1, 1, 1) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmt: { value: 0 },
    uSat: { value: 1.05 },
    uRipple: { value: new THREE.Vector4(0.5, 0.5, 0, 0) },
    uPulse: { value: 0 },
    uPulseColor: { value: new THREE.Color(1, 0, 0) },
    uHalftone: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uAspect, uRadial, uChroma, uVignette, uFlash, uInvert, uSpeed, uTintAmt, uSat, uPulse, uHalftone;
    uniform vec2 uCenter;
    uniform vec3 uFlashColor, uInvertTint, uSpeedColor, uTint, uPulseColor;
    uniform vec4 uRipple;
    varying vec2 vUv;
    float hash(float n){ return fract(sin(n) * 43758.5453123); }
    float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      // screen-space shockwave
      vec2 rd = uv - uRipple.xy; rd.x *= uAspect;
      float rdist = length(rd);
      float ring = exp(-pow((rdist - uRipple.z) / 0.07, 2.0));
      vec2 rdir = rd / (rdist + 1e-4);
      uv -= vec2(rdir.x / uAspect, rdir.y) * ring * uRipple.w;

      vec2 toC = uCenter - uv;
      float cd = length(toC * vec2(uAspect, 1.0));
      float blurAmt = uRadial * (0.25 + cd);
      vec3 col = vec3(0.0);
      const int N = 12;
      for (int i = 0; i < N; i++) {
        float k = float(i) / float(N - 1);
        vec2 b = uv + toC * k * blurAmt * 0.22;
        float ch = uChroma * (1.0 + cd * 2.0) + uRadial * 0.0035;
        col.r += texture2D(tDiffuse, b - toC * ch * 1.4).r;
        col.g += texture2D(tDiffuse, b).g;
        col.b += texture2D(tDiffuse, b + toC * ch * 1.4).b;
      }
      col /= float(N);

      // saturation + tint
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(lum), col, uSat);
      col = mix(col, col * uTint, uTintAmt);

      // speed lines
      vec2 p = (vUv - uCenter) * vec2(uAspect, 1.0);
      float r = length(p);
      float ang = atan(p.y, p.x);
      float seg = floor(ang * 70.0 + floor(uTime * 20.0) * 3.7);
      float rnd = hash(seg);
      float rnd2 = hash(seg * 1.7 + 4.0);
      float start = 0.22 + rnd2 * 0.55;
      float line = step(0.55, rnd) * smoothstep(start, start + 0.35, r);
      float thin = 1.0 - smoothstep(0.0, 1.0, abs(fract(ang * 70.0 + floor(uTime * 20.0) * 3.7) - 0.5) * 2.0 * (0.5 + rnd));
      line *= thin;
      col = mix(col, uSpeedColor, clamp(line * uSpeed, 0.0, 1.0));

      // heartbeat pulse – colour bleeds from the edges
      float edge = smoothstep(0.25, 1.1, r);
      col = mix(col, uPulseColor, edge * uPulse * 0.75);

      // vignette
      float vig = smoothstep(0.35, 1.25, r);
      col *= 1.0 - vig * uVignette;

      // halftone (comic dots on the dark edges)
      if (uHalftone > 0.0) {
        vec2 g = gl_FragCoord.xy / 7.0;
        vec2 cell = fract(g) - 0.5;
        float dots = smoothstep(0.5, 0.35, length(cell) * (1.0 + (1.0 - vig) * 1.6));
        col = mix(col, col * (0.75 + 0.25 * dots), uHalftone * vig);
      }

      // anime impact frame: hard threshold, inverted palette
      if (uInvert > 0.0) {
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        float t = smoothstep(0.28, 0.34, l);
        vec3 inv = mix(uInvertTint * 0.9, vec3(1.0), t);
        inv = mix(vec3(0.0), inv, step(0.04, l));
        // radial white burst lines
        float bl = step(0.5, hash(floor(ang * 40.0))) * smoothstep(0.1, 0.9, r);
        inv = mix(inv, vec3(1.0), bl * 0.25);
        col = mix(col, 1.0 - inv, uInvert);
      }

      col = mix(col, uFlashColor, clamp(uFlash, 0.0, 1.0));
      col += (hash2(vUv * 800.0 + uTime) - 0.5) * 0.025;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

class LuffyPost implements PostRig {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private final: ShaderPass;
  private u: typeof LUFFY_FINAL.uniforms;
  private radial = 0;
  private speed = 0;
  private invert = 0;
  private pulse = 0;
  private ripple = { r: 0, s: 0 };

  constructor(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, w: number, h: number) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(scene, cam));
    // đúng tham số gốc: (0.4, 0.6, 0.9)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.6, 0.9);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(LUFFY_FINAL);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.u = this.final.uniforms as typeof LUFFY_FINAL.uniforms;
    this.u.uAspect.value = w / h;
  }

  onCastStart(m: { ultimate?: boolean; color: string }, power: number) {
    this.radial = Math.min(1, 0.3 + power / 150);
    this.speed = Math.min(1, 0.4 + power / 180);
    if (m.ultimate) this.invert = 1;
  }

  onHit(_m: { ultimate?: boolean; color: string }, power: number) {
    this.ripple = { r: 0, s: Math.min(0.12, 0.02 + power / 800) };
    this.u.uFlash.value = Math.min(1, 0.2 + power / 200);
  }

  onHurt(v: number) {
    this.pulse = Math.max(this.pulse, v);
  }

  tick(ctx: PostContext, dt = 1 / 60) {
    this.radial = damp(this.radial, ctx.casting ? 0.3 : 0, 3, dt);
    this.speed = damp(this.speed, ctx.moving ? 0.3 : 0, 2.5, dt);
    this.invert = damp(this.invert, 0, 6, dt);
    this.pulse = damp(this.pulse, 0, 2, dt);
    this.u.uFlash.value = Math.max(0, (this.u.uFlash.value as number) - 3 * dt);
    this.ripple.r += dt * 1.5;
    if (this.ripple.r > 1.5) this.ripple = { r: 0, s: 0 };
  }

  render(_dt: number, time: number) {
    const u = this.u;
    u.uTime.value = time;
    u.uRadial.value = this.radial;
    u.uSpeed.value = this.speed;
    u.uInvert.value = this.invert;
    u.uPulse.value = this.pulse;
    (u.uRipple.value as THREE.Vector4).set(0.5, 0.5, this.ripple.r, this.ripple.s);
    this.composer.render();
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.u.uAspect.value = w / h;
  }

  dispose() {
    this.composer.dispose();
  }
}

/* ================================================================= 7. ZORO */

/** characters/zoro/src/engine/shaders.ts — chép nguyên văn */
const ZORO_SAKUGA = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uImpactMode: { value: 0 }, // 0=off, 1=white-bg black-ink, 2=black-bg white-ink, 3=tinted haki frame
    uImpactCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uImpactTint: { value: new THREE.Color('#ff1744') },
    uChromatic: { value: 0 },
    uShockwaveProgress: { value: -1 },
    uShockwaveStrength: { value: 0 },
    uSpeedLines: { value: 0 },
    uSpeedColor: { value: new THREE.Color('#ffffff') },
    uFocusDesat: { value: 0 }, // Breath of All Things (0..1)
    uBandanaVignette: { value: 0 }, // 0..1
    uFlashAlpha: { value: 0 },
    uFlashColor: { value: new THREE.Color('#ffffff') },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uImpactMode;
    uniform vec2 uImpactCenter;
    uniform vec3 uImpactTint;
    uniform float uChromatic;
    uniform float uShockwaveProgress;
    uniform float uShockwaveStrength;
    uniform float uSpeedLines;
    uniform vec3 uSpeedColor;
    uniform float uFocusDesat;
    uniform float uBandanaVignette;
    uniform float uFlashAlpha;
    uniform vec3 uFlashColor;

    varying vec2 vUv;

    float hash11(float p) {
      p = fract(p * 0.1031);
      p *= p + 33.33;
      p *= p + p;
      return fract(p);
    }

    float angularNoise(float a, float freq, float seed) {
      float x = a * freq + seed;
      float i = floor(x);
      float f = fract(x);
      float u = f * f * (3.0 - 2.0 * f);
      return mix(hash11(i), hash11(i + 1.0), u);
    }

    void main() {
      vec2 uv = vUv;
      vec2 toCenter = uv - uImpactCenter;
      vec2 aspectDelta = vec2(toCenter.x * 1.77, toCenter.y);
      float dist = length(aspectDelta);
      float angle = atan(aspectDelta.y, aspectDelta.x);

      // Expanding anime shockwave ring distortion
      if (uShockwaveProgress >= 0.0 && uShockwaveProgress <= 1.35 && uShockwaveStrength > 0.0001) {
        float ringRadius = uShockwaveProgress * 1.15;
        float ringWidth = 0.095;
        float diff = dist - ringRadius;
        float ringMask = exp(-(diff * diff) / (ringWidth * ringWidth));
        vec2 dir = dist > 0.0001 ? normalize(toCenter) : vec2(0.0);
        uv -= dir * diff * ringMask * uShockwaveStrength * (1.0 - uShockwaveProgress * 0.65);
      }

      // Radial Chromatic Aberration
      vec2 caOffset = toCenter * uChromatic * (0.35 + dist * 0.9);
      float r = texture2D(tDiffuse, clamp(uv + caOffset, 0.001, 0.999)).r;
      float g = texture2D(tDiffuse, clamp(uv, 0.001, 0.999)).g;
      float b = texture2D(tDiffuse, clamp(uv - caOffset, 0.001, 0.999)).b;
      vec3 col = vec3(r, g, b);

      float luma = dot(col, vec3(0.299, 0.587, 0.114));

      // TRUE TOEI WANO IMPACT FRAMES
      if (uImpactMode > 0.5) {
        float rays1 = angularNoise(angle, 46.0, floor(uTime * 60.0) * 7.1);
        float rays2 = angularNoise(angle, 118.0, floor(uTime * 60.0) * 13.7);
        float spike = pow(rays1 * 0.6 + rays2 * 0.4, 2.2);
        float radialBurst = smoothstep(0.18 + spike * 0.68, 0.95, dist);
        float coreStar = smoothstep(0.36, 0.0, dist - spike * 0.22);

        float ink = step(0.34, luma + (spike - 0.5) * 0.28);

        if (uImpactMode < 1.5) {
          // Mode 1: Blinding White backdrop + Stark Pitch-Black Sumi Ink + black burst spikes
          float bw = clamp(ink - radialBurst * step(0.62, rays2) + coreStar * 0.85, 0.0, 1.0);
          col = mix(vec3(0.02, 0.02, 0.03), vec3(1.0, 0.99, 0.97), bw);
        } else if (uImpactMode < 2.5) {
          // Mode 2: Inverted Obsidian Void + Searing White Sakuga Lines
          float inv = clamp((1.0 - ink) * 0.85 + step(0.66, luma) + radialBurst * step(0.7, rays2) + coreStar * 0.5, 0.0, 1.0);
          col = mix(vec3(0.01, 0.01, 0.015), vec3(1.0), step(0.52, inv));
        } else {
          // Mode 3: Conqueror's Haki Crimson/Emerald Split Impact Frame
          float bright = step(0.58, luma + coreStar * 0.35);
          float mid = step(0.24, luma + radialBurst * spike * 0.55);
          vec3 darkCol = vec3(0.015, 0.005, 0.02);
          col = mix(darkCol, uImpactTint * 1.35, mid);
          col = mix(col, vec3(1.0, 0.98, 0.95), bright);
        }

        gl_FragColor = vec4(col, 1.0);
        return;
      }

      // "Breath of All Things" (Shishi Sonson Iai Focus)
      if (uFocusDesat > 0.001) {
        vec3 indigoMono = vec3(luma * 0.52, luma * 0.68, luma * 1.08) * 0.78;
        float redAccent = clamp((col.r - max(col.g, col.b)) * 2.8, 0.0, 1.0);
        float cyanAccent = clamp((col.b - col.r) * 1.6, 0.0, 1.0);
        float keep = clamp(redAccent + cyanAccent * 0.65, 0.0, 1.0);
        col = mix(col, mix(indigoMono, col * 1.35, keep), uFocusDesat);
      }

      // Procedural Anime Radial Speed Lines around screen periphery
      if (uSpeedLines > 0.01) {
        float tStep = floor(uTime * 42.0);
        float n1 = angularNoise(angle, 72.0, tStep * 5.3);
        float n2 = angularNoise(angle, 165.0, tStep * 11.9);
        float line = step(0.76 - uSpeedLines * 0.14, n1 * 0.45 + n2 * 0.55);
        float innerEdge = 0.42 + (1.0 - n1) * 0.36 - uSpeedLines * 0.12;
        float edgeMask = smoothstep(innerEdge, innerEdge + 0.22, dist);
        col += uSpeedColor * line * edgeMask * uSpeedLines * 0.72;
      }

      // Subtle Shockwave bright rim
      if (uShockwaveProgress >= 0.0 && uShockwaveProgress <= 1.2 && uShockwaveStrength > 0.001) {
        float ringRadius = uShockwaveProgress * 1.15;
        float rim = exp(-pow((dist - ringRadius) / 0.025, 2.0)) * (1.0 - uShockwaveProgress * 0.8);
        col += uSpeedColor * rim * uShockwaveStrength * 5.5;
      }

      // Flash overlay
      if (uFlashAlpha > 0.001) {
        col = mix(col, uFlashColor, clamp(uFlashAlpha, 0.0, 1.0));
      }

      // Cinematic vignette + Black Bandana fierce upper-brow framing
      float vig = smoothstep(1.32, 0.42, dist);
      col *= mix(0.62, 1.0, vig);

      if (uBandanaVignette > 0.001) {
        float browCurve = 0.91 - pow((vUv.x - 0.5) * 1.25, 2.0) * 0.08;
        float browShadow = smoothstep(browCurve + 0.07, browCurve - 0.04, vUv.y);
        col *= mix(1.0, mix(0.22, 1.0, browShadow), uBandanaVignette);
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

class ZoroPost implements PostRig {
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private sakuga: ShaderPass;
  private u: typeof ZORO_SAKUGA.uniforms;
  private chromaticTarget = 0;
  private speedLinesTarget = 0;
  private focusTarget = 0;
  private shockwaveProgress = -1;
  private flashAlpha = 0;
  /** hàng đợi impact frame, đúng như bản gốc */
  private impactQueue: { mode: 1 | 2 | 3; duration: number; tint: string }[] = [];
  private impactTimer = 0;

  constructor(r: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.Camera, w: number, h: number) {
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, cam));
    // đúng tham số gốc: (0.92, 0.52, 0.36)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.92, 0.52, 0.36);
    this.composer.addPass(this.bloom);
    this.sakuga = new ShaderPass(ZORO_SAKUGA);
    this.composer.addPass(this.sakuga);
    this.composer.addPass(new OutputPass());
    this.u = this.sakuga.uniforms as typeof ZORO_SAKUGA.uniforms;
  }

  private queueImpact(frames: { mode: 1 | 2 | 3; duration: number; tint: string }[]) {
    this.impactQueue.push(...frames);
    if (this.impactTimer <= 0) this.impactTimer = this.impactQueue[0]?.duration ?? 0;
  }

  onCastStart(m: { ultimate?: boolean; color: string }, power: number) {
    this.chromaticTarget = Math.min(0.024, 0.008 + power / 6000);
    this.speedLinesTarget = Math.min(0.95, 0.35 + power / 200);
    if (m.ultimate) this.focusTarget = 0.7;
  }

  onHit(m: { ultimate?: boolean; color: string }, power: number) {
    this.shockwaveProgress = 0;
    this.u.uShockwaveStrength.value = Math.min(0.05, 0.015 + power / 4000);
    this.chromaticTarget = Math.min(0.03, 0.012 + power / 5000);
    // chuỗi impact frame — đúng như Zoro gốc: mode 1 → 3 (hoặc 1 → 2 khi ultimate)
    if (m.ultimate) {
      this.queueImpact([
        { mode: 1, duration: 0.045, tint: m.color },
        { mode: 3, duration: 0.05, tint: '#ff1744' },
        { mode: 2, duration: 0.04, tint: '#ffffff' },
      ]);
      this.flashAlpha = 0.5;
    } else if (power > 60) {
      this.queueImpact([{ mode: 1, duration: 0.034, tint: m.color }]);
    }
  }

  onHurt(v: number) {
    this.chromaticTarget = Math.max(this.chromaticTarget, v * 0.02);
    this.flashAlpha = Math.max(this.flashAlpha, v * 0.4);
  }

  tick(ctx: PostContext, dt = 1 / 60) {
    this.chromaticTarget = damp(this.chromaticTarget, ctx.casting ? 0.012 : 0, 4, dt);
    this.speedLinesTarget = damp(this.speedLinesTarget, 0, 3, dt);
    this.focusTarget = damp(this.focusTarget, 0, 1.5, dt);
    this.flashAlpha = Math.max(0, this.flashAlpha - 3 * dt);
    if (this.shockwaveProgress >= 0) {
      this.shockwaveProgress += dt * 1.6;
      if (this.shockwaveProgress > 1.35) this.shockwaveProgress = -1;
    }
    if (this.impactQueue.length > 0) {
      this.impactTimer -= dt;
      if (this.impactTimer <= 0) {
        this.impactQueue.shift();
        this.impactTimer = this.impactQueue[0]?.duration ?? 0;
      }
    }
  }

  render(_dt: number, time: number) {
    const u = this.u;
    u.uTime.value = time;
    u.uChromatic.value = THREE.MathUtils.lerp(u.uChromatic.value as number, this.chromaticTarget, 0.2);
    u.uSpeedLines.value = THREE.MathUtils.lerp(u.uSpeedLines.value as number, this.speedLinesTarget, 0.2);
    u.uFocusDesat.value = THREE.MathUtils.lerp(u.uFocusDesat.value as number, this.focusTarget, 0.2);
    u.uBandanaVignette.value = this.speedLinesTarget > 0.5 ? 0.35 : 0;
    u.uShockwaveProgress.value = this.shockwaveProgress;
    u.uFlashAlpha.value = this.flashAlpha;
    const head = this.impactQueue[0];
    u.uImpactMode.value = head ? head.mode : 0;
    if (head) (u.uImpactTint.value as THREE.Color).set(head.tint);
    this.composer.render();
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  dispose() {
    this.composer.dispose();
  }
}

/* ============================================================== factory */

export function buildPost(
  charId: CharId,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  w: number,
  h: number,
): PostRig {
  switch (charId) {
    case 'boa-hancock': return new HancockPost(renderer, scene, camera, w, h);
    case 'captain-kid': return new KidPost(renderer, scene, camera, w, h);
    case 'doflamingo': return new DoflamingoPost(renderer, scene, camera, w, h);
    case 'imu': return new ImuPost(renderer, scene, camera, w, h);
    case 'kizaru': return new KizaruPost(renderer, scene, camera, w, h);
    case 'luffy': return new LuffyPost(renderer, scene, camera, w, h);
    case 'zoro': return new ZoroPost(renderer, scene, camera, w, h);
  }
}

/** true nếu nhân vật có pipeline hậu kỳ riêng */
export const hasPost = (id: CharId): boolean => true && !!id;
