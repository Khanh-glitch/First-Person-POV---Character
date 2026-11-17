/**
 * ENEMY — đối thủ 1v1 dưới dạng rig 3D đơn giản nhưng có "chất" riêng.
 *
 * Rig được dựng bằng hình khối cơ bản (không asset ngoài) và mang bảng màu
 * của nhân vật tương ứng, nên nhìn là nhận ra ai. Nó cũng là **bề mặt tiếp
 * nhận hiệu ứng**: mọi đòn đánh đều gắn decal / ám hiệu lên thân đối thủ
 * (cháy xém, đóng băng, hoá đá, quấn chỉ, nhuốm hắc khí, nắm đấm cao su).
 */

import * as THREE from 'three';
import type { FxKind } from '../data/roster';

export type EnemyState = 'idle' | 'windup' | 'attack' | 'hurt' | 'stagger' | 'ko';

export interface StatusEffect {
  kind: FxKind | 'burn' | 'petrify' | 'bind' | 'stun' | 'mark';
  remaining: number;
  total: number;
  label: string;
  color: string;
}

export class Enemy {
  root = new THREE.Group();
  body = new THREE.Group();
  private torso: THREE.Mesh;
  private head: THREE.Mesh;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private mats: THREE.MeshStandardMaterial[] = [];
  private auraMat: THREE.MeshBasicMaterial;
  private ringMat: THREE.MeshBasicMaterial;
  private coreMat: THREE.MeshStandardMaterial;

  private baseColor: THREE.Color;
  private petrified = false;
  private flashT = 0;
  private flashColor = new THREE.Color('#ffffff');
  private shakeT = 0;
  private shakeAmp = 0;

  /** Vị trí trong mặt phẳng XZ */
  pos = new THREE.Vector3(0, 0, -14);
  facing = 0;
  hp = 1000;
  maxHp = 1000;
  state: EnemyState = 'idle';
  statuses: StatusEffect[] = [];

  /** Cooldown chiêu của đối thủ */
  cooldowns: Record<string, number> = {};
  /** Thời gian còn lại của animation đang chạy */
  actionT = 0;
  actionDuration = 0;
  actionMoveId: string | null = null;
  /** Đòn đang niệm (windup) */
  windupT = 0;

  constructor(id: string, colorHex: string) {
    this.baseColor = new THREE.Color(colorHex);
    this.root.name = `enemy:${id}`;
    this.root.userData.charId = id;

    const mkMat = (color: number, rough = 0.7, metal = 0.15) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      this.mats.push(m);
      return m;
    };

    const dark = this.baseColor.clone().multiplyScalar(0.28).getHex();
    const mid = this.baseColor.clone().multiplyScalar(0.55).getHex();

