import * as THREE from "three";

export const FinalShader = {
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
          col.g += texture2D(tDiffuse, u).g;
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
