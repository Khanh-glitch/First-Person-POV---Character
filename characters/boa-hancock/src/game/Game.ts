import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Particles } from "./particles";
import { makeGlowTexture, makeHeartTexture, makePetalTexture, makeRingTexture, makeSparkTexture, heartGeometry } from "./textures";
import { buildEnv, ARENA_R, type Env } from "./env";
import { Enemy, type EnemyKind } from "./enemy";
import { ViewModel } from "./viewmodel";
import { FinalShader } from "./post";
import { sfx } from "./audio";

export type Skill = "kiss" | "arrow" | "mellow" | "kick" | "haki";
export type Mode = "survival" | "sandbox";
export const CD_MAX: Record<Skill, number> = { kiss: 0.12, arrow: 1.4, mellow: 9, kick: 2.6, haki: 0 };

export interface HudState {
  hp: number;
  love: number;
  score: number;
  combo: number;
  comboT: number;
  wave: number;
  statues: number;
  kills: number;
  cds: Record<Skill, number>;
  charge: number;
  enemies: number;
  mode: Mode;
}
export interface Callout {
  jp: string;
  en: string;
  sub: string;
  color: string;
  id: number;
}
export interface GameEvents {
  hud: (h: HudState) => void;
  callout: (c: Callout) => void;
  wave: (n: number) => void;
  hit: () => void;
  hurt: () => void;
  lock: (locked: boolean) => void;
  over: (h: HudState) => void;
}

interface Proj {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  life: number;
  kind: "kiss" | "arrow";
  target: Enemy | null;
  delay: number;
}
interface Wave {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  t: number;
  hit: Set<Enemy>;
}
interface Fx {
  obj: THREE.Object3D;
  t: number;
  life: number;
  upd: (k: number, o: THREE.Object3D) => void;
  dispose?: boolean;
}
interface Bullet {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const tmp = V(),
  tmp2 = V(),
  tmp3 = V();
const UP = new THREE.Vector3(0, 1, 0);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const PINK = new THREE.Color(1, 0.3, 0.62);
const HOT = new THREE.Color(1, 0.55, 0.8);
const WHITE = new THREE.Color(1, 0.92, 0.96);

export class Game {
  canvas: HTMLCanvasElement;
  ev: GameEvents;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  final: ShaderPass;
  env: Env;
  vm: ViewModel;
  sparks: Particles;
  hearts: Particles;
  petals: Particles;
  glowTex: THREE.Texture;
  ringTex: THREE.Texture;
  heartGeo: THREE.BufferGeometry;
  smallHeartGeo: THREE.BufferGeometry;
  projMat: THREE.MeshBasicMaterial;

  // heart barrage (instanced)
  barrage: THREE.InstancedMesh;
  bData: { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; s: number; spin: number; rot: number }[] = [];
  bCursor = 0;

  // debris
  debris: THREE.InstancedMesh;
  dData: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; rv: THREE.Vector3; s: number; life: number }[] = [];
  dCursor = 0;

  beam: THREE.Group;
  beamMats: THREE.ShaderMaterial[] = [];
  slash: THREE.Mesh;

  enemies: Enemy[] = [];
  projs: Proj[] = [];
  waves: Wave[] = [];
  fxs: Fx[] = [];
  bullets: Bullet[] = [];

  // player
  pos = new THREE.Vector3(0, 0, 8);
  velY = 0;
  yaw = 0;
  pitch = 0;
  hp = 100;
  love = 0;
  score = 0;
  combo = 0;
  comboT = 0;
  kills = 0;
  statues = 0;
  wave = 0;
  waveQueue: EnemyKind[] = [];
  spawnT = 0;
  waveDelay = 2;
  lastHurt = 0;
  mode: Mode = "survival";
  cds: Record<Skill, number> = { kiss: 0, arrow: 0, mellow: 0, kick: 0, haki: 0 };

  action: { name: string; t: number; fired: number } | null = null;
  charge = 0;
  chargeTick = 0;
  keys = new Set<string>();
  mouse = { l: false, r: false, dx: 0, dy: 0 };
  locked = false;
  running = false;
  attract = true;
  over = false;

  // feel
  trauma = 0;
  fovKick = 0;
  hitStop = 0;
  timeScale = 1;
  time = 0;
  hurtFx = 0;
  flash = 0;
  flashCol = new THREE.Color();
  bob = 0;
  roll = 0;
  hakiFx = 0;
  invert = 0;
  linesFx = 0;
  radialFx = 0;
  loveFx = 0;
  aim = new THREE.Vector3();
  clock = new THREE.Clock();
  raf = 0;
  hudT = 0;
  calloutId = 0;
  disposed = false;

  constructor(canvas: HTMLCanvasElement, ev: GameEvents) {
    this.canvas = canvas;
    this.ev = ev;
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.02, 2500);
    this.scene.add(this.camera);

