import * as THREE from "three";

export type EnemyKind = "marine" | "pirate" | "gunner" | "giant";
export type EnemyState = "walk" | "attack" | "love" | "petrifying" | "stone" | "faint" | "dead";

const G = {
  leg: new THREE.CapsuleGeometry(0.11, 0.62, 4, 10).translate(0, -0.42, 0),
  boot: new THREE.BoxGeometry(0.2, 0.14, 0.32).translate(0, -0.86, 0.05),
  torso: new THREE.CapsuleGeometry(0.27, 0.45, 6, 14),
  belt: new THREE.CylinderGeometry(0.29, 0.29, 0.09, 16),
  arm: new THREE.CapsuleGeometry(0.075, 0.5, 4, 8).translate(0, -0.32, 0),
  hand: new THREE.SphereGeometry(0.085, 10, 8).translate(0, -0.65, 0),
  head: new THREE.SphereGeometry(0.2, 20, 16),
  cap: new THREE.CylinderGeometry(0.2, 0.21, 0.12, 18),
  capTop: new THREE.CylinderGeometry(0.235, 0.2, 0.05, 18),
  bandana: new THREE.SphereGeometry(0.212, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45),
  collar: new THREE.TorusGeometry(0.2, 0.06, 6, 16),
  eye: new THREE.SphereGeometry(0.028, 8, 6),
  blade: new THREE.BoxGeometry(0.035, 0.85, 0.08).translate(0, 0.5, 0),
  guard: new THREE.BoxGeometry(0.16, 0.03, 0.1).translate(0, 0.06, 0),
  rifle: new THREE.BoxGeometry(0.07, 1.1, 0.09).translate(0, -0.3, 0.05),
};

