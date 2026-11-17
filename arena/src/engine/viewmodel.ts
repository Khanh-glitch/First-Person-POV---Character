/**
 * VIEWMODEL — "chính xác góc nhìn" của từng nhân vật.
 *
 * Mỗi nhân vật có một rig riêng gắn trực tiếp vào camera (giống hệt cách các
 * dự án gốc làm: `camera.add(container)`), nên luôn nằm trong khung hình POV
 * và không bị ảnh hưởng bởi vị trí nhân vật trong thế giới.
 *
 * Toàn bộ hình khối sinh bằng code, không dùng model ngoài:
 *   boa-hancock  → bàn tay thanh mảnh + trái tim phát sáng
 *   captain-kid  → cánh tay cơ khí khổng lồ bằng sắt vụn
 *   doflamingo   → hai tay + sợi chỉ hồng căng giữa các ngón
 *   imu          → tay áo choàng tối + quả cầu hư vô
 *   kizaru       → tay hình súng (hai ngón) + đầu ngón phát sáng
 *   luffy        → cánh tay cao su co giãn + nắm đấm
 *   zoro         → ba thanh katana (2 tay + 1 ngậm miệng)
 */

import * as THREE from 'three';
import type { CharId } from '../data/roster';

const SKIN = 0xf0c9a8;

function finger(len: number, r: number, mat: THREE.Material) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 8);
  return new THREE.Mesh(g, mat);
}

/** Bàn tay đơn giản 4 ngón + ngón cái */
function buildHand(side: 1 | -1, skinColor = SKIN, glove?: number): THREE.Group {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: glove ?? skinColor,
    roughness: glove ? 0.75 : 0.62,
    metalness: glove ? 0.1 : 0.02,
  });

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.055), mat);
  palm.geometry.translate(0, 0, 0);
  root.add(palm);

  const fingerXR = [0.032, 0.011, -0.011, -0.032];
  const lens = [0.075, 0.085, 0.078, 0.062];
  for (let i = 0; i < 4; i++) {
    const f = finger(lens[i], 0.0125, mat);
    f.position.set(fingerXR[i], -0.06 - lens[i] / 2, 0.004);
    f.rotation.z = (fingerXR[i] / 0.04) * 0.12;
    root.add(f);
  }

  const thumb = finger(0.058, 0.0145, mat);
  thumb.position.set(side * 0.058, -0.03, 0.012);
  thumb.rotation.set(0.2, 0, side * -1.05);
  root.add(thumb);

  // cổ tay
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.1, 10), mat);
  wrist.position.set(0, 0.105, 0);
  root.add(wrist);

  return root;
}

/** Thanh katana đơn giản nhưng có hamon + tsuba */
function buildKatana(bladeHex: string, wrapHex: string): THREE.Group {
  const root = new THREE.Group();

  const bladeMat = new THREE.MeshStandardMaterial({
    color: bladeHex, metalness: 0.95, roughness: 0.16,
    emissive: new THREE.Color(bladeHex), emissiveIntensity: 0.12,
  });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.92, 0.006), bladeMat);
  blade.position.y = 0.5;
  root.add(blade);

  // mũi nhọn
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.09, 4), bladeMat);
  tip.position.y = 1.0;
  tip.rotation.y = Math.PI / 4;
  root.add(tip);

  // tsuba
  const tsuba = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12),
    new THREE.MeshStandardMaterial({ color: 0xc9a23e, metalness: 0.9, roughness: 0.3 }),
  );
  tsuba.position.y = 0.035;
  root.add(tsuba);

  // chuôi
  const grip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.019, 0.021, 0.2, 8),
    new THREE.MeshStandardMaterial({ color: wrapHex, roughness: 0.85 }),
  );
  grip.position.y = -0.08;
  root.add(grip);

  return root;
}

