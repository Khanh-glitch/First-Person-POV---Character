/**
 * FX — hệ hiệu ứng dùng chung, mỗi nhân vật có "chữ ký" riêng.
 *
 * Nguyên tắc: giữ đúng *chất* hiệu ứng của từng dự án gốc:
 *   boa-hancock  → trái tim hồng, cánh hoa, hoá đá (tĩnh lại + xám màu)
 *   captain-kid  → mảnh sắt vụn xoay quanh, tia điện từ trường
 *   doflamingo   → sợi chỉ căng, lưới chỉ, cắt chéo
 *   imu          → hắc khí, vòng xoáy vực thẳm, cột sáng đỏ
 *   kizaru       → tia laser vàng, flash trắng, vệt sáng
 *   luffy        → nắm đấm cao su phóng ra, vòng sốc, khói trắng
 *   zoro         → vệt chém (slash) xanh, tia lửa, chữ X
 *
 * Mọi thứ đều sinh bằng code (BufferGeometry + CanvasTexture), không asset ngoài.
 */

import * as THREE from 'three';
import type { FxKind } from '../data/roster';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/* ------------------------------------------------------------ sprite textures */

function heartTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = '#fff';
  g.beginPath();
  const s = 44, cx = 64, cy = 56;
  g.moveTo(cx, cy + s * 0.75);
  g.bezierCurveTo(cx - s * 1.6, cy - s * 0.2, cx - s * 0.5, cy - s * 1.05, cx, cy - s * 0.28);
  g.bezierCurveTo(cx + s * 0.5, cy - s * 1.05, cx + s * 1.6, cy - s * 0.2, cx, cy + s * 0.75);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sparkTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function streakTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 128, 0);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.5, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 6, 128, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------ particle pool */

interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  spin: number;
  age: number;
  life: number;
  gravity: number;
  drag: number;
  size0: number;
  size1: number;
  active: boolean;
}

export class ParticleSystem {
  group = new THREE.Group();
  private pool: Particle[] = [];
  private heartTex = heartTexture();
  private sparkTex = sparkTexture();
  private streakTex = streakTexture();

  constructor(max = 700) {
    for (let i = 0; i < max; i++) {
      const mat = new THREE.SpriteMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      this.group.add(sprite);
      this.pool.push({
        sprite, vel: new THREE.Vector3(), spin: 0, age: 0, life: 1,
        gravity: 0, drag: 0.94, size0: 1, size1: 1, active: false,
      });
    }
  }

  /** Lấy particle rảnh, hoặc tái dùng cái già nhất */
  private take(): Particle {
    for (const p of this.pool) if (!p.active) return p;
    let oldest = this.pool[0];
    for (const p of this.pool) if (p.age > oldest.age) oldest = p;
    return oldest;
  }

  private makeSprite(
    pos: THREE.Vector3, color: THREE.Color, tex: THREE.Texture,
    size: number, opacity = 1,
  ) {
    const p = this.take();
    p.active = true;
    p.age = 0;
    p.sprite.visible = true;
    p.sprite.position.copy(pos);
    p.sprite.scale.setScalar(size);
    p.size0 = size;
    const m = p.sprite.material as THREE.SpriteMaterial;
    m.map = tex;
    m.color.copy(color);
    m.opacity = opacity;
    m.needsUpdate = true;
    return p;
  }

  /* -------------------------------------------------------- per-character */

  /** Boa Hancock: trái tim bay lên + cánh hoa rơi */
  hearts(pos: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color, n = 26, spread = 1) {
    for (let i = 0; i < n; i++) {
      const p = this.makeSprite(pos, color, this.heartTex, rnd(0.3, 0.9), 1);
      p.vel.copy(dir).multiplyScalar(rnd(2, 9) * spread);
      p.vel.x += rnd(-3.2, 3.2);
      p.vel.y += rnd(-0.6, 3.6);
      p.vel.z += rnd(-3.2, 3.2);
      p.gravity = -1.1;
      p.drag = 0.965;
      p.spin = rnd(-2.5, 2.5);
      p.size1 = p.size0 * rnd(0.45, 1.0);
      p.life = rnd(0.75, 1.6);
    }
  }

