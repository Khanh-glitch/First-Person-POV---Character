import * as THREE from "three";
import type { Effects } from "./fx/Effects";
import type { ParticlePool } from "./fx/Particles";

const skyVert = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const skyFrag = /* glsl */ `
varying vec3 vDir;
uniform vec3 uSun; uniform float uTime; uniform float uStorm; uniform vec3 uTint; uniform float uTintAmt; uniform float uGlow;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.0,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=0.5;}return v;}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zen = vec3(0.05,0.03,0.14);
  vec3 mid = vec3(0.42,0.14,0.38);
  vec3 hor = vec3(1.0,0.48,0.26);
  vec3 col = mix(hor, mid, smoothstep(0.0,0.22,h));
  col = mix(col, zen, smoothstep(0.18,0.75,h));
  col = mix(col, vec3(0.25,0.09,0.12), smoothstep(0.0,-0.2,h));
  float sd = max(0.0, dot(d, normalize(uSun)));
  col += vec3(1.0,0.5,0.25)*pow(sd,10.0)*0.4 + vec3(1.0,0.7,0.4)*pow(sd,300.0)*1.2 + vec3(1.0,0.85,0.6)*smoothstep(0.9993,0.9997,sd)*2.0;
  // clouds
  if(h>0.0){
    vec2 uv = d.xz/(h+0.12)*1.3;
    float c = fbm(uv*1.4 + vec2(uTime*0.01,uTime*0.004));
    float c2 = fbm(uv*3.0 - vec2(uTime*0.02,0.0));
    float cl = smoothstep(0.45,0.85,c*0.7+c2*0.4 + uStorm*0.35);
    vec3 ccol = mix(vec3(0.95,0.45,0.42), vec3(0.28,0.12,0.25), smoothstep(0.4,1.0,c2));
    ccol += vec3(1.0,0.6,0.3)*pow(sd,4.0)*0.8;
    ccol = mix(ccol, vec3(0.08,0.05,0.1), uStorm*0.8);
    col = mix(col, ccol, cl*smoothstep(0.0,0.12,h)*0.85);
    // stars
    float st = step(0.9975, hash(floor(d.xz/(h+0.05)*160.0)));
    col += st*smoothstep(0.35,0.8,h)*0.6*(1.0-uStorm);
  }
  col = mix(col, col*vec3(0.25,0.2,0.32), uStorm*0.7);
  col += uTint*uGlow*smoothstep(0.1,1.0,h);
  col = mix(col, col*uTint*1.4, uTintAmt);
  gl_FragColor = vec4(col,1.0);
}`;

const seaVert = /* glsl */ `
varying vec3 vWorld; uniform float uTime;
void main(){ vec3 p = position; vec4 w = modelMatrix*vec4(p,1.0);
  w.y += sin(w.x*0.05+uTime*0.8)*0.3 + cos(w.z*0.04+uTime*0.6)*0.3;
  vWorld = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const seaFrag = /* glsl */ `
