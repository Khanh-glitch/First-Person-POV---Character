import * as THREE from "three";
import { clamp01, easeInOut, rand, randS, taperedTube } from "./util";

export const FOG = new THREE.Color().setRGB(0.07, 0.014, 0.036);
export const MOON_DIR = new THREE.Vector3(0.24, 0.43, -1).normalize();

function groundTexture() {
  const S = 512;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#6a5c62";
  c.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = rand(90, S - 90), y = rand(90, S - 90), r = rand(30, 85);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    const d = Math.random() < 0.5;
    g.addColorStop(0, d ? "rgba(20,12,18,0.35)" : "rgba(150,120,125,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 9000; i++) {
    const v = (Math.random() * 120) | 0;
    c.fillStyle = `rgba(${v + 30},${v + 18},${v + 24},${rand(0.08, 0.3)})`;
    c.fillRect(rand(S), rand(S), rand(1, 3.5), rand(1, 3.5));
  }
  c.strokeStyle = "rgba(10,6,10,0.85)";
  for (let i = 0; i < 34; i++) {
    let x = rand(S), y = rand(S), a = rand(6.28);
    c.lineWidth = rand(0.8, 2.6);
    c.beginPath();
    c.moveTo(x, y);
    const n = 6 + ((Math.random() * 14) | 0);
    for (let k = 0; k < n; k++) {
      a += randS(0.7);
      x += Math.cos(a) * rand(6, 22); y += Math.sin(a) * rand(6, 22);
      c.lineTo(x, y);
    }
    c.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(64, 64);
  t.anisotropy = 8;
  return t;
}

function letterTexture(ch: string) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 256;
  const c = cv.getContext("2d")!;
  c.clearRect(0, 0, 256, 256);
  c.strokeStyle = "#fff";
  c.lineWidth = 12;
  c.beginPath();
  c.arc(128, 128, 108, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 3;
  c.beginPath();
  c.arc(128, 128, 90, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = "#fff";
  c.font = "900 150px Arial Black, Arial, sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(ch, 128, 138);
  return new THREE.CanvasTexture(cv);
}

export class Colossus {
  group = new THREE.Group();
  body = new THREE.Group();
  head = new THREE.Group();
  maxHp = 60000;
  hp = 60000;
  core = new THREE.Vector3(0, 19.5, -51.5);
  flash = 0;
  squash = 0;
  aura = 0;
  markOn = 0;
  dead = false;
  deadT = 0;
  private offZ = 0; private velZ = 0; private tilt = 0; private tiltV = 0;
  private mat: THREE.MeshStandardMaterial;
  private hot: THREE.MeshBasicMaterial;
  private auraMesh: THREE.Mesh;
  private auraU = { uColor: { value: new THREE.Color(1.8, 0.4, 3.2) }, uAlpha: { value: 0 }, uTime: { value: 0 } };
  private mark: THREE.Sprite;
  static Z = -60;

  constructor(scene: THREE.Scene) {
    const mat = (this.mat = new THREE.MeshStandardMaterial({
      color: 0x40343f, roughness: 0.88, metalness: 0.12, flatShading: true,
      emissive: new THREE.Color(1, 0.22, 0.08), emissiveIntensity: 0,
    }));
    const hot = (this.hot = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 0.7, 0.2), toneMapped: false, fog: false }));
    const B = this.body;
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, m: THREE.Material = mat, parent: THREE.Object3D = B) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    add(new THREE.CylinderGeometry(7.6, 10.5, 10, 8), 0, 5, 0);
    add(new THREE.CylinderGeometry(11.5, 7.6, 12, 8), 0, 16, 0).scale.z = 0.78;
    add(new THREE.IcosahedronGeometry(9, 1), 0, 20.5, 0.8).scale.set(1.38, 0.78, 0.82);
    for (const s of [-1, 1]) {
      add(new THREE.IcosahedronGeometry(5.4, 0), s * 13.8, 22.8, 0).rotation.set(0.3, s, 0.2);
      add(new THREE.CylinderGeometry(3.3, 3.9, 11, 7), s * 16.4, 16.4, 1).rotation.set(-0.12, 0, s * 0.26);
      add(new THREE.CylinderGeometry(4.0, 5.0, 11, 7), s * 17.8, 7.0, 4.2).rotation.set(-0.42, 0, s * 0.06);
      add(new THREE.IcosahedronGeometry(5.4, 0), s * 18, 2.4, 7.4).rotation.set(s, 0.4, 0);
      add(new THREE.ConeGeometry(2.0, 8, 5), s * 15.5, 28.5, -1.5).rotation.set(-0.3, 0, -s * 0.5);
      add(new THREE.ConeGeometry(1.4, 5.5, 5), s * 11, 27.5, -3).rotation.set(-0.5, 0, -s * 0.3);
    }
    for (let i = 0; i < 4; i++) add(new THREE.ConeGeometry(1.8 - i * 0.25, 7 - i, 5), 0, 25 - i * 4.4, -7.2 + i * 0.4).rotation.x = -1.1;
    // head
    this.head.position.set(0, 29.2, 2.4);
    B.add(this.head);
    const H = this.head;
    add(new THREE.IcosahedronGeometry(4.8, 1), 0, 0, 0, mat, H).scale.set(1, 1.08, 1);
    add(new THREE.BoxGeometry(6.4, 2.8, 5.2), 0, -3.4, 1.4, mat, H).rotation.x = 0.12;
    add(new THREE.BoxGeometry(8.2, 1.3, 2.2), 0, 1.5, 3.9, mat, H).rotation.x = 0.35; // brow
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(s * 3.2, 2.2, 0), new THREE.Vector3(s * 8.6, 3.6, -0.4),
        new THREE.Vector3(s * 11.4, 8.6, 1.0), new THREE.Vector3(s * 9.6, 14, 3.6),
      ]);
      H.add(new THREE.Mesh(taperedTube(curve, 18, 1.55, 0.08, 7), mat));
      add(new THREE.SphereGeometry(0.72, 10, 8), s * 1.95, 0.35, 4.45, hot, H);
      add(new THREE.ConeGeometry(0.5, 2.2, 4), s * 1.6, -4.2, 3.9, mat, H); // tusks
    }
    add(new THREE.IcosahedronGeometry(2.7, 1), 0, 19.5, 6.4, hot);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(new THREE.BoxGeometry(0.5, 4.5 + (i % 2) * 2, 0.5), Math.cos(a) * 4.2, 19.5 + Math.sin(a) * 4.2, 7.0, hot).rotation.z = a + Math.PI / 2;
    }
    this.group.add(B);
    // rubble skirt
    const rub = new THREE.DodecahedronGeometry(1, 0);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const m = new THREE.Mesh(rub, mat);
      const r = rand(10, 15);
      m.position.set(Math.cos(a) * r * 1.5, rand(0, 1.2), Math.sin(a) * r);
      m.scale.set(rand(1.5, 4), rand(1.2, 3.4), rand(1.5, 4));
      m.rotation.set(rand(3), rand(3), rand(3));
      this.group.add(m);
    }
    // magnetic aura
    this.auraMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 40, 24),
      new THREE.ShaderMaterial({
        uniforms: this.auraU,
        vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){ vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform vec3 uColor; uniform float uAlpha, uTime;
          void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
            float bands = 0.6 + 0.4 * sin(vP.y * 22.0 - uTime * 9.0);
            gl_FragColor = vec4(uColor * (f * bands + 0.02), uAlpha); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      })
    );
    this.auraMesh.position.set(0, 17, 0);
    this.auraMesh.visible = false;
    this.auraMesh.renderOrder = 10;
    this.group.add(this.auraMesh);
    this.mark = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: letterTexture("S"), color: new THREE.Color(3, 0.7, 4.5), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, fog: false })
    );
    this.mark.position.set(0, 19.5, 10);
    this.mark.visible = false;
    this.mark.renderOrder = 20;
    this.group.add(this.mark);
    this.group.position.set(0, 0, Colossus.Z);
    scene.add(this.group);
  }

  kick(power: number) {
    this.velZ -= power * 26;
    this.tiltV -= power * 1.4;
  }

  /** returns true when this blow kills */
  damage(n: number) {
    if (this.dead) return false;
    this.hp = Math.max(0, this.hp - n);
    this.flash = Math.max(this.flash, Math.min(1, 0.25 + n / 4000));
    if (this.hp <= 0) {
      this.dead = true;
      this.deadT = 0;
      return true;
    }
    return false;
  }

  update(dt: number, time: number) {
    this.velZ += (-this.offZ * 38 - this.velZ * 5.5) * dt;
    this.offZ += this.velZ * dt;
    this.tiltV += (-this.tilt * 30 - this.tiltV * 4.5) * dt;
    this.tilt += this.tiltV * dt;
    this.flash = Math.max(0, this.flash - dt * 2.8);
    this.mat.emissiveIntensity = this.flash * this.flash * 1.0;
    const B = this.body;
    B.position.z = this.offZ;
    B.rotation.x = this.tilt + Math.sin(time * 0.7) * 0.012;
    B.scale.set(1 - this.squash * 0.24, 1 + Math.sin(time * 0.9) * 0.008 + this.squash * 0.05, 1 + this.squash * 0.08);
    this.head.rotation.set(Math.sin(time * 0.5) * 0.05 + this.tilt * 1.5, Math.sin(time * 0.31) * 0.12, 0);
    const pulse = 0.75 + 0.25 * Math.sin(time * 2.4) + this.flash * 2;
    this.hot.color.setRGB(3.0 * pulse, 0.7 * pulse, 0.2 * pulse);
    // aura / polarity mark
    this.auraMesh.visible = this.aura > 0.01;
    if (this.auraMesh.visible) {
      const s = 1 + Math.sin(time * 14) * 0.02;
      this.auraMesh.scale.set(24 * s, 27 * s, 17 * s);
      this.auraU.uAlpha.value = this.aura;
      this.auraU.uTime.value = time;
    }
    this.mark.visible = this.markOn > 0.01;
    if (this.mark.visible) {
      const s = 9 + (1 - this.markOn) * 14 + Math.sin(time * 20) * 0.25;
      this.mark.scale.set(s, s, 1);
      (this.mark.material as THREE.SpriteMaterial).opacity = this.markOn;
      (this.mark.material as THREE.SpriteMaterial).rotation = Math.sin(time * 3) * 0.06;
    }
    // death / rebirth
    if (this.dead) {
      this.deadT += dt;
      const t = this.deadT;
      const sink = easeInOut(clamp01(t / 2.6));
      const rise = easeInOut(clamp01((t - 4.4) / 2.0));
      this.group.position.y = -50 * (sink - rise);
      this.group.rotation.x = -0.35 * (sink - rise);
      this.group.position.x = t < 2.6 ? randS(0.5) * (1 - sink) : 0;
      if (t > 4.4 && this.hp <= 0) this.hp = this.maxHp;
      if (t > 6.4) {
        this.dead = false;
        this.group.position.set(0, 0, Colossus.Z);
        this.group.rotation.x = 0;
      }
    }
  }
}