  /** Captain Kid: mảnh sắt vụn + tia điện */
  scrap(pos: THREE.Vector3, color: THREE.Color, n = 22) {
    for (let i = 0; i < n; i++) {
      const p = this.makeSprite(
        pos.clone().add(new THREE.Vector3(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2))),
        color, this.sparkTex, rnd(0.14, 0.42), 1,
      );
      const orbit = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
      p.vel.copy(orbit).multiplyScalar(rnd(4, 16));
      p.gravity = 3.2;
      p.drag = 0.93;
      p.life = rnd(0.5, 1.25);
      p.size1 = p.size0 * 0.2;
    }
    // tia điện dài
    for (let i = 0; i < 8; i++) {
      const p = this.makeSprite(pos, color, this.streakTex, rnd(1.2, 3.2), 0.95);
      p.vel.set(rnd(-14, 14), rnd(-6, 10), rnd(-14, 14));
      p.gravity = -2;
      p.drag = 0.9;
      p.life = rnd(0.16, 0.4);
      p.size1 = p.size0 * 0.15;
    }
  }

  /** Doflamingo: sợi chỉ căng + tia cắt */
  strings(pos: THREE.Vector3, color: THREE.Color, n = 20) {
    for (let i = 0; i < n; i++) {
      const p = this.makeSprite(pos, color, this.streakTex, rnd(1.6, 4.5), 1);
      const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2);
      p.vel.set(Math.cos(a) * rnd(6, 18), rnd(-3, 7), Math.sin(a) * rnd(6, 18));
      p.gravity = 1.4;
      p.drag = 0.96;
      p.life = rnd(0.3, 0.75);
      p.size1 = p.size0 * 0.25;
    }
  }

  /** Imu: hắc khí dày + vòng xoáy */
  voidMist(pos: THREE.Vector3, color: THREE.Color, n = 30) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(0.4, 3.4);
      const p = this.makeSprite(
        pos.clone().add(new THREE.Vector3(Math.cos(a) * r, rnd(-1.5, 1.5), Math.sin(a) * r)),
        color, this.sparkTex, rnd(0.6, 2.2), 0.75,
      );
      p.vel.set(-Math.sin(a) * rnd(2, 7), rnd(1, 5.5), Math.cos(a) * rnd(2, 7));
      p.gravity = 1.1;
      p.drag = 0.97;
      p.life = rnd(0.9, 2.1);
      p.size1 = p.size0 * 1.7; // khí khuếch tán
    }
  }

  /** Kizaru: tia laser + flash */
  laserSparks(pos: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color, n = 24) {
    for (let i = 0; i < n; i++) {
      const p = this.makeSprite(pos, color, this.streakTex, rnd(1.0, 3.0), 1);
      p.vel.copy(dir).multiplyScalar(rnd(18, 52));
      p.vel.x += rnd(-4, 4);
      p.vel.y += rnd(-4, 4);
      p.vel.z += rnd(-4, 4);
      p.gravity = 0;
      p.drag = 0.985;
      p.life = rnd(0.1, 0.3);
      p.size1 = p.size0 * 0.2;
    }
  }

  /** Luffy: nắm đấm cao su + vòng sốc */
  rubberBurst(pos: THREE.Vector3, color: THREE.Color, n = 18) {
    for (let i = 0; i < n; i++) {
      const p = this.makeSprite(pos, color, this.sparkTex, rnd(0.3, 0.8), 1);
      const a = Math.random() * Math.PI * 2;
      const e = rnd(-0.6, 0.9);
      p.vel.set(Math.cos(a) * rnd(5, 17), e * 10, Math.sin(a) * rnd(5, 17));
      p.gravity = 2.6;
      p.drag = 0.94;
      p.life = rnd(0.35, 0.85);
      p.size1 = p.size0 * 1.9;
    }
  }

  /** Zoro: vệt chém + tia lửa */
  slashSparks(pos: THREE.Vector3, color: THREE.Color, n = 26, angle = 0) {
    for (let i = 0; i < n; i++) {
      const p = this.makeSprite(pos, color, this.streakTex, rnd(1.4, 3.6), 1);
      const a = angle + rnd(-0.5, 0.5);
      p.vel.set(Math.cos(a) * rnd(8, 26), rnd(-4, 6), Math.sin(a) * rnd(8, 26));
      p.gravity = 2.2;
      p.drag = 0.92;
      p.life = rnd(0.18, 0.5);
      p.size1 = p.size0 * 0.2;
    }
    for (let i = 0; i < 10; i++) {
      const p = this.makeSprite(pos, color, this.sparkTex, rnd(0.12, 0.3), 1);
      p.vel.set(rnd(-9, 9), rnd(-3, 9), rnd(-9, 9));
      p.gravity = 6;
      p.drag = 0.95;
      p.life = rnd(0.3, 0.7);
      p.size1 = p.size0 * 0.2;
    }
  }

  /** Dispatch theo loại hiệu ứng của nhân vật */
  emit(kind: FxKind, pos: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color, power = 1) {
    const n = Math.round(12 + power * 14);
    switch (kind) {
      case 'heart': this.hearts(pos, dir, color, n, 1); break;
      case 'magnet': this.scrap(pos, color, n); break;
      case 'string': this.strings(pos, color, n); break;
      case 'void': this.voidMist(pos, color, n + 10); break;
      case 'light': this.laserSparks(pos, dir, color, n); break;
      case 'rubber': this.rubberBurst(pos, color, n); break;
      case 'blade': this.slashSparks(pos, color, n, Math.atan2(dir.z, dir.x)); break;
    }
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.active = false;
        p.sprite.visible = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.sprite.position.addScaledVector(p.vel, dt);
      const m = p.sprite.material as THREE.SpriteMaterial;
      // fade + co lại
      m.opacity = 1 - k * k;
      const sz = p.size0 + (p.size1 - p.size0) * k;
      p.sprite.scale.setScalar(Math.max(0.001, sz));
      if (p.spin) {
        const w = p.sprite.material as THREE.SpriteMaterial;
        w.rotation += p.spin * dt;
      }
    }
  }

  dispose() {
    for (const p of this.pool) {
      (p.sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.heartTex.dispose();
    this.sparkTex.dispose();
    this.streakTex.dispose();
  }
}

/* ------------------------------------------------------------ beams & rings */

interface Beam {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  fade: boolean;
}

export class BeamSystem {
  group = new THREE.Group();
  private beams: Beam[] = [];
  private geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  private ringGeo = new THREE.RingGeometry(0.85, 1, 48);

  /** Tia nối từ `from` tới `to` */
  beam(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, radius = 0.16, life = 0.28) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const len = from.distanceTo(to);
    mesh.position.copy(mid);
    mesh.scale.set(radius, len, radius);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize(),
    );
    this.group.add(mesh);
    this.beams.push({ mesh, age: 0, life, fade: true });
    return mesh;
  }

  /** Vòng xung kích phẳng */
  ring(pos: THREE.Vector3, color: THREE.Color, size = 2, life = 0.5, grow = 14) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.copy(pos);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(size);
    mesh.userData.grow = grow;
    this.group.add(mesh);
    this.beams.push({ mesh, age: 0, life, fade: true });
    return mesh;
  }

  /** Cột sáng dựng đứng */
  pillar(pos: THREE.Vector3, color: THREE.Color, radius = 1.6, height = 40, life = 0.7) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.copy(pos).add(new THREE.Vector3(0, height / 2, 0));
    mesh.scale.set(radius, height, radius);
    this.group.add(mesh);
    this.beams.push({ mesh, age: 0, life, fade: true });
    return mesh;
  }

  update(dt: number) {
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i];
      b.age += dt;
      const k = clamp01(b.age / b.life);
      const mat = b.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - k) * 0.95;
      const grow = b.mesh.userData.grow as number | undefined;
      if (grow) b.mesh.scale.setScalar(b.mesh.scale.x + grow * dt);
      if (k >= 1) {
        this.group.remove(b.mesh);
        mat.dispose();
        this.beams.splice(i, 1);
      }
    }
  }

  dispose() {
    this.geo.dispose();
    this.ringGeo.dispose();
    for (const b of this.beams) (b.mesh.material as THREE.MeshBasicMaterial).dispose();
  }
}

