import * as THREE from 'three';

export interface ArenaHandle {
  group: THREE.Group;
  moonLight: THREE.DirectionalLight;
  hakiPointLight: THREE.PointLight;
  skyMaterial: THREE.MeshBasicMaterial;
  banners: THREE.Mesh[];
  embers: THREE.Points;
  petals: THREE.Points;
  levitatingRocks: Array<{
    mesh: THREE.Mesh;
    basePos: THREE.Vector3;
    phase: number;
    rotSpeed: THREE.Vector3;
  }>;
  update: (dt: number, elapsed: number, hakiCharge: number, freezePetals: boolean, ashuraEclipse: number) => void;
}

function createRooftopStoneTextures(): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;

  // Deep volcanic Onigashima obsidian-slate base
  ctx.fillStyle = '#111520';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Ancient Wano stone flagstones
  const rows = 8;
  const cols = 8;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (cellW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * cellW + offset;
      const y = r * cellH;
      const shade = 16 + Math.floor(Math.random() * 16);
      const blueTint = shade + 9;
      ctx.fillStyle = `rgb(${shade}, ${shade + 3}, ${blueTint})`;
      ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);

      ctx.strokeStyle = '#07090e';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);

      const bShade = 110 + Math.floor(Math.random() * 55);
      bctx.fillStyle = `rgb(${bShade}, ${bShade}, ${bShade})`;
      bctx.fillRect(x + 3, y + 3, cellW - 6, cellH - 6);
      bctx.strokeStyle = '#1a1a1a';
      bctx.lineWidth = 4;
      bctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
    }
  }

  // Battle cracks & scorch marks
  for (let i = 0; i < 36; i++) {
    let cx = Math.random() * size;
    let cy = Math.random() * size;
    ctx.beginPath();
    bctx.beginPath();
    ctx.moveTo(cx, cy);
    bctx.moveTo(cx, cy);
    const segs = 4 + Math.floor(Math.random() * 5);
    for (let s = 0; s < segs; s++) {
      cx += (Math.random() - 0.5) * 48;
      cy += (Math.random() - 0.5) * 48;
      ctx.lineTo(cx, cy);
      bctx.lineTo(cx, cy);
    }
    ctx.strokeStyle = 'rgba(4, 6, 10, 0.78)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    bctx.strokeStyle = '#121212';
    bctx.lineWidth = 2.4;
    bctx.stroke();
  }

  // Subtle gritty rock speckles
  for (let i = 0; i < 2200; i++) {
    const px = Math.random() * size;
    const py = Math.random() * size;
    const v = Math.random() > 0.5 ? 'rgba(148,163,184,0.06)' : 'rgba(0,0,0,0.16)';
    ctx.fillStyle = v;
    ctx.fillRect(px, py, 2, 2);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(16, 16);
  map.colorSpace = THREE.SRGBColorSpace;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(16, 16);

  return { map, bumpMap };
}

