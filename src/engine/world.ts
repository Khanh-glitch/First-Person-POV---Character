import * as THREE from "three";
import { clamp, easeOutCubic, rand } from "./util";
import { floorTexture } from "./textures";

export const HORIZON = new THREE.Color(0.2, 0.025, 0.055);
export const ISLAND_CENTER = new THREE.Vector3(0, -16, -520);
export const ISLAND_RADIUS = 125;

export const NOISE_GLSL = /* glsl */ `
float hash31(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i+vec3(0,0,0)),hash31(i+vec3(1,0,0)),f.x),
                 mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),
                 mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){
  float a = 0.5; float s = 0.0;
  for (int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + 7.1; a *= 0.5; }
  return s;
}
`;

export class City {
  mesh: THREE.InstancedMesh;
  items: { x: number; z: number; w: number; d: number; h: number; dist: number; rot: number; color: THREE.Color }[] = [];
  private dummy = new THREE.Object3D();
  private tmp = new THREE.Color();
  private lastR = -1;

  constructor(parent: THREE.Object3D) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);

    // window atlas
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#050308";
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (Math.random() < 0.4) {
          g.fillStyle = Math.random() < 0.15 ? "#ff9ab0" : "#ffd9a0";
          g.fillRect(x * 8 + 2, y * 8 + 2, 4, 5);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex });

    const N = 820;
    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 0.62) * (ISLAND_RADIUS - 14);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const centerBoost = 1 - r / ISLAND_RADIUS;
      const h = rand(3, 9) + Math.random() * 22 * centerBoost * centerBoost + (Math.random() < 0.05 ? 20 : 0);
      const w = rand(3, 9);
      const d = rand(3, 9);
      const color = new THREE.Color().setScalar(rand(0.9, 3.2));
      color.multiply(new THREE.Color(1.0, rand(0.8, 1), rand(0.7, 1)));
      this.items.push({ x, z, w, d, h, dist: r, rot: rand(0, Math.PI), color });
    }
    this.apply(0, true);
    parent.add(this.mesh);
  }

  private apply(radius: number, force = false) {
    if (!force && Math.abs(radius - this.lastR) < 0.05) return;
    this.lastR = radius;
    const dm = this.dummy;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const p = clamp((radius - it.dist) / 34);
      let sy = 1;
      let tilt = 0;
      if (p > 0) {
        sy = Math.max(0.03, 1 - easeOutCubic(p) * 0.97);
        tilt = p * 0.3 * (i % 2 ? 1 : -1);
      }
      dm.position.set(it.x, 0, it.z);
      dm.rotation.set(0, it.rot, tilt);
      dm.scale.set(it.w, it.h * sy, it.d);
      dm.updateMatrix();
      this.mesh.setMatrixAt(i, dm.matrix);

      this.tmp.copy(it.color);
      if (p > 0) {
        const ember = Math.sin(Math.min(1, p * 1.4) * Math.PI);
        this.tmp.multiplyScalar(Math.max(0.03, 1 - p * 1.1));
        this.tmp.r += ember * 3.2 * (1 - p * 0.4);
        this.tmp.g += ember * 0.7;
        if (p > 0.7) this.tmp.multiplyScalar(1 - (p - 0.7) * 2);
      }
      this.mesh.setColorAt(i, this.tmp);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  setBurn(r: number) {
    this.apply(r);
  }
  reset() {
    this.apply(0, true);
  }
  randomPointInside(r: number, out: THREE.Vector3) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * Math.min(r, ISLAND_RADIUS);
    return out.set(ISLAND_CENTER.x + Math.cos(a) * d, ISLAND_CENTER.y + rand(0, 14), ISLAND_CENTER.z + Math.sin(a) * d);
  }
}

