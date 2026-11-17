/**
 * WORLD — đấu trường 1v1.
 *
 * Một đảo tròn giữa biển, có cột đá, đuốc, và bầu trời chuyển màu theo
 * nhân vật người chơi. Sàn có lưới phát sáng để dễ cảm nhận khoảng cách —
 * quan trọng vì sát thương trong arena phụ thuộc tầm với.
 */

import * as THREE from 'three';

const ARENA_RADIUS = 26;

export class World {
  scene = new THREE.Scene();
  private disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  private torches: { light: THREE.PointLight; base: number; phase: number }[] = [];
  sun: THREE.DirectionalLight;
  ambient: THREE.HemisphereLight;
  private grid: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;

  constructor() {
    const track = <T extends THREE.BufferGeometry | THREE.Material | THREE.Texture>(x: T): T => {
      this.disposables.push(x);
      return x;
    };

    /* ---------------------------------------------------------- bầu trời */
    const skyGeo = track(new THREE.SphereGeometry(400, 32, 24));
    this.skyMat = track(new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color('#070a14') },
        uBottom: { value: new THREE.Color('#1b2436') },
        uAccent: { value: new THREE.Color('#2b3f66') },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform vec3 uAccent;
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y * 0.5 + 0.5;
          vec3 col = mix(uBottom, uTop, pow(h, 0.85));
          float band = smoothstep(0.42, 0.56, h) * (1.0 - smoothstep(0.56, 0.72, h));
          col += uAccent * band * 0.35;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }));
    const sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.scene.add(sky);

    /* ---------------------------------------------------------- sương mù */
    this.scene.fog = new THREE.FogExp2(0x0a0f1a, 0.012);

    /* ---------------------------------------------------------- ánh sáng */
    this.ambient = new THREE.HemisphereLight(0x9fb4dd, 0x141a26, 0.85);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xfff0d0, 1.5);
    this.sun.position.set(18, 34, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 120;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40;
    this.scene.add(this.sun);

    /* ---------------------------------------------------------- mặt biển */
    const seaGeo = track(new THREE.PlaneGeometry(900, 900, 1, 1));
    const seaMat = track(new THREE.MeshStandardMaterial({
      color: 0x0a1a2e, roughness: 0.22, metalness: 0.72,
    }));
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -2.4;
    sea.receiveShadow = true;
    this.scene.add(sea);

    /* ---------------------------------------------------------- đảo */
    const islandGeo = track(new THREE.CylinderGeometry(ARENA_RADIUS + 3, ARENA_RADIUS + 5, 4, 64));
    const islandMat = track(new THREE.MeshStandardMaterial({
      color: 0x2a2f38, roughness: 0.92, metalness: 0.08,
    }));
    const island = new THREE.Mesh(islandGeo, islandMat);
    island.position.y = -2;
    island.receiveShadow = true;
    this.scene.add(island);

    const floorGeo = track(new THREE.CircleGeometry(ARENA_RADIUS, 72));
    const floorMat = track(new THREE.MeshStandardMaterial({
      color: 0x353b47, roughness: 0.82, metalness: 0.14,
    }));
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    /* ---------------------------------------------------------- lưới phát sáng */
    const gridGeo = track(new THREE.CircleGeometry(ARENA_RADIUS, 72, 0, Math.PI * 2));
    const gridMat = track(new THREE.MeshBasicMaterial({
      color: 0x4a7fb5, transparent: true, opacity: 0.1, depthWrite: false,
    }));
    this.grid = new THREE.Mesh(gridGeo, gridMat);
    this.grid.rotation.x = -Math.PI / 2;
    this.grid.position.y = 0.012;
    this.scene.add(this.grid);

    // vòng tròn đồng tâm (dễ ước lượng tầm)
    for (let r = 6; r <= ARENA_RADIUS; r += 6) {
      const ringGeo = track(new THREE.RingGeometry(r - 0.05, r + 0.05, 96));
      const ringMat = track(new THREE.MeshBasicMaterial({
        color: 0x6fa8dc, transparent: true, opacity: 0.16,
        side: THREE.DoubleSide, depthWrite: false,
      }));
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.016;
      this.scene.add(ring);
    }

    /* ---------------------------------------------------------- vòng ngoài */
    const rimGeo = track(new THREE.TorusGeometry(ARENA_RADIUS, 0.16, 8, 96));
    const rimMat = track(new THREE.MeshStandardMaterial({
      color: 0x8fb6e0, emissive: 0x2f5f96, emissiveIntensity: 1.4,
      roughness: 0.5, metalness: 0.6,
    }));
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.02;
    this.scene.add(rim);

    /* ---------------------------------------------------------- cột đá + đuốc */
    const pillarGeo = track(new THREE.CylinderGeometry(0.7, 0.95, 7, 8));
    const pillarMat = track(new THREE.MeshStandardMaterial({
      color: 0x3d4351, roughness: 0.88, metalness: 0.12,
    }));
    const capGeo = track(new THREE.BoxGeometry(1.9, 0.4, 1.9));
    const capMat = track(new THREE.MeshStandardMaterial({
      color: 0x4d5464, roughness: 0.8, metalness: 0.2,
    }));

    const N = 10;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = ARENA_RADIUS - 1.6;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(x, 3.5, z);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.scene.add(pillar);

      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(x, 7.15, z);
      cap.castShadow = true;
      this.scene.add(cap);

      // lửa + đèn
      const flameGeo = track(new THREE.SphereGeometry(0.28, 10, 10));
      const flameMat = track(new THREE.MeshBasicMaterial({
        color: 0xffb347, transparent: true, opacity: 0.92,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(x, 7.6, z);
      this.scene.add(flame);

      const light = new THREE.PointLight(0xffa040, 9, 26, 2);
      light.position.set(x, 8, z);
      this.scene.add(light);
      this.torches.push({ light, base: 9, phase: Math.random() * Math.PI * 2 });
    }

    /* ---------------------------------------------------------- sỏi đá rải */
    const rockGeo = track(new THREE.DodecahedronGeometry(1, 0));
    const rockMat = track(new THREE.MeshStandardMaterial({
      color: 0x2e343f, roughness: 0.95, metalness: 0.05,
    }));
    for (let i = 0; i < 42; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * (ARENA_RADIUS - 6);
      const s = 0.18 + Math.random() * 0.55;
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(Math.cos(a) * r, s * 0.35, Math.sin(a) * r);
      rock.scale.set(s, s * 0.7, s);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
    }
  }

  /** Đổi tông màu cảnh theo nhân vật đang chọn */
  setTheme(colorHex: string) {
    const c = new THREE.Color(colorHex);
    this.skyMat.uniforms.uAccent.value.copy(c).multiplyScalar(0.55);
    this.skyMat.uniforms.uBottom.value.copy(c).multiplyScalar(0.16);
    (this.grid.material as THREE.MeshBasicMaterial).color.copy(c).lerp(new THREE.Color('#ffffff'), 0.35);
    this.ambient.color.copy(c).lerp(new THREE.Color('#ffffff'), 0.72);
  }

  update(_dt: number, time: number) {
    for (const t of this.torches) {
      const f = Math.sin(time * 7.3 + t.phase) * 0.35 + Math.sin(time * 13.1 + t.phase) * 0.18;
      t.light.intensity = t.base * (1 + f * 0.32);
    }
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

export const ARENA = { radius: ARENA_RADIUS };
export const PLAYER_RADIUS = 0.55;
export const ENEMY_RADIUS = 0.8;