export class Environment {
  sky: THREE.Mesh;
  skyU = { uTime: { value: 0 }, uMoon: { value: MOON_DIR.clone() }, uFog: { value: FOG.clone() }, uFlash: { value: 0 } };
  colossus: Colossus;
  skyFlash = 0;
  private nextFlash = 3;

  constructor(scene: THREE.Scene) {
    scene.fog = new THREE.FogExp2(FOG, 0.006);
    scene.background = FOG.clone();

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.skyU,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec3 vP; uniform float uTime, uFlash; uniform vec3 uMoon, uFog;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
          float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+vec2(17.0,9.0); a*=0.5; } return s; }
          void main(){
            vec3 d = normalize(vP);
            float h = d.y;
            vec3 top = vec3(0.010, 0.004, 0.030);
            vec3 mid = vec3(0.05, 0.010, 0.075);
            vec3 hor = vec3(0.30, 0.04, 0.06);
            vec3 col = mix(hor, mid, smoothstep(-0.02, 0.24, h));
            col = mix(col, top, smoothstep(0.16, 0.8, h));
            float md = dot(d, uMoon);
            float halo = pow(max(md, 0.0), 60.0) * 0.4 + pow(max(md, 0.0), 8.0) * 0.1;
            col += vec3(1.0, 0.2, 0.16) * halo;
            float disc = smoothstep(0.9920, 0.9932, md);
            vec2 mp = d.xy * 16.0;
            vec3 moon = vec3(1.9, 0.36, 0.2) * (0.5 + 0.7 * fbm(mp)) ;
            col = mix(col, moon, disc);
            // storm clouds spiralling over the arena
            vec2 cp = d.xz / (abs(h) + 0.28);
            float ang = 0.35 * length(cp) - uTime * 0.012;
            cp = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * cp;
            float c = fbm(cp * 0.85 + vec2(uTime * 0.01, 3.0));
            float cover = smoothstep(0.40, 0.66, c) * smoothstep(-0.02, 0.12, h);
            float under = fbm(cp * 2.3 + 11.0);
            vec3 cloud = mix(vec3(0.006, 0.003, 0.014), vec3(0.20, 0.03, 0.07), smoothstep(0.42, 0.0, h) * under);
            cloud += vec3(0.22, 0.03, 0.10) * smoothstep(0.66, 0.42, c) * 0.5;
            cloud += vec3(1.0, 0.2, 0.14) * pow(max(md, 0.0), 14.0) * 0.4 * under;
            cloud += vec3(0.75, 0.4, 1.6) * uFlash * smoothstep(0.35, 0.8, fbm(cp * 0.8 + 5.0)) * 1.2;
            col = mix(col, cloud, cover * 0.93);
            col = mix(col, uFog, smoothstep(0.035, -0.06, h));
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // ground
    const tex = groundTexture();
    tex.colorSpace = THREE.SRGBColorSpace;
    const bump = tex.clone();
    bump.colorSpace = THREE.NoColorSpace;
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1300, 72),
      new THREE.MeshStandardMaterial({ map: tex, bumpMap: bump, bumpScale: 1.4, roughness: 0.92, metalness: 0.05, color: 0xb0a0a8 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // rocks & spires
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3038, roughness: 0.95, flatShading: true });
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, 170);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    for (let i = 0; i < 170; i++) {
      const a = rand(6.283), r = i < 60 ? rand(16, 70) : rand(70, 300);
      const k = i < 60 ? rand(0.4, 1.8) : rand(2, 11);
      p.set(Math.cos(a) * r, k * 0.25, Math.sin(a) * r);
      if (p.z < -30 && Math.abs(p.x) < 26) p.x += p.x < 0 ? -30 : 30;
      e.set(rand(3), rand(3), rand(3));
      q.setFromEuler(e);
      s.set(k * rand(0.8, 1.6), k * rand(0.5, 1.1), k * rand(0.8, 1.6));
      m.compose(p, q, s);
      rocks.setMatrixAt(i, m);
    }
    scene.add(rocks);
    const spires = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), rockMat, 60);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * 6.283 + randS(0.08), r = rand(120, 380);
      const hgt = rand(18, 100) * (Math.abs(Math.sin(a * 2.5)) * 0.8 + 0.4);
      p.set(Math.cos(a) * r, hgt * 0.5 - 2, Math.sin(a) * r);
      if (p.z < 0 && Math.abs(p.x) < 70) p.x += p.x < 0 ? -80 : 80;
      e.set(randS(0.18), rand(6), randS(0.18));
      q.setFromEuler(e);
      s.set(hgt * rand(0.14, 0.3), hgt, hgt * rand(0.14, 0.3));
      m.compose(p, q, s);
      spires.setMatrixAt(i, m);
    }
    scene.add(spires);
    // titanic horns on the horizon
    for (const sd of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sd * 210, -10, -330), new THREE.Vector3(sd * 235, 90, -335),
        new THREE.Vector3(sd * 190, 190, -325), new THREE.Vector3(sd * 105, 248, -315),
      ]);
      scene.add(new THREE.Mesh(taperedTube(curve, 26, 34, 2, 8), rockMat));
    }
    // skull-dome ridge
    const ridge = new THREE.Mesh(new THREE.SphereGeometry(190, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), rockMat);
    ridge.position.set(0, -95, -520);
    ridge.scale.set(1.6, 1, 1);
    scene.add(ridge);

    // lights
    scene.add(new THREE.HemisphereLight(0x8a6ad8, 0x3a0e18, 0.85));
    const moon = new THREE.DirectionalLight(0xff6a4a, 2.6);
    moon.position.copy(MOON_DIR).multiplyScalar(100);
    scene.add(moon);
    const fill = new THREE.DirectionalLight(0x8f9cff, 1.0);
    fill.position.set(-30, 60, 50);
    scene.add(fill);

    this.colossus = new Colossus(scene);
  }

  update(dt: number, time: number, camPos: THREE.Vector3) {
    this.sky.position.copy(camPos);
    this.skyU.uTime.value = time;
    this.nextFlash -= dt;
    if (this.nextFlash <= 0) {
      this.nextFlash = rand(2.5, 8);
      this.skyFlash = rand(0.5, 1);
    }
    this.skyFlash = Math.max(0, this.skyFlash - dt * 3.2);
    this.skyU.uFlash.value = this.skyFlash * (0.6 + 0.4 * Math.sin(time * 70));
    this.colossus.update(dt, time);
  }
}