varying vec3 vWorld; uniform vec3 uSun; uniform float uTime; uniform vec3 uFogColor; uniform float uStorm;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
  vec3 v = normalize(cameraPosition - vWorld);
  float n1 = noise(vWorld.xz*0.08 + uTime*0.3);
  float n2 = noise(vWorld.xz*0.21 - uTime*0.4);
  vec3 nrm = normalize(vec3((n1-0.5)*0.5, 1.0, (n2-0.5)*0.5));
  vec3 r = reflect(-v, nrm);
  float fres = pow(1.0 - max(0.0,dot(v,nrm)), 4.0);
  vec3 deep = vec3(0.06,0.05,0.16);
  vec3 sky = mix(vec3(1.0,0.5,0.3), vec3(0.4,0.15,0.35), clamp(r.y*3.0,0.0,1.0));
  vec3 col = mix(deep, sky, 0.25+fres*0.7);
  float sp = pow(max(0.0,dot(r, normalize(uSun))), 220.0);
  col += vec3(1.0,0.7,0.4)*sp*8.0*(1.0-uStorm);
  float dist = length(vWorld - cameraPosition);
  col = mix(col, uFogColor, smoothstep(250.0, 1400.0, dist)*0.85);
  gl_FragColor = vec4(col,1.0);
}`;

function facadeTextures() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const e = document.createElement("canvas");
  e.width = e.height = S;
  const g = c.getContext("2d")!;
  const ge = e.getContext("2d")!;
  g.fillStyle = "#f2e6d8";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${120 + Math.random() * 60},${90 + Math.random() * 50},70,${Math.random() * 0.06})`;
    g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  ge.fillStyle = "#000";
  ge.fillRect(0, 0, S, S);
  const cell = S / 4;
  for (let y = 0; y < 4; y++) {
    // floor band
    g.fillStyle = "rgba(90,60,40,0.18)";
    g.fillRect(0, y * cell + cell - 6, S, 6);
    for (let x = 0; x < 4; x++) {
      const wx = x * cell + cell * 0.3,
        wy = y * cell + cell * 0.22,
        ww = cell * 0.4,
        wh = cell * 0.52;
      g.fillStyle = "#5a3a2a";
      g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      const lit = Math.random() < 0.38;
      g.fillStyle = lit ? "#ffcf7a" : "#1d2340";
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(wx, wy, ww * 0.45, wh);
      g.fillStyle = "#3b2a22";
      g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
      // balcony
      g.fillStyle = "rgba(60,40,30,0.55)";
      g.fillRect(wx - 8, wy + wh, ww + 16, 6);
      if (lit) {
        ge.fillStyle = `rgb(${255},${170 + Math.random() * 60},${80})`;
        ge.fillRect(wx, wy, ww, wh);
      }
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const em = new THREE.CanvasTexture(e);
  em.wrapS = em.wrapT = THREE.RepeatWrapping;
  em.colorSpace = THREE.SRGBColorSpace;
  return { map, em };
}

function stoneTexture(base: string, tile = 64) {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += tile / 2) {
    const off = (y / (tile / 2)) % 2 ? tile / 2 : 0;
    for (let x = -tile; x < S; x += tile) {
      const l = 0.85 + Math.random() * 0.3;
      g.fillStyle = `rgba(${Math.floor(255 * l)},${Math.floor(240 * l)},${Math.floor(225 * l)},0.12)`;
      g.fillRect(x + off + 2, y + 2, tile - 4, tile / 2 - 4);
      g.strokeStyle = "rgba(40,25,20,0.35)";
      g.lineWidth = 2;
      g.strokeRect(x + off + 1, y + 1, tile - 2, tile / 2 - 2);
    }
  }
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
    g.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function arenaTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d9b48a";
  g.fillRect(0, 0, 1024, 256);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 24; i++) {
      const x = i * (1024 / 24) + 8,
        y = row * 80 + 18,
        w = 1024 / 24 - 16,
        h = 56;
      g.fillStyle = "#3a1d18";
      g.beginPath();
      g.moveTo(x, y + h);
      g.lineTo(x, y + w / 2);
      g.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
      g.lineTo(x + w, y + h);
      g.fill();
    }
    g.fillStyle = "#b88a62";
    g.fillRect(0, row * 80 + 76, 1024, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  cur: number;
  target: number;
  roof: boolean;
  roofH: number;
  color: THREE.Color;
  roofColor: THREE.Color;
  state: "ok" | "cut" | "down";
  speed: number;
  delay: number;
}

interface Chunk {
  mesh: THREE.Mesh;
  roof: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  active: boolean;
  t: number;
  h: number;
  w: number;
}

export interface Puppet {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  home: THREE.Vector3;
  homeYaw: number;
  vel: THREE.Vector3;
  spin: number;
  mode: "idle" | "hit" | "puppet" | "fly" | "down";
  t: number;
  hitT: number;
  lift: number;
  seed: number;
  control: number; // 0..1 parasite influence
  glowMat: THREE.MeshStandardMaterial[];
}

export class World {
  scene: THREE.Scene;
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  seaMat: THREE.ShaderMaterial;
  buildings: Building[] = [];
  bMesh!: THREE.InstancedMesh;
  rMesh!: THREE.InstancedMesh;
  chunks: Chunk[] = [];
  solids: THREE.Object3D[] = [];
  puppets: Puppet[] = [];
  colosseum = new THREE.Group();
  colDamage = 0;
  colTarget = 0;
  sunDir = new THREE.Vector3(-0.25, 0.12, -1).normalize();
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fog: THREE.Fog;
  fx!: Effects;
  smoke!: ParticlePool;
  glow!: ParticlePool;
  time = 0;
  dirty = false;
  private m4 = new THREE.Matrix4();
  private v = new THREE.Vector3();
  facade: { map: THREE.Texture; em: THREE.Texture };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.fog = new THREE.Fog(0x8a4060, 180, 1200);
    scene.fog = this.fog;