const NOISE_GLSL = /* glsl */ `
float h3(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;

export interface PetrifyUniforms {
  uPetrify: { value: number };
  uBaseY: { value: number };
  uHeight: { value: number };
  uLove: { value: number };
  uFlash: { value: number };
}

function petrifyMaterial(color: number, u: PetrifyUniforms, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...opts });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWP;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed,1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWP; uniform float uPetrify; uniform float uBaseY; uniform float uHeight; uniform float uLove; uniform float uFlash;
        ${NOISE_GLSL}`
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float pn = n3(vWP*7.0)*0.6 + n3(vWP*21.0)*0.4;
        float hh = (vWP.y - uBaseY) / uHeight;
        float pEdge = uPetrify*1.42 - hh - 0.12 + (pn-0.5)*0.18;
        float isStone = step(0.0, pEdge);
        vec3 stone = mix(vec3(0.36,0.34,0.33), vec3(0.66,0.63,0.6), pn);
        float crack = 1.0 - smoothstep(0.0, 0.035, abs(n3(vWP*9.0)-0.5));
        stone *= 1.0 - crack*0.55;
        diffuseColor.rgb = mix(diffuseColor.rgb, stone, isStone);`
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.95, isStone);`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float band = (1.0 - smoothstep(0.0, 0.12, abs(pEdge))) * step(0.001, uPetrify) * step(uPetrify, 0.999);
        float rim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
        totalEmissiveRadiance += vec3(1.0,0.25,0.6) * band * 4.0;
        totalEmissiveRadiance += vec3(1.0,0.3,0.65) * rim * uLove * 2.2 * (1.0-isStone);
        totalEmissiveRadiance += vec3(1.0,0.6,0.8) * uFlash * 2.0;`
      );
  };
  return m;
}

const PALETTES: Record<EnemyKind, { body: number; pants: number; accent: number; skin: number[] }> = {
  marine: { body: 0xf2f4f8, pants: 0x1d3f8a, accent: 0x2a66d9, skin: [0xf1c9a5, 0xd9a47a, 0xa8714d] },
  pirate: { body: 0x7a2e2e, pants: 0x3b3328, accent: 0xd8b04a, skin: [0xf1c9a5, 0xc68f63, 0x8a5a3c] },
  gunner: { body: 0x2b4a3a, pants: 0x2a2a2a, accent: 0xc0392b, skin: [0xf1c9a5, 0xd9a47a] },
  giant: { body: 0x3a2a4a, pants: 0x1a1a22, accent: 0xff3355, skin: [0xc68f63, 0xa8714d] },
};

export class Enemy {
  root = new THREE.Group();
  body = new THREE.Group();
  kind: EnemyKind;
  state: EnemyState = "walk";
  u: PetrifyUniforms;
  mats: THREE.MeshStandardMaterial[] = [];
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  head: THREE.Group;
  scale: number;
  height: number;
  speed: number;
  charm = 0;
  charmMax: number;
  animT = Math.random() * 10;
  animSpeed = 1;
  stateT = 0;
  attackCd = 1 + Math.random();
  fired = false;
  vel = new THREE.Vector3();
  radius: number;
  faintAxis = new THREE.Vector3(1, 0, 0);
  spawnT = 0;
  stoneTimer = 0;
  hitByMellow = false;

  constructor(kind: EnemyKind) {
    this.kind = kind;
    this.scale = kind === "giant" ? 2.3 : 0.92 + Math.random() * 0.16;
    this.height = 1.95 * this.scale;
    this.radius = 0.4 * this.scale;
    this.speed = kind === "giant" ? 1.6 : kind === "gunner" ? 2.2 : 2.6 + Math.random() * 1.2;
    this.charmMax = kind === "giant" ? 7 : 1;
    this.u = { uPetrify: { value: 0 }, uBaseY: { value: 0 }, uHeight: { value: this.height }, uLove: { value: 0 }, uFlash: { value: 0 } };
    const P = PALETTES[kind];
    const skinC = P.skin[Math.floor(Math.random() * P.skin.length)];
    const mk = (c: number, o?: Partial<THREE.MeshStandardMaterialParameters>) => {
      const m = petrifyMaterial(c, this.u, o);
      this.mats.push(m);
      return m;
    };
    const bodyM = mk(P.body);
    const pantsM = mk(P.pants);
    const accentM = mk(P.accent, { metalness: 0.3, roughness: 0.4 });
    const skinM = mk(skinC, { roughness: 0.5 });
    const darkM = mk(0x15151a);
    const steelM = mk(0xd8dde6, { metalness: 0.9, roughness: 0.2 });

    const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const x = new THREE.Mesh(g, m);
      x.castShadow = true;
      return x;
    };

    // hips at y=0.95
    const hips = new THREE.Group();
    hips.position.y = 0.95;
    this.body.add(hips);
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.position.set(-0.13, 0, 0);
    this.legR.position.set(0.13, 0, 0);
    for (const l of [this.legL, this.legR]) {
      l.add(mesh(G.leg, pantsM), mesh(G.boot, darkM));
      hips.add(l);
    }
    const torso = mesh(G.torso, bodyM);
    torso.position.y = 0.42;
    torso.scale.set(1, 1, 0.75);
    hips.add(torso);
    const belt = mesh(G.belt, darkM);
    belt.position.y = 0.12;
    belt.scale.z = 0.78;
    hips.add(belt);
    const collar = mesh(G.collar, accentM);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.78;
    collar.scale.set(1, 0.75, 1);
    hips.add(collar);

    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.armL.position.set(-0.36, 0.72, 0);
    this.armR.position.set(0.36, 0.72, 0);
    for (const a of [this.armL, this.armR]) {
      a.add(mesh(G.arm, bodyM), mesh(G.hand, skinM));
      hips.add(a);
    }
    if (kind === "gunner") {
      const r = mesh(G.rifle, darkM);
      r.position.set(0, -0.62, 0);
      this.armR.add(r);
    } else {
      const sword = new THREE.Group();
      sword.add(mesh(G.blade, steelM), mesh(G.guard, accentM));
      sword.position.set(0, -0.66, 0);
      sword.rotation.x = Math.PI / 2;
      this.armR.add(sword);
    }

    this.head = new THREE.Group();
    this.head.position.y = 1.08;
    hips.add(this.head);
    this.head.add(mesh(G.head, skinM));
    for (const sx of [-1, 1]) {
      const e = mesh(G.eye, darkM);
      e.position.set(sx * 0.07, 0.03, 0.18);
      this.head.add(e);
    }
    if (kind === "marine") {
      const c = mesh(G.cap, bodyM);
      c.position.y = 0.14;
      const ct = mesh(G.capTop, bodyM);
      ct.position.y = 0.21;
      this.head.add(c, ct);
    } else {
      const b = mesh(G.bandana, accentM);
      b.position.y = 0.01;
      this.head.add(b);
    }
    this.body.scale.setScalar(this.scale);
    this.root.add(this.body);
  }

  setSpawn(p: THREE.Vector3) {
    this.root.position.copy(p);
    this.spawnT = 0;
  }

  get alive() {
    return this.state === "walk" || this.state === "attack";
  }

  get charmable() {
    return this.state === "walk" || this.state === "attack" || this.state === "love";
  }

  animate(dt: number) {
    this.u.uBaseY.value = this.root.position.y;
    this.u.uFlash.value = Math.max(0, this.u.uFlash.value - dt * 5);
    const frozen = this.state === "stone" ? 0 : this.state === "petrifying" ? 1 - this.u.uPetrify.value : 1;
    if (this.state === "faint" || this.state === "dead") return;
    this.animT += dt * this.animSpeed * frozen;
    const t = this.animT;
    if (this.state === "walk") {
      const w = Math.sin(t * this.speed * 3.2);
      this.legL.rotation.x = w * 0.6;
      this.legR.rotation.x = -w * 0.6;
      this.armL.rotation.set(-w * 0.5, 0, 0);
      this.armR.rotation.x = this.kind === "gunner" ? -1.2 : -0.9 + w * 0.2;
      this.armR.rotation.z = 0;
      this.body.position.y = Math.abs(w) * 0.05 * this.scale;
      this.body.rotation.x = 0.08;
      this.head.rotation.set(0, 0, 0);
    } else if (this.state === "attack") {
      const k = Math.min(1, this.stateT / 0.55);
      if (this.kind === "gunner") {
        this.armR.rotation.x = -1.55;
        this.armL.rotation.x = -1.3;
        this.armL.rotation.z = -0.5;
      } else {
        // windup then slash
        const wind = k < 0.75 ? k / 0.75 : 1 - (k - 0.75) / 0.25;
        this.armR.rotation.x = -0.9 - wind * 2.2 + (k > 0.75 ? 2.6 * ((k - 0.75) / 0.25) : 0);
        this.armR.rotation.z = -wind * 0.4;
        this.body.rotation.x = -0.15 * wind + (k > 0.75 ? 0.3 : 0);
      }
      this.legL.rotation.x = 0.3;
      this.legR.rotation.x = -0.3;
    } else if (this.state === "love" || this.state === "petrifying") {
      // lovestruck swoon: hands clasped at chest, sway
      const s = Math.sin(t * 6);
      this.armL.rotation.set(-1.9, 0, 0.75);
      this.armR.rotation.set(-1.9, 0, -0.75);
      this.legL.rotation.x = 0.1;
      this.legR.rotation.x = -0.2;
      this.body.rotation.x = -0.25 + s * 0.04;
      this.body.rotation.z = s * 0.08;
      this.head.rotation.set(-0.35, 0, s * 0.15);
      this.body.position.y = Math.max(0, Math.sin(t * 9)) * 0.06 * this.scale;
    }
  }
}
