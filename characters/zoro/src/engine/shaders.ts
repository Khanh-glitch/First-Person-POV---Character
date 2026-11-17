import * as THREE from 'three';

/**
 * Full-screen Toei Wano Sakuga Post-Processing Shader
 * Handles:
 * - True binary Black/White & Crimson/Emerald Anime Impact Frames with radial burst spikes
 * - Expanding screen-space shockwave ring distortion
 * - Velocity/impact Chromatic Aberration
 * - Procedural radial anime speed lines during supersonic blitz
 * - "Breath of All Things" (Ittoryu Iai) indigo focus desaturation preserving red/cyan energy
 * - Black Bandana brow vignette & dark Haki atmosphere boost
 */
export const AnimeSakugaPostShader = {
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

/**
 * Volumetric Sakuga Sword Slash Crescent Ribbon Shader
 * UV.x = 0 (tail) -> 1 (leading slash head)
 * UV.y = 0 (inner edge) -> 1 (outer razor edge)
 */
export function createSlashArcMaterial(
  primaryHex: string,
  secondaryHex: string,
  coreHex = '#ffffff'
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 }, // 0 -> 1 life progress
      uColorPrimary: { value: new THREE.Color(primaryHex) },
      uColorSecondary: { value: new THREE.Color(secondaryHex) },
      uColorCore: { value: new THREE.Color(coreHex) },
      uIntensity: { value: 2.8 },
      uSeed: { value: Math.random() * 100 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uProgress;
      uniform vec3 uColorPrimary;
      uniform vec3 uColorSecondary;
      uniform vec3 uColorCore;
      uniform float uIntensity;
      uniform float uSeed;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.05;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        // Fast slash reveal in first 22% of lifetime, then dramatic erosion
        float headPos = smoothstep(0.0, 0.22, uProgress);
        float tailErode = smoothstep(0.14, 1.0, uProgress);

        // Directional anime streak noise
        vec2 streakUv = vec2(vUv.x * 5.5 - uTime * 9.0 + uSeed, vUv.y * 18.0 + uSeed * 0.3);
        float streaks = fbm(streakUv);
        float fineLines = smoothstep(0.46, 0.78, noise(vec2(vUv.x * 9.0 - uTime * 14.0, vUv.y * 34.0 + uSeed)));

        // Arc head & tail tapering
        float headMask = smoothstep(headPos + 0.04, headPos - 0.08, vUv.x);
        float tailMask = smoothstep(tailErode * 0.72 - 0.1, tailErode * 0.72 + 0.45, vUv.x + streaks * 0.22);
        float endFade = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265);

        // Width profile: razor bright outer crest (vUv.y ~ 0.78), smoky fiery inner wake
        float outerFade = smoothstep(1.0, 0.82, vUv.y);
        float innerFade = smoothstep(0.0, 0.48 - streaks * 0.24, vUv.y);
        float bladeProfile = outerFade * innerFade;

        // Searing white cutting spine
        float coreLine = exp(-pow((vUv.y - 0.76) / 0.095, 2.0));
        float secondaryFlame = smoothstep(0.75, 0.12, vUv.y) * streaks;

        // Erosion dissolution near end of lifetime
        float dissolve = smoothstep(tailErode * 0.92, tailErode * 0.92 + 0.28, streaks * 0.65 + coreLine * 0.55 + (1.0 - uProgress) * 0.35);

        float alpha = headMask * tailMask * bladeProfile * (0.45 + 0.55 * endFade) * dissolve;
        alpha *= smoothstep(1.0, 0.72, uProgress);

        if (alpha < 0.015) discard;

        vec3 col = mix(uColorSecondary, uColorPrimary, smoothstep(0.18, 0.68, vUv.y + streaks * 0.2));
        col += uColorPrimary * fineLines * 0.85;
        col = mix(col, uColorCore * 1.45, clamp(coreLine * (1.15 - uProgress * 0.45) + secondaryFlame * 0.15, 0.0, 1.0));

        gl_FragColor = vec4(col * uIntensity, clamp(alpha * 1.25, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Canonical King of Hell / Enma Spectral Blade Flame Aura Shader
 * Flows cyan at blade base -> emerald mid-aura -> golden tips (customizable per move!)
 */
export function createBladeAuraMaterial(
  innerHex = '#22d3ee',
  midHex = '#00ff88',
  tipHex = '#fde047'
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0.25 },
      uColorInner: { value: new THREE.Color(innerHex) },
      uColorMid: { value: new THREE.Color(midHex) },
      uColorTip: { value: new THREE.Color(tipHex) },
      uSeed: { value: Math.random() * 50.0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uSeed;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 pos = position;
        float flutter = sin(uv.y * 16.0 - uTime * 11.0 + uSeed) * 0.012 * uIntensity;
        pos.x += flutter * smoothstep(0.0, 1.0, abs(uv.x - 0.5) * 2.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColorInner;
      uniform vec3 uColorMid;
      uniform vec3 uColorTip;
      uniform float uSeed;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      void main() {
        if (uIntensity < 0.01) discard;
        float distFromSpine = abs(vUv.x - 0.5) * 2.0;
        float n1 = noise(vec2(vUv.x * 7.0 + uSeed, vUv.y * 9.0 - uTime * 6.5));
        float n2 = noise(vec2(vUv.x * 14.0 - uSeed, vUv.y * 18.0 - uTime * 11.0));
        float flame = n1 * 0.62 + n2 * 0.38;

        float lengthMask = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
        float wisp = smoothstep(1.0, 0.08, distFromSpine + (1.0 - flame) * 0.58);
        float alpha = wisp * lengthMask * clamp(uIntensity, 0.0, 1.6) * 0.85;

        if (alpha < 0.02) discard;

        vec3 col = mix(uColorInner, uColorMid, smoothstep(0.08, 0.48, distFromSpine));
        col = mix(col, uColorTip, smoothstep(0.45, 0.88, distFromSpine + flame * 0.25));

        gl_FragColor = vec4(col * (1.4 + uIntensity * 1.25), clamp(alpha, 0.0, 0.92));
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Kokujo O Tatsu Maki — Helical Black-Rope Dragon Tornado Shader
 */
export function createTornadoMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1.0 },
      uColorWind: { value: new THREE.Color('#00ff9d') },
      uColorHaki: { value: new THREE.Color('#ff1e56') },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        float sway = sin(uv.y * 5.0 - uTime * 7.0) * uv.y * 0.9;
        float swayZ = cos(uv.y * 4.5 - uTime * 6.5) * uv.y * 0.9;
        p.x += sway;
        p.z += swayZ;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColorWind;
      uniform vec3 uColorHaki;
      varying vec2 vUv;

      void main() {
        float angle = vUv.x * 6.2831853;
        float spiral1 = sin(angle * 3.0 + vUv.y * 26.0 - uTime * 24.0);
        float spiral2 = sin(angle * 5.0 + vUv.y * 38.0 - uTime * 31.0);
        float razorBands = smoothstep(0.45, 0.96, spiral1 * 0.6 + spiral2 * 0.4);
        float crimsonRope = smoothstep(0.72, 0.98, sin(angle * 2.0 + vUv.y * 19.0 - uTime * 19.0));
        float whiteCore = smoothstep(0.88, 0.995, spiral2);

        float vertFade = smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
        float alpha = clamp((razorBands * 0.78 + crimsonRope * 0.65) * vertFade * uOpacity, 0.0, 0.95);
        if (alpha < 0.02) discard;

        vec3 col = mix(uColorWind * 1.6, uColorHaki * 2.2, crimsonRope);
        col = mix(col, vec3(1.0, 1.0, 1.0) * 2.5, whiteCore * 0.7);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Additive Sakuga Spirit Billboard Shader (Ashura Deity & Hiryu Flying Dragon)
 * Smoothly keys pure black + elliptical soft edge feather + living flame distortion
 */
export function createSpiritBillboardMaterial(texture: THREE.Texture, boost = 1.65): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uBoost: { value: boost },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uBoost;
      varying vec2 vUv;

      void main() {
        if (uOpacity < 0.01) discard;
        vec2 wobble = vec2(
          sin(vUv.y * 14.0 - uTime * 6.5) * 0.008,
          cos(vUv.x * 12.0 - uTime * 5.0) * 0.006
        );
        vec2 uv = clamp(vUv + wobble, 0.002, 0.998);
        vec3 tex = texture2D(uMap, uv).rgb;
        float lum = max(tex.r, max(tex.g, tex.b));

        // Soft elliptical mask guarantees zero rectangular frame edge
        vec2 d = (vUv - 0.5) * 2.0;
        float radial = 1.0 - dot(d, d);
        float edgeMask = smoothstep(0.0, 0.42, radial);
        float keyMask = smoothstep(0.07, 0.32, lum);

        float alpha = edgeMask * keyMask * uOpacity;
        if (alpha < 0.01) discard;

        gl_FragColor = vec4(tex * uBoost * edgeMask, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Glowing Molten Haki Ground Fissure Shader carved into Onigashima Rooftop
 */
export function createGroundScarMaterial(primaryHex: string, secondaryHex: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uLife: { value: 1.0 },
      uPrimary: { value: new THREE.Color(primaryHex) },
      uSecondary: { value: new THREE.Color(secondaryHex) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uLife;
      uniform vec3 uPrimary;
      uniform vec3 uSecondary;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      void main() {
        float jag = (noise(vec2(vUv.y * 22.0, 1.5)) - 0.5) * 0.24;
        float centerDist = abs((vUv.x - 0.5) + jag) * 2.0;
        float endTaper = sin(clamp(vUv.y, 0.0, 1.0) * 3.14159265);
        float width = endTaper * (0.35 + 0.65 * uLife);

        float core = exp(-pow(centerDist / max(0.06, 0.14 * width), 2.0));
        float glow = smoothstep(0.85 * width, 0.0, centerDist);
        float ember = noise(vec2(vUv.x * 12.0, vUv.y * 28.0 - uTime * 2.5));

        float alpha = clamp((core + glow * ember * 0.85) * uLife, 0.0, 1.0);
        if (alpha < 0.02) discard;

        vec3 col = mix(uSecondary * 1.4, uPrimary * 2.2, glow);
        col = mix(col, vec3(1.0) * 2.6, core * uLife);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
