import * as THREE from 'three';
import { makeOutlineMat } from './arm';

export const DECK_R = 34;
export const SUN_DIR = new THREE.Vector3(-0.3, 0.1, -0.95).normalize();

const GLSL_SKY = /* glsl */ `
const vec3 SUN = vec3(-0.2873, 0.0958, -0.9532);
vec3 skyCol(vec3 d, float mood){
  float h = clamp(d.y, 0.0, 1.0);
  vec3 hor = mix(vec3(1.0, 0.60, 0.34), vec3(0.42, 0.72, 1.0), mood);
  vec3 mid = mix(vec3(0.93, 0.36, 0.46), vec3(0.16, 0.46, 0.98), mood);
  vec3 top = mix(vec3(0.09, 0.11, 0.34), vec3(0.04, 0.18, 0.72), mood);
  vec3 c = mix(hor, mid, smoothstep(0.0, 0.22, h));
  return mix(c, top, smoothstep(0.15, 0.85, h));
}
float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hsh(i), hsh(i+vec2(1,0)), f.x), mix(hsh(i+vec2(0,1)), hsh(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }
`;

export function makeGradient() {
  const t = new THREE.DataTexture(new Uint8Array([85, 150, 215, 255]), 4, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

function plankTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const rows = 8;
  const h = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = -Math.random() * 200;
    while (x < 512) {
      const w = 180 + Math.random() * 220;
      const l = 0.5 + Math.random() * 0.12;
      g.fillStyle = `hsl(${26 + Math.random() * 6}, ${46 + Math.random() * 10}%, ${l * 62}%)`;
      g.fillRect(x, r * h, w, h);
      g.strokeStyle = 'rgba(40,18,8,0.55)';
      g.lineWidth = 3;
      g.strokeRect(x, r * h, w, h);
      g.strokeStyle = 'rgba(60,30,12,0.22)';
      g.lineWidth = 1;
      for (let k = 0; k < 4; k++) {
        const y = r * h + 6 + Math.random() * (h - 12);
        g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x + w - 4, y + (Math.random() - 0.5) * 3); g.stroke();
      }
      g.fillStyle = 'rgba(30,14,6,0.7)';
      g.beginPath(); g.arc(x + 9, r * h + h / 2, 2.2, 0, 7); g.arc(x + w - 9, r * h + h / 2, 2.2, 0, 7); g.fill();
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(7, 7);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function stripeTexture(a: string, b: string) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? b : a; g.fillRect(0, i * 8, 32, 8); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1.2);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/* ------------------------------------------------------------------ Targets */
export type Kind = 'marine' | 'boss' | 'barrel' | 'crate';

export class Target {
  group = new THREE.Group();
  kind: Kind;
  home = new THREE.Vector3();
  homeRot = 0;
  vel = new THREE.Vector3();
  angVel = new THREE.Vector3();
  state: 'idle' | 'fly' | 'gone' | 'spawn' = 'idle';
  radius = 0.8;
  centerY = 1;
  heavy = false;
  launchPower = 0;
  mass = 1;
  mats: THREE.MeshToonMaterial[] = [];
  flash = 0;
  t = 0;
  stag = new THREE.Vector3();
  stagVel = new THREE.Vector3();
  tilt = 0;
  tiltVel = 0;
  baseScale = 1;
  vanished = false; // set for one frame when it left the arena
  lastPos = new THREE.Vector3();
  trailT = 0;

  constructor(kind: Kind) {
    this.kind = kind;
  }
  center(out: THREE.Vector3) {
    return out.set(this.group.position.x, this.group.position.y + this.centerY * this.baseScale, this.group.position.z);
  }
  get alive() {
    return this.state === 'idle' || this.state === 'spawn';
  }
  nudge(dir: THREE.Vector3, amt: number) {
    this.flash = 1;
    const d = dir.clone().setY(0).normalize();
    this.stagVel.addScaledVector(d, amt);
    this.tiltVel += amt * 0.25;
  }
  hit(dir: THREE.Vector3, power: number): 'stagger' | 'launch' {
    this.flash = 1;
    if (this.heavy && power < this.launchPower) {
      const d = dir.clone().setY(0).normalize();
      this.stagVel.addScaledVector(d, power * 0.05);
      this.tiltVel += power * 0.012;
      return 'stagger';
    }
    this.state = 'fly';
    this.t = 0;
    const m = this.heavy ? 0.5 : 1;
    this.vel.copy(dir).multiplyScalar(power * 0.78 * m + 4).add(new THREE.Vector3(0, power * 0.3 * m + 5, 0));
    this.angVel.set((Math.random() - 0.5) * power * 0.12, (Math.random() - 0.5) * power * 0.12, (Math.random() - 0.5) * power * 0.14);
    return 'launch';
  }
}

export class World {
  scene = new THREE.Scene();
  targets: Target[] = [];
  uniforms = { uTime: { value: 0 }, uMood: { value: 0 } };
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  gradient: THREE.Texture;
  sky: THREE.Mesh;
  sea: THREE.Mesh;
  private outlineCache = new Map<number, THREE.ShaderMaterial>();

  constructor(gradient: THREE.Texture) {
    this.gradient = gradient;
    this.scene.fog = new THREE.Fog(0xf0a080, 90, 400);
    this.hemi = new THREE.HemisphereLight(0xffc4a8, 0x3a4a80, 1.5);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffe4c8, 2.6);
    this.key.position.set(7, 16, 12);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 80;
    this.key.shadow.bias = -0.0005;
    this.key.shadow.normalBias = 0.05;
    this.scene.add(this.key);
    this.rim = new THREE.DirectionalLight(0xff8a50, 1.8);
    this.rim.position.set(-14, 8, -40);
    this.scene.add(this.rim);

    this.sky = this.buildSky();
    this.sea = this.buildSea();
    this.buildDeck();
    this.buildScenery();
    this.buildTargets();
  }

  private outline(th: number) {
    const k = Math.round(th * 10000);
    let m = this.outlineCache.get(k);
    if (!m) { m = makeOutlineMat(th); this.outlineCache.set(k, m); }
    return m;
  }

  private toon(color: THREE.ColorRepresentation, t?: Target, opts: Partial<THREE.MeshToonMaterialParameters> = {}) {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: this.gradient, ...opts });
    if (t) t.mats.push(m);
    return m;
  }

  private mesh(t: Target, geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, th = 0.018, opts: Partial<THREE.MeshToonMaterialParameters> = {}) {
    const m = new THREE.Mesh(geo, this.toon(color, t, opts));
    m.castShadow = true;
    if (th > 0) m.add(new THREE.Mesh(geo, this.outline(th)));
    return m;
  }

  /* ---------------- sky, sea, deck */
  private buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: this.uniforms,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `${GLSL_SKY}
        uniform float uTime, uMood; varying vec3 vP;
        void main(){
          vec3 d = normalize(vP);
          vec3 c = skyCol(d, uMood);
          float sd = dot(d, SUN);
          float glow = pow(max(sd, 0.0), 14.0);
          c += mix(vec3(1.0, 0.55, 0.25), vec3(1.0, 0.95, 0.8), uMood) * glow * 0.34;
          float disc = smoothstep(0.9962, 0.9972, sd);
          c = mix(c, mix(vec3(1.0, 0.93, 0.7), vec3(1.0), uMood), disc);
          if (d.y > 0.01) {
            vec2 uv = d.xz / (d.y + 0.14) * 0.9 + vec2(uTime * 0.012, 0.0);
            float n = fbm(uv);
            float cloud = smoothstep(0.5, 0.56, n) * smoothstep(0.0, 0.14, d.y);
            float core = smoothstep(0.6, 0.72, fbm(uv + vec2(0.07, 0.11)));
            vec3 lit = mix(vec3(1.0, 0.78, 0.62), vec3(1.0), uMood);
            vec3 dark = mix(vec3(0.58, 0.28, 0.5), vec3(0.55, 0.68, 0.92), uMood);
            vec3 cc = mix(lit, dark, core);
            cc += mix(vec3(0.5,0.25,0.1), vec3(0.2), uMood) * smoothstep(0.96, 1.0, sd) * (1.0 - core);
            c = mix(c, cc, cloud);
          }
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), mat);
    m.renderOrder = -10;
    this.scene.add(m);
    return m;
  }

  private buildSea() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `${GLSL_SKY}
        uniform float uTime, uMood; varying vec3 vW;
        void main(){
          vec3 V = normalize(vW - cameraPosition);
          vec2 p = vW.xz; float t = uTime;
          float w1 = sin(p.x*0.55 + t*1.1) + sin(p.y*0.8 - t*0.9) + sin((p.x+p.y)*0.42 + t*0.7) + sin((p.x-p.y)*1.1 - t*1.4);
          vec2 g = vec2(cos(p.x*0.55+t*1.1)*0.55 + cos((p.x+p.y)*0.42+t*0.7)*0.42 + cos((p.x-p.y)*1.1-t*1.4)*1.1,
                        cos(p.y*0.8-t*0.9)*0.8 + cos((p.x+p.y)*0.42+t*0.7)*0.42 - cos((p.x-p.y)*1.1-t*1.4)*1.1);
          vec3 n = normalize(vec3(-g.x*0.03, 1.0, -g.y*0.03));
          float fr = pow(1.0 - max(dot(-V, n), 0.0), 3.0);
          vec3 R = reflect(V, n); R.y = abs(R.y);
          vec3 sky = skyCol(R, uMood);
          vec3 deep = mix(vec3(0.03, 0.15, 0.30), vec3(0.04, 0.46, 0.78), uMood);
          vec3 shallow = mix(vec3(0.08, 0.30, 0.45), vec3(0.2, 0.75, 0.9), uMood);
          vec3 col = mix(deep, shallow, smoothstep(-3.0, 4.0, w1));
          col = mix(col, sky, clamp(fr * 0.9 + 0.12, 0.0, 1.0));
          float sg = dot(normalize(R), SUN);
          float spark = smoothstep(0.9965, 0.9985, sg) * step(0.2, vnoise(p*1.8 + t));
          col += mix(vec3(1.0, 0.7, 0.4), vec3(1.0), uMood) * (spark + pow(max(sg,0.), 40.) * 0.35);
          float foam = smoothstep(2.55, 2.7, w1) * 0.8;
          float rr = length(p);
          float edge = smoothstep(DECK_R + 5.5 + sin(atan(p.y,p.x)*9.0 + t)*0.6, DECK_R + 0.5, rr);
          float eb = step(0.45, fract(rr*0.6 - t*0.3 + vnoise(p*0.5)*2.0)) ;
          foam = max(foam, edge * (0.45 + 0.4 * eb));
          col = mix(col, vec3(1.0, 0.97, 0.95), clamp(foam, 0.0, 1.0));
          float d = length(vW - cameraPosition);
          col = mix(col, skyCol(vec3(0.0, 0.0, -1.0), uMood), 1.0 - exp(-d * 0.0042));
          gl_FragColor = vec4(col, 1.0);
        }`.replace(/DECK_R/g, DECK_R.toFixed(1)),
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = -1.4;
    this.scene.add(m);
    return m;
  }

  private buildDeck() {
    const top = new THREE.MeshToonMaterial({ map: plankTexture(), gradientMap: this.gradient, color: 0xffffff });
    const side = new THREE.MeshToonMaterial({ color: 0x4a2a16, gradientMap: this.gradient });
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(DECK_R, DECK_R + 0.8, 1.4, 96), [side, top, side]);
    deck.position.y = -0.7;
    deck.receiveShadow = true;
    this.scene.add(deck);
    // rail
    const rail = new THREE.Mesh(new THREE.TorusGeometry(DECK_R - 0.6, 0.12, 8, 120), this.toon(0x6b3d1e));
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 1.15;
    this.scene.add(rail);
    const postGeo = new THREE.CylinderGeometry(0.16, 0.2, 1.3, 8);
    const post = new THREE.InstancedMesh(postGeo, this.toon(0x5a3218), 48);
    const o = new THREE.Object3D();
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      o.position.set(Math.cos(a) * (DECK_R - 0.6), 0.6, Math.sin(a) * (DECK_R - 0.6));
      o.updateMatrix();
      post.setMatrixAt(i, o.matrix);
    }
    this.scene.add(post);
  }

  private buildScenery() {
    const rockMat = this.toon(0x5d4a64, undefined, {});
    const rockMat2 = this.toon(0x7a5c6a, undefined, {});
    const addRock = (x: number, z: number, s: number, h: number) => {
      const g = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const geo = new THREE.IcosahedronGeometry(1, 2);
        const pa = geo.getAttribute('position');
        const v = new THREE.Vector3();
        for (let k = 0; k < pa.count; k++) {
          v.fromBufferAttribute(pa, k);
          const n = 1 + 0.28 * Math.sin(v.x * 3.1 + i) * Math.cos(v.z * 2.7 + i * 2) + 0.12 * Math.sin(v.y * 6 + v.x * 4);
          v.multiplyScalar(n);
          if (v.y < -0.2) v.y = -0.2;
          pa.setXYZ(k, v.x, v.y, v.z);
        }
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, i % 2 ? rockMat2 : rockMat);
        const k = 1 - i * 0.17;
        m.scale.set(s * k * 0.8, h * k * 0.55, s * k * 0.8);
        m.position.set((Math.random() - 0.5) * s * 0.7, h * k * 0.4 - 2, (Math.random() - 0.5) * s * 0.7);
        m.rotation.y = Math.random() * 3;
        g.add(m);
      }
      g.position.set(x, -1.4, z);
      this.scene.add(g);
    };
    addRock(-95, -150, 22, 60);
    addRock(120, -170, 30, 80);
    addRock(-190, -90, 26, 50);
    addRock(210, -60, 20, 38);
    addRock(30, -260, 40, 90);
    addRock(-60, 170, 25, 45);
    addRock(150, 140, 22, 40);

    // distant warship
    const ship = new THREE.Group();
    const hullMat = this.toon(0x2a2c48);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(70, 12, 18), hullMat);
    hull.position.y = 4;
    ship.add(hull);
    const prow = new THREE.Mesh(new THREE.ConeGeometry(9, 22, 4), hullMat);
    prow.rotation.set(0, Math.PI / 4, -Math.PI / 2);
    prow.scale.set(1, 1, 0.9);
    prow.position.set(-46, 4, 0);
    ship.add(prow);
    const sailMat = new THREE.MeshToonMaterial({ color: 0xfff1e0, gradientMap: this.gradient, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 58, 6), this.toon(0x3b2412));
      mast.position.set(-18 + i * 20, 34, 0);
      ship.add(mast);
      for (let k = 0; k < 2; k++) {
        const sail = new THREE.Mesh(new THREE.PlaneGeometry(16, 13), sailMat);
        sail.position.set(-18 + i * 20, 24 + k * 16, 0.5);
        sail.rotation.y = Math.PI / 2;
        ship.add(sail);
      }
    }
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshBasicMaterial({ color: 0xf2f6ff, side: THREE.DoubleSide }));
    flag.position.set(-18 + 2 * 20 + 4, 62, 0);
    flag.rotation.y = Math.PI / 2;
    ship.add(flag);
    ship.position.set(115, -1.2, -135);
    ship.rotation.y = 0.35;
    this.scene.add(ship);
  }

  /* ---------------- enemies, boss, props */
  private face(t: Target, g: THREE.Group, y: number, z: number, sep: number, s: number, glow = false) {
    for (const sx of [-1, 1]) {
      const white = new THREE.Mesh(new THREE.SphereGeometry(0.06 * s, 12, 10), new THREE.MeshBasicMaterial({ color: glow ? 0xffb000 : 0xffffff }));
      white.position.set(sx * sep, y, z);
      g.add(white);
      if (!glow) {
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.028 * s, 8, 8), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        pupil.position.set(sx * sep, y, z + 0.045 * s);
        g.add(pupil);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.1 * s, 0.018 * s, 0.02 * s), new THREE.MeshBasicMaterial({ color: 0x221111 }));
        brow.position.set(sx * sep, y + 0.085 * s, z);
        brow.rotation.z = sx * -0.35;
        g.add(brow);
      } else {
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.05 * s, 0.05 * s), new THREE.MeshBasicMaterial({ color: 0x120808 }));
        brow.position.set(sx * sep, y + 0.1 * s, z);
        brow.rotation.z = sx * 0.5;
        g.add(brow);
      }
    }
    void t;
  }

  private buildMarine(variant: number) {
    const t = new Target('marine');
    const g = t.group;
    const skins = [0xf3c09a, 0xe0a47c, 0xc58a64, 0xf7cfae];
    const skin = skins[variant % skins.length];
    const navy = 0x1f2f66;
    const stripe = this.toon(0xffffff, t, { map: stripeTexture('#2c4a9a', '#f4f6ff') });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.5, 6, 14), stripe);
    torso.position.y = 1.15; torso.castShadow = true;
    torso.add(new THREE.Mesh(torso.geometry, this.outline(0.02)));
    g.add(torso);
    const belt = this.mesh(t, new THREE.CylinderGeometry(0.285, 0.285, 0.1, 16), 0x2a1c14, 0.012);
    belt.position.y = 0.86; g.add(belt);
    for (const s of [-1, 1]) {
      const leg = this.mesh(t, new THREE.CapsuleGeometry(0.115, 0.5, 5, 10), navy, 0.016);
      leg.position.set(s * 0.14, 0.5, 0); g.add(leg);
      const shoe = this.mesh(t, new THREE.BoxGeometry(0.22, 0.12, 0.38), 0x16141a, 0.012);
      shoe.position.set(s * 0.14, 0.06, -0.05); g.add(shoe);
      const arm = this.mesh(t, new THREE.CapsuleGeometry(0.085, 0.42, 5, 10), 0xf4f6ff, 0.014);
      arm.position.set(s * 0.37, 1.3, -0.12);
      arm.rotation.set(-1.1, 0, s * 0.35);
      g.add(arm);
      const hand = this.mesh(t, new THREE.SphereGeometry(0.09, 10, 8), skin, 0.012);
      hand.position.set(s * 0.26, 1.2, -0.46); g.add(hand);
    }
    const rifle = this.mesh(t, new THREE.BoxGeometry(0.09, 0.11, 0.95), 0x4b2e1a, 0.012);
    rifle.position.set(0.12, 1.22, -0.45); rifle.rotation.set(0, 0.0, 0); g.add(rifle);
    const barrel = this.mesh(t, new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), 0x2c2c34, 0.01);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0.12, 1.25, -0.95); g.add(barrel);
    const head = this.mesh(t, new THREE.SphereGeometry(0.25, 20, 16), skin, 0.02);
    head.position.y = 1.72; g.add(head);
    this.face(t, g, 1.74, -0.21, 0.09, 1, false);
    // NOTE: marines face -Z in local space; group is rotated to face the player later.
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0x3a0f0f }));
    mouth.scale.set(1.3, 1, 0.6); mouth.position.set(0, 1.62, -0.235); g.add(mouth);
    const capBase = this.mesh(t, new THREE.CylinderGeometry(0.27, 0.285, 0.14, 18), 0xf6f8ff, 0.016);
    capBase.position.y = 1.9; g.add(capBase);
    const capTop = this.mesh(t, new THREE.SphereGeometry(0.27, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xf6f8ff, 0.016);
    capTop.position.y = 1.93; capTop.scale.y = 0.7; g.add(capTop);
    const band = this.mesh(t, new THREE.CylinderGeometry(0.29, 0.29, 0.05, 18), navy, 0.01);
    band.position.y = 1.85; g.add(band);
    const brim = this.mesh(t, new THREE.CylinderGeometry(0.26, 0.26, 0.025, 18, 1, false, -0.9, 1.8), navy, 0.01);
    brim.position.set(0, 1.84, -0.2); brim.scale.set(1, 1, 1.1); g.add(brim);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: 0x2c4a9a }));
    badge.position.set(0, 1.93, -0.275); badge.rotation.y = Math.PI; g.add(badge);

    t.radius = 0.7; t.centerY = 1.15; t.mass = 1; t.baseScale = 1;
    return t;
  }

  private buildBoss() {
    const t = new Target('boss');
    const g = t.group;
    const steel = 0x3a4262, gold = 0xd6a53a, skin = 0xc48a66, red = 0x8a1a2a;
    const torso = this.mesh(t, new THREE.CapsuleGeometry(0.62, 0.8, 8, 18), steel, 0.03);
    torso.position.y = 1.9; g.add(torso);
    const belly = this.mesh(t, new THREE.SphereGeometry(0.58, 18, 14), gold, 0.025);
    belly.scale.set(1, 0.7, 0.55); belly.position.set(0, 1.75, -0.45); g.add(belly);
    const belt = this.mesh(t, new THREE.CylinderGeometry(0.66, 0.66, 0.16, 20), 0x24160e, 0.02);
    belt.position.y = 1.35; g.add(belt);
    const cape = this.mesh(t, new THREE.BoxGeometry(1.8, 2.3, 0.08), red, 0.025, { side: THREE.DoubleSide });
    cape.position.set(0, 1.7, 0.7); cape.rotation.x = 0.12; g.add(cape);
    for (const s of [-1, 1]) {
      const sh = this.mesh(t, new THREE.SphereGeometry(0.48, 16, 12), gold, 0.025);
      sh.position.set(s * 0.95, 2.55, 0); g.add(sh);
      for (let k = 0; k < 3; k++) {
        const sp = this.mesh(t, new THREE.ConeGeometry(0.1, 0.5, 8), 0xe8e8f0, 0.015);
        sp.position.set(s * (0.95 + (k - 1) * 0.2), 2.95 + (k === 1 ? 0.1 : 0), (k - 1) * 0.2);
        sp.rotation.z = -s * (0.3 + (k - 1) * 0.35);
        g.add(sp);
      }
      const arm = this.mesh(t, new THREE.CapsuleGeometry(0.26, 1.05, 6, 12), skin, 0.025);
      arm.position.set(s * 1.1, 1.75, -0.05); arm.rotation.z = s * 0.12; g.add(arm);
      const fist = this.mesh(t, new THREE.SphereGeometry(0.34, 14, 12), skin, 0.025);
      fist.position.set(s * 1.2, 0.95, -0.1); g.add(fist);
      const leg = this.mesh(t, new THREE.CapsuleGeometry(0.3, 0.85, 6, 12), steel, 0.025);
      leg.position.set(s * 0.35, 0.65, 0); g.add(leg);
      const foot = this.mesh(t, new THREE.BoxGeometry(0.55, 0.25, 0.9), 0x1a1a22, 0.02);
      foot.position.set(s * 0.35, 0.12, -0.15); g.add(foot);
    }
    const head = this.mesh(t, new THREE.SphereGeometry(0.45, 20, 16), skin, 0.03);
    head.position.set(0, 3.15, -0.02); g.add(head);
    const jaw = this.mesh(t, new THREE.BoxGeometry(0.62, 0.3, 0.4), skin, 0.02);
    jaw.position.set(0, 3.0, -0.28); g.add(jaw);
    this.face(t, g, 3.22, -0.4, 0.17, 2.2, true);
    const helm = this.mesh(t, new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0.025);
    helm.position.set(0, 3.25, 0); g.add(helm);
    const crest = this.mesh(t, new THREE.BoxGeometry(0.08, 0.3, 0.9), gold, 0.015);
    crest.position.set(0, 3.8, 0); g.add(crest);
    for (const s of [-1, 1]) {
      const horn = this.mesh(t, new THREE.ConeGeometry(0.14, 0.9, 10), 0xf1ead2, 0.02);
      horn.position.set(s * 0.58, 3.65, 0); horn.rotation.z = -s * 0.75; g.add(horn);
    }
    const tooth = this.mesh(t, new THREE.BoxGeometry(0.4, 0.07, 0.06), 0xffffff, 0.01);
    tooth.position.set(0, 2.9, -0.5); g.add(tooth);
    t.radius = 2.1; t.centerY = 2.0; t.heavy = true; t.launchPower = 62; t.mass = 6; t.baseScale = 1.35;
    g.scale.setScalar(t.baseScale);
    return t;
  }

  private buildProp(kind: 'barrel' | 'crate') {
    const t = new Target(kind);
    if (kind === 'barrel') {
      const b = this.mesh(t, new THREE.CylinderGeometry(0.42, 0.36, 0.95, 14), 0x8a5a2b, 0.02);
      b.position.y = 0.48; t.group.add(b);
      for (const y of [0.18, 0.78]) {
        const band = this.mesh(t, new THREE.CylinderGeometry(0.435, 0.435, 0.07, 14), 0x2d2d36, 0.01);
        band.position.y = y; t.group.add(band);
      }
      t.radius = 0.5; t.centerY = 0.5;
    } else {
      const b = this.mesh(t, new THREE.BoxGeometry(0.95, 0.95, 0.95), 0xa8723a, 0.02);
      b.position.y = 0.48; t.group.add(b);
      const f = this.mesh(t, new THREE.BoxGeometry(1.0, 0.12, 1.0), 0x6b4220, 0.01);
      f.position.y = 0.95; t.group.add(f);
      const f2 = this.mesh(t, new THREE.BoxGeometry(1.0, 0.12, 1.0), 0x6b4220, 0.01);
      f2.position.y = 0.02; t.group.add(f2);
      t.radius = 0.6; t.centerY = 0.5;
    }
    return t;
  }

  private place(t: Target, dist: number, angDeg: number) {
    const a = THREE.MathUtils.degToRad(angDeg);
    t.home.set(Math.sin(a) * dist, 0, -Math.cos(a) * dist);
    t.group.position.copy(t.home);
    // face the player (origin). marines are modelled facing -Z, so turn them around.
    t.homeRot = Math.atan2(t.home.x, t.home.z);
    t.group.rotation.y = t.homeRot + (t.kind === 'marine' ? (Math.random() - 0.5) * 0.4 : 0);
    t.homeRot = t.group.rotation.y;
    this.scene.add(t.group);
    this.targets.push(t);
  }

  private buildTargets() {
    // The player looks along -Z. Marines are modelled facing -Z, so rotate by PI to face camera.
    const boss = this.buildBoss();
    this.place(boss, 25, 0);
    const marines: [number, number][] = [
      [10.5, 4], [13, -22], [12, 26], [16, -10], [17, 14], [15, -40], [19, 36], [21, -27],
      [24, 24], [11, 52], [11, -55], [22, -6], [27, 8], [28, -16], [30, 30], [30, -38],
    ];
    marines.forEach(([d, a], i) => this.place(this.buildMarine(i), d, a));
    const props: ['barrel' | 'crate', number, number][] = [
      ['barrel', 8, -12], ['crate', 8.6, 14], ['barrel', 14, 2], ['crate', 15, -32], ['barrel', 18, 28],
      ['crate', 18, -3], ['barrel', 20, -17], ['crate', 12, 38], ['barrel', 13, -46], ['crate', 26, -24],
      ['barrel', 26, 16], ['crate', 22, 44], ['barrel', 20, 8], ['crate', 9, -35],
    ];
    props.forEach(([k, d, a]) => this.place(this.buildProp(k), d, a));
    // marine/prop models face -Z inside the group; props are symmetric so it doesn't matter.
  }

  /* ---------------- per-frame */
  update(dt: number, time: number, mood: number) {
    this.uniforms.uTime.value = time;
    this.uniforms.uMood.value = mood;
    const lerpC = (c: THREE.Color, a: number, b: number) => c.setHex(a).lerp(new THREE.Color(b), mood);
    lerpC(this.hemi.color, 0xffc4a8, 0xcfe4ff);
    lerpC(this.hemi.groundColor, 0x3a4a80, 0x6688cc);
    this.hemi.intensity = 1.5 - mood * 0.6;
    this.key.intensity = 2.6 - mood * 1.3;
    lerpC(this.key.color, 0xffe4c8, 0xffffff);
    lerpC(this.rim.color, 0xff8a50, 0xcfe8ff);
    (this.scene.fog as THREE.Fog).color.setHex(0xf0a080).lerp(new THREE.Color(0xbfe0ff), mood);

    for (const t of this.targets) this.updateTarget(t, dt);
  }

  private updateTarget(t: Target, dt: number) {
    const g = t.group;
    t.vanished = false;
    t.t += dt;
    // flash fade
    if (t.flash > 0) {
      t.flash = Math.max(0, t.flash - dt * 4.5);
      for (const m of t.mats) m.emissive.setRGB(t.flash * 0.85, t.flash * 0.8, t.flash * 0.75);
    }
    if (t.state === 'idle' || t.state === 'spawn') {
      // stagger spring
      t.stagVel.addScaledVector(t.stag, -26 * dt).multiplyScalar(Math.exp(-4.5 * dt));
      t.stag.addScaledVector(t.stagVel, dt);
      t.tiltVel += -t.tilt * 30 * dt;
      t.tiltVel *= Math.exp(-4 * dt);
      t.tilt += t.tiltVel * dt;
      g.position.copy(t.home).add(t.stag);
      g.rotation.x = -t.tilt * 0.35;
      g.rotation.y = t.homeRot;
      // idle bob
      const bob = t.kind === 'marine' ? Math.sin(performance.now() * 0.004 + t.home.x) * 0.02 : 0;
      g.position.y += bob;
      if (t.state === 'spawn') {
        const u = Math.min(1, t.t / 0.5);
        const s = u < 1 ? 1 - Math.pow(1 - u, 3) * Math.cos(u * 9) : 1;
        g.scale.setScalar(Math.max(0.001, s) * t.baseScale);
        if (u >= 1) t.state = 'idle';
      } else g.scale.setScalar(t.baseScale);
      g.visible = true;
    } else if (t.state === 'fly') {
      const v = t.vel;
      v.y -= 17 * dt;
      g.position.addScaledVector(v, dt);
      g.rotation.x += t.angVel.x * dt;
      g.rotation.y += t.angVel.y * dt;
      g.rotation.z += t.angVel.z * dt;
      const onDeck = g.position.x * g.position.x + g.position.z * g.position.z < DECK_R * DECK_R;
      if (onDeck && g.position.y < 0 && v.y < 0) {
        g.position.y = 0;
        v.y *= -0.32; v.x *= 0.78; v.z *= 0.78;
        t.angVel.multiplyScalar(0.6);
      }
      const dist = Math.hypot(g.position.x, g.position.z);
      const lifeLimit = t.kind === 'boss' ? 5 : 3.2;
      if (g.position.y < -8 || dist > 160 || g.position.y > 140 || t.t > lifeLimit) {
        t.state = 'gone';
        t.t = 0;
        t.vanished = true;
        g.visible = false;
      }
    } else if (t.state === 'gone') {
      g.visible = false;
      if (t.t > (t.kind === 'boss' ? 2.4 : 1.6)) {
        t.state = 'spawn';
        t.t = 0;
        t.stag.set(0, 0, 0); t.stagVel.set(0, 0, 0); t.tilt = 0; t.tiltVel = 0;
        g.position.copy(t.home);
        g.rotation.set(0, t.homeRot, 0);
        g.scale.setScalar(0.001);
        g.visible = true;
      }
    }
    t.lastPos.copy(g.position);
  }
}
