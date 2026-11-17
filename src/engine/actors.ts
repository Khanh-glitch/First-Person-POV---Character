import * as THREE from "three";
import { NOISE_GLSL } from "./world";
import { clamp, easeOutCubic, easeOutExpo, rand } from "./util";
import type { ParticleSystem } from "./particles";

export interface Actor {
  obj: THREE.Object3D;
  update(dt: number, t: number): boolean; // false = remove
  dispose(): void;
}

const Z = new THREE.Vector3(0, 0, 1);

/* ------------------------------------------------------------------ */
/*  Shock ring (flat plane with an expanding glowing band)             */
/* ------------------------------------------------------------------ */
const ringGeo = new THREE.PlaneGeometry(2, 2);

export class ShockRing implements Actor {
  obj: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private age = 0;
  constructor(
    pos: THREE.Vector3,
    normal: THREE.Vector3,
    color: THREE.Color,
    radius: number,
    private dur: number,
    thick = 0.1,
    alpha = 1
  ) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uProg: { value: 0 }, uColor: { value: color }, uThick: { value: thick }, uAlpha: { value: alpha } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; uniform float uProg, uThick, uAlpha; uniform vec3 uColor;
        void main(){
          vec2 p = vUv*2.0-1.0; float r = length(p); float a = atan(p.y,p.x);
          float rad = uProg*0.97;
          float th = uThick*(1.0-uProg*0.6);
          float jit = (sin(a*9.0+uProg*20.0)*0.5 + sin(a*23.0-uProg*33.0)*0.5)*0.012;
          float d = abs(r-rad-jit);
          float ring = smoothstep(th, 0.0, d);
          float trail = smoothstep(th*5.0, 0.0, rad-r) * step(r, rad) * 0.22;
          float al = (ring + trail) * pow(1.0-uProg, 1.4) * uAlpha;
          gl_FragColor = vec4(uColor*(1.0+ring*2.5), al);
        }`,
    });
    this.obj = new THREE.Mesh(ringGeo, this.mat);
    this.obj.position.copy(pos);
    this.obj.scale.setScalar(radius);
    this.obj.quaternion.setFromUnitVectors(Z, normal.clone().normalize());
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 8;
  }
  update(dt: number) {
    this.age += dt;
    const p = clamp(this.age / this.dur);
    this.mat.uniforms.uProg.value = easeOutCubic(p);
    return p < 1;
  }
  dispose() {
    this.mat.dispose();
  }
}

/* ------------------------------------------------------------------ */
/*  Fresnel dome (explosion shell)                                     */
/* ------------------------------------------------------------------ */
export class Dome implements Actor {
  obj: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private age = 0;
  constructor(pos: THREE.Vector3, color: THREE.Color, private radius: number, private dur: number, half = false) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uProg: { value: 0 }, uColor: { value: color }, uTime: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float uProg, uTime; uniform vec3 uColor;
        ${NOISE_GLSL}
        void main(){
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float n = fbm(vec3(vP*3.0 + vec3(0.0, -uTime*2.0, 0.0)));
          float al = (pow(f, 2.2)*1.2 + 0.1*n) * pow(1.0-uProg, 1.6);
          vec3 c = uColor * (0.8 + n*2.0);
          gl_FragColor = vec4(c, al);
        }`,
    });
    const geo = new THREE.SphereGeometry(1, 40, 28, 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI);
    this.obj = new THREE.Mesh(geo, this.mat);
    this.obj.position.copy(pos);
    this.obj.scale.setScalar(0.01);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 9;
  }
  update(dt: number, t: number) {
    this.age += dt;
    const p = clamp(this.age / this.dur);
    this.obj.scale.setScalar(Math.max(0.01, this.radius * easeOutExpo(p)));
    this.mat.uniforms.uProg.value = p;
    this.mat.uniforms.uTime.value = t;
    return p < 1;
  }
  dispose() {
    this.mat.dispose();
    this.obj.geometry.dispose();
  }
}

