import * as THREE from "three";

const ringVert = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const ringFrag = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor; uniform float uAlpha; uniform float uThick;
void main(){
  float d = length(vUv-0.5)*2.0;
  float r = smoothstep(1.0-uThick, 1.0-uThick*0.4, d) * smoothstep(1.0, 0.94, d);
  float inner = smoothstep(1.0-uThick*3.0, 1.0, d) * 0.25 * step(d,1.0);
  gl_FragColor = vec4(uColor*(r*1.6+inner)*uAlpha, 1.0);
}`;

const cutFrag = /* glsl */ `
varying vec2 vUv;
uniform vec3 uColor; uniform float uAlpha; uniform float uHeat; uniform float uTime;
void main(){
  float x = abs(vUv.y-0.5)*2.0;
  float core = smoothstep(0.35,0.0,x);
  float glow = smoothstep(1.0,0.0,x);
  float flick = 0.85+0.15*sin(vUv.x*120.0+uTime*30.0);
  vec3 hot = mix(uColor, vec3(1.0), core*uHeat);
  float tip = smoothstep(1.0,0.97,vUv.x);
  gl_FragColor = vec4(hot*(core*2.5+glow*0.6)*uAlpha*flick*tip, 1.0);
}`;

interface Ring {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  dur: number;
  r0: number;
  r1: number;
  active: boolean;
  face: boolean;
}
interface Ball {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  t: number;
  dur: number;
  r: number;
  active: boolean;
  color: THREE.Color;
}
interface Cut {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  dur: number;
  len: number;
  grow: number;
  active: boolean;
  width: number;
  onProgress?: (p: THREE.Vector3, k: number) => void;
  start: THREE.Vector3;
  dir: THREE.Vector3;
  lastK: number;
}
interface FLight {
  light: THREE.PointLight;
  t: number;
  dur: number;
  peak: number;
}

export class Effects {
  group = new THREE.Group();
  debris: THREE.InstancedMesh;
  dCap = 900;
  dPos: Float32Array;
  dVel: Float32Array;
  dRot: Float32Array;
  dSpin: Float32Array;
  dScale: Float32Array;
  dLife: Float32Array;
  dCursor = 0;
  rings: Ring[] = [];
  balls: Ball[] = [];
  cuts: Cut[] = [];
  lights: FLight[] = [];
  time = 0;
  groundAt: (x: number, z: number) => number = () => 0;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor() {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const dm = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
    this.debris = new THREE.InstancedMesh(box, dm, this.dCap);
    this.debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debris.frustumCulled = false;
    this.debris.castShadow = true;
    const n = this.dCap;
    this.dPos = new Float32Array(n * 3);
    this.dVel = new Float32Array(n * 3);
    this.dRot = new Float32Array(n * 3);
    this.dSpin = new Float32Array(n * 3);
    this.dScale = new Float32Array(n);
    this.dLife = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.debris.setColorAt(i, c.set(0xffffff));
      this.m4.makeScale(0, 0, 0);
      this.debris.setMatrixAt(i, this.m4);
    }
    this.group.add(this.debris);

    const ringGeo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 28; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: ringVert,
        fragmentShader: ringFrag,
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uThick: { value: 0.15 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 15;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, t: 0, dur: 1, r0: 0, r1: 1, active: false, face: false });
    }
    const sph = new THREE.SphereGeometry(1, 24, 16);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(sph, mat);
      mesh.visible = false;
      mesh.renderOrder = 14;
      this.group.add(mesh);
      this.balls.push({ mesh, mat, t: 0, dur: 1, r: 1, active: false, color: new THREE.Color() });
    }
    const cutGeo = new THREE.PlaneGeometry(1, 1);
    cutGeo.translate(0.5, 0, 0);
    for (let i = 0; i < 40; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: ringVert,
        fragmentShader: cutFrag,
        uniforms: {
          uColor: { value: new THREE.Color() },
          uAlpha: { value: 0 },
          uHeat: { value: 1 },
          uTime: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(cutGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 12;
      this.group.add(mesh);
      this.cuts.push({
        mesh,
        mat,
        t: 0,
        dur: 1,
        len: 1,
        grow: 1,
        active: false,
        width: 1,
        start: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        lastK: 0,
      });
    }
    for (let i = 0; i < 4; i++) {
      const light = new THREE.PointLight(0xffaa66, 0, 120, 1.6);
      this.group.add(light);
      this.lights.push({ light, t: 1, dur: 1, peak: 0 });
    }
  }

  spawnDebris(pos: THREE.Vector3, count: number, color: THREE.Color | number, speed = 12, size = 0.6, up = 1) {
    const col = new THREE.Color(color);
    const c2 = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const i = this.dCursor;
      this.dCursor = (this.dCursor + 1) % this.dCap;
      this.dPos[i * 3] = pos.x + (Math.random() - 0.5) * size * 3;
      this.dPos[i * 3 + 1] = pos.y + (Math.random() - 0.5) * size * 3;
      this.dPos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * size * 3;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.3 + Math.random() * 0.9);
      this.dVel[i * 3] = Math.cos(a) * sp * 0.7;
      this.dVel[i * 3 + 1] = (0.4 + Math.random()) * sp * up;
      this.dVel[i * 3 + 2] = Math.sin(a) * sp * 0.7;
      for (let j = 0; j < 3; j++) {
        this.dRot[i * 3 + j] = Math.random() * 6;
        this.dSpin[i * 3 + j] = (Math.random() - 0.5) * 14;
      }
      this.dScale[i] = size * (0.3 + Math.random() * 1.0);
      this.dLife[i] = 3.5 + Math.random() * 2;
      c2.copy(col).multiplyScalar(0.6 + Math.random() * 0.5);
      this.debris.setColorAt(i, c2);
    }
    if (this.debris.instanceColor) this.debris.instanceColor.needsUpdate = true;
  }

  ring(pos: THREE.Vector3, r0: number, r1: number, dur: number, color: number | THREE.Color, opts: { face?: boolean; normal?: THREE.Vector3; thick?: number } = {}) {
    const r = this.rings.find((x) => !x.active) ?? this.rings[0];
    r.active = true;
    r.t = 0;
    r.dur = dur;
    r.r0 = r0;
    r.r1 = r1;
    r.face = !!opts.face;
    r.mesh.position.copy(pos);
    r.mat.uniforms.uColor.value.set(color);
    r.mat.uniforms.uThick.value = opts.thick ?? 0.15;
    if (!r.face) {
      const n = opts.normal ?? new THREE.Vector3(0, 1, 0);
      r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.clone().normalize());
    }
    r.mesh.visible = true;
  }

  fireball(pos: THREE.Vector3, radius: number, dur: number, color: number | THREE.Color) {
    const b = this.balls.find((x) => !x.active) ?? this.balls[0];
    b.active = true;
    b.t = 0;
    b.dur = dur;
    b.r = radius;
    b.color.set(color);
    b.mesh.position.copy(pos);
    b.mesh.visible = true;
  }

  /** a glowing gash/cut strip that grows from start along dir */
  cut(
    start: THREE.Vector3,
    dir: THREE.Vector3,
    len: number,
    width: number,
    color: number | THREE.Color,
    growTime: number,
    dur: number,
    opts: { vertical?: boolean; normal?: THREE.Vector3; onProgress?: (p: THREE.Vector3, k: number) => void } = {}
  ) {
    const c = this.cuts.find((x) => !x.active) ?? this.cuts[0];
    c.active = true;
    c.t = 0;
    c.dur = dur;
    c.len = len;
    c.grow = growTime;
    c.width = width;
    c.lastK = 0;
    c.onProgress = opts.onProgress;
    c.start.copy(start);
    c.dir.copy(dir).normalize();
    c.mat.uniforms.uColor.value.set(color);
    c.mesh.position.copy(start);
    // orient: local +X along dir, plane normal = up (ground) or given normal
    const xAxis = c.dir.clone();
    const n = opts.normal ? opts.normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    const yAxis = new THREE.Vector3().crossVectors(n, xAxis).normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    c.mesh.quaternion.setFromRotationMatrix(m);
    c.mesh.scale.set(0.001, width, 1);
    c.mesh.visible = true;
  }

  flashLight(pos: THREE.Vector3, color: number, intensity: number, dur: number, range = 150) {
    const l = this.lights.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    l.light.position.copy(pos);
    l.light.color.set(color);
    l.light.distance = range;
    l.t = 0;
    l.dur = dur;
    l.peak = intensity;
  }

  update(dt: number, camera: THREE.Camera) {
    this.time += dt;
    // debris
    for (let i = 0; i < this.dCap; i++) {
      if (this.dLife[i] <= 0) continue;
      this.dLife[i] -= dt;
      const ix = i * 3;
      this.dVel[ix + 1] -= 30 * dt;
      this.dPos[ix] += this.dVel[ix] * dt;
      this.dPos[ix + 1] += this.dVel[ix + 1] * dt;
      this.dPos[ix + 2] += this.dVel[ix + 2] * dt;
      const g = this.groundAt(this.dPos[ix], this.dPos[ix + 2]);
      const sc = this.dScale[i];
      if (this.dPos[ix + 1] < g + sc * 0.5) {
        this.dPos[ix + 1] = g + sc * 0.5;
        this.dVel[ix + 1] *= -0.3;
        this.dVel[ix] *= 0.6;
        this.dVel[ix + 2] *= 0.6;
        this.dSpin[ix] *= 0.5;
        this.dSpin[ix + 1] *= 0.5;
        this.dSpin[ix + 2] *= 0.5;
      }
      for (let j = 0; j < 3; j++) this.dRot[ix + j] += this.dSpin[ix + j] * dt;
      const shrink = Math.min(1, this.dLife[i] / 0.8);
      this.e.set(this.dRot[ix], this.dRot[ix + 1], this.dRot[ix + 2]);
      this.q.setFromEuler(this.e);
      this.v.set(this.dPos[ix], this.dPos[ix + 1], this.dPos[ix + 2]);
      this.s.setScalar(sc * shrink);
      this.m4.compose(this.v, this.q, this.s);
      this.debris.setMatrixAt(i, this.m4);
      if (this.dLife[i] <= 0) {
        this.m4.makeScale(0, 0, 0);
        this.debris.setMatrixAt(i, this.m4);
      }
    }
    this.debris.instanceMatrix.needsUpdate = true;

    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.dur);
      const e = 1 - Math.pow(1 - k, 3);
      const rad = r.r0 + (r.r1 - r.r0) * e;
      r.mesh.scale.setScalar(rad * 2);
      r.mat.uniforms.uAlpha.value = Math.pow(1 - k, 1.5);
      if (r.face) r.mesh.quaternion.copy(camera.quaternion);
      if (k >= 1) {
        r.active = false;
        r.mesh.visible = false;
      }
    }
    for (const b of this.balls) {
      if (!b.active) continue;
      b.t += dt;
      const k = Math.min(1, b.t / b.dur);
      b.mesh.scale.setScalar(b.r * (0.3 + 0.7 * (1 - Math.pow(1 - k, 4))));
      const a = Math.pow(1 - k, 2);
      b.mat.color.copy(b.color).multiplyScalar(a * 2.5);
      if (k >= 1) {
        b.active = false;
        b.mesh.visible = false;
      }
    }
    for (const c of this.cuts) {
      if (!c.active) continue;
      c.t += dt;
      const g = Math.min(1, c.t / c.grow);
      const ge = 1 - Math.pow(1 - g, 2);
      c.mesh.scale.x = Math.max(0.001, c.len * ge);
      const fade = c.t < c.grow ? 1 : Math.max(0, 1 - (c.t - c.grow) / c.dur);
      c.mat.uniforms.uAlpha.value = fade;
      c.mat.uniforms.uHeat.value = Math.max(0, 1 - (c.t - c.grow) / (c.dur * 0.4));
      c.mat.uniforms.uTime.value = this.time;
      if (c.onProgress && ge > c.lastK) {
        const steps = Math.ceil((ge - c.lastK) * 30);
        for (let s = 1; s <= steps; s++) {
          const kk = c.lastK + ((ge - c.lastK) * s) / steps;
          c.onProgress(this.v.copy(c.start).addScaledVector(c.dir, c.len * kk), kk);
        }
        c.lastK = ge;
      }
      if (c.t > c.grow + c.dur) {
        c.active = false;
        c.mesh.visible = false;
      }
    }
    for (const l of this.lights) {
      l.t += dt;
      const k = Math.min(1, l.t / l.dur);
      l.light.intensity = l.peak * Math.pow(1 - k, 2);
    }
  }
}