/** Cánh tay cơ khí từ sắt vụn (Captain Kid) */
function buildScrapArm(): THREE.Group {
  const root = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({
    color: 0x8a929c, metalness: 0.92, roughness: 0.38,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x4e555e, metalness: 0.85, roughness: 0.55,
  });

  // cẳng tay
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.11, 0.34, 8), metal);
  fore.position.set(0, -0.02, 0);
  root.add(fore);

  // nắm đấm lớn
  const fist = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.18, 0.2), metal);
  fist.position.set(0, -0.26, -0.02);
  root.add(fist);

  // các mảnh sắt vụn vướng vào
  for (let i = 0; i < 7; i++) {
    const s = 0.03 + Math.random() * 0.05;
    const chunk = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.6, s * 1.3), darkMetal);
    const a = Math.random() * Math.PI * 2;
    chunk.position.set(Math.cos(a) * 0.11, -0.2 + Math.random() * 0.3, Math.sin(a) * 0.09);
    chunk.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    root.add(chunk);
  }

  // bu lông
  for (let i = 0; i < 5; i++) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 6), darkMetal);
    bolt.position.set(
      (Math.random() - 0.5) * 0.16, -0.1 - Math.random() * 0.2, 0.09 + Math.random() * 0.02,
    );
    bolt.rotation.x = Math.PI / 2;
    root.add(bolt);
  }

  return root;
}

/** Quả cầu hư vô (Imu) */
function buildVoidOrb(color: string): THREE.Group {
  const root = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.07, 1),
    new THREE.MeshStandardMaterial({
      color: 0x120018, emissive: new THREE.Color(color),
      emissiveIntensity: 2.4, roughness: 0.4,
    }),
  );
  root.add(core);

  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.15, 24),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  halo.rotation.x = Math.PI / 2.4;
  root.add(halo);

  root.userData.spin = true;
  return root;
}

export interface ViewModel {
  root: THREE.Group;
  update(dt: number, time: number, castT: number): void;
  dispose(): void;
}

