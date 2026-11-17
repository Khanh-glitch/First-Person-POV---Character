import * as THREE from "three";
import { heartPath } from "./textures";

export const ARENA_R = 30;

export interface Env {
  update: (t: number) => void;
  sun: THREE.DirectionalLight;
  skyU: { uHaki: { value: number }; uTime: { value: number } };
  lanterns: THREE.Sprite[];
}

function floorTexture() {
  const s = 1024;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#cdb9a6";
  c.fillRect(0, 0, s, s);
  const cx = s / 2;
  // concentric tiled rings
  for (let r = 40; r < s / 2 + 200; r += 46) {
    const n = Math.floor((r * 2 * Math.PI) / 70);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 + (r % 92 ? 0.03 : 0);
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const l = 70 + Math.random() * 30;
      c.fillStyle = `hsl(${20 + Math.random() * 15},${18 + Math.random() * 12}%,${l * 0.85}%)`;
      c.beginPath();
      c.arc(cx, cx, r + 44, a0 + 0.004, a1 - 0.004);
      c.arc(cx, cx, r + 2, a1 - 0.004, a0 + 0.004, true);
      c.closePath();
      c.fill();
    }
  }
  // grime noise
  for (let i = 0; i < 9000; i++) {
    c.fillStyle = `rgba(${Math.random() < 0.5 ? "60,40,30" : "255,240,230"},${Math.random() * 0.06})`;
    const r = Math.random() * 6;
    c.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
  // emblem: original serpent ring + heart
  c.save();
  c.translate(cx, cx);
  c.strokeStyle = "#7a1530";
  c.lineWidth = 16;
  c.beginPath();
  c.arc(0, 0, 170, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = "#c79a3a";
  c.lineWidth = 5;
  c.beginPath();
  c.arc(0, 0, 186, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(0, 0, 154, 0, Math.PI * 2);
  c.stroke();
  // serpent scales along ring
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    c.fillStyle = i % 2 ? "#9b2040" : "#5d0d22";
    c.beginPath();
    c.ellipse(Math.cos(a) * 170, Math.sin(a) * 170, 9, 6, a, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = "#a3123b";
  heartPath(c, 0, 10, 220);
  c.fill();
  c.strokeStyle = "#e7c26a";
  c.lineWidth = 6;
  heartPath(c, 0, 10, 220);
  c.stroke();
  c.restore();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildEnv(scene: THREE.Scene, glowTex: THREE.Texture): Env {
  const skyU = { uHaki: { value: 0 }, uTime: { value: 0 } };
  const sunDir = new THREE.Vector3(-0.5, 0.18, -0.85).normalize();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { ...skyU, uSun: { value: sunDir } },
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vD; uniform vec3 uSun; uniform float uHaki; uniform float uTime;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
        float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}
        void main(){
          vec3 d = normalize(vD);
          float y = d.y;
          vec3 top = vec3(0.16,0.10,0.32);
          vec3 mid = vec3(0.95,0.42,0.48);
          vec3 hor = vec3(1.0,0.72,0.45);
          vec3 col = mix(hor, mid, smoothstep(0.0,0.18,y));
          col = mix(col, top, smoothstep(0.15,0.65,y));
          col = mix(col, vec3(0.45,0.22,0.35), (1.0 - smoothstep(-0.2,0.0,y)));
          float sd = max(dot(d,uSun),0.0);
          col += vec3(1.0,0.6,0.35)*pow(sd,8.0)*0.6 + vec3(1.0,0.9,0.7)*pow(sd,900.0)*8.0;
          // clouds
          vec2 cp = d.xz/(y+0.12)*1.4 + vec2(uTime*0.01,0.0);
          float cl = smoothstep(0.5,0.85,fbm(cp));
          vec3 cc = mix(vec3(0.55,0.25,0.4), vec3(1.0,0.65,0.55), pow(sd,3.0)+0.2);
          col = mix(col, cc, cl*smoothstep(0.02,0.25,y)*0.85);
          // haki: blood sky
          vec3 hk = mix(vec3(0.02,0.0,0.01), vec3(0.6,0.0,0.05), smoothstep(-0.1,0.4,fbm(cp*2.0+uTime*0.3))) ;
          col = mix(col, hk, uHaki);
          gl_FragColor = vec4(col,1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  // Ocean
  const oceanU = { uTime: { value: 0 }, uSun: { value: sunDir }, uHaki: skyU.uHaki };
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400, 200, 200).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: { ...oceanU },
      vertexShader: /* glsl */ `
        uniform float uTime; varying vec3 vW; varying vec3 vN;
        vec3 wave(vec2 p){
          float h = 0.0; vec2 g = vec2(0.0);
          for(int i=0;i<4;i++){
            float fi=float(i); vec2 dir = normalize(vec2(cos(fi*1.7+0.3), sin(fi*2.3+0.7)));
            float fr = 0.05*pow(1.8,fi); float am = 0.9/pow(1.9,fi);
            float ph = dot(dir,p)*fr + uTime*(0.8+fi*0.35);
            h += sin(ph)*am; g += dir*cos(ph)*am*fr;
          }
          return vec3(h,g);
        }
        void main(){
          vec4 w = modelMatrix*vec4(position,1.0);
          vec3 wv = wave(w.xz);
          float fall = smoothstep(30.0, 60.0, length(w.xz));
          w.y += wv.x * fall;
          vN = normalize(vec3(-wv.y*fall, 1.0, -wv.z*fall));
          vW = w.xyz;
          gl_Position = projectionMatrix*viewMatrix*w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uHaki; varying vec3 vW; varying vec3 vN;
        void main(){
          vec3 v = normalize(cameraPosition - vW);
          vec3 n = normalize(vN);
          float fres = pow(1.0 - max(dot(n,v),0.0), 4.0);
          vec3 deep = vec3(0.05,0.12,0.25);
          vec3 skyc = vec3(1.0,0.55,0.5);
          vec3 col = mix(deep, skyc, fres*0.9+0.08);
          vec3 r = reflect(-v, n);
          col += vec3(1.0,0.75,0.5)*pow(max(dot(r,uSun),0.0), 180.0)*6.0;
          col += vec3(1.0,0.5,0.4)*pow(max(dot(r,uSun),0.0), 12.0)*0.35;
          float dist = length(vW.xz - cameraPosition.xz);
          col = mix(col, vec3(1.0,0.66,0.5), smoothstep(150.0, 900.0, dist));
          col = mix(col, vec3(0.08,0.0,0.01) + vec3(0.5,0.0,0.03)*fres, uHaki);
          gl_FragColor = vec4(col,1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  ocean.position.y = -2.5;
  scene.add(ocean);

  // Arena floor
  const floorTex = floorTexture();
  const floor = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA_R + 3, ARENA_R + 5, 3, 96, 1),
    [
      new THREE.MeshStandardMaterial({ color: 0x8a6d5c, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75, metalness: 0.05 }),
      new THREE.MeshStandardMaterial({ color: 0x5a4438 }),
    ]
  );
  floor.position.y = -1.5;
  floor.receiveShadow = true;
  scene.add(floor);
  // gold trim ring
  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(ARENA_R + 3, 0.18, 8, 120).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffc94d, metalness: 1, roughness: 0.3 })
  );
  trim.position.y = 0.02;
  scene.add(trim);

  // Pillars ring
  const pillarM = new THREE.MeshStandardMaterial({ color: 0xe8dccf, roughness: 0.55 });
  const goldM = new THREE.MeshStandardMaterial({ color: 0xd9a63a, metalness: 1, roughness: 0.3 });
  const clothM = new THREE.MeshStandardMaterial({ color: 0xa3123b, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x300010 });
  const shaft = new THREE.CylinderGeometry(0.75, 0.9, 11, 16);
  const cap = new THREE.BoxGeometry(2.2, 0.6, 2.2);
  const lanterns: THREE.Sprite[] = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = ARENA_R + 2;
    const g = new THREE.Group();
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const s = new THREE.Mesh(shaft, pillarM);
    s.position.y = 5.5;
    s.castShadow = true;
    const c1 = new THREE.Mesh(cap, goldM);
    c1.position.y = 11.2;
    const c0 = new THREE.Mesh(cap, pillarM);
    c0.position.y = 0.3;
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 6, 1, 8), clothM);
    const bannerHolder = new THREE.Group();
    bannerHolder.add(banner);
    banner.position.set(0, 7.2, 0.95);
    bannerHolder.rotation.y = Math.atan2(-g.position.x, -g.position.z);
    g.add(s, c1, c0, bannerHolder);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff6aa8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    lamp.position.y = 12.3;
    lamp.scale.setScalar(4);
    g.add(lamp);
    lanterns.push(lamp);
    scene.add(g);
  }

  // distant mountains / cliffs
  const mtM = new THREE.MeshStandardMaterial({ color: 0x4a2a48, roughness: 1, flatShading: true });
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 220 + Math.random() * 380;
    const h = 40 + Math.random() * 140;
    const m = new THREE.Mesh(new THREE.ConeGeometry(20 + Math.random() * 50, h, 6 + Math.floor(Math.random() * 3)), mtM);
    m.position.set(Math.cos(a) * d, h / 2 - 6, Math.sin(a) * d);
    m.rotation.y = Math.random() * 3;
    scene.add(m);
  }

  // Lights
  scene.add(new THREE.HemisphereLight(0xffc0d0, 0x40203a, 0.9));
  const sun = new THREE.DirectionalLight(0xffc49a, 2.6);
  sun.position.copy(sunDir).multiplyScalar(60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -40;
  sc.right = sc.top = 40;
  sc.far = 200;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0xff5fa0, 1.0);
  rim.position.set(30, 20, 40);
  scene.add(rim);

  scene.fog = new THREE.Fog(0xf2a08a, 60, 600);

  return {
    sun,
    skyU,
    lanterns,
    update: (t: number) => {
      skyU.uTime.value = t;
      oceanU.uTime.value = t;
      lanterns.forEach((l, i) => l.scale.setScalar(3.6 + Math.sin(t * 3 + i) * 0.4));
    },
  };
}
