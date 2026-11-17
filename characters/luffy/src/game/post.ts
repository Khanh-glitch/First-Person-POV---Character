import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const FinalShader = {
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

export class Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  final: ShaderPass;
  u: typeof FinalShader.uniforms;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.4, 0.6, 0.9);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());
    this.u = this.final.uniforms as typeof FinalShader.uniforms;
    this.u.uAspect.value = w / h;
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.u.uAspect.value = w / h;
  }
}
