/**
 * FX — tia nối và vệt chém (BỔ TRỢ cho hệ hạt per-character ở `particles.ts`).
 *
 * Hệ hạt chính đã chuyển sang `particles.ts` (port texture + tham số từ từng
 * dự án gốc). File này chỉ còn giữ hai thứ dùng chung mà mọi nhân vật đều
 * cần: tia nối hai điểm (beam/ring) và vệt chém (slash).
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
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/* ------------------------------------------------------------ sprite textures */




/* ------------------------------------------------------------ particle pool */

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