    /* -------------------------------------------------------- thân */
    this.torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 0.86, 6, 14), mkMat(mid, 0.62, 0.22));
    this.torso.position.y = 1.55;
    this.torso.castShadow = true;
    this.body.add(this.torso);

    // ngực / giáp
    const chest = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 0.5, 0.52),
      mkMat(dark, 0.5, 0.45),
    );
    chest.position.y = 1.92;
    chest.castShadow = true;
    this.body.add(chest);

    /* -------------------------------------------------------- đầu */
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), mkMat(0xe8c2a0, 0.72, 0.05));
    this.head.position.y = 2.52;
    this.head.castShadow = true;
    this.body.add(this.head);

    // mắt phát sáng theo màu nhân vật — điểm nhấn nhận diện
    const eyeMat = new THREE.MeshBasicMaterial({ color: this.baseColor });
    this.mats.push(eyeMat as unknown as THREE.MeshStandardMaterial);
    for (const sx of [-0.12, 0.12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
      eye.position.set(sx, 2.56, 0.3);
      this.body.add(eye);
    }

    /* -------------------------------------------------------- tay */
    const armGeo = new THREE.CapsuleGeometry(0.15, 0.78, 5, 10);
    this.armL = new THREE.Mesh(armGeo, mkMat(mid, 0.66, 0.18));
    this.armL.position.set(-0.68, 1.72, 0);
    this.armL.castShadow = true;
    this.body.add(this.armL);

    this.armR = new THREE.Mesh(armGeo, mkMat(mid, 0.66, 0.18));
    this.armR.position.set(0.68, 1.72, 0);
    this.armR.castShadow = true;
    this.body.add(this.armR);

    /* -------------------------------------------------------- chân */
    const legGeo = new THREE.CapsuleGeometry(0.185, 0.74, 5, 10);
    this.legL = new THREE.Mesh(legGeo, mkMat(dark, 0.82, 0.12));
    this.legL.position.set(-0.24, 0.55, 0);
    this.legL.castShadow = true;
    this.body.add(this.legL);

    this.legR = new THREE.Mesh(legGeo, mkMat(dark, 0.82, 0.12));
    this.legR.position.set(0.24, 0.55, 0);
    this.legR.castShadow = true;
    this.body.add(this.legR);

    /* -------------------------------------------------------- lõi năng lượng */
    this.coreMat = new THREE.MeshStandardMaterial({
      color: this.baseColor, emissive: this.baseColor,
      emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.4,
    });
    this.mats.push(this.coreMat);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), this.coreMat);
    core.position.y = 2.0;
    core.name = 'core';
    this.body.add(core);

    /* -------------------------------------------------------- hào quang */
    this.auraMat = new THREE.MeshBasicMaterial({
      color: this.baseColor, transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const aura = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 3.4, 20, 1, true), this.auraMat);
    aura.position.y = 1.7;
    this.body.add(aura);

    /* -------------------------------------------------------- vòng dưới chân */
    this.ringMat = new THREE.MeshBasicMaterial({
      color: this.baseColor, transparent: true, opacity: 0.42,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.14, 40), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    this.root.add(ring);

    this.root.add(this.body);
    this.root.position.copy(this.pos);
  }

  setColor(colorHex: string) {
    this.baseColor.set(colorHex);
    this.coreMat.color.copy(this.baseColor);
    this.coreMat.emissive.copy(this.baseColor);
    this.auraMat.color.copy(this.baseColor);
    this.ringMat.color.copy(this.baseColor);
  }

  /* ------------------------------------------------------------ status */

  applyStatus(effect: StatusEffect) {
    const existing = this.statuses.find((s) => s.kind === effect.kind);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, effect.remaining);
      existing.total = Math.max(existing.total, effect.total);
    } else {
      this.statuses.push(effect);
    }
    if (effect.kind === 'petrify') this.petrified = true;
  }

  hasStatus(kind: StatusEffect['kind']): boolean {
    return this.statuses.some((s) => s.kind === kind);
  }

  /* ------------------------------------------------------------ damage */

  damage(amount: number, colorHex: string) {
    this.hp = Math.max(0, this.hp - amount);
    this.flashT = 0.22;
    this.flashColor.set(colorHex);
    if (this.hp <= 0) {
      this.state = 'ko';
      this.actionT = 0;
    } else {
      this.shakeT = Math.min(0.4, 0.12 + amount / 260);
      this.shakeAmp = Math.min(0.18, 0.03 + amount / 900);
    }
  }

  stagger(seconds: number) {
    if (this.state === 'ko') return;
    this.state = 'stagger';
    this.actionT = seconds;
    this.actionMoveId = null;
  }

  reset() {
    this.hp = this.maxHp;
    this.state = 'idle';
    this.statuses = [];
    this.petrified = false;
    this.actionMoveId = null;
    this.actionT = 0;
    this.windupT = 0;
    this.cooldowns = {};
    this.pos.set(0, 0, -14);
    this.root.position.copy(this.pos);
    this.resetMaterials();
  }

  private resetMaterials() {
    for (const m of this.mats) {
      m.color.copy(m.userData.origColor ?? m.color);
    }
    this.petrified = false;
  }

  /** Ghi nhớ màu gốc để hoàn nguyên sau hiệu ứng */
  captureOriginalColors() {
    for (const m of this.mats) m.userData.origColor = m.color.clone();
  }

  /* ------------------------------------------------------------ update */

  update(dt: number, time: number, playerPos: THREE.Vector3) {
    /* --- status --- */
    for (let i = this.statuses.length - 1; i >= 0; i--) {
      const s = this.statuses[i];
      s.remaining -= dt;
      if (s.remaining <= 0) {
        if (s.kind === 'petrify') this.petrified = false;
        this.statuses.splice(i, 1);
      }
    }

    /* --- animation state --- */
    const busy = this.actionT > 0;
    if (busy) {
      this.actionT -= dt;
      if (this.actionT <= 0) {
        this.actionT = 0;
        if (this.state === 'stagger') this.state = 'idle';
        this.actionMoveId = null;
      }
    }

    /* --- quay về phía người chơi --- */
    const toPlayer = playerPos.clone().sub(this.pos);
    toPlayer.y = 0;
    const targetFacing = Math.atan2(toPlayer.x, toPlayer.z);
    let diff = targetFacing - this.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turnSpeed = this.petrified ? 0.3 : 3.4;
    this.facing += diff * Math.min(1, dt * turnSpeed);

    /* --- pose --- */
    const speedScale = this.petrified ? 0.08 : 1;
    const breathe = Math.sin(time * 1.7 * speedScale) * 0.02;
    const attackSwing = this.actionMoveId ? Math.sin((1 - this.actionT / Math.max(0.01, this.actionDuration)) * Math.PI) : 0;
    const staggerLean = this.state === 'stagger' ? Math.sin(time * 22) * 0.12 : 0;
    const koDrop = this.state === 'ko' ? 1 : 0;

    this.body.position.y = breathe - koDrop * 1.25;
    this.body.rotation.z = staggerLean - koDrop * 0.4;
    this.body.rotation.x = -attackSwing * 0.16 + (this.windupT > 0 ? 0.14 : 0);

    this.armR.rotation.x = -attackSwing * 2.0 + Math.sin(time * 1.5) * 0.06;
    this.armL.rotation.x = Math.sin(time * 1.5 + 1) * 0.06 - attackSwing * 0.3;
    this.legL.rotation.x = Math.sin(time * 1.2) * 0.04;
    this.legR.rotation.x = -Math.sin(time * 1.2) * 0.04;

    // lõi xoay + nhấp nháy
    const core = this.body.getObjectByName('core');
    if (core) {
      core.rotation.y = time * 1.6;
      core.rotation.x = time * 0.9;
      const pulse = 1 + Math.sin(time * 3.2) * 0.16 + attackSwing * 0.6;
      core.scale.setScalar(pulse);
    }

    this.auraMat.opacity = 0.1 + Math.sin(time * 2.1) * 0.04 + attackSwing * 0.22;
    this.ringMat.opacity = 0.3 + Math.sin(time * 2.6) * 0.1;

    /* --- vị trí + rung --- */
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;

    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT / 0.4);
      this.root.position.x += (Math.random() - 0.5) * this.shakeAmp * k * 4;
      this.root.position.z += (Math.random() - 0.5) * this.shakeAmp * k * 4;
    }

    /* --- màu theo trạng thái --- */
    this.applyVisualStatus(dt, time);
  }

  private applyVisualStatus(dt: number, time: number) {
    for (const m of this.mats) {
      if (!m.userData.origColor) m.userData.origColor = m.color.clone();
      const orig = m.userData.origColor as THREE.Color;

      if (this.petrified) {
        // hoá đá: xám + cứng
        m.color.copy(orig).lerp(new THREE.Color('#8d8d92'), 0.82);
        m.roughness = 0.96;
        m.metalness = 0.02;
      } else if (this.hasStatus('burn')) {
        const burn = this.statuses.find((s) => s.kind === 'burn')!;
        const k = Math.sin(time * 12) * 0.5 + 0.5;
        m.color.copy(orig).lerp(new THREE.Color('#ff6a2a'), 0.28 + k * 0.2 * (burn.remaining / burn.total));
      } else if (this.hasStatus('bind')) {
        const bind = this.statuses.find((s) => s.kind === 'bind')!;
        m.color.copy(orig).lerp(new THREE.Color('#ff7bb0'), 0.3 * (bind.remaining / bind.total));
      } else if (this.hasStatus('mark')) {
        const mark = this.statuses.find((s) => s.kind === 'mark')!;
        const k = Math.sin(time * 9) * 0.5 + 0.5;
        m.color.copy(orig).lerp(new THREE.Color('#b48cff'), 0.18 + k * 0.16 * (mark.remaining / mark.total));
      } else {
        m.color.copy(orig);
        m.roughness = 0.7;
        m.metalness = 0.15;
      }

      // flash khi trúng đòn
      if (this.flashT > 0) {
        m.color.lerp(this.flashColor, (this.flashT / 0.22) * 0.6);
      }

      // nhấp nháy khi bị choáng
      if (this.state === 'stagger') {
        m.emissive?.copy(this.baseColor).multiplyScalar(Math.sin(time * 26) * 0.2 + 0.2);
      }
    }
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
  }

  /** Khoảng cách tới người chơi */
  distanceTo(p: THREE.Vector3): number {
    const dx = this.pos.x - p.x;
    const dz = this.pos.z - p.z;
    return Math.hypot(dx, dz);
  }

  /** Điểm ngực để gắn hiệu ứng */
  chestPoint(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, 1.8, this.pos.z);
  }

  dispose() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
}
