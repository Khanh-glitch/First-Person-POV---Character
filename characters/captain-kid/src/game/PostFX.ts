import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const FinalShader = {
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

export class PostFX {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  final: ShaderPass;
  u: typeof FinalShader.uniforms;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.6, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.u = this.final.uniforms as typeof FinalShader.uniforms;
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.u.uAspect.value = w / h;
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.u.uAspect.value = w / h;
  }

  render() {
    this.composer.render();
  }
}
