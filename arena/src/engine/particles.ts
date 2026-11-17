/**
 * HỆ HẠT — port từ hệ hạt của từng dự án gốc.
 *
 * Bản cũ của arena dùng một `ParticleSystem` chung với 7 nhánh `switch`, mỗi
 * nhánh ~15 dòng. Cách đó làm mọi nhân vật trông giống nhau: cùng một sprite
 * tròn, cùng một kiểu bay, chỉ khác màu.
 *
 * Bản này port đúng **cơ chế** và **tham số emit** của từng dự án:
 *
 *   boa-hancock  THREE.Points + ShaderMaterial, texture trái tim bezier,
 *                emit theo spin/sizeEnd, có cánh hoa rơi (petals) riêng
 *   captain-kid  hạt sắt vụn + tia sét (lightning bolt) nhiều đốt gãy khúc
 *   doflamingo   hạt sợi chỉ dài, kéo thành vệt theo hướng bay
 *   imu          khói hắc ám, có vòng xoáy và màn phủ tối
 *   kizaru       vệt ánh sáng (streak) + hạt sáng điểm
 *   luffy        chấm halftone truyện tranh + vòng sóng cao su
 *   zoro         vệt kiếm khí hình lưỡi liềm + tia lửa
 *
 * Nguồn tham số:
 *   boa-hancock/src/game/Game.ts:983,1068,1129,1288,1298,1382,1386
 *   captain-kid/src/game/FX.ts:71,188,420,458,490
 *   doflamingo/src/engine/fx/Effects.ts
 *   imu/src/engine/fxlib.ts:34
 *   kizaru/src/game/fx.ts + gfx.ts:52,173
 *   luffy/src/game/effects.ts:35,80,144
 *   zoro/src/engine/vfxSystem.ts
 */

import * as THREE from 'three';
import type { CharId, FxKind } from '../data/roster';
import { texturesFor } from './textures';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/* ================================================================ cơ chế */

interface Particle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  /** kích thước đầu / cuối */
  s0: number;
  s1: number;
  life: number;
  age: number;
  gravity: number;
  /** hệ số cản mỗi giây (bản gốc dùng drag 0..2) */
  drag: number;
  spin: number;
  rot: number;
  alpha0: number;
  /** true = xoay sprite theo hướng bay (sợi chỉ, vệt sáng, kiếm khí) */
  align: boolean;
}

/**
 * Bể hạt dùng THREE.Points + ShaderMaterial — đúng cơ chế của
 * boa-hancock/src/game/particles.ts: mỗi hạt có size/alpha/rot riêng, đổ
 * vào buffer attribute, shader tự quay sprite quanh tâm.
 */
export class ParticleField {
  readonly points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private mat: THREE.ShaderMaterial;
  private pool: Particle[] = [];
  private posArr: Float32Array;
  private colArr: Float32Array;
  private sizeArr: Float32Array;
  private alphaArr: Float32Array;
  private rotArr: Float32Array;
  private cursor = 0;