/* ------------------------------------------------------------------ */
/*  Vertical beam                                                      */
/* ------------------------------------------------------------------ */
export class Beam implements Actor {
  obj = new THREE.Group();
  outer: THREE.ShaderMaterial;
  inner: THREE.ShaderMaterial;
  private meshes: THREE.Mesh[] = [];
  constructor(top: THREE.Vector3, bottom: THREE.Vector3, radius: number, colorOuter: THREE.Color, colorCore: THREE.Color) {
    const len = top.distanceTo(bottom);
    const make = (r: number, color: THREE.Color, core: THREE.Color, coreK: number) => {
      const m = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uGrow: { value: 0 },
          uAmp: { value: 1 },
          uCoreK: { value: coreK },
          uLen: { value: len },
          uColor: { value: color },
          uCore: { value: core },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        vertexShader: `
          varying vec3 vPos; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
          void main(){ vUv=uv; vPos=position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV=-mv.xyz; gl_Position = projectionMatrix*mv; }`,
        fragmentShader: /* glsl */ `
          varying vec3 vPos; varying vec3 vN; varying vec3 vV; varying vec2 vUv;
          uniform float uTime, uGrow, uAmp, uCoreK, uLen; uniform vec3 uColor, uCore;
          ${NOISE_GLSL}
          void main(){
            float y = vUv.y;
            float front = 1.0 - uGrow;
            if (y < front) discard;
            float ang = atan(vPos.z, vPos.x);
            float flow = fbm(vec3(cos(ang)*2.0, sin(ang)*2.0 + y*uLen*0.06 - uTime*9.0, uTime*1.5));
            float fres = pow(abs(dot(normalize(vN), normalize(vV))), 1.1);
            float core = pow(fres, 2.2);
            vec3 col = mix(uColor, uCore, core*uCoreK) * (0.55 + flow*1.6);
            float al = (fres*0.85 + 0.15) * (0.5 + flow*0.9) * uAmp;
            float h = exp(-(y-front)*uLen*0.05);
            col += uCore * h * 2.5;
            al += h*0.8*uAmp;
            gl_FragColor = vec4(col, al);
          }`,
      });
      const g = new THREE.CylinderGeometry(r, r * 1.04, 1, 40, 1, true);
      const mesh = new THREE.Mesh(g, m);
      mesh.scale.y = len;
      mesh.frustumCulled = false;
      mesh.renderOrder = 25;
      this.meshes.push(mesh);
      this.obj.add(mesh);
      return m;
    };
    this.outer = make(radius, colorOuter, colorCore, 0.6);
    this.inner = make(radius * 0.45, colorCore, new THREE.Color(1.6, 1.5, 1.6), 1);
    this.obj.position.copy(top.clone().add(bottom).multiplyScalar(0.5));
  }
  widen(k: number) {
    this.meshes[0].scale.x = k;
    this.meshes[0].scale.z = k;
    this.meshes[1].scale.x = k;
    this.meshes[1].scale.z = k;
  }
  set(grow: number, amp: number, t: number) {
    for (const m of [this.outer, this.inner]) {
      m.uniforms.uGrow.value = grow;
      m.uniforms.uAmp.value = amp;
      m.uniforms.uTime.value = t;
    }
  }
  update() {
    return true;
  }
  dispose() {
    this.outer.dispose();
    this.inner.dispose();
    this.meshes.forEach((m) => m.geometry.dispose());
  }
}