export function buildViewModel(charId: CharId, colorHex: string): ViewModel {
  const root = new THREE.Group();
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  const track = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
    disposables.push(x);
    return x;
  };

  let idle: (dt: number, time: number) => void = () => {};
  let cast: (k: number) => void = () => {};

  switch (charId) {
    /* ------------------------------------------------ BOA HANCOCK */
    case 'boa-hancock': {
      const hand = buildHand(1, SKIN);
      hand.position.set(0.3, -0.3, -0.52);
      hand.rotation.set(0.5, 0.32, -0.62);
      root.add(hand);

      // trái tim phát sáng trong lòng bàn tay
      const heartMat = track(new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex), transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const heart = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.05, 0)), heartMat);
      heart.position.set(0.03, -0.12, 0.02);
      hand.add(heart);

      const baseX = hand.position.x;
      idle = (_dt, time) => {
        hand.position.y = -0.3 + Math.sin(time * 1.6) * 0.012;
        heart.rotation.y = time * 1.4;
        heart.scale.setScalar(1 + Math.sin(time * 3.4) * 0.16);
      };
      cast = (k) => {
        hand.position.x = baseX - Math.sin(k * Math.PI) * 0.1;
        heartMat.opacity = 0.55 + Math.sin(k * Math.PI) * 0.45;
      };
      break;
    }

    /* ------------------------------------------------ CAPTAIN KID */
    case 'captain-kid': {
      const arm = buildScrapArm();
      arm.position.set(0.34, -0.34, -0.5);
      arm.rotation.set(0.18, -0.3, 0.16);
      root.add(arm);

      const spark = new THREE.Mesh(
        track(new THREE.SphereGeometry(0.03, 8, 8)),
        track(new THREE.MeshBasicMaterial({
          color: new THREE.Color(colorHex), transparent: true, opacity: 0.85,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })),
      );
      spark.position.set(0, -0.32, -0.02);
      arm.add(spark);

      const baseY = arm.position.y;
      idle = (_dt, time) => {
        arm.position.y = baseY + Math.sin(time * 1.3) * 0.014;
        arm.rotation.z = 0.16 + Math.sin(time * 0.9) * 0.02;
        spark.scale.setScalar(0.8 + Math.abs(Math.sin(time * 9)) * 0.6);
      };
      cast = (k) => {
        arm.rotation.z = 0.16 - Math.sin(k * Math.PI) * 0.35;
        arm.position.z = -0.5 - Math.sin(k * Math.PI) * 0.12;
      };
      break;
    }

    /* ------------------------------------------------ DOFLAMINGO */
    case 'doflamingo': {
      const right = buildHand(1, SKIN);
      right.position.set(0.33, -0.31, -0.5);
      right.rotation.set(0.44, 0.36, -0.7);
      root.add(right);

      const left = buildHand(-1, SKIN);
      left.position.set(-0.2, -0.36, -0.56);
      left.rotation.set(0.5, -0.3, 0.55);
      root.add(left);

      // sợi chỉ hồng giữa hai bàn tay
      const stringMat = track(new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex), transparent: true, opacity: 0.75,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const stringGeo = track(new THREE.BufferGeometry());
      const positions = new Float32Array(5 * 3);
      stringGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const line = new THREE.Line(stringGeo, stringMat);
      root.add(line);

      idle = (_dt, time) => {
        const a = new THREE.Vector3(0.33, -0.34, -0.5);
        const b = new THREE.Vector3(-0.2, -0.39, -0.56);
        for (let i = 0; i < 5; i++) {
          const u = i / 4;
          positions[i * 3] = a.x + (b.x - a.x) * u;
          positions[i * 3 + 1] = a.y + (b.y - a.y) * u + Math.sin(time * 4 + u * 3) * 0.012;
          positions[i * 3 + 2] = a.z + (b.z - a.z) * u;
        }
        stringGeo.attributes.position.needsUpdate = true;
      };
      cast = (k) => {
        right.rotation.z = -0.7 + Math.sin(k * Math.PI) * 0.3;
        stringMat.opacity = 0.75 + Math.sin(k * Math.PI) * 0.25;
      };
      break;
    }

    /* ------------------------------------------------ IMU */
    case 'imu': {
      // tay áo choàng tối
      const sleeveMat = track(new THREE.MeshStandardMaterial({
        color: 0x0d0a16, roughness: 0.95, metalness: 0.05,
      }));
      const sleeve = new THREE.Mesh(track(new THREE.CylinderGeometry(0.1, 0.16, 0.34, 10)), sleeveMat);
      sleeve.position.set(0.28, -0.36, -0.56);
      sleeve.rotation.set(0.5, 0, -0.3);
      root.add(sleeve);

      const orb = buildVoidOrb(colorHex);
      orb.position.set(0.24, -0.19, -0.54);
      root.add(orb);

      idle = (_dt, time) => {
        orb.rotation.y = time * 0.8;
        orb.rotation.x = Math.sin(time * 0.6) * 0.3;
        orb.position.y = -0.19 + Math.sin(time * 1.4) * 0.018;
      };
      cast = (k) => {
        orb.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.9);
        sleeve.rotation.z = -0.3 + Math.sin(k * Math.PI) * 0.2;
      };
      break;
    }

    /* ------------------------------------------------ KIZARU */
    case 'kizaru': {
      const hand = buildHand(1, SKIN, 0xf6e6c8);
      hand.position.set(0.26, -0.22, -0.5);
      hand.rotation.set(0.05, 0.05, -1.35); // pose "súng" hai ngón
      root.add(hand);

      // đầu ngón phát sáng
      const tipMat = track(new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex), transparent: true, opacity: 0.95,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const tip = new THREE.Mesh(track(new THREE.SphereGeometry(0.022, 10, 10)), tipMat);
      tip.position.set(0.03, -0.14, 0.01);
      hand.add(tip);

      idle = (_dt, time) => {
        hand.position.y = -0.22 + Math.sin(time * 1.8) * 0.01;
        tip.scale.setScalar(0.75 + Math.abs(Math.sin(time * 6)) * 0.5);
        tipMat.opacity = 0.7 + Math.abs(Math.sin(time * 6)) * 0.3;
      };
      cast = (k) => {
        tipMat.opacity = 1;
        tip.scale.setScalar(1 + Math.sin(k * Math.PI) * 2.2);
        hand.position.z = -0.5 + Math.sin(k * Math.PI) * 0.06;
      };
      break;
    }

    /* ------------------------------------------------ LUFFY */
    case 'luffy': {
      // cánh tay cao su: ống co giãn
      const skinMat = track(new THREE.MeshStandardMaterial({
        color: 0xf0b58a, roughness: 0.7, metalness: 0.0,
      }));
      const tube = new THREE.Mesh(track(new THREE.CylinderGeometry(0.055, 0.07, 0.4, 12)), skinMat);
      tube.position.set(0.3, -0.32, -0.48);
      tube.rotation.set(0.55, 0.1, -0.5);
      root.add(tube);

      const fist = new THREE.Mesh(track(new THREE.SphereGeometry(0.085, 14, 12)), skinMat);
      fist.position.set(0.34, -0.13, -0.6);
      fist.scale.set(1, 0.85, 1);
      root.add(fist);

      // cổ tay áo đỏ
      const cuff = new THREE.Mesh(
        track(new THREE.CylinderGeometry(0.062, 0.062, 0.05, 12)),
        track(new THREE.MeshStandardMaterial({ color: 0xd93a2b, roughness: 0.85 })),
      );
      cuff.position.set(0.3, -0.26, -0.5);
      cuff.rotation.copy(tube.rotation);
      root.add(cuff);

      idle = (_dt, time) => {
        fist.position.y = -0.13 + Math.sin(time * 1.5) * 0.012;
        fist.rotation.z = Math.sin(time * 1.1) * 0.08;
      };
      cast = (k) => {
        const punch = Math.sin(k * Math.PI);
        fist.position.z = -0.6 - punch * 0.55;
        fist.position.y = -0.13 + punch * 0.08;
        fist.scale.setScalar(1 + punch * 0.5);
      };
      break;
    }

    /* ------------------------------------------------ ZORO */
    case 'zoro': {
      // 2 kiếm hai tay
      const rKat = buildKatana('#e8f4ff', '#1a3a2a');
      rKat.position.set(0.3, -0.34, -0.5);
      rKat.rotation.set(-0.72, -0.25, 0.42);
      root.add(rKat);

      const lKat = buildKatana('#e8f4ff', '#1a3a2a');
      lKat.position.set(-0.26, -0.36, -0.52);
      lKat.rotation.set(-0.78, 0.3, -0.44);
      root.add(lKat);

      // kiếm ngậm miệng (Wado) — góc dưới giữa khung hình
      const mKat = buildKatana('#ffffff', '#f2f2f2');
      mKat.position.set(0.02, -0.5, -0.44);
      mKat.rotation.set(-1.02, 0.06, 0.06);
      root.add(mKat);

      idle = (_dt, time) => {
        const sway = Math.sin(time * 1.25) * 0.012;
        rKat.position.y = -0.34 + sway;
        lKat.position.y = -0.36 + sway * 0.8;
        mKat.position.y = -0.5 + sway * 0.6;
      };
      cast = (k) => {
        const swing = Math.sin(k * Math.PI);
        rKat.rotation.z = 0.42 - swing * 1.5;
        lKat.rotation.z = -0.44 + swing * 1.4;
        rKat.rotation.x = -0.72 - swing * 0.35;
        lKat.rotation.x = -0.78 - swing * 0.3;
      };
      break;
    }
  }

  return {
    root,
    update(dt, time, castT) {
      idle(dt, time);
      if (castT > 0) cast(castT);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    },
  };
}