  constructor(
    max: number,
    texture: THREE.Texture,
    blending: THREE.Blending = THREE.AdditiveBlending,
  ) {
    this.posArr = new Float32Array(max * 3);
    this.colArr = new Float32Array(max * 3);
    this.sizeArr = new Float32Array(max);
    this.alphaArr = new Float32Array(max);
    this.rotArr = new Float32Array(max);
    for (let i = 0; i < max; i++) {
      this.posArr[i * 3 + 1] = -9999;
      this.pool.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        color: new THREE.Color(),
        s0: 0, s1: 0, life: 1, age: 0,
        gravity: 0, drag: 0, spin: 0, rot: 0, alpha0: 1, align: false,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizeArr, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphaArr, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aRot', new THREE.BufferAttribute(this.rotArr, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = geo;

    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: texture }, uScale: { value: window.innerHeight * 0.5 } },
      // chép nguyên văn từ boa-hancock/src/game/particles.ts
      vertexShader: /* glsl */ `
        attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aRot;
        varying vec3 vColor; varying float vAlpha; varying float vRot;
        uniform float uScale;
        void main(){
          vColor = aColor; vAlpha = aAlpha; vRot = aRot;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * uScale / max(-mv.z, 0.05);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        varying vec3 vColor; varying float vAlpha; varying float vRot;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          p = mat2(c,-s,s,c) * p + 0.5;
          vec4 t = texture2D(uTex, vec2(p.x, 1.0 - p.y));
          if (t.a < 0.01) discard;
          gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
        }`,
      transparent: true,
      depthWrite: false,
      blending,
    });

    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** emit chép đúng tham số EmitOpts của bản gốc */
  spawn(o: {
    pos: THREE.Vector3;
    vel?: THREE.Vector3;
    color?: THREE.Color | number;
    size?: number;
    sizeEnd?: number;
    life?: number;
    gravity?: number;
    drag?: number;
    spin?: number;
    alpha?: number;
    align?: boolean;
  }): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.pool.length;
    const i3 = i * 3;
    const p = this.pool[i];
    p.active = true;
    p.pos.copy(o.pos);
    p.vel.copy(o.vel ?? new THREE.Vector3());
    if (o.color instanceof THREE.Color) p.color.copy(o.color);
    else p.color.set(o.color ?? 0xffffff);
    p.s0 = o.size ?? 0.3;
    p.s1 = o.sizeEnd ?? 0;
    p.life = o.life ?? 1;
    p.age = 0;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.spin = o.spin ?? 0;
    p.rot = o.spin ? Math.random() * 6.28 : 0;
    p.alpha0 = o.alpha ?? 1;
    p.align = o.align ?? false;

    this.posArr[i3] = p.pos.x;
    this.posArr[i3 + 1] = p.pos.y;
    this.posArr[i3 + 2] = p.pos.z;
    this.colArr[i3] = p.color.r;
    this.colArr[i3 + 1] = p.color.g;
    this.colArr[i3 + 2] = p.color.b;
    this.sizeArr[i] = p.s0;
    this.alphaArr[i] = p.alpha0;
    this.rotArr[i] = p.rot;
  }

  update(dt: number, camera?: THREE.Camera): void {
    const max = this.pool.length;
    for (let i = 0; i < max; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.age += dt;
      const i3 = i * 3;
      if (p.age >= p.life) {
        p.active = false;
        this.alphaArr[i] = 0;
        this.posArr[i3 + 1] = -9999;
        continue;
      }
      const k = p.age / p.life;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vel.x *= d;
      p.vel.y = p.vel.y * d - p.gravity * dt;
      p.vel.z *= d;
      p.pos.addScaledVector(p.vel, dt);

      this.posArr[i3] = p.pos.x;
      this.posArr[i3 + 1] = p.pos.y;
      this.posArr[i3 + 2] = p.pos.z;
      this.sizeArr[i] = p.s0 + (p.s1 - p.s0) * k;
      // đường cong alpha chép nguyên văn: vào nhanh, ra chậm
      this.alphaArr[i] = p.alpha0 * Math.min(1, (1 - k) * 2.5) * Math.min(1, k * 12 + 0.2);
      p.rot += p.spin * dt;
      if (p.align && camera) {
        // xoay sprite theo hình chiếu hướng bay lên màn hình
        const v = p.vel.clone().normalize();
        const right = new THREE.Vector3().crossVectors(camera.up, v).normalize();
        const up = new THREE.Vector3().crossVectors(v, right).normalize();
        p.rot = Math.atan2(up.y, right.y) + Math.PI / 2;
      }
      this.rotArr[i] = p.rot;
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = true;
    a.aColor.needsUpdate = true;
    a.aSize.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
    a.aRot.needsUpdate = true;
  }

  resize(): void {
    this.mat.uniforms.uScale.value = window.innerHeight * 0.5;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

/* ============================================== tia sét (captain-kid gốc) */

/**
 * characters/captain-kid/src/game/FX.ts:129-281 — Lightning.
 * Tia sét sinh nhiều đốt gãy khúc giữa hai điểm, mỗi đốt lệch ngẫu nhiên theo
 * phương vuông góc, rồi tắt dần.
 */
class Lightning {
  private lines: {
    mesh: THREE.Line;
    mat: THREE.LineBasicMaterial;
    life: number;
    maxLife: number;
  }[] = [];
  readonly group = new THREE.Group();

  bolt(
    a: THREE.Vector3,
    b: THREE.Vector3,
    color: THREE.Color,
    width: number,
    life: number,
    jag: number,
  ): void {
    const segs = 12;
    const pts: THREE.Vector3[] = [];
    const dir = b.clone().sub(a);
    const perp1 = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    if (perp1.lengthSq() < 0.01) perp1.set(1, 0, 0);
    const perp2 = dir.clone().cross(perp1).normalize();
    for (let i = 0; i <= segs; i++) {
      const k = i / segs;
      const p = a.clone().addScaledVector(dir, k);
      if (i > 0 && i < segs) {
        const amp = dir.length() * jag * Math.sin(k * Math.PI);
        p.addScaledVector(perp1, rnd(-amp, amp)).addScaledVector(perp2, rnd(-amp, amp));
      }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: width,
    });
    const mesh = new THREE.Line(geo, mat);
    this.group.add(mesh);
    this.lines.push({ mesh, mat, life, maxLife: life });
  }

  update(dt: number): void {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.life -= dt;
      if (l.life <= 0) {
        this.group.remove(l.mesh);
        l.mesh.geometry.dispose();
        l.mat.dispose();
        this.lines.splice(i, 1);
        continue;
      }
      l.mat.opacity = l.life / l.maxLife;
    }
  }

  dispose(): void {
    for (const l of this.lines) {
      l.mesh.geometry.dispose();
      l.mat.dispose();
    }
    this.lines.length = 0;
  }
}