/* ------------------------------------------------------------------ */
/*  Dark orb ("black sun")                                             */
/* ------------------------------------------------------------------ */
export class Orb implements Actor {
  obj: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  constructor(radius: number, rim: THREE.Color, core = new THREE.Color(0.002, 0, 0.004)) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uRim: { value: rim }, uCore: { value: core }, uPower: { value: 1 } },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec3 vN; varying vec3 vV; varying vec3 vPos;
        void main(){ vPos=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: /* glsl */ `
        varying vec3 vN; varying vec3 vV; varying vec3 vPos; uniform float uTime, uPower; uniform vec3 uRim, uCore;
        ${NOISE_GLSL}
        void main(){
          vec3 n = normalize(vN); vec3 v = normalize(vV);
          float f = 1.0 - abs(dot(n, v));
          float sw = fbm(vec3(vPos*5.0 + vec3(0.0, uTime*1.8, uTime*0.7)));
          float rim = pow(f, 2.0);
          float veins = smoothstep(0.55, 0.7, sw) * 0.8;
          vec3 col = mix(uCore, uRim * (1.2 + sw*3.0), clamp(rim*1.3 + veins*rim, 0.0, 1.0));
          col += uRim * veins * 0.5;
          gl_FragColor = vec4(col * uPower, clamp(0.96 * uPower, 0.0, 1.0));
        }`,
    });
    this.obj = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), this.mat);
    this.obj.renderOrder = 12;
    this.obj.frustumCulled = false;
  }
  update(_dt: number, t: number) {
    this.mat.uniforms.uTime.value = t;
    return true;
  }
  dispose() {
    this.mat.dispose();
    this.obj.geometry.dispose();
  }
}

/* ------------------------------------------------------------------ */
/*  Magic circle                                                       */
/* ------------------------------------------------------------------ */
export class MagicCircle implements Actor {
  obj: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  spin = 0.3;
  constructor(tex: THREE.Texture, color: THREE.Color, size: number) {
    this.mat = new THREE.MeshBasicMaterial({
      map: tex,
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.obj = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.mat);
    this.obj.frustumCulled = false;
    this.obj.renderOrder = 6;
  }
  update(dt: number) {
    this.obj.rotation.z += this.spin * dt;
    return true;
  }
  dispose() {
    this.mat.dispose();
    this.obj.geometry.dispose();
  }
}

/* ------------------------------------------------------------------ */
/*  Lightning (rendered as dense glowing beads into the fire system)   */
/* ------------------------------------------------------------------ */
export function emitBolt(
  ps: ParticleSystem,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c0: THREE.Color,
  c1: THREE.Color,
  size = 1.2,
  jag = 0.12,
  life = 0.2,
  branches = 2,
  depth = 0
) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  dir.normalize();
  const perp1 = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).cross(dir).normalize();
  const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();
  const segs = Math.max(6, Math.floor(len / (size * 3)));
  let ox = 0;
  let oy = 0;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;
    const env = Math.sin(f * Math.PI);
    ox += rand(-1, 1) * len * jag * 0.35;
    oy += rand(-1, 1) * len * jag * 0.35;
    ox *= 0.86;
    oy *= 0.86;
    pts.push(
      a
        .clone()
        .addScaledVector(dir, len * f)
        .addScaledVector(perp1, ox * env)
        .addScaledVector(perp2, oy * env)
    );
  }
  const d = new THREE.Vector3();
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    d.subVectors(q, p);
    const steps = Math.max(1, Math.ceil(d.length() / (size * 0.8)));
    for (let s = 0; s < steps; s++) {
      const k = s / steps;
      ps.emit({
        x: p.x + d.x * k,
        y: p.y + d.y * k,
        z: p.z + d.z * k,
        life: life * rand(0.7, 1.2),
        size0: size * rand(0.8, 1.3),
        size1: size * 0.4,
        c0,
        c1,
        a: 1,
        fadeIn: 0,
        spin: 0,
      });
    }
    if (depth < 1 && branches > 0 && Math.random() < 0.18) {
      const end = p
        .clone()
        .addScaledVector(dir, len * 0.25)
        .addScaledVector(perp1, rand(-1, 1) * len * 0.25)
        .addScaledVector(perp2, rand(-1, 1) * len * 0.25);
      emitBolt(ps, p.clone(), end, c0, c1, size * 0.7, jag, life * 0.8, 0, depth + 1);
    }
  }
}
