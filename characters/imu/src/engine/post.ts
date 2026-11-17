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

export class Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  final: ShaderPass;
  u = FinalShader.uniforms;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(size, 0.85, 0.75, 0.62);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    // ShaderPass clones uniforms; keep our reference to the clone
    this.u = this.final.uniforms as typeof FinalShader.uniforms;
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.setSize(size.x, size.y);
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.u.uAspect.value = w / h;
  }

  render(dt: number) {
    this.composer.render(dt);
  }
}
