import * as THREE from "three";
import { easeOutCubic, lerp, rand, randS } from "./util";

/* ------------------------------------------------------------------ */
/* Point particles (sparks = additive, smoke = alpha)                  */
/* ------------------------------------------------------------------ */
export class Particles {
  points: THREE.Points;
  max: number;
  cursor = 0;
  pos: Float32Array;
  vel: Float32Array;
  col: Float32Array;
  size: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  s0: Float32Array;
  s1: Float32Array;
  a0: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  mat: THREE.ShaderMaterial;
  private fadeIn: boolean;
  private bounce: boolean;

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.fadeIn = !additive;
    this.bounce = additive;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uPow: { value: additive ? 2.2 : 1.0 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute vec4 aColor; varying vec4 vColor; uniform float uScale;
        void main(){
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), 700.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vColor; uniform float uPow;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = pow(smoothstep(0.5, 0.0, d), uPow);
          gl_FragColor = vec4(vColor.rgb, a * vColor.a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 8;
  }

  spawn(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, s0: number, s1: number,
    r: number, g: number, b: number, a: number,
    grav = 0, drag = 0
  ) {
    const i = this.cursor;
    this.cursor = (i + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a;
    this.grav[i] = grav; this.drag[i] = drag;
    const i4 = i * 4;
    this.col[i4] = r; this.col[i4 + 1] = g; this.col[i4 + 2] = b; this.col[i4 + 3] = 0;
    this.size[i] = s0;
  }

  update(dt: number) {
    const { pos, vel, life, maxLife, size, col } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        size[i] = 0;
        col[i * 4 + 3] = 0;
        continue;
      }
      const k = life[i] / maxLife[i];
      const i3 = i * 3;
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      vel[i3] *= dr; vel[i3 + 1] *= dr; vel[i3 + 2] *= dr;
      vel[i3 + 1] += this.grav[i] * dt;
      pos[i3] += vel[i3] * dt; pos[i3 + 1] += vel[i3 + 1] * dt; pos[i3 + 2] += vel[i3 + 2] * dt;
      if (this.bounce && this.grav[i] < 0 && pos[i3 + 1] < 0.03 && vel[i3 + 1] < 0) {
        pos[i3 + 1] = 0.03;
        vel[i3 + 1] *= -0.42; vel[i3] *= 0.7; vel[i3 + 2] *= 0.7;
      }
      size[i] = lerp(this.s1[i], this.s0[i], k);
      let a = this.a0[i] * Math.min(1, k * 2.5);
      if (this.fadeIn) a *= Math.min(1, (1 - k) * 7);
      col[i * 4 + 3] = a;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* Lightning ribbons                                                   */
/* ------------------------------------------------------------------ */
const SEG = 12;
const NP = SEG + 1;

class Lightning {
  mesh: THREE.Mesh;
  max = 90;
  cursor = 0;
  a: Float32Array; b: Float32Array; c: Float32Array;
  life: Float32Array; maxLife: Float32Array; width: Float32Array; jag: Float32Array; regen: Float32Array;
  pts: Float32Array;
  posA: Float32Array; colA: Float32Array;
  alive: Uint8Array;

  constructor() {
    const m = this.max;
    this.a = new Float32Array(m * 3); this.b = new Float32Array(m * 3); this.c = new Float32Array(m * 3);
    this.life = new Float32Array(m); this.maxLife = new Float32Array(m);
    this.width = new Float32Array(m); this.jag = new Float32Array(m); this.regen = new Float32Array(m);
    this.alive = new Uint8Array(m);
    this.pts = new Float32Array(m * NP * 3);
    this.posA = new Float32Array(m * NP * 2 * 3);
    this.colA = new Float32Array(m * NP * 2 * 4);
    const side = new Float32Array(m * NP * 2);
    const idx: number[] = [];
    for (let k = 0; k < m; k++) {
      const base = k * NP * 2;
      for (let i = 0; i < NP; i++) {
        side[base + i * 2] = -1;
        side[base + i * 2 + 1] = 1;
      }
      for (let i = 0; i < SEG; i++) {
        const v = base + i * 2;
        idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.posA, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.colA, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute vec4 aColor; attribute float aSide; varying vec4 vColor; varying float vSide;
        void main(){ vColor = aColor; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec4 vColor; varying float vSide;
        void main(){
          float s = 1.0 - abs(vSide);
          float core = smoothstep(0.55, 0.95, s);
          vec3 col = vColor.rgb * s * s * 1.1 + vec3(1.0, 0.9, 1.0) * core * 1.25;
          gl_FragColor = vec4(col, vColor.a);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
  }

  bolt(a: THREE.Vector3, b: THREE.Vector3, r: number, g: number, bl: number, width: number, life: number, jag: number) {
    const k = this.cursor;
    this.cursor = (k + 1) % this.max;
    const k3 = k * 3;
    this.a[k3] = a.x; this.a[k3 + 1] = a.y; this.a[k3 + 2] = a.z;
    this.b[k3] = b.x; this.b[k3 + 1] = b.y; this.b[k3 + 2] = b.z;
    this.c[k3] = r; this.c[k3 + 1] = g; this.c[k3 + 2] = bl;
    this.life[k] = life; this.maxLife[k] = life;
    this.width[k] = width; this.jag[k] = jag; this.regen[k] = 0;
    this.alive[k] = 1;
  }

  private gen(k: number) {
    const k3 = k * 3;
    const ax = this.a[k3], ay = this.a[k3 + 1], az = this.a[k3 + 2];
    const dx = this.b[k3] - ax, dy = this.b[k3 + 1] - ay, dz = this.b[k3 + 2] - az;
    const amp = Math.sqrt(dx * dx + dy * dy + dz * dz) * this.jag[k];
    let ox = 0, oy = 0, oz = 0;
    const base = k * NP * 3;
    for (let i = 0; i < NP; i++) {
      const t = i / SEG;
      const env = Math.sin(Math.PI * t);
      ox = ox * 0.55 + randS(amp); oy = oy * 0.55 + randS(amp); oz = oz * 0.55 + randS(amp);
      this.pts[base + i * 3] = ax + dx * t + ox * env;
      this.pts[base + i * 3 + 1] = ay + dy * t + oy * env;
      this.pts[base + i * 3 + 2] = az + dz * t + oz * env;
    }
  }

  update(dt: number, cam: THREE.Vector3) {
    const { pts, posA, colA } = this;
    for (let k = 0; k < this.max; k++) {
      if (!this.alive[k]) continue;
      const vb = k * NP * 2;
      this.life[k] -= dt;
      if (this.life[k] <= 0) {
        this.alive[k] = 0;
        for (let i = 0; i < NP * 2; i++) {
          posA[(vb + i) * 3] = 0; posA[(vb + i) * 3 + 1] = -999; posA[(vb + i) * 3 + 2] = 0;
          colA[(vb + i) * 4 + 3] = 0;
        }
        continue;
      }
      this.regen[k] -= dt;
      if (this.regen[k] <= 0) {
        this.gen(k);
        this.regen[k] = 0.035;
      }
      const base = k * NP * 3;
      const alpha = Math.sqrt(this.life[k] / this.maxLife[k]) * (0.65 + Math.random() * 0.35);
      const w = this.width[k];
      const cr = this.c[k * 3], cg = this.c[k * 3 + 1], cb = this.c[k * 3 + 2];
      for (let i = 0; i < NP; i++) {
        const i0 = base + Math.max(0, i - 1) * 3;
        const i1 = base + Math.min(SEG, i + 1) * 3;
        const p = base + i * 3;
        const tx = pts[i1] - pts[i0], ty = pts[i1 + 1] - pts[i0 + 1], tz = pts[i1 + 2] - pts[i0 + 2];
        const cx = cam.x - pts[p], cy = cam.y - pts[p + 1], cz = cam.z - pts[p + 2];
        let sx = ty * cz - tz * cy, sy = tz * cx - tx * cz, sz = tx * cy - ty * cx;
        const sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
        const dist = Math.sqrt(cx * cx + cy * cy + cz * cz);
        // keep bolts readable at distance
        const ww = (Math.max(w, dist * 0.0022) * (0.5 + 0.5 * Math.sin(Math.PI * (i / SEG)) + 0.25)) / sl;
        sx *= ww; sy *= ww; sz *= ww;
        const v = (vb + i * 2) * 3;
        posA[v] = pts[p] - sx; posA[v + 1] = pts[p + 1] - sy; posA[v + 2] = pts[p + 2] - sz;
        posA[v + 3] = pts[p] + sx; posA[v + 4] = pts[p + 1] + sy; posA[v + 5] = pts[p + 2] + sz;
        const c4 = (vb + i * 2) * 4;
        colA[c4] = cr; colA[c4 + 1] = cg; colA[c4 + 2] = cb; colA[c4 + 3] = alpha;
        colA[c4 + 4] = cr; colA[c4 + 5] = cg; colA[c4 + 6] = cb; colA[c4 + 7] = alpha;
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aColor.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ */
/* FX hub                                                              */
/* ------------------------------------------------------------------ */
interface Ring { mesh: THREE.Mesh; u: { uProg: { value: number }; uColor: { value: THREE.Color }; uAlpha: { value: number } }; life: number; max: number; r0: number; r1: number }
interface Shell { mesh: THREE.Mesh; u: { uColor: { value: THREE.Color }; uAlpha: { value: number } }; life: number; max: number; r0: number; r1: number }
interface Glow { sprite: THREE.Sprite; life: number; max: number; s0: number; s1: number; a: number }
interface Flash { light: THREE.PointLight; life: number; max: number; intensity: number }

export const PURPLE = new THREE.Color(1.5, 0.38, 2.7);
export const MAGENTA = new THREE.Color(2.3, 0.3, 1.0);
export const HOT = new THREE.Color(2.5, 1.1, 0.35);

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _Z = new THREE.Vector3(0, 0, 1);

export class FX {
  sparks = new Particles(7000, true);
  smoke = new Particles(1400, false);
  lightning = new Lightning();
  rings: Ring[] = [];
  shells: Shell[] = [];
  glows: Glow[] = [];
  orbs: THREE.Sprite[] = [];
  flashes: Flash[] = [];
  beam: THREE.Group;
  beamU = { uTime: { value: 0 }, uAlpha: { value: 0 }, uLen: { value: 100 } };
  glowTex: THREE.Texture;
  private ri = 0; private si = 0; private gi = 0; private fi = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.sparks.points, this.smoke.points, this.lightning.mesh);

    // rings
    const ringGeo = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < 22; i++) {
      const u = { uProg: { value: 0 }, uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform float uProg, uAlpha; uniform vec3 uColor;
          void main(){
            float r = length(vUv - 0.5) * 2.0;
            float w = mix(0.38, 0.05, uProg);
            float ring = smoothstep(1.0 - w, 1.0 - w * 0.25, r) * smoothstep(1.0, 0.975, r);
            float inner = smoothstep(0.0, 1.0, r) * 0.12 * (1.0 - uProg) * step(r, 1.0);
            gl_FragColor = vec4(uColor * (ring + inner), uAlpha);
          }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 11;
      scene.add(mesh);
      this.rings.push({ mesh, u, life: 0, max: 1, r0: 1, r1: 2 });
    }

    // shock shells
    const sphGeo = new THREE.SphereGeometry(1, 40, 20);
    for (let i = 0; i < 8; i++) {
      const u = { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } };
      const mat = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV;
          void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: /* glsl */ `varying vec3 vN; varying vec3 vV; uniform vec3 uColor; uniform float uAlpha;
          void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.4); gl_FragColor = vec4(uColor * (f * 0.75 + 0.01), uAlpha); }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(sphGeo, mat);
      mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 11;
      scene.add(mesh);
      this.shells.push({ mesh, u, life: 0, max: 1, r0: 1, r1: 2 });
    }

    // glow texture
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const cx = cv.getContext("2d")!;
    const gr = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.18, "rgba(255,255,255,0.75)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.18)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    cx.fillStyle = gr;
    cx.fillRect(0, 0, 128, 128);
    this.glowTex = new THREE.CanvasTexture(cv);
    const mkSprite = () => {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })
      );
      s.visible = false; s.renderOrder = 13;
      scene.add(s);
      return s;
    };
    for (let i = 0; i < 12; i++) this.glows.push({ sprite: mkSprite(), life: 0, max: 1, s0: 1, s1: 2, a: 1 });
    for (let i = 0; i < 4; i++) {
      const o = mkSprite();
      (o.material as THREE.SpriteMaterial).depthTest = false;
      this.orbs.push(o);
    }

    // flash lights
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 120, 1.6);
      scene.add(light);
      this.flashes.push({ light, life: 0, max: 1, intensity: 0 });
    }

    // railgun beam
    this.beam = new THREE.Group();
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 28, 24, true);
    cyl.rotateX(Math.PI / 2);
    cyl.translate(0, 0, 0.5);
    const beamMat = (core: boolean) =>
      new THREE.ShaderMaterial({
        uniforms: this.beamU,
        vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uTime, uAlpha, uLen;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
          void main(){
            float f = abs(dot(normalize(vN), normalize(vV)));
            float along = vUv.y * uLen;
            float n = noise(vec2(vUv.x * 14.0, along * 0.22 - uTime * 26.0));
            float n2 = noise(vec2(vUv.x * 5.0 + uTime * 2.0, along * 0.06 - uTime * 11.0));
            ${core
              ? `vec3 col = vec3(1.9, 1.6, 2.1) * (0.8 + 0.5 * n); float a = pow(f, 1.4);`
              : `vec3 col = mix(vec3(1.2, 0.06, 0.3), vec3(1.5, 0.35, 2.6), n2) * (0.3 + 1.1 * n * n2);
                 col += vec3(1.2, 0.5, 1.4) * pow(f, 6.0);
                 float a = pow(f, 2.2) * (0.4 + 0.6 * n);`}
            a *= smoothstep(0.0, 0.015, vUv.y);
            gl_FragColor = vec4(col, a * uAlpha);
          }`,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
    const outer = new THREE.Mesh(cyl, beamMat(false));
    const core = new THREE.Mesh(cyl, beamMat(true));
    core.scale.set(0.42, 0.42, 1);
    outer.frustumCulled = core.frustumCulled = false;
    outer.renderOrder = 15; core.renderOrder = 16;
    this.beam.add(outer, core);
    this.beam.visible = false;
    scene.add(this.beam);
  }

  /* ---- spawners ---- */
  bolt(a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color = PURPLE, width = 0.08, life = 0.12, jag = 0.12) {
    this.lightning.bolt(a, b, color.r, color.g, color.b, width, life, jag);
  }

  ring(pos: THREE.Vector3, normal: THREE.Vector3, r0: number, r1: number, life: number, color: THREE.Color = PURPLE) {
    const r = this.rings[this.ri];
    this.ri = (this.ri + 1) % this.rings.length;
    r.mesh.position.copy(pos);
    r.mesh.quaternion.setFromUnitVectors(_Z, _v1.copy(normal).normalize());
    r.mesh.visible = true;
    r.life = r.max = life; r.r0 = r0; r.r1 = r1;
    r.u.uColor.value.copy(color);
  }

  shell(pos: THREE.Vector3, r0: number, r1: number, life: number, color: THREE.Color = PURPLE) {
    const s = this.shells[this.si];
    this.si = (this.si + 1) % this.shells.length;
    s.mesh.position.copy(pos);
    s.mesh.visible = true;
    s.life = s.max = life; s.r0 = r0; s.r1 = r1;
    s.u.uColor.value.copy(color);
  }

  glow(pos: THREE.Vector3, s0: number, s1: number, life: number, color: THREE.Color = PURPLE, a = 1) {
    const g = this.glows[this.gi];
    this.gi = (this.gi + 1) % this.glows.length;
    g.sprite.position.copy(pos);
    g.sprite.visible = true;
    (g.sprite.material as THREE.SpriteMaterial).color.copy(color);
    g.life = g.max = life; g.s0 = s0; g.s1 = s1; g.a = a;
  }

  light(pos: THREE.Vector3, color: THREE.Color | number, intensity: number, life: number, distance = 140) {
    const f = this.flashes[this.fi];
    this.fi = (this.fi + 1) % this.flashes.length;
    f.light.position.copy(pos);
    f.light.color.set(color as THREE.ColorRepresentation);
    f.light.distance = distance;
    f.life = f.max = life; f.intensity = Math.min(intensity, 1600);
  }

  /** hot metal + magnetic sparks */
  burst(pos: THREE.Vector3, n: number, speed: number, size = 0.14, purple = 0.4, dir?: THREE.Vector3, spread = 1) {
    for (let i = 0; i < n; i++) {
      _v1.set(randS(1), randS(1), randS(1)).normalize();
      if (dir) _v1.multiplyScalar(spread).add(dir).normalize();
      const sp = speed * (0.25 + Math.random() * Math.random() * 1.2);
      const isP = Math.random() < purple;
      const c = isP ? PURPLE : HOT;
      const k = 0.6 + Math.random() * 0.9;
      this.sparks.spawn(
        pos.x, pos.y, pos.z, _v1.x * sp, _v1.y * sp + speed * 0.15, _v1.z * sp,
        rand(0.5, 1.6), size * rand(0.6, 1.5), 0.01,
        c.r * k, c.g * k, c.b * k, 1, -rand(14, 26), rand(0.2, 1.0)
      );
    }
  }

  dust(pos: THREE.Vector3, n: number, radius: number, speed: number, size = 3, dark = 0.5, up = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius * Math.sqrt(Math.random());
      const sp = speed * rand(0.3, 1);
      const g = rand(0.01, 0.028) * dark * 2;
      this.smoke.spawn(
        pos.x + Math.cos(a) * r, pos.y + rand(0, 0.8), pos.z + Math.sin(a) * r,
        Math.cos(a) * sp, rand(0.4, 2.5) * up, Math.sin(a) * sp,
        rand(1.6, 3.6), size * rand(0.5, 0.9), size * rand(1.8, 3.2),
        g * 1.25, g * 0.95, g * 1.1, rand(0.25, 0.5), 0, rand(0.8, 1.6)
      );
    }
  }

  /** composite impact: flash, rings, shell, sparks, smoke */
  impact(pos: THREE.Vector3, normal: THREE.Vector3, scale: number, color: THREE.Color = PURPLE) {
    this.glow(pos, scale * 3, scale * 9, 0.28, color, 0.8);
    this.glow(pos, scale * 1.5, scale * 4.5, 0.4, WHITE, 0.9);
    this.ring(pos, normal, scale * 0.8, scale * 11, 0.55, color);
    this.ring(pos, normal, scale * 0.4, scale * 17, 0.85, MAGENTA);
    this.shell(pos, scale * 0.8, scale * 8, 0.5, color);
    this.light(pos, color, 260 * scale, 0.5, 220);
    this.burst(pos, Math.floor(140 * scale), 34 * Math.sqrt(scale), 0.2 * Math.sqrt(scale), 0.35, normal, 1.4);
    this.dust(pos, Math.floor(16 * scale), 2.5 * scale, 9 * scale, 4.5 * scale, 0.6);
  }

  setBeam(origin: THREE.Vector3, target: THREE.Vector3, radius: number, alpha: number, time: number) {
    if (alpha <= 0.001 || radius <= 0.001) {
      this.beam.visible = false;
      return;
    }
    this.beam.visible = true;
    this.beam.position.copy(origin);
    this.beam.lookAt(target);
    const len = 420;
    this.beam.scale.set(radius, radius, len);
    this.beamU.uAlpha.value = alpha;
    this.beamU.uTime.value = time;
    this.beamU.uLen.value = len;
  }

  hideOrbs() {
    for (const o of this.orbs) o.visible = false;
  }

  setOrb(i: number, pos: THREE.Vector3, size: number, color: THREE.Color, opacity = 1) {
    const o = this.orbs[i];
    o.visible = size > 0.001;
    o.position.copy(pos);
    o.scale.setScalar(size);
    const m = o.material as THREE.SpriteMaterial;
    m.color.copy(color);
    m.opacity = opacity;
  }

  update(dt: number, camera: THREE.PerspectiveCamera, bufferH: number) {
    const scale = bufferH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.sparks.mat.uniforms.uScale.value = scale;
    this.smoke.mat.uniforms.uScale.value = scale;
    this.sparks.update(dt);
    this.smoke.update(dt);
    camera.getWorldPosition(_v2);
    this.lightning.update(dt, _v2);
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) { r.mesh.visible = false; continue; }
      const p = 1 - r.life / r.max;
      r.mesh.scale.setScalar(lerp(r.r0, r.r1, easeOutCubic(p)));
      r.u.uProg.value = p;
      r.u.uAlpha.value = Math.pow(1 - p, 1.4);
    }
    for (const s of this.shells) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      const p = 1 - s.life / s.max;
      s.mesh.scale.setScalar(lerp(s.r0, s.r1, easeOutCubic(p)));
      s.u.uAlpha.value = Math.pow(1 - p, 1.6);
    }
    for (const g of this.glows) {
      if (g.life <= 0) continue;
      g.life -= dt;
      if (g.life <= 0) { g.sprite.visible = false; continue; }
      const p = 1 - g.life / g.max;
      g.sprite.scale.setScalar(lerp(g.s0, g.s1, easeOutCubic(p)));
      (g.sprite.material as THREE.SpriteMaterial).opacity = g.a * Math.pow(1 - p, 1.5);
    }
    for (const f of this.flashes) {
      if (f.life <= 0) { f.light.intensity = 0; continue; }
      f.life -= dt;
      f.light.intensity = f.intensity * Math.pow(Math.max(0, f.life / f.max), 2);
    }
  }
}

export const WHITE = new THREE.Color(2.1, 2.0, 2.2);