    // sky
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      uniforms: {
        uSun: { value: this.sunDir },
        uTime: { value: 0 },
        uStorm: { value: 0 },
        uTint: { value: new THREE.Color(1, 0.5, 0.9) },
        uTintAmt: { value: 0 },
        uGlow: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // lights
    this.hemi = new THREE.HemisphereLight(0x7a5ae0, 0x4a2418, 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffa070, 3.2);
    this.sun.position.copy(this.sunDir).multiplyScalar(80).add(new THREE.Vector3(0, 10, -10));
    this.sun.target.position.set(0, 10, -10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.bias = -0.0005;
    scene.add(this.sun, this.sun.target);
    const fill = new THREE.DirectionalLight(0xff7ab8, 0.9);
    fill.position.set(10, 20, 30);
    scene.add(fill);

    // sea
    this.seaMat = new THREE.ShaderMaterial({
      vertexShader: seaVert,
      fragmentShader: seaFrag,
      uniforms: {
        uSun: { value: this.sunDir },
        uTime: { value: 0 },
        uFogColor: { value: new THREE.Color(0xb85a5e) },
        uStorm: { value: 0 },
      },
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 80, 80), this.seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -1.2;
    scene.add(sea);

    // island ground
    const sand = stoneTexture("#b98d6c", 48);
    sand.repeat.set(70, 70);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(300, 96),
      new THREE.MeshStandardMaterial({ map: sand, roughness: 0.95, color: 0xd9a888 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -130);
    ground.receiveShadow = true;
    scene.add(ground);
    this.solids.push(ground);
    // beach rim
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(298, 318, 96),
      new THREE.MeshStandardMaterial({ color: 0xe8c39a, roughness: 1 })
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(0, -0.3, -130);
    scene.add(rim);

    // terrace / palace plateau
    const stone = stoneTexture("#c9b7a4", 64);
    stone.repeat.set(10, 10);
    const terrMat = new THREE.MeshStandardMaterial({ map: stone, roughness: 0.8, color: 0xf0e0d0 });
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(120, 10, 56), terrMat);
    terrace.position.set(0, 5, 3);
    terrace.receiveShadow = true;
    scene.add(terrace);
    this.solids.push(terrace);
    // balustrade on the front edge
    const balMat = new THREE.MeshStandardMaterial({ color: 0xf3e6d6, roughness: 0.7 });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(120, 0.35, 0.8), balMat);
    rail.position.set(0, 11.2, -24.6);
    rail.castShadow = true;
    scene.add(rail);
    const postGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.0, 8);
    const posts = new THREE.InstancedMesh(postGeo, balMat, 160);
    for (let i = 0; i < 160; i++) {
      this.m4.makeTranslation(-59.5 + i * 0.75, 10.5, -24.6);
      posts.setMatrixAt(i, this.m4);
    }
    posts.castShadow = true;
    scene.add(posts);
    // palace pillars & flags behind / sides
    const pillarGeo = new THREE.CylinderGeometry(0.8, 0.9, 14, 16);
    for (const x of [-22, -14, 14, 22]) {
      const p = new THREE.Mesh(pillarGeo, balMat);
      p.position.set(x, 17, -2);
      p.castShadow = true;
      scene.add(p);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.4), balMat);
      cap.position.set(x, 24.3, -2);
      scene.add(cap);
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 7, 1, 8),
        new THREE.MeshStandardMaterial({ color: 0xe0389a, side: THREE.DoubleSide, roughness: 0.6 })
      );
      flag.position.set(x, 19, -0.9);
      flag.userData.flag = true;
      scene.add(flag);
    }
    // planters
    const potGeo = new THREE.CylinderGeometry(1.1, 0.8, 1.2, 12);
    const bushGeo = new THREE.IcosahedronGeometry(1.3, 1);
    const potMat = new THREE.MeshStandardMaterial({ color: 0xb5603a, roughness: 0.9 });
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x3d6b2c, roughness: 1, flatShading: true });
    for (const [x, z] of [
      [-26, -21],
      [26, -21],
      [-26, -8],
      [26, -8],
    ]) {
      const pot = new THREE.Mesh(potGeo, potMat);
      pot.position.set(x, 10.6, z);
      pot.castShadow = true;
      const b = new THREE.Mesh(bushGeo, bushMat);
      b.position.set(x, 12, z);
      b.castShadow = true;
      scene.add(pot, b);
    }

    this.facade = facadeTextures();
    this.buildTown();
    this.buildColosseum();
    this.buildMountains();
    this.buildPuppets();
    this.buildChunks();
  }

  groundAt = (x: number, z: number) => (Math.abs(x) < 60 && z > -25 && z < 31 ? 10 : 0);

  private buildTown() {
    const palette = ["#f7d9c4", "#f4b6a6", "#ffe3a3", "#c9e4de", "#f6c1d8", "#fbe7d0", "#e8b4a0", "#ffd6a5", "#d7e3fc", "#fdffb6"];
    const roofPal = ["#c4552f", "#b0472a", "#d36b3c", "#9c3d25", "#c86a3e"];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const colX = 55,
      colZ = -150;
    for (let gz = -36; gz > -330; gz -= 14) {
      for (let gx = -230; gx < 230; gx += 13) {
        if (Math.abs(gx) < 7) continue; // main avenue
        if ((gz + 36) % 70 === 0) continue;
        const x = gx + rnd(-2, 2),
          z = gz + rnd(-2, 2);
        if (Math.hypot(x - colX, z - colZ) < 48) continue;
        if (Math.hypot(x, z + 130) > 285) continue;
        if (Math.hypot(x + 70, z + 110) < 18) continue; // plaza
        const n = Math.random() < 0.35 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const w = rnd(5, 10),
            d = rnd(5, 10);
          const center = 1 - Math.min(1, Math.hypot(x, z + 160) / 260);
          const h = rnd(6, 12) + center * rnd(4, 16) + (Math.random() < 0.05 ? 14 : 0);
          const roof = Math.random() < 0.65;
          this.buildings.push({
            x: x + (n > 1 ? (k ? 3 : -3) : 0),
            z: z + (n > 1 ? rnd(-2, 2) : 0),
            w: n > 1 ? w * 0.6 : w,
            d,
            h,
            cur: h,
            target: h,
            roof,
            roofH: rnd(2, 4),
            color: new THREE.Color(palette[Math.floor(Math.random() * palette.length)]),
            roofColor: new THREE.Color(roofPal[Math.floor(Math.random() * roofPal.length)]),
            state: "ok",
            speed: 0,
            delay: 0,
          });
        }
      }
    }
    // tower landmarks
    for (const [x, z, h] of [
      [-90, -200, 42],
      [120, -90, 36],
      [-40, -280, 38],
    ]) {
      this.buildings.push({
        x,
        z,
        w: 7,
        d: 7,
        h,
        cur: h,
        target: h,
        roof: true,
        roofH: 9,
        color: new THREE.Color("#fbe7d0"),
        roofColor: new THREE.Color("#2f5aa8"),
        state: "ok",
        speed: 0,
        delay: 0,
      });
    }

    const mat = new THREE.MeshStandardMaterial({
      map: this.facade.map,
      emissiveMap: this.facade.em,
      emissive: new THREE.Color(1, 0.75, 0.4),
      emissiveIntensity: 1.6,
      roughness: 0.85,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vec3 sc_ = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vec2 us_ = abs(normal.x) > 0.5 ? vec2(sc_.z, sc_.y) : (abs(normal.z) > 0.5 ? vec2(sc_.x, sc_.y) : vec2(sc_.x, sc_.z)*0.0);
        vec2 off_ = vec2(floor(fract(instanceMatrix[3].x*0.137+instanceMatrix[3].z*0.071)*4.0)/4.0, floor(fract(instanceMatrix[3].z*0.213)*4.0)/4.0);
        vMapUv = uv * us_ / 12.0 + off_;
        vEmissiveMapUv = vMapUv;`
      );
    };
    const n = this.buildings.length;
    this.bMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), mat, n);
    const roofGeo = new THREE.ConeGeometry(0.72, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    this.rMesh = new THREE.InstancedMesh(
      roofGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.75, flatShading: true }),
      n
    );
    this.bMesh.receiveShadow = true;
    for (let i = 0; i < n; i++) {
      this.bMesh.setColorAt(i, this.buildings[i].color);
      this.rMesh.setColorAt(i, this.buildings[i].roofColor);
      this.writeBuilding(i);
    }
    this.scene.add(this.bMesh, this.rMesh);
    this.solids.push(this.bMesh);
  }

  private writeBuilding(i: number) {
    const b = this.buildings[i];
    const h = Math.max(0.001, b.cur);
    this.m4.makeScale(b.w, h, b.d).setPosition(b.x, 0, b.z);
    this.bMesh.setMatrixAt(i, this.m4);
    if (b.roof && b.state === "ok" && b.cur > 0.5) {
      const rs = Math.min(1, b.cur / b.h);
      this.m4.makeScale(b.w * 1.05, b.roofH * rs, b.d * 1.05).setPosition(b.x, h, b.z);
    } else this.m4.makeScale(0, 0, 0);
    this.rMesh.setMatrixAt(i, this.m4);
  }

  private buildColosseum() {
    const tex = arenaTexture();
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(34, 36, 22, 64, 1, true),
      new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.9 })
    );
    wall.position.y = 11;
    const inner = new THREE.Mesh(
      new THREE.CylinderGeometry(26, 30, 14, 64, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x9c6b4e, side: THREE.DoubleSide, roughness: 1 })
    );
    inner.position.y = 7;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(26, 48), new THREE.MeshStandardMaterial({ color: 0xd8b07a }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.3;
    const top = new THREE.Mesh(new THREE.TorusGeometry(35, 1.1, 8, 64), new THREE.MeshStandardMaterial({ color: 0xe9cfa8 }));
    top.rotation.x = Math.PI / 2;
    top.position.y = 22;
    this.colosseum.add(wall, inner, floor, top);
    this.solids.push(wall);
    this.colosseum.position.set(55, 0, -150);
    this.scene.add(this.colosseum);
  }

  private buildMountains() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a2a55, roughness: 1, flatShading: true });
    const geo = new THREE.ConeGeometry(1, 1, 7, 3);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(geo, mat);
      const a = -Math.PI / 2 + (i / 13 - 0.5) * 2.6;
      const r = 900 + Math.random() * 500;
      const s = 80 + Math.random() * 160;
      m.scale.set(s * 1.8, s * (0.6 + Math.random() * 0.8), s * 1.4);
      m.position.set(Math.cos(a) * r, -5, Math.sin(a) * r - 150);
      m.rotation.y = Math.random() * 6;
      this.scene.add(m);
    }
  }

  private buildPuppets() {
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.7 });
    const navy = new THREE.MeshStandardMaterial({ color: 0x1d3a7a, roughness: 0.7 });
    const skinM = new THREE.MeshStandardMaterial({ color: 0xe0a882, roughness: 0.6 });
    const black = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
    const cap = (r: number, l: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10).translate(0, -l / 2 - r, 0), m);
      mesh.castShadow = true;
      return mesh;
    };
    const positions: [number, number][] = [
      [-7, -12],
      [-3.5, -16],
      [0.5, -11],
      [4, -17],
      [7.5, -13],
      [-0.5, -20],
    ];
    positions.forEach(([x, z], idx) => {
      const glowMat = [white.clone(), navy.clone()];
      const [w, n] = glowMat;
      const root = new THREE.Group();
      const hips = new THREE.Group();
      hips.position.y = 0.95;
      root.add(hips);
      const torso = new THREE.Group();
      hips.add(torso);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.5, 4, 10), w);
      body.position.y = 0.42;
      body.castShadow = true;
      torso.add(body);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.14, 12), n);
      collar.position.y = 0.78;
      torso.add(collar);
      const head = new THREE.Group();
      head.position.y = 0.92;
      torso.add(head);
      const hm = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), skinM);
      hm.position.y = 0.12;
      hm.castShadow = true;
      head.add(hm);
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.13, 14), w);
      hat.position.y = 0.27;
      head.add(hat);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 14), black);
      brim.position.set(0, 0.2, -0.04);
      head.add(brim);
      const mkArm = (side: number) => {
        const a = new THREE.Group();
        a.position.set(0.34 * side, 0.72, 0);
        a.add(cap(0.075, 0.26, w));
        const f = new THREE.Group();
        f.position.y = -0.42;
        f.add(cap(0.065, 0.24, skinM));
        a.add(f);
        torso.add(a);
        return [a, f];
      };
      const mkLeg = (side: number) => {
        const l = new THREE.Group();
        l.position.set(0.13 * side, 0, 0);
        l.add(cap(0.1, 0.32, n));
        const s = new THREE.Group();
        s.position.y = -0.48;
        s.add(cap(0.085, 0.3, n));
        const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.26), black);
        boot.position.set(0, -0.48, -0.05);
        s.add(boot);
        l.add(s);
        hips.add(l);
        return [l, s];
      };
      const [armL, foreL] = mkArm(-1);
      const [armR, foreR] = mkArm(1);
      const [legL, shinL] = mkLeg(-1);
      const [legR, shinR] = mkLeg(1);
      // sword
      const sword = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.9, 0.08), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.2 }));
      sword.position.set(0, -0.75, -0.3);
      sword.rotation.x = -1.2;
      foreR.add(sword);
      root.scale.setScalar(1.25);
      const home = new THREE.Vector3(x, 10, z);
      root.position.copy(home);
      const homeYaw = Math.atan2(x, z);
      root.rotation.y = homeYaw;
      this.scene.add(root);
      this.puppets.push({
        root,
        hips,
        torso,
        head,
        armL,
        armR,
        foreL,
        foreR,
        legL,
        legR,
        shinL,
        shinR,
        home,
        homeYaw,
        vel: new THREE.Vector3(),
        spin: 0,
        mode: "idle",
        t: 0,
        hitT: 0,
        lift: 0,
        seed: idx * 1.7,
        control: 0,
        glowMat,
      });
    });
  }

  private buildChunks() {
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const roofGeo = new THREE.ConeGeometry(0.72, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
    for (let i = 0; i < 60; i++) {
      const mat = new THREE.MeshStandardMaterial({
        map: this.facade.map,
        emissiveMap: this.facade.em,
        emissive: new THREE.Color(1, 0.75, 0.4),
        emissiveIntensity: 1.2,
        roughness: 0.85,
      });
      const mesh = new THREE.Mesh(box, mat);
      const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.75 }));
      mesh.add(roof);
      mesh.visible = false;
      this.scene.add(mesh);
      this.chunks.push({ mesh, roof, mat, vel: new THREE.Vector3(), spin: new THREE.Vector3(), active: false, t: 0, h: 1, w: 1 });
    }
  }

  /** cut building i horizontally at height y, top slides off */
  slice(i: number, y: number, push: THREE.Vector3, heatColor = 0xff6a20) {
    const b = this.buildings[i];
    if (b.state !== "ok" || b.cur < y + 0.8 || y < 0.5) return false;
    const topH = b.cur - y;
    b.state = "cut";
    b.cur = y;
    b.target = y;
    this.writeBuilding(i);
    this.dirty = true;
    const c = this.chunks.find((x) => !x.active);
    if (c) {
      c.active = true;
      c.t = 0;
      c.h = topH;
      c.w = Math.max(b.w, b.d);
      c.mesh.visible = true;
      c.mesh.position.set(b.x, y, b.z);
      c.mesh.rotation.set(0, 0, 0);
      c.mesh.scale.set(b.w, topH, b.d);
      c.mat.color.copy(b.color);
      c.roof.visible = b.roof;
      c.roof.position.y = 1;
      c.roof.scale.set(1.05, b.roofH / topH, 1.05);
      (c.roof.material as THREE.MeshStandardMaterial).color.copy(b.roofColor);
      c.vel.copy(push).multiplyScalar(4 + Math.random() * 4);
      c.vel.y = 2 + Math.random() * 3;
      c.spin.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 1.5).add(
        new THREE.Vector3(push.z, 0, -push.x).multiplyScalar(1.2)
      );
    }
    const p = new THREE.Vector3(b.x, y, b.z);
    this.glow.emit({ pos: p, count: 40, speed: 14, color: heatColor, color2: 0xffe0a0, size: 1.4, life: 0.9, gravity: 10, drag: 0.96, posJitter: b.w });
    this.fx.fireball(p, b.w * 0.9, 0.5, heatColor);
    return true;
  }

  collapse(i: number, delay = 0, speed = 1) {
    const b = this.buildings[i];
    if (b.state === "down") return false;
    b.state = "down";
    b.target = 0;
    b.speed = speed;
    b.delay = delay;
    this.dirty = true;
    return true;
  }

  restore() {
    this.buildings.forEach((b, i) => {
      if (b.state === "ok" && b.cur === b.h) return;
      b.state = "ok";
      b.target = b.h;
      b.speed = 1;
      b.delay = Math.random() * 0.8 + Math.hypot(b.x, b.z) * 0.002;
      this.writeBuilding(i);
    });
    this.colTarget = 0;
    this.dirty = false;
    this.puppets.forEach((p) => {
      p.mode = "idle";
      p.root.position.copy(p.home);
      p.root.rotation.set(0, p.homeYaw, 0);
      p.vel.set(0, 0, 0);
      p.control = 0;
      p.lift = 0;
    });
  }

  buildingsNear(p: THREE.Vector3, r: number) {
    const out: number[] = [];
    this.buildings.forEach((b, i) => {
      if (Math.hypot(b.x - p.x, b.z - p.z) < r + Math.max(b.w, b.d) * 0.5) out.push(i);
    });
    return out;
  }

  hitPuppet(p: Puppet, dir: THREE.Vector3, force = 1) {
    if (p.mode === "fly") return;
    if (force > 1.5) {
      p.mode = "fly";
      p.vel.copy(dir).multiplyScalar(8 * force);
      p.vel.y = 5 + force * 2;
      p.spin = (Math.random() - 0.5) * 12;
    } else {
      p.mode = "hit";
      p.hitT = 0;
      p.vel.copy(dir).multiplyScalar(4 * force);
    }
  }

  update(dt: number) {
    this.time += dt;
    this.skyMat.uniforms.uTime.value = this.time;
    this.seaMat.uniforms.uTime.value = this.time;
    this.seaMat.uniforms.uStorm.value = this.skyMat.uniforms.uStorm.value;

    // buildings animate
    let changed = false;
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.cur === b.target) continue;
      if (b.delay > 0) {
        b.delay -= dt;
        continue;
      }
      changed = true;
      if (b.target < b.cur) {
        const prev = b.cur;
        b.cur = Math.max(b.target, b.cur - dt * 14 * b.speed * (1 + (b.h - b.cur) * 0.15));
        if (Math.floor(prev / 3) !== Math.floor(b.cur / 3)) {
          this.v.set(b.x, b.cur, b.z);
          this.smoke.emit({ pos: this.v, count: 6, speed: 4, color: 0x8a6a60, color2: 0xc8a090, size: 9, life: 2.4, drag: 0.95, posJitter: b.w, grow: 1.5, dir: new THREE.Vector3(0, 1, 0), spread: 1 });
          this.fx.spawnDebris(this.v, 3, b.color, 8, 0.8);
        }
      } else {
        b.cur = Math.min(b.target, b.cur + dt * 22 * (0.4 + b.cur / b.h));
        if (Math.random() < 0.15) {
          this.v.set(b.x + (Math.random() - 0.5) * b.w, b.cur, b.z + (Math.random() - 0.5) * b.d);
          this.glow.emit({ pos: this.v, count: 2, speed: 2, color: 0xffffff, color2: 0xff7ad0, size: 0.8, life: 0.5 });
        }
      }
      this.writeBuilding(i);
    }
    if (changed || this.dirty) {
      this.bMesh.instanceMatrix.needsUpdate = true;
      this.rMesh.instanceMatrix.needsUpdate = true;
    }

    // chunks
    for (const c of this.chunks) {
      if (!c.active) continue;
      c.t += dt;
      c.vel.y -= 22 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      const g = this.groundAt(c.mesh.position.x, c.mesh.position.z);
      if (c.mesh.position.y < g + 0.5 || c.t > 6) {
        c.active = false;
        c.mesh.visible = false;
        const p = c.mesh.position.clone();
        p.y = g + 1;
        this.smoke.emit({ pos: p, count: 26, speed: 9, color: 0x7a5a50, color2: 0xd0a890, size: 14, life: 2.8, drag: 0.94, posJitter: c.w, grow: 1.8 });
        this.fx.spawnDebris(p, 14, c.mat.color, 14, 1.1);
        this.glow.emit({ pos: p, count: 20, speed: 10, color: 0xffa040, size: 1, life: 0.6, gravity: 8 });
      }
    }

    // colosseum damage
    this.colDamage += (this.colTarget - this.colDamage) * Math.min(1, dt * 3);
    this.colosseum.scale.y = 1 - this.colDamage * 0.55;
    this.colosseum.rotation.z = this.colDamage * 0.04;

    // puppets
    for (const p of this.puppets) this.updatePuppet(p, dt);

    this.scene.traverse((o) => {
      if (o.userData.flag) {
        o.rotation.y = Math.sin(this.time * 2 + o.position.x) * 0.25;
      }
    });
  }

  private updatePuppet(p: Puppet, dt: number) {
    p.t += dt;
    const t = p.t + p.seed;
    const r = p.root;
    const glow = p.control;
    for (const m of p.glowMat) {
      m.emissive.setRGB(0.9 * glow, 0.2 * glow, 0.8 * glow);
    }
    if (p.mode === "idle") {
      r.position.lerp(p.home, Math.min(1, dt * 3));
      r.rotation.x *= 0.9;
      r.rotation.z *= 0.9;
      p.torso.rotation.set(Math.sin(t * 1.3) * 0.03, Math.sin(t * 0.7) * 0.1, 0);
      p.armL.rotation.set(Math.sin(t * 1.1) * 0.08, 0, 0.15);
      p.armR.rotation.set(-0.5 + Math.sin(t) * 0.05, 0, -0.15);
      p.foreR.rotation.x = -0.9;
      p.foreL.rotation.x = -0.2;
      p.legL.rotation.x = 0;
      p.legR.rotation.x = 0;
      p.shinL.rotation.x = 0;
      p.shinR.rotation.x = 0;
      p.hips.position.y = 0.95 + Math.sin(t * 2) * 0.01;
    } else if (p.mode === "hit") {
      p.hitT += dt;
      r.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(0.9);
      const k = Math.max(0, 1 - p.hitT / 0.6);
      p.torso.rotation.x = -0.6 * k;
      p.armL.rotation.z = 0.15 + k * 1.2;
      p.armR.rotation.z = -0.15 - k * 1.2;
      if (p.hitT > 0.9) p.mode = "idle";
    } else if (p.mode === "puppet") {
      // jerky marionette motion driven externally via p.lift & control
      const j = (f: number, o: number) => Math.sin(t * f + o) * Math.sin(t * f * 0.37 + o * 2) * 1.6;
      const tgt = p.home.clone();
      tgt.y += p.lift;
      r.position.lerp(tgt, Math.min(1, dt * 8));
      p.hips.position.y = 0.95;
      p.torso.rotation.set(j(5, 1) * 0.3, j(3, 2) * 0.4, j(4, 3) * 0.2);
      p.armL.rotation.set(j(7, 0) - 0.8, 0, 0.4 + Math.abs(j(6, 1)) * 0.6);
      p.armR.rotation.set(j(6, 2) - 1.4, 0, -0.4 - Math.abs(j(5, 3)) * 0.6);
      p.foreL.rotation.x = -Math.abs(j(8, 4));
      p.foreR.rotation.x = -Math.abs(j(9, 5));
      p.legL.rotation.x = j(5, 6) * 0.6;
      p.legR.rotation.x = j(5, 7) * 0.6;
      p.shinL.rotation.x = Math.abs(j(6, 8)) * 0.8;
      p.shinR.rotation.x = Math.abs(j(6, 9)) * 0.8;
      p.head.rotation.set(0.5 + j(3, 1) * 0.2, j(2, 2) * 0.5, 0);
    } else if (p.mode === "fly") {
      p.vel.y -= 20 * dt;
      r.position.addScaledVector(p.vel, dt);
      r.rotation.x += p.spin * dt;
      r.rotation.z += p.spin * 0.5 * dt;
      p.armL.rotation.z = 1.8;
      p.armR.rotation.z = -1.8;
      p.legL.rotation.x = 0.6;
      p.legR.rotation.x = -0.4;
      const g = this.groundAt(r.position.x, r.position.z);
      if (r.position.y < g && p.vel.y < 0) {
        r.position.y = g;
        p.mode = "down";
        p.t = 0;
        this.smoke.emit({ pos: r.position.clone().setY(g + 0.5), count: 8, speed: 3, color: 0x9a8070, size: 4, life: 1.4, grow: 1 });
      }
    } else if (p.mode === "down") {
      r.rotation.x += (-Math.PI / 2 - r.rotation.x) * Math.min(1, dt * 8);
      r.rotation.z *= 0.9;
      const g = this.groundAt(r.position.x, r.position.z);
      r.position.y += (g + 0.25 - r.position.y) * Math.min(1, dt * 8);
      if (p.t > 4) {
        p.mode = "idle";
        r.position.copy(p.home);
        r.rotation.set(0, p.homeYaw, 0);
      }
    }
  }
}