export class World {
  group = new THREE.Group();
  skyU = {
    uTime: { value: 0 },
    uStorm: { value: 0 },
    uGlow: { value: new THREE.Color(0, 0, 0) },
    uGlowDir: { value: new THREE.Vector3(0, 0, -1) },
    uHorizon: { value: HORIZON.clone() },
  };
  cloudU = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uGlowPos: { value: new THREE.Vector3(0, 0, -520) },
    uGlowCol: { value: new THREE.Color(1, 0.2, 0.1) },
    uGlowI: { value: 0 },
    uRing: { value: new THREE.Vector3(0, 30, 0) },
    uRingCol: { value: new THREE.Color(1, 0.3, 0.2) },
    uHorizon: { value: HORIZON.clone() },
    uDark: { value: 0 },
  };
  groundU = {
    uTime: { value: 0 },
    uBurn: { value: -10 },
    uHeat: { value: 0 },
    uFront: { value: 0 },
    uHorizon: { value: HORIZON.clone() },
  };
  city!: City;
  hemi: THREE.HemisphereLight;
  moon: THREE.DirectionalLight;
  fxLight: THREE.PointLight;
  sky: THREE.Mesh;
  pillars: THREE.Mesh[] = [];
  floor: THREE.Mesh;
  private shakeables: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    scene.fog = new THREE.FogExp2(HORIZON.clone().multiplyScalar(0.7), 0.0011);
    scene.add(this.group);

    // ---------- Sky ----------
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyU,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uStorm; uniform vec3 uGlow, uGlowDir, uHorizon;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 mid = vec3(0.035,0.004,0.07);
          vec3 top = vec3(0.003,0.0,0.014);
          vec3 col = mix(uHorizon, mid, smoothstep(-0.04, 0.32, h));
          col = mix(col, top, smoothstep(0.22, 0.95, h));
          col = mix(col, vec3(0.04,0.0,0.06), smoothstep(0.0, -0.35, h));

          // stars
          vec3 sp = floor(d*260.0);
          float hs = hash31(sp);
          float st = step(0.9975, hs);
          col += st * (0.5 + 0.5*sin(uTime*2.0 + hs*40.0)) * smoothstep(0.05, 0.5, h) * vec3(1.0,0.75,0.85) * (1.0-uStorm*0.8);

          // swirling storm clouds
          vec2 q = d.xz / (abs(h) + 0.28);
          float ang = uTime*0.01;
          q = mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*q;
          float n = fbm(vec3(q*1.4, uTime*0.03));
          float n2 = fbm(vec3(q*3.2 + 4.0, uTime*0.05));
          float cl = smoothstep(0.38, 0.82, n*0.8+n2*0.3);
          vec3 cloudCol = vec3(0.012,0.0,0.02) + vec3(0.30,0.03,0.08)*pow(n2,2.5)*(1.0-h*0.7);
          col = mix(col, cloudCol, cl * smoothstep(-0.06, 0.18, h) * (0.55 + uStorm*0.45));

          // blood moon
          vec3 md = normalize(vec3(-0.5, 0.33, -0.8));
          float m = dot(d, md);
          float disc = smoothstep(0.99905, 0.9993, m);
          float surf = 0.75 + 0.5*fbm(d*55.0);
          float glow = pow(max(m,0.0), 90.0)*0.7 + pow(max(m,0.0), 10.0)*0.14;
          col += vec3(1.0,0.16,0.12) * (disc*surf*1.7 + glow) * (1.0 - uStorm*0.55);

          // dynamic energy glow
          float g = pow(max(dot(d, normalize(uGlowDir)), 0.0), 9.0);
          col += uGlow * g;
          col *= 1.0 - uStorm*0.35;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 48, 32), skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    // ---------- Cloud sea ----------
    const cloudMat = new THREE.ShaderMaterial({
      uniforms: this.cloudU,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vW;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uGlowI, uDark; uniform vec3 uCam, uGlowPos, uGlowCol, uRing, uRingCol, uHorizon;
        varying vec3 vW;
        ${NOISE_GLSL}
        void main(){
          vec2 p = vW.xz * 0.0042;
          float t = uTime * 0.025;
          vec2 w = vec2(fbm(vec3(p + vec2(t, 0.0), 1.0)), fbm(vec3(p + vec2(5.2, 1.3) - t, 2.0)));
          float n = fbm(vec3(p + w * 1.4, t * 2.0));
          vec3 deep = vec3(0.012, 0.0, 0.035);
          vec3 lit = vec3(0.32, 0.07, 0.15);
          vec3 col = mix(deep, lit, smoothstep(0.22, 0.85, n));
          col += vec3(0.5,0.08,0.1) * pow(smoothstep(0.55,0.95,n), 2.0) * 0.6;
          float dist = length(vW.xz - uCam.xz);
          float f = 1.0 - exp(-dist * 0.00062);
          col = mix(col, uHorizon * 0.78, f * 0.92);
          float gd = length(vW.xz - uGlowPos.xz);
          col += uGlowCol * exp(-gd * 0.0045) * uGlowI * (0.35 + n * 1.2);
          float rd = abs(gd - uRing.x);
          col += uRingCol * exp(-pow(rd / max(uRing.y, 1.0), 2.0)) * uRing.z * (0.5 + n);
          col *= 1.0 - uDark * 0.65;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const clouds = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1), cloudMat);
    clouds.rotation.x = -Math.PI / 2;
    clouds.position.y = -30;
    clouds.frustumCulled = false;
    scene.add(clouds);

    // ---------- Target island ("Lulusia") ----------
    const island = new THREE.Group();
    island.position.copy(ISLAND_CENTER);
    scene.add(island);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(ISLAND_RADIUS + 16, 96).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: this.groundU,
        transparent: false,
        fog: false,
        vertexShader: /* glsl */ `
          varying vec3 vL; varying vec3 vW;
          void main(){ vL = position; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uBurn, uHeat, uFront; uniform vec3 uHorizon;
          varying vec3 vL; varying vec3 vW;
          ${NOISE_GLSL}
          void main(){
            float r = length(vL.xz);
            float a = atan(vL.z, vL.x);
            float edge = ${ISLAND_RADIUS.toFixed(1)} + 6.0*sin(a*3.0+1.0) + 3.5*sin(a*7.0) + 2.0*sin(a*13.0+2.0);
            if (r > edge) discard;
            float n = fbm(vec3(vL.xz*0.06, 0.0));
            vec3 base = mix(vec3(0.02,0.025,0.02), vec3(0.07,0.06,0.07), n);
            float burned = smoothstep(uBurn, uBurn - 22.0, r) * step(0.0, uBurn);
            float crust = fbm(vec3(vL.xz*0.11, uTime*0.05));
            float cracks = smoothstep(0.52, 0.64, crust) * smoothstep(0.7, 0.45, abs(crust-0.58)*3.0+0.2);
            float lava = pow(smoothstep(0.4, 0.62, crust), 2.0);
            vec3 charred = vec3(0.008,0.004,0.004);
            vec3 col = mix(base, charred, burned);
            col += vec3(1.0, 0.22, 0.03) * lava * burned * uHeat * 2.4;
            col += vec3(1.0, 0.5, 0.2) * cracks * burned * uHeat * 1.2;
            col += vec3(1.0, 0.5, 0.3) * exp(-abs(r-uBurn)/5.0) * uFront * step(0.0,uBurn);
            float rim = smoothstep(edge-4.0, edge, r);
            col *= 1.0 - rim*0.6;
            float dist = length(vW - cameraPosition);
            col = mix(col, uHorizon*0.7, (1.0-exp(-dist*0.0011*dist*0.0011)) );
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    ground.position.y = 0.02;
    island.add(ground);

    const rock = new THREE.Mesh(
      new THREE.CylinderGeometry(ISLAND_RADIUS - 8, 38, 160, 40, 6, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.012, 0.03), side: THREE.DoubleSide })
    );
    // roughen
    const rp = rock.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < rp.count; i++) {
      const k = 1 + (Math.sin(rp.getX(i) * 0.13 + rp.getY(i) * 0.2) * 0.5 + Math.sin(rp.getZ(i) * 0.17) * 0.5) * 0.12;
      rp.setX(i, rp.getX(i) * k);
      rp.setZ(i, rp.getZ(i) * k);
    }
    rock.position.y = -80;
    island.add(rock);

    this.city = new City(island);

    // central castle spires
    const spireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.05, 0.08) });
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.2, 0.5) });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const rr = i === 0 ? 0 : 12;
      const h = i === 0 ? 70 : rand(30, 46);
      const s = new THREE.Mesh(new THREE.ConeGeometry(i === 0 ? 8 : 4.5, h, 6), spireMat);
      s.position.set(Math.cos(a) * rr, h / 2 + 10, Math.sin(a) * rr);
      island.add(s);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), glowMat);
      tip.position.set(s.position.x, h + 10, s.position.z);
      island.add(tip);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(i === 0 ? 9 : 5, i === 0 ? 10 : 6, 12, 8), spireMat);
      base.position.set(s.position.x, 6, s.position.z);
      island.add(base);
    }

    // ---------- distant crags ----------
    const cragMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.04, 0.012, 0.045) });
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(900, 2000);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x) < 250 && z < 0 && z > -800) continue;
      const h = rand(80, 320);
      const crag = new THREE.Mesh(new THREE.ConeGeometry(rand(40, 110), h, rand(4, 7) | 0), cragMat);
      crag.position.set(x, -30 + h / 2 - 10, z);
      crag.rotation.y = rand(0, 3);
      scene.add(crag);
    }

    // ---------- Balcony of Pangaea Castle ----------
    const platform = new THREE.Group();
    scene.add(platform);
    const ft = floorTexture();
    this.floor = new THREE.Mesh(
      new THREE.BoxGeometry(70, 4, 42),
      new THREE.MeshStandardMaterial({ map: ft, roughness: 0.45, metalness: 0.3, color: new THREE.Color(1.1, 1.0, 1.2) })
    );
    this.floor.position.set(0, -3.7, -5);
    platform.add(this.floor);

    const stone = new THREE.MeshStandardMaterial({ color: 0x17121d, roughness: 0.55, metalness: 0.5 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc19a3a, roughness: 0.3, metalness: 1, emissive: 0x3a2204, emissiveIntensity: 0.6 });

    // balustrade
    const rail = new THREE.Mesh(new THREE.BoxGeometry(70, 0.2, 0.4), gold);
    rail.position.set(0, -0.75, -25.5);
    platform.add(rail);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(70, 0.6, 0.7), stone);
    wall.position.set(0, -1.1, -25.5);
    platform.add(wall);
    const postGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.0, 8);
    for (let i = -11; i <= 11; i++) {
      const p = new THREE.Mesh(postGeo, stone);
      p.position.set(i * 3, -1.1, -25.5);
      platform.add(p);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), gold);
      cap.position.set(i * 3, -0.5, -25.5);
      platform.add(cap);
    }

    // pillars
    const pillarGeo = new THREE.CylinderGeometry(1.25, 1.5, 90, 20);
    const bandGeo = new THREE.TorusGeometry(1.42, 0.16, 8, 24);
    [-4, -12, -20].forEach((z) => {
      [-17, 17].forEach((x) => {
        const p = new THREE.Mesh(pillarGeo, stone);
        p.position.set(x, 43, z);
        platform.add(p);
        this.pillars.push(p);
        for (let k = 0; k < 4; k++) {
          const b = new THREE.Mesh(bandGeo, gold);
          b.rotation.x = Math.PI / 2;
          b.position.set(x, -1 + k * 6 + 1, z);
          platform.add(b);
          this.shakeables.push(b);
        }
        this.shakeables.push(p);
      });
    });

    // legendary weapons planted around the throne room
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x0b0a10, roughness: 0.25, metalness: 1, emissive: 0x2a0410, emissiveIntensity: 0.8 });
    const bladeGeo = new THREE.BoxGeometry(0.8, 14, 0.12);
    const tipGeo = new THREE.ConeGeometry(0.57, 2.2, 4);
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * rand(7, 12);
      const z = -6 - Math.floor(i / 2) * 5 - rand(0, 2);
      const g = new THREE.Group();
      const b = new THREE.Mesh(bladeGeo, bladeMat);
      b.position.y = 7;
      g.add(b);
      const t = new THREE.Mesh(tipGeo, bladeMat);
      t.rotation.y = Math.PI / 4;
      t.scale.set(1, 1, 0.2);
      t.position.y = 15.1;
      g.add(t);
      const cg = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 0.4), gold);
      cg.position.y = 0.2;
      g.add(cg);
      g.position.set(x, -1.7, z);
      g.rotation.z = side * rand(0.0, 0.14);
      g.rotation.y = rand(-0.5, 0.5);
      platform.add(g);
    }

    // ---------- lights ----------
    this.hemi = new THREE.HemisphereLight(0x5a2d82, 0x14040c, 0.9);
    scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xff5060, 1.1);
    this.moon.position.set(-50, 33, -80);
    scene.add(this.moon);
    this.fxLight = new THREE.PointLight(0x9a40ff, 0, 140, 1.4);
    scene.add(this.fxLight);
  }

  update(dt: number, t: number, cam: THREE.Camera) {
    this.skyU.uTime.value = t;
    this.cloudU.uTime.value = t;
    this.groundU.uTime.value = t;
    this.cloudU.uCam.value.copy(cam.position);
    this.sky.position.copy(cam.position);
    void dt;
  }

  /** subtle architectural rumble */
  rumble(amount: number, t: number) {
    for (let i = 0; i < this.shakeables.length; i++) {
      const o = this.shakeables[i];
      if (o.userData.bx === undefined) {
        o.userData.bx = o.position.x;
        o.userData.bz = o.position.z;
      }
      o.position.x = o.userData.bx + Math.sin(t * 60 + i * 3.1) * amount * 0.05;
      o.position.z = o.userData.bz + Math.cos(t * 55 + i * 1.7) * amount * 0.05;
    }
  }
}