/* ------------------------------------------------------------ slash ribbon */

/** Vệt chém hình lưỡi liềm (đặc trưng Zoro / Doflamingo) */
export class SlashSystem {
  group = new THREE.Group();
  private items: { mesh: THREE.Mesh; age: number; life: number }[] = [];

  slash(
    pos: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color,
    radius = 3.6, arc = Math.PI * 0.85, life = 0.3, roll = 0,
  ) {
    const shape = new THREE.Shape();
    const seg = 24;
    shape.moveTo(0, 0);
    for (let i = 0; i <= seg; i++) {
      const a = -arc / 2 + (arc * i) / seg;
      shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    shape.lineTo(0, 0);
    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    // hướng theo `dir`, rồi xoay quanh trục đó
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1), dir.clone().normalize(),
    );
    const rollQ = new THREE.Quaternion().setFromAxisAngle(dir.clone().normalize(), roll);
    mesh.quaternion.copy(rollQ).multiply(q);
    this.group.add(mesh);
    this.items.push({ mesh, age: 0, life });
    return mesh;
  }

  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      const k = clamp01(it.age / it.life);
      const mat = it.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = 1 - k;
      it.mesh.scale.setScalar(1 + k * 0.55);
      if (k >= 1) {
        this.group.remove(it.mesh);
        (it.mesh.geometry as THREE.BufferGeometry).dispose();
        mat.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  dispose() {
    for (const it of this.items) {
      (it.mesh.geometry as THREE.BufferGeometry).dispose();
      (it.mesh.material as THREE.MeshBasicMaterial).dispose();
    }
  }
}
