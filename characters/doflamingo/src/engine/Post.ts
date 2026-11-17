import * as THREE from "three";

export const AnimeGradeShader = {
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