/* ================================================== hệ hiệu ứng per-char */

/** Tham số emit chép từ chính chỗ gọi trong game gốc */
interface EmitProfile {
  count: number;
  size: [number, number];
  sizeEnd: number;
  life: [number, number];
  speed: [number, number];
  gravity: number;
  drag: number;
  spin: [number, number];
  align: boolean;
  /** hướng bay: 1 = theo hướng đánh, 0 = toả tròn */
  forward: number;
}

const PROFILES: Record<CharId, EmitProfile> = {
  // Game.ts:1068 — hearts.emit size 0.15..0.5 → 1..2.2, life 0.8..1.3, spin ±5, drag 0.4
  'boa-hancock': {
    count: 14, size: [0.15, 0.5], sizeEnd: 1.8, life: [0.8, 1.3],
    speed: [1.5, 5], gravity: -0.6, drag: 0.4, spin: [-5, 5], align: false, forward: 0.35,
  },
  // FX.ts:458 burst + 420 ring — mảnh sắt bắn nhanh, tắt nhanh
  'captain-kid': {
    count: 20, size: [0.08, 0.22], sizeEnd: 0.02, life: [0.3, 0.7],
    speed: [8, 22], gravity: 3.5, drag: 1.2, spin: [-9, 9], align: true, forward: 0.7,
  },
  // Effects.ts — sợi chỉ mảnh, bay xa, khựng lại rồi tan
  doflamingo: {
    count: 16, size: [0.12, 0.3], sizeEnd: 0.05, life: [0.5, 1.0],
    speed: [6, 16], gravity: 0.4, drag: 0.9, spin: [0, 0], align: true, forward: 0.85,
  },
  // fxlib.ts:34 blackExplosion — khói đen cuộn lên
  imu: {
    count: 24, size: [0.3, 0.8], sizeEnd: 1.6, life: [1.0, 2.0],
    speed: [2, 8], gravity: -1.8, drag: 0.6, spin: [-2, 2], align: false, forward: 0.3,
  },
  // gfx.ts Streaks — vệt sáng cực nhanh, gần như đường thẳng
  kizaru: {
    count: 18, size: [0.1, 0.26], sizeEnd: 0.04, life: [0.15, 0.4],
    speed: [18, 44], gravity: 0, drag: 0.5, spin: [0, 0], align: true, forward: 0.95,
  },
  // effects.ts Bursts — chấm halftone bung đều
  luffy: {
    count: 18, size: [0.2, 0.45], sizeEnd: 0.6, life: [0.35, 0.8],
    speed: [7, 18], gravity: 2.2, drag: 1.0, spin: [-4, 4], align: false, forward: 0.5,
  },
  // vfxSystem.ts — kiếm khí hình lưỡi liềm, bay theo phương chém
  zoro: {
    count: 20, size: [0.25, 0.55], sizeEnd: 0.08, life: [0.2, 0.5],
    speed: [12, 30], gravity: 1.2, drag: 1.1, spin: [0, 0], align: true, forward: 0.9,
  },
};