export function buildOnigashimaArena(scene: THREE.Scene, textureLoader: THREE.TextureLoader): ArenaHandle {
  const group = new THREE.Group();
  scene.add(group);

  // Deep stormy night fog
  scene.fog = new THREE.FogExp2('#070a14', 0.0085);
  scene.background = new THREE.Color('#05070f');

  // Lighting: Dramatic Wano moonlight + crimson storm rim + dynamic Haki point light
  const hemiLight = new THREE.HemisphereLight('#7dd3fc', '#1e1b4b', 0.85);
  group.add(hemiLight);

  const moonLight = new THREE.DirectionalLight('#dbeafe', 2.2);
  moonLight.position.set(4, 38, -55);
  group.add(moonLight);

  const crimsonRim = new THREE.DirectionalLight('#f43f5e', 0.9);
  crimsonRim.position.set(-45, 16, -20);
  group.add(crimsonRim);

  const emeraldRim = new THREE.DirectionalLight('#10b981', 0.75);
  emeraldRim.position.set(45, 14, -22);
  group.add(emeraldRim);

  const hakiPointLight = new THREE.PointLight('#10ff96', 0, 48, 1.4);
  hakiPointLight.position.set(0, 3.5, -6);
  group.add(hakiPointLight);

  // Panoramic Wano Onigashima Sky Backdrop Dome + Front Hero Mural
  const skyTex = textureLoader.load('/images/onigashima-sky.jpg');
  skyTex.colorSpace = THREE.SRGBColorSpace;
  skyTex.wrapS = THREE.MirroredRepeatWrapping;
  skyTex.wrapT = THREE.ClampToEdgeWrapping;
  skyTex.repeat.set(2, 1);

  const skyGeo = new THREE.CylinderGeometry(135, 135, 98, 64, 1, true);
  // Flip cylinder normals inward and align hero moon right ahead (-Z)
  skyGeo.scale(-1, 1, 1);
  skyGeo.rotateY(Math.PI * 0.5);

  const skyMaterial = new THREE.MeshBasicMaterial({
    map: skyTex,
    color: new THREE.Color('#cfdcf2'),
    fog: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const skyCylinder = new THREE.Mesh(skyGeo, skyMaterial);
  skyCylinder.position.set(0, 32, -8);
  group.add(skyCylinder);

  // Upper night zenith cap
  const zenith = new THREE.Mesh(
    new THREE.SphereGeometry(142, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshBasicMaterial({ color: '#050814', side: THREE.BackSide, fog: false })
  );
  zenith.position.y = 10;
  group.add(zenith);

  // Onigashima Skull Dome Rooftop Ground
  const { map: floorMap, bumpMap: floorBump } = createRooftopStoneTextures();
  const floorMat = new THREE.MeshStandardMaterial({
    map: floorMap,
    bumpMap: floorBump,
    bumpScale: 0.14,
    roughness: 0.52,
    metalness: 0.24,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(115, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // Subtle carved ritual ring on the rooftop arena center
  const ringMat = new THREE.MeshBasicMaterial({
    color: '#334155',
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });
  const arenaRing = new THREE.Mesh(new THREE.RingGeometry(15.5, 16.1, 64), ringMat);
  arenaRing.rotation.x = -Math.PI / 2;
  arenaRing.position.set(0, 0.02, -14);
  group.add(arenaRing);

  // Monumental Onigashima Giant Curved Demon Skull Horns flanking left & right horizon!
  const hornMat = new THREE.MeshStandardMaterial({
    color: '#1e2230',
    roughness: 0.78,
    metalness: 0.15,
    emissive: '#0c0a18',
  });

  [-1, 1].forEach((side) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 42, -6, -34),
      new THREE.Vector3(side * 52, 14, -46),
      new THREE.Vector3(side * 46, 36, -54),
      new THREE.Vector3(side * 33, 56, -58),
    ]);
    const segs = 22;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs;
      const t1 = (i + 1) / segs;
      const p0 = curve.getPoint(t0);
      const p1 = curve.getPoint(t1);
      const r0 = THREE.MathUtils.lerp(6.8, 0.35, t0);
      const r1 = THREE.MathUtils.lerp(6.8, 0.35, t1);
      const len = p0.distanceTo(p1) * 1.12;
      const segGeo = new THREE.CylinderGeometry(r1, r0, len, 10);
      const seg = new THREE.Mesh(segGeo, hornMat);
      seg.position.copy(p0).lerp(p1, 0.5);
      seg.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        p1.clone().sub(p0).normalize()
      );
      group.add(seg);
    }
  });

  // Jagged perimeter crags + broken Wano Torii columns + flickering fire braziers
  const cragMat = new THREE.MeshStandardMaterial({
    color: '#141824',
    roughness: 0.85,
    metalness: 0.12,
  });
  for (let i = 0; i < 28; i++) {
    const ang = (i / 28) * Math.PI * 2;
    // Leave forward moon sightline slightly dramatic and framed
    if (Math.abs(Math.sin(ang)) < 0.22 && Math.cos(ang) < 0) continue;
    const rad = 36 + (i % 4) * 5.5;
    const h = 4 + (i % 5) * 2.8;
    const crag = new THREE.Mesh(new THREE.ConeGeometry(2.4 + (i % 3) * 1.1, h, 6), cragMat);
    crag.position.set(Math.sin(ang) * rad, h * 0.42, Math.cos(ang) * rad - 10);
    crag.rotation.z = ((i % 3) - 1) * 0.22;
    crag.rotation.y = i * 1.1;
    group.add(crag);
  }

  // Wano Torii ruins & flapping samurai war banners
  const toriiMat = new THREE.MeshStandardMaterial({
    color: '#4c0f19',
    roughness: 0.65,
    metalness: 0.2,
  });
  const bannerMat = new THREE.MeshStandardMaterial({
    color: '#7f1d1d',
    emissive: '#2a060b',
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  const banners: THREE.Mesh[] = [];

  [
    [-16, -24, 0.25],
    [16, -24, -0.25],
    [-22, -10, 0.45],
    [22, -10, -0.45],
  ].forEach(([bx, bz, rot]) => {
    // Stone lantern / brazier pillar
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.56, 5.6, 8), toriiMat);
    pillar.position.set(bx, 2.8, bz);
    pillar.rotation.y = rot;
    group.add(pillar);

    // Flapping war banner cloth
    const bannerGeo = new THREE.PlaneGeometry(1.3, 3.4, 4, 8);
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(bx + (bx < 0 ? 0.65 : -0.65), 3.6, bz);
    banner.rotation.y = rot;
    group.add(banner);
    banners.push(banner);

    // Warm glowing lantern flame orb
    const brazierCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 1),
      new THREE.MeshBasicMaterial({ color: '#ff9e2c' })
    );
    brazierCore.position.set(bx, 5.85, bz);
    group.add(brazierCore);
  });

  // Levitating rubble pebbles around Zoro & arena that lift off the ground when Conqueror's Haki surges!
  const levitatingRocks: ArenaHandle['levitatingRocks'] = [];
  const pebbleMat = new THREE.MeshStandardMaterial({
    color: '#252c3d',
    roughness: 0.72,
    metalness: 0.2,
  });
  for (let i = 0; i < 38; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 3.2 + Math.random() * 22;
    const px = Math.cos(ang) * dist;
    const pz = Math.sin(ang) * dist - 9;
    const size = 0.14 + Math.random() * 0.34;
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), pebbleMat);
    mesh.scale.set(1.2, 0.75, 1.0);
    const basePos = new THREE.Vector3(px, size * 0.35, pz);
    mesh.position.copy(basePos);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    group.add(mesh);
    levitatingRocks.push({
      mesh,
      basePos,
      phase: Math.random() * Math.PI * 2,
      rotSpeed: new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3
      ),
    });
  }

  // Drifting Onigashima war fire embers (320 glowing rising particles)
  const emberCount = 320;
  const emberPositions = new Float32Array(emberCount * 3);
  const emberColors = new Float32Array(emberCount * 3);
  for (let i = 0; i < emberCount; i++) {
    emberPositions[i * 3] = (Math.random() - 0.5) * 64;
    emberPositions[i * 3 + 1] = Math.random() * 24;
    emberPositions[i * 3 + 2] = (Math.random() - 0.5) * 60 - 12;

    const pick = Math.random();
    const c =
      pick < 0.55
        ? new THREE.Color('#ff922b')
        : pick < 0.82
        ? new THREE.Color('#10ff96')
        : new THREE.Color('#ff2a55');
    emberColors[i * 3] = c.r;
    emberColors[i * 3 + 1] = c.g;
    emberColors[i * 3 + 2] = c.b;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
  emberGeo.setAttribute('color', new THREE.BufferAttribute(emberColors, 3));
  const embers = new THREE.Points(
    emberGeo,
    new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  group.add(embers);

  // Wano crimson/pale sakura petals (freeze mid-air during Ittoryu Iai: Shi Shishi Sonson!)
  const petalCount = 110;
  const petalPositions = new Float32Array(petalCount * 3);
  for (let i = 0; i < petalCount; i++) {
    petalPositions[i * 3] = (Math.random() - 0.5) * 34;
    petalPositions[i * 3 + 1] = 0.5 + Math.random() * 14;
    petalPositions[i * 3 + 2] = -28 + Math.random() * 32;
  }
  const petalGeo = new THREE.BufferGeometry();
  petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPositions, 3));
  const petals = new THREE.Points(
    petalGeo,
    new THREE.PointsMaterial({
      size: 0.17,
      color: '#fda4af',
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  group.add(petals);

  const baseSkyColor = new THREE.Color('#c8d4ea');
  const eclipseSkyColor = new THREE.Color('#ff3355');

  const update = (
    dt: number,
    elapsed: number,
    hakiCharge: number,
    freezePetals: boolean,
    ashuraEclipse: number
  ) => {
    // Subtle storm lightning sky flicker + Ashura blood eclipse
    const stormFlash = Math.pow(Math.max(0, Math.sin(elapsed * 1.7) * Math.sin(elapsed * 7.3)), 14) * 0.45;
    skyMaterial.color.copy(baseSkyColor).lerp(eclipseSkyColor, ashuraEclipse * 0.72);
    skyMaterial.color.multiplyScalar(1 + stormFlash);
    moonLight.intensity = 2.1 + stormFlash * 2.5 - ashuraEclipse * 0.9;

    // War banners whipping in rooftop wind
    if (!freezePetals) {
      banners.forEach((b, idx) => {
        b.rotation.z = Math.sin(elapsed * 4.2 + idx * 1.4) * 0.14 + 0.08 * (idx % 2 === 0 ? 1 : -1);
      });
    }

    // Drift embers upward
    if (!freezePetals) {
      const posAttr = emberGeo.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const speedMult = 1 + hakiCharge * 2.8;
      for (let i = 0; i < emberCount; i++) {
        arr[i * 3] += Math.sin(elapsed * 1.5 + i) * dt * 0.9;
        arr[i * 3 + 1] += (1.1 + (i % 5) * 0.35) * dt * speedMult;
        if (arr[i * 3 + 1] > 24) {
          arr[i * 3 + 1] = 0.2;
          arr[i * 3] = (Math.random() - 0.5) * 64;
        }
      }
      posAttr.needsUpdate = true;

      // Falling Wano sakura petals
      const pAttr = petalGeo.getAttribute('position') as THREE.BufferAttribute;
      const pArr = pAttr.array as Float32Array;
      for (let i = 0; i < petalCount; i++) {
        pArr[i * 3] += (0.85 + Math.sin(elapsed * 2 + i) * 0.5) * dt;
        pArr[i * 3 + 1] -= (0.65 + (i % 3) * 0.2) * dt;
        if (pArr[i * 3 + 1] < 0.2) {
          pArr[i * 3 + 1] = 13.5;
          pArr[i * 3] = (Math.random() - 0.5) * 34;
        }
      }
      pAttr.needsUpdate = true;
    }

    // Conqueror's Haki anti-gravity trembling & levitating rooftop rubble!
    for (let i = 0; i < levitatingRocks.length; i++) {
      const r = levitatingRocks[i];
      if (hakiCharge > 0.05) {
        const lift =
          hakiCharge * (0.85 + Math.sin(elapsed * 3.2 + r.phase) * 0.45 + (i % 4) * 0.42);
        const tremor = hakiCharge * 0.04;
        r.mesh.position.set(
          r.basePos.x + Math.sin(elapsed * 42 + r.phase) * tremor,
          THREE.MathUtils.lerp(r.mesh.position.y, r.basePos.y + lift, Math.min(1, dt * 6)),
          r.basePos.z + Math.cos(elapsed * 39 + r.phase) * tremor
        );
        r.mesh.rotation.x += r.rotSpeed.x * dt * hakiCharge;
        r.mesh.rotation.y += r.rotSpeed.y * dt * hakiCharge;
      } else {
        r.mesh.position.y = THREE.MathUtils.lerp(r.mesh.position.y, r.basePos.y, Math.min(1, dt * 7));
      }
    }
  };

  return {
    group,
    moonLight,
    hakiPointLight,
    skyMaterial,
    banners,
    embers,
    petals,
    levitatingRocks,
    update,
  };
}
