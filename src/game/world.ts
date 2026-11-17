import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import waterNormalsUrl from '../assets/waternormals.jpg?inline';
import { Ship } from './ships';
import { rand, TAU } from './util';

export interface Hit {
  kind: 'ship' | 'water' | 'sky';
  point: THREE.Vector3;
  ship: Ship | null;
  dist: number;
}

export interface WorldHooks {
  splash(pos: THREE.Vector3, size: number): void;
  trail(pos: THREE.Vector3, power: number): void;
  burn(pos: THREE.Vector3, power: number): void;
  explode(pos: THREE.Vector3, size: number): void;
}

interface Chunk {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  ang: THREE.Vector3;
  t: number;
  splashT: number;
  size: number;
}

const SLOTS = [
  { pos: new THREE.Vector3(-58, 0, -215), heading: 0.5 },
  { pos: new THREE.Vector3(72, 0, -305), heading: -0.55 },
  { pos: new THREE.Vector3(-200, 0, -335), heading: 0.18 },
  { pos: new THREE.Vector3(225, 0, -255), heading: -0.9 },
  { pos: new THREE.Vector3(8, 0, -480), heading: 0.35 },
];

function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}

function rockGeometry(seed: number, rx: number, ry: number, rz: number) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position;
  const colors: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = vnoise(x * 2.2 + seed, y * 2.2, z * 2.2 + seed) * 0.55 + vnoise(x * 5 + seed, y * 5, z * 5) * 0.25;
    const f = 0.75 + n * 0.7;
    x *= f; y *= f; z *= f;
    y = Math.max(y, -0.35);
    const tall = y > 0 ? y * (1 + Math.pow(y, 2) * 0.4) : y;
    p.setXYZ(i, x * rx, tall * ry, z * rz);
    const h = (y + 0.35) / 1.4;
    if (h > 0.72) c.setHex(0x2d4a36).offsetHSL(0, 0, rand(-0.02, 0.03));
    else {
      c.setHex(0x4a3b31).lerp(new THREE.Color(0x8a6e55), Math.max(0, Math.sin(y * 14 + seed) * 0.5 + 0.1));
      c.offsetHSL(0, 0, rand(-0.02, 0.02));
    }
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const BUBBLE_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vec3 base = instanceMatrix[3].xyz;
  float sc = length(instanceMatrix[0].xyz);
  float h = fract(sin(dot(base.xz, vec2(12.9898, 78.233))) * 43758.5453);
  float range = 140.0;
  float rise = mod(uTime * (3.0 + h * 4.0) + h * range, range);
  vec3 wpos = base + position * sc + vec3(sin(uTime * 0.4 + h * 6.28) * 4.0, rise, cos(uTime * 0.3 + h * 9.0) * 4.0);
  vN = normalize(normal);
  vWorld = wpos;
  gl_Position = projectionMatrix * viewMatrix * vec4(wpos, 1.0);
}`;
const BUBBLE_FRAG = /* glsl */ `
uniform vec3 uSun;
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 N = normalize(vN);
  float f = pow(1.0 - abs(dot(N, V)), 2.6);
  vec3 irid = 0.55 + 0.45 * cos(6.2832 * (f * 1.6 + vec3(0.0, 0.33, 0.67)));
  vec3 R = reflect(-V, N);
  float glint = pow(max(dot(R, uSun), 0.0), 80.0) * 5.0;
  vec3 col = irid * f * 1.1 + vec3(1.0, 0.8, 0.5) * glint;
  gl_FragColor = vec4(col, f * 0.85 + 0.03 + glint * 0.2);
}`;

export class World {
  scene: THREE.Scene;
  sky: Sky;
  water: Water;
  sunDir = new THREE.Vector3();
  ships: (Ship | null)[] = [];
  timers: number[] = [];
  chunks: Chunk[] = [];
  hooks: WorldHooks | null = null;
  sunk = 0;
  private bubbleMat: THREE.ShaderMaterial;
  private ray = new THREE.Ray();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0xe2a574, 0.00085);

    const el = THREE.MathUtils.degToRad(6.5);
    const az = THREE.MathUtils.degToRad(-60);
    this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();

    this.sky = new Sky();
    this.sky.scale.setScalar(10000);
    const su = this.sky.material.uniforms;
    su.turbidity.value = 6;
    su.rayleigh.value = 2.0;
    su.mieCoefficient.value = 0.0042;
    su.mieDirectionalG.value = 0.86;
    su.sunPosition.value.copy(this.sunDir);
    su.cloudCoverage.value = 0.52;
    su.cloudDensity.value = 0.55;
    su.cloudElevation.value = 0.42;
    scene.add(this.sky);

    // environment lighting from the sky
    const envSky = new Sky();
    envSky.scale.setScalar(10000);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG', 'cloudCoverage', 'cloudDensity', 'cloudElevation']) {
      envSky.material.uniforms[k].value = su[k].value;
    }
    envSky.material.uniforms.sunPosition.value.copy(this.sunDir);
    envSky.material.uniforms.showSunDisc.value = 0;
    const envScene = new THREE.Scene();
    envScene.add(envSky);
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = pm.fromScene(envScene, 0, 0.1, 10000);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.7;
    pm.dispose();

    const normals = new THREE.TextureLoader().load(waterNormalsUrl, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    });
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    this.water = new Water(new THREE.PlaneGeometry(30000, 30000), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: this.sunDir.clone(),
      sunColor: 0xffd9a8,
      waterColor: 0x0b2a38,
      distortionScale: 3.4,
      fog: true,
    });
    this.water.rotation.x = -Math.PI / 2;
    this.water.material.uniforms.size.value = 0.55;
    scene.add(this.water);

    const sun = new THREE.DirectionalLight(0xffc48a, 3.2);
    sun.position.copy(this.sunDir).multiplyScalar(500);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffb8a0, 1.1);
    fill.position.set(0.4, 0.55, 1).multiplyScalar(300);
    scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xffd0a8, 0x14303f, 0.65));

    this.buildScenery();
    this.bubbleMat = this.buildBubbles();

    SLOTS.forEach((_, i) => {
      this.ships[i] = null;
      this.timers[i] = 0;
      this.spawn(i, true);
    });
  }

  private buildScenery() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
    const rocks: [number, number, number, number, number][] = [
      // x, z, rx, ry, rz
      [-520, -780, 90, 190, 80],
      [430, -640, 70, 150, 60],
      [-330, -480, 40, 90, 45],
      [640, -430, 55, 110, 50],
      [-760, -380, 80, 140, 70],
      [120, -1000, 130, 260, 110],
      [-180, -1300, 160, 220, 140],
      [900, -900, 120, 210, 100],
      [-1000, -1100, 150, 280, 120],
      [330, -1500, 190, 300, 150],
      [-620, -1700, 200, 340, 160],
      [260, -330, 28, 50, 30],
    ];
    rocks.forEach(([x, z, rx, ry, rz], i) => {
      const m = new THREE.Mesh(rockGeometry(i * 3.7, rx, ry, rz), mat);
      m.position.set(x, -4, z);
      m.rotation.y = rand(0, TAU);
      this.scene.add(m);
    });

    // giant mangrove-like trees (Sabaody nod)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4d3828, roughness: 1, flatShading: true });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a5a3e, roughness: 0.9, flatShading: true });
    const trees: [number, number, number][] = [
      [-420, -900, 1.0],
      [560, -1050, 1.25],
      [-840, -640, 0.9],
      [880, -720, 1.0],
      [40, -1650, 1.7],
      [-260, -1250, 1.3],
    ];
    trees.forEach(([x, z, s], ti) => {
      const g = new THREE.Group();
      const trunkGeo = new THREE.CylinderGeometry(11, 17, 280, 9, 8);
      const tp = trunkGeo.attributes.position;
      for (let i = 0; i < tp.count; i++) {
        const y = tp.getY(i);
        tp.setX(i, tp.getX(i) + Math.sin(y * 0.021 + ti) * 9);
      }
      trunkGeo.computeVertexNormals();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 140;
      g.add(trunk);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + rand(-0.2, 0.2);
        const rg = new THREE.CylinderGeometry(2.4, 6.5, 90, 6);
        const r = new THREE.Mesh(rg, trunkMat);
        r.position.set(Math.cos(a) * 21, 30, Math.sin(a) * 21);
        r.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
        g.add(r);
      }
      for (let i = 0; i < 7; i++) {
        const lg = new THREE.IcosahedronGeometry(1, 1);
        const l = new THREE.Mesh(lg, leafMat);
        const a = rand(0, TAU);
        const rr = rand(0, 55);
        l.position.set(Math.cos(a) * rr, 270 + rand(-18, 30), Math.sin(a) * rr);
        l.scale.set(rand(45, 80), rand(28, 44), rand(45, 80));
        l.rotation.y = rand(0, TAU);
        g.add(l);
      }
      g.scale.setScalar(s);
      g.position.set(x, -6, z);
      this.scene.add(g);
    });
  }

  private buildBubbles() {
    const count = 220;
    const mat = new THREE.ShaderMaterial({
      vertexShader: BUBBLE_VERT,
      fragmentShader: BUBBLE_FRAG,
      uniforms: { uTime: { value: 0 }, uSun: { value: this.sunDir.clone() } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 12), mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const centers = [
      [-420, -900], [560, -1050], [-840, -640], [880, -720], [-130, -520], [220, -420], [-300, -300], [380, -560],
    ];
    for (let i = 0; i < count; i++) {
      const c = centers[i % centers.length];
      const a = rand(0, TAU);
      const r = rand(10, 170);
      const s = rand(1.2, 7.5);
      m.compose(new THREE.Vector3(c[0] + Math.cos(a) * r, rand(0, 30), c[1] + Math.sin(a) * r), q, new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m);
    }
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    this.scene.add(mesh);
    return mat;
  }

  private spawn(i: number, instant: boolean) {
    const slot = SLOTS[i];
    const b = new THREE.Vector3(Math.sin(slot.heading), 0, Math.cos(slot.heading));
    const from = slot.pos.clone().addScaledVector(b, instant ? 0 : -260);
    const ship = new Ship(i, slot.pos, slot.heading, from);
    if (instant) ship.enter = 1;
    ship.root.position.copy(from);
    this.ships[i] = ship;
    this.scene.add(ship.root);
  }

  alive() {
    return this.ships.filter((s): s is Ship => !!s && s.alive);
  }

  rayHit(origin: THREE.Vector3, dir: THREE.Vector3, out: Hit): Hit {
    let best = Infinity;
    let ship: Ship | null = null;
    for (const s of this.ships) {
      if (!s || !s.alive) continue;
      const d = s.intersect(origin, dir, this.ray, this.tmp);
      if (d !== null && d < best) {
        best = d;
        ship = s;
        out.point.copy(this.tmp);
      }
    }
    let tw = Infinity;
    if (dir.y < -1e-4) tw = -origin.y / dir.y;
    if (ship && best <= tw) {
      out.kind = 'ship';
      out.ship = ship;
      out.dist = best;
    } else if (tw < 3500) {
      out.kind = 'water';
      out.ship = null;
      out.dist = tw;
      out.point.copy(origin).addScaledVector(dir, tw);
      out.point.y = 0;
    } else {
      out.kind = 'sky';
      out.ship = null;
      out.dist = 2500;
      out.point.copy(origin).addScaledVector(dir, 2500);
    }
    return out;
  }

  /** ship whose centre is closest to the ray (angular) */
  pickShip(origin: THREE.Vector3, dir: THREE.Vector3): Ship | null {
    let best: Ship | null = null;
    let bestScore = Infinity;
    for (const s of this.alive()) {
      this.tmp2.copy(s.center).sub(origin);
      const d = this.tmp2.length();
      const ang = Math.acos(Math.min(1, this.tmp2.dot(dir) / d));
      if (this.tmp2.dot(dir) < 0) continue;
      const score = ang + d * 0.00004;
      if (score < bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  damage(ship: Ship, amount: number, point: THREE.Vector3, mode: 'blast' | 'cut' = 'blast', dir?: THREE.Vector3): boolean {
    if (!ship.alive) return false;
    ship.hp -= amount;
    ship.shake = Math.min(1.4, ship.shake + amount * 0.04);
    if (ship.hp <= 0) {
      this.destroy(ship, point, 1, mode, dir);
      return true;
    }
    return false;
  }

  destroy(ship: Ship, center: THREE.Vector3, power = 1, mode: 'blast' | 'cut' = 'blast', dir?: THREE.Vector3) {
    if (!ship.alive) return;
    ship.alive = false;
    ship.hp = 0;
    this.sunk++;
    ship.root.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(Math.sin(ship.heading), 0, Math.cos(ship.heading));
    const all: THREE.Object3D[] = [ship.parts.hullStern, ship.parts.hullBow, ...ship.parts.extras];
    const wp = new THREE.Vector3();
    for (const part of all) {
      part.getWorldPosition(wp);
      this.scene.attach(part);
      const out = wp.clone().sub(center);
      out.y = Math.abs(out.y) * 0.3 + 0.3;
      if (out.lengthSq() < 1e-3) out.set(rand(-1, 1), 0.5, rand(-1, 1));
      out.normalize();
      const vel = out.multiplyScalar(rand(14, 32) * power);
      vel.y += rand(10, 26) * power;
      if (part === ship.parts.hullBow) vel.addScaledVector(fwd, 20 * power);
      if (part === ship.parts.hullStern) vel.addScaledVector(fwd, -20 * power);
      if (mode === 'cut' && dir) {
        // sever along cut normal
        const side = part === ship.parts.hullBow || wp.clone().sub(center).dot(dir) > 0 ? 1 : -1;
        vel.addScaledVector(dir, side * 26);
      }
      this.chunks.push({
        obj: part,
        vel,
        ang: new THREE.Vector3(rand(-1.6, 1.6), rand(-1, 1), rand(-1.6, 1.6)).multiplyScalar(power),
        t: 0,
        splashT: -1,
        size: part === ship.parts.hullBow || part === ship.parts.hullStern ? 3 : 1.4,
      });
    }
    this.scene.remove(ship.root);
    this.timers[ship.slot] = 7 + rand(0, 4);
    const ep = center.clone();
    if (ep.y < 6) ep.y = 6;
    this.hooks?.explode(ep, 1.2 * power);
  }

  update(dt: number, t: number) {
    (this.water.material.uniforms.time as { value: number }).value += dt * 0.55;
    this.bubbleMat.uniforms.uTime.value = t;

    for (let i = 0; i < SLOTS.length; i++) {
      const s = this.ships[i];
      if (s && s.alive) {
        s.update(dt, t);
        if (s.hp < 55 && this.hooks) {
          s.burnAcc += dt * (1 + (55 - s.hp) * 0.06);
          while (s.burnAcc > 0.045) {
            s.burnAcc -= 0.045;
            this.tmp.set(rand(-4, 4), rand(3, 9), rand(-14, 14)).multiplyScalar(1.6).applyMatrix4(s.root.matrixWorld);
            this.hooks.burn(this.tmp, (55 - s.hp) / 55);
          }
        }
      } else if (!s || !s.alive) {
        this.timers[i] -= dt;
        if (this.timers[i] <= 0 && (this.ships[i] === null || !this.ships[i]!.alive)) this.spawn(i, false);
      }
    }

    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i];
      c.t += dt;
      const o = c.obj;
      if (c.splashT < 0) {
        c.vel.y -= 24 * dt;
        c.vel.multiplyScalar(Math.exp(-0.12 * dt));
        if (this.hooks && c.t < 3.2 && Math.random() < dt * 22) this.hooks.trail(o.position, c.size);
        if (o.position.y < 1.5 && c.vel.y < 0) {
          c.splashT = 0;
          this.hooks?.splash(o.position, c.size * 6);
          c.vel.multiplyScalar(0.25);
          c.ang.multiplyScalar(0.35);
        }
      } else {
        c.splashT += dt;
        c.vel.y += (-1.4 - c.vel.y) * Math.min(1, dt * 2);
        c.vel.x *= Math.exp(-0.9 * dt);
        c.vel.z *= Math.exp(-0.9 * dt);
        if (this.hooks && c.splashT < 2 && Math.random() < dt * 8) this.hooks.burn(o.position, 0.6);
      }
      o.position.addScaledVector(c.vel, dt);
      o.rotation.x += c.ang.x * dt;
      o.rotation.y += c.ang.y * dt;
      o.rotation.z += c.ang.z * dt;
      if (c.splashT > 6.5 || o.position.y < -45) {
        this.scene.remove(o);
        o.traverse((m) => {
          const mesh = m as THREE.Mesh;
          if (mesh.isMesh && mesh.geometry) mesh.geometry.dispose();
        });
        this.chunks.splice(i, 1);
      }
    }
  }
}