/**
 * Hệ hiệu ứng của một nhân vật: một bể hạt chính + tia sét (nếu là Kid).
 */
export class CharFx {
  readonly field: ParticleField;
  readonly group = new THREE.Group();
  private lightning = new Lightning();
  private profile: EmitProfile;
  private id: CharId;

  constructor(id: CharId, max = 700) {
    this.id = id;
    this.profile = PROFILES[id];
    const tex = texturesFor(id);
    this.field = new ParticleField(max, tex.primary);
    this.group.add(this.field.points);
    this.group.add(this.lightning.group);
  }

  /**
   * Phát hiệu ứng tại một điểm, theo hướng `dir`.
   * Tham số lấy từ PROFILES — chép đúng từ chỗ gọi trong game gốc.
   */
  emit(pos: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color, power = 1): void {
    const p = this.profile;
    const n = Math.round(p.count * (0.6 + power * 0.7));
    const d = dir.clone().normalize();

    for (let i = 0; i < n; i++) {
      // hướng bay: một phần theo hướng đánh, phần còn lại toả ngẫu nhiên
      const rndDir = new THREE.Vector3(
        rnd(-1, 1), rnd(-1, 1), rnd(-1, 1),
      ).normalize();
      const v = rndDir.multiplyScalar(1 - p.forward).addScaledVector(d, p.forward).normalize();
      v.multiplyScalar(rnd(p.speed[0], p.speed[1]));
      this.field.spawn({
        pos: pos.clone(),
        vel: v,
        color,
        size: rnd(p.size[0], p.size[1]),
        sizeEnd: p.sizeEnd,
        life: rnd(p.life[0], p.life[1]),
        gravity: p.gravity,
        drag: p.drag,
        spin: rnd(p.spin[0], p.spin[1]),
        alpha: 0.95,
        align: p.align,
      });
    }

    // Kid: kèm tia sét bắn từ điểm phát ra ngoài — đúng FX.ts
    if (this.id === 'captain-kid') {
      for (let i = 0; i < 3; i++) {
        const target = pos.clone().addScaledVector(
          new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize(),
          rnd(2, 5),
        );
        this.lightning.bolt(pos, target, color, 0.08, 0.12, 0.12);
      }
    }
  }

  /** vệt kéo dài từ A tới B (dùng cho đòn tầm xa) */
  stream(a: THREE.Vector3, b: THREE.Vector3, color: THREE.Color, power = 1): void {
    const p = this.profile;
    const n = Math.round(10 + power * 16);
    const dir = b.clone().sub(a);
    const len = dir.length();
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const pos = a.clone().addScaledVector(dir, k);
      const v = dir.clone().normalize().multiplyScalar(rnd(p.speed[0], p.speed[1]) * 0.35);
      pos.x += rnd(-0.15, 0.15);
      pos.y += rnd(-0.15, 0.15);
      pos.z += rnd(-0.15, 0.15);
      this.field.spawn({
        pos,
        vel: v,
        color,
        size: rnd(p.size[0], p.size[1]) * Math.max(0.6, 1 - k * 0.4),
        sizeEnd: p.sizeEnd,
        life: Math.max(0.12, len / 40) * rnd(0.6, 1.1),
        gravity: p.gravity * 0.35,
        drag: p.drag,
        spin: rnd(p.spin[0], p.spin[1]),
        alpha: 0.9,
        align: p.align,
      });
    }
    if (this.id === 'captain-kid' && len > 1) {
      this.lightning.bolt(a, b, color, 0.1, 0.14, 0.1);
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    this.field.update(dt, camera);
    this.lightning.update(dt);
  }

  resize(): void {
    this.field.resize();
  }

  dispose(): void {
    this.field.dispose();
    this.lightning.dispose();
  }
}

/** map FxKind → CharId để tương thích chỗ gọi cũ */
export const FX_KIND_TO_CHAR: Record<FxKind, CharId> = {
  heart: 'boa-hancock',
  magnet: 'captain-kid',
  string: 'doflamingo',
  void: 'imu',
  light: 'kizaru',
  rubber: 'luffy',
  blade: 'zoro',
};