    this.glowTex = makeGlowTexture();
    this.ringTex = makeRingTexture();
    this.env = buildEnv(this.scene, this.glowTex);
    this.sparks = new Particles(5000, makeSparkTexture());
    this.hearts = new Particles(3000, makeHeartTexture());
    this.petals = new Particles(900, makePetalTexture(), THREE.NormalBlending);
    this.scene.add(this.sparks.points, this.hearts.points, this.petals.points);
    this.heartGeo = heartGeometry(1, 0.3);
    this.smallHeartGeo = heartGeometry(0.35, 0.35);
    this.projMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.7, 1.6), toneMapped: false });

    this.vm = new ViewModel(this.glowTex);
    this.camera.add(this.vm.group);

    // barrage
    const BN = 260;
    this.barrage = new THREE.InstancedMesh(this.heartGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), BN);
    this.barrage.frustumCulled = false;
    const m4 = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < BN; i++) {
      this.barrage.setMatrixAt(i, m4);
      this.barrage.setColorAt(i, new THREE.Color(2.5, 0.5, 1.3));
      this.bData.push({ p: V(), v: V(), life: 0, max: 1, s: 1, spin: 0, rot: 0 });
    }
    this.scene.add(this.barrage);

    // debris
    const DN = 700;
    this.debris = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0x9a948e, roughness: 0.95, flatShading: true }),
      DN
    );
    this.debris.castShadow = true;
    this.debris.frustumCulled = false;
    for (let i = 0; i < DN; i++) {
      this.debris.setMatrixAt(i, m4);
      this.dData.push({ p: V(), v: V(), r: new THREE.Euler(), rv: V(), s: 0, life: 0 });
    }
    this.scene.add(this.debris);

    // Mellow beam (camera space)
    this.beam = new THREE.Group();
    const mkBeam = (rNear: number, rFar: number, colA: THREE.Color, colB: THREE.Color, speed: number) => {
      const g = new THREE.CylinderGeometry(rFar, rNear, 62, 48, 24, true).translate(0, 31, 0).rotateX(-Math.PI / 2);
      const m = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uI: { value: 0 }, uA: { value: colA }, uB: { value: colB }, uSpeed: { value: speed } },
        vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=-mv.xyz; gl_Position=projectionMatrix*mv; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uI, uSpeed; uniform vec3 uA, uB; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){
            float f = abs(dot(normalize(vN), normalize(vV)));
            float edge = pow(f, 1.6);
            float sw = sin(vUv.x*6.2832*4.0 + vUv.y*30.0 - uTime*uSpeed*0.6);
            float st = 0.5 + 0.5*sin(vUv.y*90.0 - uTime*uSpeed + sw*1.5);
            float fade = smoothstep(0.0, 0.02, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
            vec3 c = mix(uA, uB, edge*edge) * (0.55 + st*0.7);
            gl_FragColor = vec4(c * uI * fade * (0.15 + edge), 1.0);
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.beamMats.push(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.frustumCulled = false;
      return mesh;
    };
    this.beam.add(mkBeam(0.25, 7.2, new THREE.Color(1.6, 0.25, 0.8), new THREE.Color(2.4, 1.2, 1.8), 50));
    this.beam.add(mkBeam(0.08, 2.8, new THREE.Color(2.5, 0.8, 1.6), new THREE.Color(4, 3.4, 3.8), 80));
    this.beam.position.set(0, -0.08, -0.45);
    this.beam.visible = false;
    this.camera.add(this.beam);

    // Kick slash arc (camera space)
    this.slash = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 2.0, 64, 1, 0.2, Math.PI - 0.4),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.9, 1.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    this.slash.position.set(0, -0.4, -1.6);
    this.slash.visible = false;
    this.camera.add(this.slash);

    // post
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.9, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.final);
    this.composer.addPass(new OutputPass());

    this.bindInput();
    window.addEventListener("resize", this.onResize);
    this.clock.start();
    this.loop();
  }

  // ---------------- input ----------------
  bindInput() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("contextmenu", this.onCtx);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }
  onCtx = (e: Event) => e.preventDefault();
  onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (!this.running || !this.locked) return;
    if (e.code === "KeyQ") this.tryMellow();
    if (e.code === "KeyE") this.tryKick();
    if (e.code === "KeyR") this.tryHaki();
    if (e.code === "Space" && this.pos.y <= 0.001) this.velY = 7.5;
  };
  onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  onMouseDown = (e: MouseEvent) => {
    if (!this.running || !this.locked) return;
    if (e.button === 0) this.mouse.l = true;
    if (e.button === 2) {
      this.mouse.r = true;
      this.tryArrowStart();
    }
  };
  onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouse.l = false;
    if (e.button === 2) {
      this.mouse.r = false;
      if (this.action?.name === "arrowCharge") this.releaseArrows();
    }
  };
  onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return;
    this.mouse.dx += e.movementX;
    this.mouse.dy += e.movementY;
  };
  onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    this.ev.lock(this.locked);
    if (!this.locked) {
      this.mouse.l = this.mouse.r = false;
      this.keys.clear();
    }
  };
  requestLock() {
    this.canvas.requestPointerLock?.();
  }
  onResize = () => {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.sparks.resize();
    this.hearts.resize();
    this.petals.resize();
  };

  // ---------------- lifecycle ----------------
  start(mode: Mode) {
    this.mode = mode;
    for (const e of this.enemies) this.removeEnemy(e);
    this.enemies = [];
    this.pos.set(0, 0, 8);
    this.yaw = 0;
    this.pitch = 0;
    this.hp = 100;
    this.love = mode === "sandbox" ? 100 : 0;
    this.score = this.combo = this.kills = this.statues = 0;
    this.wave = 0;
    this.waveQueue = [];
    this.waveDelay = 1.5;
    this.over = false;
    this.timeScale = 1;
    this.hitStop = 0;
    this.hakiFx = 0;
    this.beam.visible = false;
    this.vm.heartTarget = 0;
    this.vm.bowTarget = 0;
    this.projs.forEach((p) => this.scene.remove(p.mesh));
    this.projs = [];
    this.bullets.forEach((b) => this.scene.remove(b.mesh));
    this.bullets = [];
    this.attract = false;
    this.running = true;
    this.action = null;
    (Object.keys(this.cds) as Skill[]).forEach((k) => (this.cds[k] = 0));
    sfx.init();
    sfx.startMusic();
    this.requestLock();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("contextmenu", this.onCtx);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    sfx.stopMusic();
    this.renderer.dispose();
  }

  // ---------------- helpers ----------------
  shake(a: number) {
    this.trauma = Math.min(1.2, this.trauma + a);
  }
  doFlash(c: THREE.Color | number, a: number) {
    this.flashCol.set(c as THREE.Color);
    this.flash = Math.max(this.flash, a);
  }
  callout(jp: string, en: string, sub: string, color: string) {
    this.ev.callout({ jp, en, sub, color, id: ++this.calloutId });
  }
  handWorld(which: "R" | "L", out: THREE.Vector3) {
    const arm = which === "R" ? this.vm.R : this.vm.L;
    return arm.wrist.localToWorld(out.set(0, 0, -0.08));
  }
  eyePos(out: THREE.Vector3) {
    return this.camera.getWorldPosition(out);
  }
  enemyCenter(e: Enemy, out: THREE.Vector3) {
    return out.copy(e.root.position).setY(e.root.position.y + e.height * 0.58);
  }
  burst(p: THREE.Vector3, n: number, speed: number, color: THREE.Color | number, size = 0.25, life = 0.8, kind: "spark" | "heart" = "spark", gravity = 0) {
    const sys = kind === "heart" ? this.hearts : this.sparks;
    for (let i = 0; i < n; i++) {
      tmp3.randomDirection().multiplyScalar(speed * rand(0.3, 1));
      sys.emit({ pos: p, vel: tmp3, color, size: size * rand(0.6, 1.3), sizeEnd: 0, life: life * rand(0.6, 1.2), drag: 2.5, gravity, spin: kind === "heart" ? rand(-4, 4) : 0 });
    }
  }
  converge(p: THREE.Vector3, n: number, radius: number, color: THREE.Color | number, kind: "spark" | "heart" = "spark") {
    const sys = kind === "heart" ? this.hearts : this.sparks;
    for (let i = 0; i < n; i++) {
      tmp3.randomDirection().multiplyScalar(radius * rand(0.5, 1)).add(p);
      tmp2.subVectors(p, tmp3).multiplyScalar(3.2);
      sys.emit({ pos: tmp3, vel: tmp2, color, size: rand(0.02, 0.06), sizeEnd: 0.005, life: 0.3, alpha: 1 });
    }
  }
  emitBarrage(p: THREE.Vector3, v: THREE.Vector3, s: number, life: number, col?: THREE.Color) {
    const d = this.bData[this.bCursor];
    d.p.copy(p);
    d.v.copy(v);
    d.life = d.max = life;
    d.s = s;
    d.spin = rand(-3, 3);
    d.rot = rand(-0.4, 0.4);
    if (col) this.barrage.setColorAt(this.bCursor, col);
    this.bCursor = (this.bCursor + 1) % this.bData.length;
  }
  ringFx(p: THREE.Vector3, normal: THREE.Vector3, color: THREE.Color, maxScale: number, life: number, blending: THREE.Blending = THREE.AdditiveBlending) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.ringTex, color, transparent: true, blending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    );
    m.position.copy(p);
    m.lookAt(tmp.copy(p).add(normal));
    this.scene.add(m);
    this.fxs.push({
      obj: m,
      t: 0,
      life,
      dispose: true,
      upd: (k, o) => {
        const e = 1 - Math.pow(1 - k, 3);
        o.scale.setScalar(0.2 + e * maxScale);
        ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k;
      },
    });
  }
  bolt(from: THREE.Vector3, to: THREE.Vector3, radius: number, color: THREE.Color, life: number, black = false) {
    const pts: THREE.Vector3[] = [];
    const n = 10;
    const len = from.distanceTo(to);
    for (let i = 0; i <= n; i++) {
      const p = V().lerpVectors(from, to, i / n);
      if (i > 0 && i < n) p.add(tmp.randomDirection().multiplyScalar(len * 0.07));
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, 30, radius, 5, false);
    const grp = new THREE.Group();
    const glow = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    grp.add(glow);
    if (black) {
      const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, radius * 0.45, 5, false), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true }));
      grp.add(core);
    }
    this.scene.add(grp);
    this.fxs.push({
      obj: grp,
      t: 0,
      life,
      dispose: true,
      upd: (k, o) => {
        o.children.forEach((c) => (((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = Math.random() < 0.3 ? 0.2 : 1 - k));
      },
    });
  }

  // ---------------- skills ----------------
  busy() {
    return this.action !== null;
  }
  cdMul() {
    return this.mode === "sandbox" ? 0.25 : 1;
  }

  tryKiss() {
    if (this.busy() || this.cds.kiss > 0) return;
    this.action = { name: "kiss", t: 0, fired: 0 };
    this.vm.setPose("kissPrep", 22);
  }

  tryArrowStart() {
    if (this.busy() || this.cds.arrow > 0) return;
    this.action = { name: "arrowCharge", t: 0, fired: 0 };
    this.charge = 0;
    this.vm.setPose("arrowDraw", 14);
    this.vm.bowTarget = 0.35;
    sfx.whoosh();
  }

  releaseArrows() {
    const c = this.charge;
    const n = Math.round(5 + c * 25);
    this.action = { name: "arrowRelease", t: 0, fired: 0 };
    this.vm.setPose("arrowRelease", 30);
    this.vm.bowTarget = 0;
    this.cds.arrow = CD_MAX.arrow * this.cdMul();
    const eye = this.eyePos(V());
    const start = this.vm.bowHeart.getWorldPosition(V());
    // targets: enemies in front
    const cands = this.enemies
      .filter((e) => e.charmable || e.state === "stone")
      .map((e) => {
        this.enemyCenter(e, tmp);
        const d = tmp.clone().sub(eye);
        const dist = d.length();
        const dot = d.normalize().dot(this.aim);
        return { e, dot, dist };
      })
      .filter((o) => o.dot > 0.55 && o.dist < 70 && o.e.charmable)
      .sort((a, b) => b.dot - a.dot);
    const right = tmp2.crossVectors(this.aim, UP).normalize().clone();
    for (let i = 0; i < n; i++) {
      const spread = (i / Math.max(1, n - 1) - 0.5) * 2;
      const vel = this.aim
        .clone()
        .multiplyScalar(30)
        .addScaledVector(right, spread * (8 + c * 10))
        .addScaledVector(UP, rand(2, 7 + c * 6));
      const mesh = this.makeArrowMesh();
      mesh.position.copy(start);
      this.scene.add(mesh);
      this.projs.push({ mesh, vel, life: 2.4, kind: "arrow", target: cands.length ? cands[i % cands.length].e : null, delay: i * 0.012 });
    }
    sfx.arrowRelease(n);
    this.burst(start, 50 + c * 80, 9, HOT, 0.12, 0.6);
    this.burst(start, 20 + c * 20, 6, PINK, 0.18, 0.9, "heart");
    this.ringFx(start, this.aim, new THREE.Color(3, 0.8, 1.8), 3 + c * 4, 0.45);
    this.shake(0.25 + c * 0.35);
    this.fovKick += 4 + c * 6;
    this.vm.recoil = 0.6 + c;
    if (c > 0.4) this.callout("虜の矢", "SLAVE ARROW", `${n} mũi tên trái tim`, "#ff4f9a");
  }

  makeArrowMesh() {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.1, 5).rotateX(Math.PI / 2).translate(0, 0, 0.55), this.projMat);
    const tip = new THREE.Mesh(this.smallHeartGeo, this.projMat);
    tip.scale.setScalar(0.7);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff4f9a, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(0.9);
    g.add(shaft, tip, glow);
    return g;
  }

  tryMellow() {
    if (this.busy() || this.cds.mellow > 0) return;
    this.action = { name: "mellow", t: 0, fired: 0 };
    this.vm.setPose("heart", 9);
    this.vm.heartTarget = 1;
    sfx.mellowCharge();
    sfx.duckMusic(0.3, 4);
    this.callout("メロメロ甘風", "MERO MERO MELLOW", "Ai mà chẳng say đắm… sẽ hóa đá", "#ff3f8e");
  }

  tryKick() {
    if (this.busy() || this.cds.kick > 0) return;
    this.action = { name: "kick", t: 0, fired: 0 };
    this.vm.setPose("kick", 18);
    this.vm.startKick();
    sfx.whoosh();
    this.cds.kick = CD_MAX.kick * this.cdMul();
    this.callout("芳香脚", "PERFUME FEMUR", "Đôi chân đẹp nhất thế gian", "#ff6fb0");
  }

  tryHaki() {
    if (this.busy() || this.love < 100) return;
    this.action = { name: "haki", t: 0, fired: 0 };
    this.vm.setPose("haki", 8);
    if (this.mode !== "sandbox") this.love = 0;
    sfx.duckMusic(0.05, 4);
    this.callout("覇王色の覇気", "HAOSHOKU HAKI", "Quỳ xuống trước Nữ Đế!", "#ff2540");
  }

  // ---------------- charm / petrify ----------------
  charmEnemy(e: Enemy, amt: number, source: "kiss" | "arrow" | "mellow" | "kick" | "haki") {
    if (e.state === "stone") {
      if (source === "kick" || source === "haki") this.shatter(e);
      else {
        this.enemyCenter(e, tmp);
        this.burst(tmp, 6, 3, 0xbbb5ae, 0.1, 0.4, "spark", 6);
      }
      return;
    }
    if (!e.charmable) return;
    e.charm += amt;
    e.u.uFlash.value = 1;
    e.u.uLove.value = Math.min(1, e.u.uLove.value + 0.5);
    this.ev.hit();
    if (e.charm >= e.charmMax) {
      if (e.state !== "love") {
        e.state = "love";
        e.stateT = 0;
        e.animSpeed = 1;
        sfx.enemyGasp();
        this.enemyCenter(e, tmp);
        tmp.y += e.height * 0.35;
        this.burst(tmp, 14, 3, PINK, 0.35, 1.2, "heart", -1.5);
      }
    }
  }

  startPetrify(e: Enemy) {
    e.state = "petrifying";
    e.stateT = 0;
    sfx.petrify();
  }

  finishPetrify(e: Enemy) {
    e.state = "stone";
    e.stoneTimer = 0;
    e.u.uPetrify.value = 1;
    e.u.uLove.value = 0;
    this.statues++;
    this.kills++;
    this.addCombo();
    this.score += Math.round((e.kind === "giant" ? 1000 : 100) * this.mult());
    this.love = Math.min(100, this.love + (e.kind === "giant" ? 30 : 7));
    this.enemyCenter(e, tmp);
    this.burst(tmp, 30, 5, WHITE, 0.15, 0.7);
    this.burst(tmp, 8, 2.5, 0xb8b0a8, 0.25, 1.2, "spark", 4);
  }

  shatter(e: Enemy) {
    if (e.state === "dead") return;
    const wasStone = e.state === "stone";
    e.state = "dead";
    sfx.shatter();
    const n = e.kind === "giant" ? 70 : 28;
    const c = this.enemyCenter(e, V());
    for (let i = 0; i < n; i++) {
      const d = this.dData[this.dCursor];
      this.dCursor = (this.dCursor + 1) % this.dData.length;
      d.p.set(c.x + rand(-0.3, 0.3) * e.scale, e.root.position.y + rand(0.1, e.height), c.z + rand(-0.3, 0.3) * e.scale);
      tmp.subVectors(d.p, this.pos).setY(0).normalize();
      d.v.set(rand(-4, 4), rand(2, 9), rand(-4, 4)).addScaledVector(tmp, rand(4, 12));
      d.r.set(rand(0, 6), rand(0, 6), rand(0, 6));
      d.rv.set(rand(-10, 10), rand(-10, 10), rand(-10, 10));
      d.s = rand(0.06, 0.2) * e.scale;
      d.life = rand(2.5, 4);
    }
    this.burst(c, 40, 8, 0xd8d0c8, 0.3, 0.9, "spark", 5);
    this.burst(c, 25, 7, PINK, 0.3, 1.0, "heart", 2);
    this.ringFx(tmp.copy(e.root.position).setY(0.05), UP, new THREE.Color(1.5, 0.6, 1), 5 * e.scale, 0.5);
    if (wasStone) {
      this.score += Math.round(50 * this.mult());
      this.addCombo();
    }
    this.removeEnemy(e);
  }

  removeEnemy(e: Enemy) {
    this.scene.remove(e.root);
    e.mats.forEach((m) => m.dispose());
    if (e.state !== "dead") e.state = "dead";
  }

  addCombo() {
    this.combo++;
    this.comboT = 3.5;
  }
  mult() {
    return 1 + Math.floor(this.combo / 5) * 0.5;
  }

  hurt(dmg: number) {
    if (this.mode === "sandbox" || this.over) return;
    this.hp -= dmg;
    this.lastHurt = this.time;
    this.hurtFx = 1;
    this.shake(0.35);
    sfx.hurt();
    this.ev.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.over = true;
      this.running = false;
      this.timeScale = 0.2;
      document.exitPointerLock?.();
      setTimeout(() => this.ev.over(this.hudState()), 900);
    }
  }

  // ---------------- waves ----------------
  nextWave() {
    this.wave++;
    const w = this.wave;
    const q: EnemyKind[] = [];
    const n = 4 + w * 2;
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (w >= 2 && r < 0.22) q.push("gunner");
      else if (r < 0.6) q.push("marine");
      else q.push("pirate");
    }
    if (w >= 3) for (let i = 0; i < Math.floor((w - 1) / 2); i++) q.push("giant");
    this.waveQueue = q.sort(() => Math.random() - 0.5);
    this.ev.wave(w);
    sfx.ui();
  }

  spawnEnemy(kind: EnemyKind) {
    const e = new Enemy(kind);
    const a = this.yaw + Math.PI + rand(-1.6, 1.6) + (Math.random() < 0.3 ? Math.PI : 0);
    // spawn in front-ish hemisphere relative to view
    const fwd = Math.atan2(-this.aim.x, -this.aim.z);
    const ang = Math.random() < 0.75 ? fwd + rand(-1.1, 1.1) : a;
    const r = ARENA_R - 2;
    const p = V(-Math.sin(ang) * r, 0, -Math.cos(ang) * r);
    e.setSpawn(p);
    e.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.scene.add(e.root);
    this.enemies.push(e);
    // dark portal spawn fx
    this.burst(tmp.copy(p).setY(1), 30, 4, 0x4a1030, 0.6, 1.0, "spark", -2);
    this.ringFx(tmp.copy(p).setY(0.05), UP, new THREE.Color(0.8, 0.1, 0.3), 3 * e.scale, 0.6);
  }

  // ---------------- main loop ----------------
  loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const raw = Math.min(this.clock.getDelta(), 0.05);
    let pdt = raw;
    if (this.hitStop > 0) {
      this.hitStop -= raw;
      pdt = raw * 0.08;
    }
    const wdt = pdt * this.timeScale;
    this.time += raw;
    this.update(pdt, wdt, raw);
    this.composer.render();
  };

  update(pdt: number, wdt: number, raw: number) {
    const t = this.time;
    this.env.update(t);
    const active = this.running && this.locked;

    // camera orientation
    if (this.attract) {
      this.yaw = t * 0.08;
      this.pitch = 0.08 + Math.sin(t * 0.3) * 0.05;
      this.pos.set(Math.sin(t * 0.08) * 10, 0, Math.cos(t * 0.08) * 10);
    } else if (this.locked) {
      this.yaw -= this.mouse.dx * 0.0022;
      this.pitch -= this.mouse.dy * 0.0022;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    }
    const mdx = this.mouse.dx,
      mdy = this.mouse.dy;
    this.mouse.dx = this.mouse.dy = 0;

    // movement
    let moving = 0;
    if (active && !this.attract) {
      const f = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
      const s = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
      const sprint = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
      let sp = sprint ? 12 : 7.5;
      if (this.action?.name === "mellow") sp *= 0.25;
      if (this.action?.name === "arrowCharge") sp *= 0.55;
      const fx = -Math.sin(this.yaw),
        fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw),
        rz = -Math.sin(this.yaw);
      const len = Math.hypot(f, s) || 1;
      if (f || s) moving = sprint ? 1.4 : 1;
      this.pos.x += ((fx * f + rx * s) / len) * sp * pdt;
      this.pos.z += ((fz * f + rz * s) / len) * sp * pdt;
      this.roll += (-s * 0.025 - this.roll) * Math.min(1, pdt * 6);
      this.velY -= 20 * pdt;
      this.pos.y += this.velY * pdt;
      if (this.pos.y < 0) {
        if (this.velY < -8) this.shake(0.1);
        this.pos.y = 0;
        this.velY = 0;
      }
      const r = Math.hypot(this.pos.x, this.pos.z);
      if (r > ARENA_R) {
        this.pos.x *= ARENA_R / r;
        this.pos.z *= ARENA_R / r;
      }
    }

    // feel decay
    this.trauma = Math.max(0, this.trauma - raw * 1.6);
    this.fovKick *= Math.exp(-raw * 5);
    this.hurtFx = Math.max(0, this.hurtFx - raw * 1.5);
    this.flash = Math.max(0, this.flash - raw * 4);
    this.invert = Math.max(0, this.invert - raw * 8);

    const sh = this.trauma * this.trauma;
    const cam = this.camera;
    this.bob += pdt * moving * 9;
    cam.position.set(
      this.pos.x + (Math.random() - 0.5) * sh * 0.25,
      this.pos.y + 1.8 + Math.sin(this.bob * 2) * 0.04 * Math.min(moving, 1) + (Math.random() - 0.5) * sh * 0.25,
      this.pos.z + (Math.random() - 0.5) * sh * 0.25
    );
    cam.rotation.set(this.pitch + (Math.random() - 0.5) * sh * 0.06, this.yaw + (Math.random() - 0.5) * sh * 0.06, this.roll + (Math.random() - 0.5) * sh * 0.08, "YXZ");
    cam.fov = 72 + this.fovKick + moving * 3;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    cam.getWorldDirection(this.aim);

    // regen
    if (this.running && this.mode === "survival" && t - this.lastHurt > 4) this.hp = Math.min(100, this.hp + 3 * pdt);
    if (this.mode === "sandbox") this.love = 100;

    // cooldowns
    (Object.keys(this.cds) as Skill[]).forEach((k) => (this.cds[k] = Math.max(0, this.cds[k] - pdt)));
    if (this.comboT > 0) {
      this.comboT -= pdt;
      if (this.comboT <= 0) this.combo = 0;
    }

    if (active && this.mouse.l && !this.attract) this.tryKiss();
    this.updateAction(pdt);
    this.vm.update(pdt, t, moving, mdx, mdy);
    this.vm.group.visible = !this.attract;

    // waves
    if (this.running && !this.attract && this.locked) {
      const alive = this.enemies.filter((e) => e.state !== "stone" && e.state !== "dead" && e.state !== "faint").length;
      if (this.waveQueue.length) {
        this.spawnT -= wdt;
        if (this.spawnT <= 0 && alive < 18) {
          this.spawnEnemy(this.waveQueue.pop()!);
          this.spawnT = rand(0.35, 0.9);
        }
      } else if (alive === 0) {
        this.waveDelay -= wdt;
        if (this.waveDelay <= 0) {
          this.nextWave();
          this.waveDelay = 3;
        }
      }
    }

    this.updateEnemies(wdt);
    this.updateProjectiles(wdt);
    this.updateFx(wdt, pdt);

    // ambient petals
    for (let i = 0; i < 2; i++) {
      if (Math.random() < 0.6) {
        tmp.set(this.pos.x + rand(-25, 25), rand(2, 14), this.pos.z + rand(-25, 25));
        this.petals.emit({ pos: tmp, vel: tmp2.set(rand(1, 2.5), rand(-0.6, -0.2), rand(-0.5, 0.5)), size: rand(0.12, 0.22), sizeEnd: 0.1, life: rand(5, 8), spin: rand(-3, 3), color: 0xffffff, alpha: 0.95 });
      }
    }
    this.sparks.update(wdt);
    this.hearts.update(wdt);
    this.petals.update(wdt);

    // post uniforms
    const u = this.final.uniforms;
    u.uTime.value = t;
    u.uAberr.value = 0.0015 + sh * 0.02 + this.radialFx * 0.01 + this.hakiFx * 0.008;
    u.uRadial.value = this.radialFx;
    u.uLines.value = Math.min(1, this.linesFx + (moving > 1 ? 0.25 : 0));
    u.uHaki.value = this.hakiFx;
    u.uInvert.value = this.invert;
    u.uHurt.value = Math.max(this.hurtFx * 0.8, this.running && this.mode === "survival" ? Math.max(0, (35 - this.hp) / 35) * (0.4 + Math.sin(t * 6) * 0.15) : 0);
    u.uFlash.value = this.flash;
    (u.uFlashCol.value as THREE.Color).copy(this.flashCol);
    u.uLove.value = this.loveFx;
    (u.uLineCol.value as THREE.Color).set(this.hakiFx > 0.3 ? 0x000000 : 0xffe6f3);
    this.bloom.strength = 0.85 + this.loveFx * 0.5 + this.hakiFx * 0.4;
    this.env.skyU.uHaki.value = this.hakiFx;

    // hud
    this.hudT -= raw;
    if (this.hudT <= 0 && !this.attract) {
      this.hudT = 0.066;
      this.ev.hud(this.hudState());
    }
  }

  hudState(): HudState {
    return {
      hp: this.hp,
      love: this.love,
      score: this.score,
      combo: this.combo,
      comboT: this.comboT,
      wave: this.wave,
      statues: this.statues,
      kills: this.kills,
      cds: { ...this.cds },
      charge: this.action?.name === "arrowCharge" ? this.charge : this.action?.name === "mellow" ? Math.min(1, this.action.t) : 0,
      enemies: this.enemies.filter((e) => e.alive || e.state === "love").length + this.waveQueue.length,
      mode: this.mode,
    };
  }

  updateAction(dt: number) {
    const a = this.action;
    // fade env FX when idle
    const target = { lines: 0, radial: 0, love: 0, haki: 0 };
    if (!a) {
      this.linesFx += (target.lines - this.linesFx) * Math.min(1, dt * 5);
      this.radialFx += (target.radial - this.radialFx) * Math.min(1, dt * 5);
      this.loveFx += (target.love - this.loveFx) * Math.min(1, dt * 3);
      this.hakiFx += (target.haki - this.hakiFx) * Math.min(1, dt * 2);
      this.timeScale += (1 - this.timeScale) * Math.min(1, dt * 4);
      this.vm.hakiAura = Math.max(0, this.vm.hakiAura - dt);
      if (this.vm.pose !== undefined && !this.over) {
        const moving = this.keys.has("ShiftLeft") && (this.keys.has("KeyW") || this.keys.has("KeyA") || this.keys.has("KeyS") || this.keys.has("KeyD"));
        this.vm.setPose(moving ? "run" : "idle", 8);
      }
      return;
    }
    a.t += dt;
    const eye = this.eyePos(V());

    if (a.name === "kiss") {
      if (a.t > 0.11 && !a.fired) {
        a.fired = 1;
        this.vm.setPose("kissRelease", 26);
        const start = this.handWorld("R", V());
        // auto-aim assist
        let best: Enemy | null = null;
        let bestDot = 0.985;
        for (const e of this.enemies) {
          if (!e.charmable) continue;
          this.enemyCenter(e, tmp);
          const d = tmp.sub(eye).normalize().dot(this.aim);
          if (d > bestDot) {
            bestDot = d;
            best = e;
          }
        }
        const aimPt = best ? this.enemyCenter(best, V()) : eye.clone().addScaledVector(this.aim, 60);
        const vel = aimPt.sub(start).normalize().multiplyScalar(42);
        const g = new THREE.Group();
        const h = new THREE.Mesh(this.heartGeo, this.projMat);
        h.scale.setScalar(0.32);
        const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff3f8e, blending: THREE.AdditiveBlending, depthWrite: false }));
        gl.scale.setScalar(1.6);
        g.add(h, gl);
        g.position.copy(start);
        this.scene.add(g);
        this.projs.push({ mesh: g, vel, life: 1.6, kind: "kiss", target: best, delay: 0 });
        sfx.kiss();
        this.burst(start, 14, 2.5, HOT, 0.06, 0.4);
        this.hearts.emit({ pos: start, vel: tmp.copy(vel).multiplyScalar(0.05).add(UP), color: PINK, size: 0.12, sizeEnd: 0.0, life: 0.6, spin: 2 });
        this.vm.recoil = 0.25;
        this.fovKick += 0.8;
      }
      if (a.t > 0.3) {
        this.action = null;
        this.cds.kiss = CD_MAX.kiss * this.cdMul();
      }
    } else if (a.name === "arrowCharge") {
      this.charge = Math.min(1, a.t / 1.1);
      this.vm.bowTarget = 0.35 + this.charge * 0.9;
      const p = this.vm.bowHeart.getWorldPosition(V());
      this.converge(p, 3 + Math.round(this.charge * 4), 0.5, Math.random() < 0.5 ? HOT : WHITE);
      this.chargeTick -= dt;
      if (this.chargeTick <= 0 && this.charge < 1) {
        this.chargeTick = 0.09;
        sfx.arrowCharge(this.charge);
      }
      this.linesFx += (this.charge * 0.3 - this.linesFx) * dt * 4;
      this.fovKick += (-this.charge * 6 - this.fovKick) * Math.min(1, dt * 6);
      this.loveFx += (this.charge * 0.35 - this.loveFx) * dt * 4;
      if (this.charge >= 1) this.shake(dt * 0.4);
    } else if (a.name === "arrowRelease") {
      this.loveFx *= Math.exp(-dt * 3);
      if (a.t > 0.38) this.action = null;
    } else if (a.name === "mellow") {
      const CH = 1.0,
        FIRE = 2.4;
      const hp = this.vm.heart.getWorldPosition(V());
      if (a.t < CH) {
        const k = a.t / CH;
        this.converge(hp, 10, 1.4, Math.random() < 0.5 ? HOT : WHITE);
        if (Math.random() < 0.5) this.converge(hp, 1, 1.0, PINK, "heart");
        this.fovKick += (-10 * k - this.fovKick) * Math.min(1, dt * 6);
        this.loveFx += (0.7 * k - this.loveFx) * Math.min(1, dt * 6);
        this.linesFx += (k * 0.5 - this.linesFx) * Math.min(1, dt * 6);
        this.radialFx += (k * 0.4 - this.radialFx) * Math.min(1, dt * 6);
        this.shake(dt * 0.25 * k);
        this.timeScale += (0.45 - this.timeScale) * Math.min(1, dt * 4);
      } else if (a.t < CH + FIRE) {
        if (!a.fired) {
          a.fired = 1;
          this.vm.setPose("mellowFire", 20);
          this.beam.visible = true;
          sfx.mellowFire();
          this.doFlash(new THREE.Color(1, 0.6, 0.85), 1.2);
          this.fovKick = 16;
          this.shake(0.8);
          this.hitStop = 0.08;
          this.ringFx(hp, this.aim, new THREE.Color(3, 1, 2), 8, 0.6);
          this.ringFx(hp, this.aim, new THREE.Color(2, 0.4, 1.2), 14, 0.9);
          this.burst(hp, 120, 16, HOT, 0.15, 0.8);
          this.burst(hp, 40, 10, PINK, 0.35, 1.2, "heart");
          this.enemies.forEach((e) => (e.hitByMellow = false));
        }
        const ft = a.t - CH;
        const inten = Math.min(1, ft * 6) * (1 - Math.max(0, (ft - FIRE + 0.4) / 0.4));
        this.beamMats.forEach((m) => {
          m.uniforms.uTime.value = this.time;
          m.uniforms.uI.value = inten * (0.9 + Math.random() * 0.25);
        });
        this.beam.scale.set(1 + Math.sin(this.time * 40) * 0.04, 1 + Math.sin(this.time * 37) * 0.04, Math.min(1, ft * 4));
        this.timeScale += (1 - this.timeScale) * Math.min(1, dt * 6);
        this.trauma = Math.max(this.trauma, 0.45 * inten);
        this.fovKick += (12 * inten - this.fovKick) * Math.min(1, dt * 4);
        this.linesFx = inten;
        this.radialFx = inten * 0.9;
        this.loveFx = 0.6 * inten;
        this.vm.heartTarget = 1.3 * inten;
        // heart barrage
        const right = tmp2.crossVectors(this.aim, UP).normalize();
        const up = tmp3.crossVectors(right, this.aim).normalize();
        for (let i = 0; i < 4; i++) {
          const ang = Math.random() * Math.PI * 2;
          const rr = rand(0, 1);
          const v = this.aim
            .clone()
            .multiplyScalar(rand(36, 52))
            .addScaledVector(right, Math.cos(ang) * rr * 5.5)
            .addScaledVector(up, Math.sin(ang) * rr * 5.5);
          const c = Math.random() < 0.25 ? new THREE.Color(4, 3, 3.6) : Math.random() < 0.5 ? new THREE.Color(3, 0.4, 1.4) : new THREE.Color(2.4, 0.9, 2.2);
          this.emitBarrage(hp.clone().addScaledVector(this.aim, 0.6), v, rand(0.25, 0.7), rand(1.1, 1.5), c);
        }
        for (let i = 0; i < 8; i++) {
          const v = this.aim.clone().multiplyScalar(rand(20, 50)).add(tmp.randomDirection().multiplyScalar(rand(1, 7)));
          this.hearts.emit({ pos: hp, vel: v, color: Math.random() < 0.5 ? PINK : WHITE, size: rand(0.15, 0.5), sizeEnd: rand(1, 2.2), life: rand(0.8, 1.3), spin: rand(-5, 5), drag: 0.4, alpha: 0.9 });
        }
        if (Math.random() < 0.25) this.ringFx(eye.clone().addScaledVector(this.aim, rand(4, 30)), this.aim, new THREE.Color(2, 0.5, 1.4), rand(5, 10), 0.4);
        // petrify cone
        for (const e of this.enemies) {
          if (!(e.charmable || e.state === "stone")) continue;
          this.enemyCenter(e, tmp).sub(eye);
          const along = tmp.dot(this.aim);
          if (along < 0 || along > 60) continue;
          const perp = tmp.addScaledVector(this.aim, -along).length();
          if (perp < 0.6 + along * 0.11 + e.radius) {
            if (e.charmable) {
              this.charmEnemy(e, dt * 7, "mellow");
              if (!e.hitByMellow) {
                e.hitByMellow = true;
                this.enemyCenter(e, tmp2);
                this.burst(tmp2, 20, 4, HOT, 0.2, 0.6, "heart");
              }
            }
          }
        }
      } else {
        this.beam.visible = false;
        this.vm.heartTarget = 0;
        this.vm.setPose("idle", 6);
        if (a.t > CH + FIRE + 0.35) {
          this.action = null;
          this.cds.mellow = CD_MAX.mellow * this.cdMul();
        }
      }
    } else if (a.name === "kick") {
      const fwd = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      if (a.t < 0.22) {
        // dash
        this.pos.addScaledVector(fwd, dt * 16 * (1 - a.t / 0.22));
        this.linesFx += (0.8 - this.linesFx) * Math.min(1, dt * 12);
        this.fovKick += (10 - this.fovKick) * Math.min(1, dt * 10);
      }
      this.roll = a.t < 0.3 ? -Math.sin((a.t / 0.3) * Math.PI) * 0.12 : this.roll;
      if (a.t > 0.16 && a.t < 0.36) {
        const k = (a.t - 0.16) / 0.2;
        this.slash.visible = true;
        this.slash.rotation.z = 0.9 - k * 1.8;
        this.slash.scale.setScalar(1 + k * 0.6);
        (this.slash.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI);
      } else this.slash.visible = false;
      if (a.t > 0.21 && !a.fired) {
        a.fired = 1;
        sfx.kickImpact();
        this.shake(0.7);
        this.hitStop = 0.07;
        this.doFlash(new THREE.Color(1, 0.7, 0.9), 0.5);
        this.invert = 0.6;
        const impact = eye.clone().addScaledVector(this.aim, 2.2);
        this.burst(impact, 80, 12, HOT, 0.15, 0.6);
        this.burst(impact, 30, 8, PINK, 0.3, 1.0, "heart");
        this.ringFx(impact, this.aim, new THREE.Color(3, 1, 2), 7, 0.4);
        this.ringFx(tmp2.copy(this.pos).addScaledVector(fwd, 2).setY(0.06), UP, new THREE.Color(2, 0.6, 1.4), 12, 0.6);
        // ground petal storm
        for (let i = 0; i < 60; i++) {
          tmp2.copy(this.pos).addScaledVector(fwd, rand(1, 5)).add(tmp3.set(rand(-2, 2), rand(0.2, 2), rand(-2, 2)));
          this.petals.emit({ pos: tmp2, vel: tmp3.copy(fwd).multiplyScalar(rand(6, 16)).add(V().randomDirection().multiplyScalar(4)).setY(rand(2, 8)), size: rand(0.15, 0.3), sizeEnd: 0.1, life: rand(1.5, 3), spin: rand(-8, 8), gravity: 3, drag: 1.5 });
        }
        // melee cone
        for (const e of [...this.enemies]) {
          if (e.state === "dead" || e.state === "faint") continue;
          tmp2.subVectors(e.root.position, this.pos).setY(0);
          const d = tmp2.length();
          if (d < 4.5 + e.radius && tmp2.normalize().dot(fwd) > 0.2) {
            if (e.state === "stone") this.shatter(e);
            else {
              this.charmEnemy(e, 3, "kick");
              e.vel.copy(tmp2).multiplyScalar(14).setY(5);
            }
          }
        }
        // travelling crescent wave
        const wm = new THREE.Mesh(
          new THREE.RingGeometry(1.8, 2.6, 48, 1, 0.15, Math.PI - 0.3),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.8, 1.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
        );
        wm.position.copy(this.pos).setY(0.3).addScaledVector(fwd, 2);
        wm.lookAt(tmp2.copy(wm.position).add(fwd));
        this.scene.add(wm);
        this.waves.push({ mesh: wm, dir: fwd.clone(), t: 0, hit: new Set() });
      }
      if (a.t > 0.62) {
        this.action = null;
      }
    } else if (a.name === "haki") {
      const BUILD = 0.9;
      if (a.t < BUILD) {
        const k = a.t / BUILD;
        this.timeScale += (0.15 - this.timeScale) * Math.min(1, dt * 8);
        this.hakiFx = Math.min(1, k * 1.2);
        this.vm.hakiAura = k;
        this.shake(dt * 0.8);
        this.fovKick += (-8 * k - this.fovKick) * Math.min(1, dt * 6);
        this.radialFx = k * 0.5;
        if (Math.random() < 0.5) {
          const from = eye.clone().add(V(rand(-1, 1), rand(-0.6, 0.2), 0).applyQuaternion(this.camera.quaternion)).addScaledVector(this.aim, 1.4);
          const to = from.clone().add(V().randomDirection().multiplyScalar(rand(2, 6)));
          this.bolt(from, to, 0.03, new THREE.Color(3, 0.1, 0.25), 0.12, true);
        }
        if (Math.random() < 0.15) sfx.noise(0.06, 0.25, "highpass", 3000, 1000, 1, 0.4);
      } else if (!a.fired) {
        a.fired = 1;
        sfx.haki();
        this.invert = 1;
        this.hitStop = 0.15;
        this.shake(1.2);
        this.fovKick = 22;
        this.doFlash(new THREE.Color(1, 0.05, 0.1), 1);
        const ground = tmp2.copy(this.pos).setY(0.1);
        this.ringFx(ground.clone(), UP, new THREE.Color(3, 0.1, 0.2), 90, 1.4);
        this.ringFx(ground.clone().setY(0.15), UP, new THREE.Color(0, 0, 0), 70, 1.6, THREE.NormalBlending);
        this.ringFx(eye.clone(), this.aim, new THREE.Color(3, 0.2, 0.3), 30, 0.8);
        for (let i = 0; i < 18; i++) {
          const to = eye.clone().add(V(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(10, 35)));
          this.bolt(eye.clone().addScaledVector(this.aim, 1).setY(eye.y - 0.4), to, rand(0.06, 0.16), new THREE.Color(3, 0.1, 0.3), rand(0.25, 0.5), true);
        }
        for (const e of [...this.enemies]) {
          const d = e.root.position.distanceTo(this.pos);
          if (d > 48) continue;
          if (e.state === "stone") {
            this.shatter(e);
            continue;
          }
          if (e.state === "dead" || e.state === "faint") continue;
          e.state = "faint";
          e.stateT = -d * 0.012;
          this.kills++;
          this.addCombo();
          this.score += Math.round((e.kind === "giant" ? 600 : 120) * this.mult());
          this.enemyCenter(e, tmp3);
          this.bolt(eye.clone().addScaledVector(this.aim, 1), tmp3.clone(), 0.08, new THREE.Color(3, 0.1, 0.3), 0.35, true);
        }
        this.burst(eye.clone().addScaledVector(this.aim, 2), 200, 25, new THREE.Color(1, 0.08, 0.15), 0.2, 1.2);
      } else {
        this.timeScale += (0.6 - this.timeScale) * Math.min(1, dt * 3);
        this.hakiFx = Math.max(0, 1 - (a.t - BUILD - 0.8) / 1.0);
        this.radialFx *= Math.exp(-dt * 3);
        if (Math.random() < 0.2 && this.hakiFx > 0.3) {
          const p = this.pos.clone().add(V(rand(-30, 30), 0, rand(-30, 30)));
          this.bolt(p.clone().setY(20), p, 0.1, new THREE.Color(3, 0.1, 0.3), 0.15, true);
        }
        if (a.t > BUILD + 1.8) {
          this.action = null;
        }
      }
    }
  }

  updateEnemies(dt: number) {
    const player = this.pos;
    for (const e of this.enemies) {
      e.stateT += dt;
      e.attackCd -= dt;
      const p = e.root.position;
      // knockback
      if (e.vel.lengthSq() > 0.01) {
        p.addScaledVector(e.vel, dt);
        e.vel.multiplyScalar(Math.exp(-dt * 5));
        e.vel.y -= 25 * dt;
      }
      if (p.y > 0 || e.vel.y > 0) {
        if (p.y < 0) {
          p.y = 0;
          e.vel.y = 0;
        }
      } else p.y = 0;
      tmp.subVectors(player, p).setY(0);
      const dist = tmp.length();
      if (e.alive) {
        const face = Math.atan2(tmp.x, tmp.z);
        e.root.rotation.y += Math.atan2(Math.sin(face - e.root.rotation.y), Math.cos(face - e.root.rotation.y)) * Math.min(1, dt * 8);
      }
      if (e.state === "walk") {
        const isG = e.kind === "gunner";
        const reach = (isG ? 13 : 1.7) + e.radius;
        if (dist > reach) p.addScaledVector(tmp.normalize(), e.speed * dt);
        else if (isG && dist < 8) p.addScaledVector(tmp.normalize(), -e.speed * 0.6 * dt);
        if (dist <= reach + (isG ? 4 : 0.3) && e.attackCd <= 0 && this.running) {
          e.state = "attack";
          e.stateT = 0;
          e.fired = false;
        }
      } else if (e.state === "attack") {
        if (e.kind === "gunner") {
          if (e.stateT > 0.55 && !e.fired) {
            e.fired = true;
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.2, 0.3), toneMapped: false }));
            this.enemyCenter(e, m.position);
            m.position.y += 0.3;
            const target = tmp2.copy(this.pos).setY(this.pos.y + 1.5);
            const vel = target.sub(m.position).normalize().multiplyScalar(16);
            this.scene.add(m);
            this.bullets.push({ mesh: m, vel, life: 4 });
            this.burst(m.position, 10, 3, 0xffaa44, 0.15, 0.3);
            sfx.noise(0.12, 0.2, "lowpass", 3000, 300, 1, 0.2);
          }
          if (e.stateT > 0.9) {
            e.state = "walk";
            e.attackCd = rand(2, 3.5);
          }
        } else {
          if (e.stateT > 0.44 && !e.fired) {
            e.fired = true;
            if (dist < 2.6 + e.radius) this.hurt(e.kind === "giant" ? 22 : 9);
          }
          if (e.stateT > 0.6) {
            e.state = "walk";
            e.attackCd = rand(0.8, 1.6);
          }
        }
      } else if (e.state === "love") {
        e.u.uLove.value = 1;
        if (Math.random() < dt * 8) {
          this.enemyCenter(e, tmp2);
          tmp2.y += e.height * 0.4;
          this.hearts.emit({ pos: tmp2, vel: tmp3.set(rand(-0.6, 0.6), rand(1, 2.2), rand(-0.6, 0.6)), color: PINK, size: 0.22 * e.scale, sizeEnd: 0.05, life: 1, spin: rand(-2, 2) });
        }
        if (e.stateT > (e.hitByMellow ? 0.35 : 0.18)) this.startPetrify(e);
      } else if (e.state === "petrifying") {
        const dur = e.kind === "giant" ? 1.4 : 0.8;
        e.u.uPetrify.value = Math.min(1, e.stateT / dur);
        if (Math.random() < dt * 30) {
          tmp2.copy(p).setY(p.y + e.height * e.u.uPetrify.value * 1.1);
          tmp2.x += rand(-0.3, 0.3) * e.scale;
          tmp2.z += rand(-0.3, 0.3) * e.scale;
          this.sparks.emit({ pos: tmp2, vel: tmp3.set(rand(-1, 1), rand(0, 1.5), rand(-1, 1)), color: HOT, size: 0.12, life: 0.5, drag: 2 });
        }
        if (e.stateT >= dur) this.finishPetrify(e);
      } else if (e.state === "stone") {
        e.stoneTimer += dt;
        if (e.stoneTimer > 18) this.shatter(e);
      } else if (e.state === "faint") {
        if (e.stateT > 0) {
          const k = Math.min(1, e.stateT / 0.5);
          e.body.rotation.x = -k * k * 1.55;
          e.body.position.y = 0.2 * e.scale * Math.sin(k * Math.PI);
          e.u.uFlash.value = 0;
          e.u.uLove.value = 0;
          if (e.stateT < 0.05) {
            this.enemyCenter(e, tmp2);
            this.burst(tmp2, 14, 4, new THREE.Color(1, 0.1, 0.15), 0.2, 0.6);
          }
          if (e.stateT > 3) p.y = -(e.stateT - 3) * 0.8;
          if (e.stateT > 5) {
            e.state = "dead";
            this.removeEnemy(e);
          }
        }
      }
      e.animate(dt);
    }
    // separation
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.state === "dead") continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.state === "dead") continue;
        const dx = b.root.position.x - a.root.position.x;
        const dz = b.root.position.z - a.root.position.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + b.radius;
        if (d < min && d > 0.0001) {
          const push = (min - d) / 2;
          const aMov = a.state !== "stone" ? 1 : 0;
          const bMov = b.state !== "stone" ? 1 : 0;
          a.root.position.x -= (dx / d) * push * aMov;
          a.root.position.z -= (dz / d) * push * aMov;
          b.root.position.x += (dx / d) * push * bMov;
          b.root.position.z += (dz / d) * push * bMov;
        }
      }
      // keep inside arena & away from player
      const r = Math.hypot(a.root.position.x, a.root.position.z);
      if (r > ARENA_R) a.root.position.multiplyScalar(ARENA_R / r);
      const pd = Math.hypot(a.root.position.x - this.pos.x, a.root.position.z - this.pos.z);
      const pm = a.radius + 0.5;
      if (pd < pm && pd > 0.0001 && a.state !== "stone") {
        a.root.position.x += ((a.root.position.x - this.pos.x) / pd) * (pm - pd);
        a.root.position.z += ((a.root.position.z - this.pos.z) / pd) * (pm - pd);
      }
    }
    this.enemies = this.enemies.filter((e) => e.state !== "dead");
  }

  updateProjectiles(dt: number) {
    for (const pr of this.projs) {
      if (pr.delay > 0) {
        pr.delay -= dt;
        pr.mesh.visible = false;
        continue;
      }
      pr.mesh.visible = true;
      pr.life -= dt;
      const p = pr.mesh.position;
      if (pr.target && pr.target.state !== "dead" && (pr.target.charmable || pr.target.state === "petrifying")) {
        this.enemyCenter(pr.target, tmp);
        tmp.sub(p);
        const sp = pr.kind === "arrow" ? 48 : 46;
        const turn = pr.kind === "arrow" ? 7 : 5;
        tmp.normalize().multiplyScalar(sp);
        pr.vel.lerp(tmp, Math.min(1, dt * turn));
      } else if (pr.kind === "arrow") {
        pr.vel.y -= 4 * dt;
      }
      p.addScaledVector(pr.vel, dt);
      if (pr.kind === "arrow") {
        pr.mesh.lookAt(tmp2.copy(p).sub(pr.vel));
        if (Math.random() < 0.7) this.sparks.emit({ pos: p, vel: tmp3.copy(pr.vel).multiplyScalar(-0.05), color: HOT, size: 0.12, life: 0.25 });
      } else {
        pr.mesh.children[0].rotation.y += dt * 10;
        pr.mesh.children[0].lookAt(this.camera.position);
        this.hearts.emit({ pos: p, vel: tmp3.randomDirection().multiplyScalar(0.6), color: Math.random() < 0.5 ? PINK : WHITE, size: 0.12, sizeEnd: 0, life: 0.45, spin: 3 });
        this.sparks.emit({ pos: p, color: HOT, size: 0.3, sizeEnd: 0, life: 0.15 });
      }
      // hit
      for (const e of this.enemies) {
        if (!(e.charmable || e.state === "stone" || e.state === "petrifying")) continue;
        this.enemyCenter(e, tmp);
        const dy = Math.abs(p.y - tmp.y);
        const dxz = Math.hypot(p.x - tmp.x, p.z - tmp.z);
        if (dxz < e.radius + 0.35 && dy < e.height * 0.55) {
          pr.life = -1;
          if (e.state !== "petrifying") this.charmEnemy(e, pr.kind === "kiss" ? 1 : 0.7, pr.kind);
          sfx.heartHit();
          this.burst(p, pr.kind === "kiss" ? 26 : 12, 5, HOT, 0.14, 0.5);
          this.burst(p, pr.kind === "kiss" ? 10 : 4, 3, PINK, 0.28, 0.9, "heart");
          this.ringFx(p.clone(), tmp2.subVectors(this.camera.position, p).normalize(), new THREE.Color(3, 0.8, 1.7), 2.2, 0.3);
          this.hitStop = Math.max(this.hitStop, 0.025);
          break;
        }
      }
      if (p.y < 0) {
        pr.life = -1;
        this.burst(p.setY(0.05), 10, 3, HOT, 0.12, 0.4);
      }
      if (pr.life <= 0) this.scene.remove(pr.mesh);
    }
    this.projs = this.projs.filter((p) => p.life > 0);

    // enemy bullets
    for (const b of this.bullets) {
      b.life -= dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (Math.random() < 0.6) this.sparks.emit({ pos: b.mesh.position, color: 0xff7a30, size: 0.25, life: 0.2 });
      tmp.copy(this.pos).setY(this.pos.y + 1.4);
      if (b.mesh.position.distanceTo(tmp) < 0.7) {
        b.life = -1;
        this.hurt(7);
        this.burst(b.mesh.position, 20, 4, 0xff6a20, 0.15, 0.4);
      }
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);

    // kick crescent waves
    for (const w of this.waves) {
      w.t += dt;
      w.mesh.position.addScaledVector(w.dir, dt * 32);
      w.mesh.scale.setScalar(1 + w.t * 3);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - w.t / 0.55);
      if (Math.random() < 0.8) this.petals.emit({ pos: w.mesh.position, vel: tmp3.randomDirection().multiplyScalar(3).setY(3), size: 0.2, sizeEnd: 0.1, life: 1.2, spin: 6, gravity: 3 });
      const width = 2.2 * (1 + w.t * 3);
      for (const e of [...this.enemies]) {
        if (w.hit.has(e) || e.state === "dead" || e.state === "faint") continue;
        tmp.subVectors(e.root.position, w.mesh.position).setY(0);
        const along = tmp.dot(w.dir);
        const lat = tmp.addScaledVector(w.dir, -along).length();
        if (Math.abs(along) < 1.2 + e.radius && lat < width) {
          w.hit.add(e);
          if (e.state === "stone") this.shatter(e);
          else {
            this.charmEnemy(e, 2, "kick");
            e.vel.copy(w.dir).multiplyScalar(10).setY(4);
          }
        }
      }
      if (w.t > 0.55) {
        this.scene.remove(w.mesh);
        w.mesh.geometry.dispose();
      }
    }
    this.waves = this.waves.filter((w) => w.t <= 0.55);
  }

  updateFx(wdt: number, pdt: number) {
    for (const f of this.fxs) {
      f.t += pdt;
      f.upd(Math.min(1, f.t / f.life), f.obj);
      if (f.t >= f.life) {
        this.scene.remove(f.obj);
        if (f.dispose)
          f.obj.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.geometry) m.geometry.dispose();
            if (m.material) (m.material as THREE.Material).dispose();
          });
      }
    }
    this.fxs = this.fxs.filter((f) => f.t < f.life);

    // barrage
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qz = new THREE.Quaternion();
    const sc = V();
    const camQ = this.camera.quaternion;
    let any = false;
    for (let i = 0; i < this.bData.length; i++) {
      const d = this.bData[i];
      if (d.life <= 0) continue;
      any = true;
      d.life -= wdt;
      d.p.addScaledVector(d.v, wdt);
      const k = 1 - d.life / d.max;
      const s = d.life <= 0 ? 0 : d.s * (0.4 + k * 3.2) * Math.min(1, (1 - k) * 4);
      d.rot += d.spin * wdt;
      qz.setFromAxisAngle(new THREE.Vector3(0, 0, 1), d.rot);
      q.copy(camQ).multiply(qz);
      m4.compose(d.p, q, sc.setScalar(s));
      this.barrage.setMatrixAt(i, m4);
    }
    if (any) {
      this.barrage.instanceMatrix.needsUpdate = true;
      if (this.barrage.instanceColor) this.barrage.instanceColor.needsUpdate = true;
    }

    // debris
    let anyD = false;
    for (let i = 0; i < this.dData.length; i++) {
      const d = this.dData[i];
      if (d.life <= 0) continue;
      anyD = true;
      d.life -= wdt;
      d.v.y -= 22 * wdt;
      d.p.addScaledVector(d.v, wdt);
      if (d.p.y < d.s * 0.6) {
        d.p.y = d.s * 0.6;
        d.v.y *= -0.35;
        d.v.x *= 0.7;
        d.v.z *= 0.7;
        d.rv.multiplyScalar(0.7);
      }
      d.r.x += d.rv.x * wdt;
      d.r.y += d.rv.y * wdt;
      d.r.z += d.rv.z * wdt;
      const s = d.life <= 0 ? 0 : d.s * Math.min(1, d.life * 1.5);
      q.setFromEuler(d.r);
      m4.compose(d.p, q, sc.setScalar(s));
      this.debris.setMatrixAt(i, m4);
    }
    if (anyD) this.debris.instanceMatrix.needsUpdate = true;
  }
}
