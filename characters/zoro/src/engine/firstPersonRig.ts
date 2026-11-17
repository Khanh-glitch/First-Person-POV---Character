import * as THREE from 'three';
import { createBladeAuraMaterial } from './shaders';

export interface SwordPose {
  pos: [number, number, number];
  rot: [number, number, number];
  visible?: boolean;
}

export interface RigTargetPose {
  left: SwordPose;
  right: SwordPose;
  mouth: SwordPose;
  saya?: SwordPose;
  spinAngle?: number; // for Sanzen Sekai twin-turbine spin
  ashuraFan?: number; // 0..1 spectral 6 extra swords
  bandanaSweep?: number; // 0..1 hands pulling black bandana down
  tsubaGlint?: number; // 0..1 anime star flash on tsuba
}

interface BuiltKatana {
  root: THREE.Group;
  pivot: THREE.Group; // inner pivot for spins/offsets
  bladeMat: THREE.MeshStandardMaterial;
  edgeGlowMat: THREE.MeshBasicMaterial;
  auraMat: THREE.ShaderMaterial;
  baseMarker: THREE.Object3D;
  tipMarker: THREE.Object3D;
  tsubaMarker: THREE.Object3D;
}

interface RibbonTrail {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  mat: THREE.MeshBasicMaterial;
  history: Array<{ base: THREE.Vector3; tip: THREE.Vector3 }>;
  maxPoints: number;
}

/** Procedural traditional Japanese diamond Tsuka-Ito grip texture */
function createTsukaTexture(
  wrapHex: string,
  samegawaHex: string,
  goldFlower = false
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;

  ctx.fillStyle = samegawaHex;
  ctx.fillRect(0, 0, 128, 256);

  // Subtle ray-skin dots
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  for (let i = 0; i < 160; i++) {
    ctx.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
  }

  if (goldFlower) {
    // Enma lilac lacquer with golden 5-petal sakura menuki
    ctx.fillStyle = wrapHex;
    ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = '#fbbf24';
    [48, 128, 208].forEach((cy) => {
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(64 + Math.cos(a) * 9, cy + Math.sin(a) * 9, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  // Diamond ito cord crossings
  ctx.strokeStyle = wrapHex;
  ctx.lineWidth = 14;
  for (let y = -32; y < 288; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y + 32);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(128, y);
    ctx.lineTo(0, y + 32);
    ctx.stroke();

    // Shadow fold lines
    ctx.strokeStyle = 'rgba(0,0,0,0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y + 7);
    ctx.lineTo(128, y + 39);
    ctx.stroke();
    ctx.strokeStyle = wrapHex;
    ctx.lineWidth = 14;
  }

  // Golden menuki peek
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(64, 128, 6, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Procedural Katana Blade Steel + Hamon Temper Pattern texture */
function createBladeHamonTexture(
  style: 'wado' | 'enma' | 'sandai',
  blackHaki = false
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  // Spine (bo-hi / shinogi)
  ctx.fillStyle = blackHaki ? '#050508' : style === 'enma' ? '#0d0b14' : '#181c26';
  ctx.fillRect(0, 0, 128, 512);

  // Cutting edge (ha) gradient
  const grad = ctx.createLinearGradient(0, 0, 128, 0);
  if (blackHaki) {
    grad.addColorStop(0, '#040407');
    grad.addColorStop(0.58, '#0c0a16');
    grad.addColorStop(0.8, style === 'enma' ? '#9333ea' : style === 'sandai' ? '#e11d48' : '#10ff96');
    grad.addColorStop(1, '#f8fafc');
  } else if (style === 'wado') {
    // Pure straight suguha white-silver harmony edge
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(0.52, '#64748b');
    grad.addColorStop(0.62, '#f8fafc');
    grad.addColorStop(1, '#ffffff');
  } else if (style === 'enma') {
    // Black-purple steel with irregular flame hamon
    grad.addColorStop(0, '#09070f');
    grad.addColorStop(0.5, '#1e1033');
    grad.addColorStop(0.76, '#c084fc');
    grad.addColorStop(1, '#ffffff');
  } else {
    // Sandai Kitetsu cursed crimson-flamed edge
    grad.addColorStop(0, '#12090d');
    grad.addColorStop(0.5, '#3b0a18');
    grad.addColorStop(0.75, '#fb7185');
    grad.addColorStop(1, '#fff1f2');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 512);

  // Irregular flame hamon waves for Enma & Sandai
  if (style !== 'wado') {
    ctx.beginPath();
    ctx.moveTo(74, 0);
    for (let y = 0; y <= 512; y += 8) {
      const wave =
        Math.sin(y * 0.09) * 14 + Math.cos(y * 0.23) * 8 + (style === 'enma' ? Math.sin(y * 0.4) * 5 : 0);
      ctx.lineTo(74 + wave, y);
    }
    ctx.strokeStyle = style === 'enma' ? '#e879f9' : '#ff2a55';
    ctx.lineWidth = 4.5;
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build detailed 3D Katana + optional Zoro First-Person Hand & Muscular Scarred Forearm */
function buildLegendaryKatana(
  type: 'enma' | 'sandai' | 'wado' | 'ashura',
  withArm: 'left' | 'right' | 'none'
): BuiltKatana {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);

  const goldMat = new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    metalness: 0.92,
    roughness: 0.2,
    emissive: '#451a03',
    emissiveIntensity: 0.25,
  });

  // 1. TSUKA (Hilt) along -Y (0 -> -0.28)
  const tsukaTex =
    type === 'enma'
      ? createTsukaTexture('#7e22ce', '#3b0764', true)
      : type === 'sandai'
      ? createTsukaTexture('#881337', '#1f2937', false)
      : type === 'ashura'
      ? createTsukaTexture('#9f1239', '#450a0a', false)
      : createTsukaTexture('#f1f5f9', '#94a3b8', false);

  const tsukaGeo = new THREE.CylinderGeometry(0.019, 0.0175, 0.28, 12);
  tsukaGeo.scale(0.72, 1, 1.18);
  const tsuka = new THREE.Mesh(
    tsukaGeo,
    new THREE.MeshStandardMaterial({
      map: tsukaTex,
      roughness: 0.62,
      metalness: 0.12,
      emissive: type === 'ashura' ? '#be123c' : '#000000',
      emissiveIntensity: type === 'ashura' ? 0.6 : 0,
    })
  );
  tsuka.position.y = -0.145;
  pivot.add(tsuka);

  // Kashira (end pommel cap) & Fuchi (collar)
  const kashira = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.018, 0.024, 12), goldMat);
  kashira.scale.set(0.76, 1, 1.22);
  kashira.position.y = -0.29;
  pivot.add(kashira);

  if (type === 'sandai') {
    // Sandai Kitetsu signature central gold ring on hilt
    const midBand = new THREE.Mesh(new THREE.CylinderGeometry(0.0205, 0.0205, 0.022, 12), goldMat);
    midBand.scale.set(0.76, 1, 1.22);
    midBand.position.y = -0.145;
    pivot.add(midBand);
  }

  // 2. TSUBA (Iconic canonical handguard at Y = 0)
  const tsubaGroup = new THREE.Group();
  pivot.add(tsubaGroup);

  if (type === 'enma') {
    // ENMA's iconic 3-petal Golden Trefoil (clover) Tsuba!
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const lobe = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.011, 16), goldMat);
      lobe.position.set(Math.cos(a) * 0.026, 0, Math.sin(a) * 0.026);
      tsubaGroup.add(lobe);

      // Cutout dark inner detail
      const hole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.014, 0.013, 10),
        new THREE.MeshStandardMaterial({ color: '#2e1065', metalness: 0.7, roughness: 0.3 })
      );
      hole.position.set(Math.cos(a) * 0.028, 0, Math.sin(a) * 0.028);
      tsubaGroup.add(hole);
    }
  } else if (type === 'sandai' || type === 'ashura') {
    // SANDAI KITETSU's iconic Golden Rounded-Cross (Mokko) Tsuba!
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
      const lobe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.011, 14), goldMat);
      lobe.position.set(Math.cos(a) * 0.024, 0, Math.sin(a) * 0.024);
      tsubaGroup.add(lobe);
    }
  } else {
    // WADO ICHIMONJI's iconic pure Golden Oval Tsuba with clean rim!
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.01, 24), goldMat);
    disc.scale.set(0.88, 1, 1.08);
    tsubaGroup.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.0055, 8, 24), goldMat);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(0.88, 1.08, 1);
    tsubaGroup.add(rim);
  }

  // Golden Habaki (blade collar just above tsuba)
  const habaki = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.034, 0.034), goldMat);
  habaki.position.y = 0.022;
  pivot.add(habaki);

  // 3. CURVED KATANA NAGASA (Blade extending along +Y from 0.035 to ~1.06, slight sori curve along -Z)
  const bladeLen = 1.02;
  const segsY = 18;
  const bladeGeo = new THREE.BoxGeometry(0.0075, bladeLen, 0.033, 1, segsY, 2);
  const posAttr = bladeGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i); // -bladeLen/2 .. +bladeLen/2
    const z = posAttr.getZ(i);
    const t = (y + bladeLen * 0.5) / bladeLen; // 0 (base) -> 1 (kissaki tip)

    // Graceful Japanese katana sori curvature (spine curves back -Z, cutting edge faces +Z)
    const sori = -Math.pow(t, 2.05) * 0.058;
    // Kissaki point taper in top 12%
    const tipTaper = t > 0.88 ? 1.0 - Math.pow((t - 0.88) / 0.12, 1.5) * 0.88 : 1.0;
    // Razor sharp cutting edge on +Z side
    const edgePinch = z > 0.008 ? 0.12 : 1.0;

    posAttr.setXYZ(i, x * edgePinch * tipTaper, y + bladeLen * 0.5 + 0.035, z * tipTaper + sori);
  }
  bladeGeo.computeVertexNormals();

  const bladeStyle = type === 'ashura' ? 'sandai' : type;
  const bladeTex = createBladeHamonTexture(bladeStyle, false);
  const bladeMat = new THREE.MeshStandardMaterial({
    map: bladeTex,
    color: '#ffffff',
    metalness: 0.9,
    roughness: 0.14,
    emissive:
      type === 'enma'
        ? '#581c87'
        : type === 'sandai'
        ? '#881337'
        : type === 'ashura'
        ? '#ff1e56'
        : '#0f172a',
    emissiveIntensity: type === 'ashura' ? 1.4 : 0.35,
  });
  const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
  pivot.add(bladeMesh);

  // Gleaming razor cutting-edge highlight line (triggers crisp HDR bloom!)
  const edgePoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const sori = -Math.pow(t, 2.05) * 0.058;
    const taper = t > 0.88 ? 1 - Math.pow((t - 0.88) / 0.12, 1.5) * 0.85 : 1;
    edgePoints.push(new THREE.Vector3(0, 0.035 + t * bladeLen, 0.017 * taper + sori));
  }
  const edgeCurve = new THREE.CatmullRomCurve3(edgePoints);
  const edgeGlowMat = new THREE.MeshBasicMaterial({
    color:
      type === 'enma'
        ? '#d8b4fe'
        : type === 'sandai'
        ? '#fda4af'
        : type === 'ashura'
        ? '#fbbf24'
        : '#f0f9ff',
    transparent: true,
    opacity: type === 'ashura' ? 0.95 : 0.65,
    blending: THREE.AdditiveBlending,
  });
  const edgeTube = new THREE.Mesh(new THREE.TubeGeometry(edgeCurve, 18, 0.0022, 5, false), edgeGlowMat);
  pivot.add(edgeTube);

  // 4. LIVING KING OF HELL / ENMA FLAME AURA PLANES (crossed planes for full 3D volume!)
  const auraMat =
    type === 'enma'
      ? createBladeAuraMaterial('#c084fc', '#10ff96', '#fde047')
      : type === 'ashura'
      ? createBladeAuraMaterial('#fffbeb', '#ff2a55', '#fbbf24')
      : createBladeAuraMaterial('#22d3ee', '#00ff88', '#fde047');

  if (type === 'ashura') {
    auraMat.uniforms.uIntensity.value = 1.25;
  }

  const auraGeo = new THREE.PlaneGeometry(0.16, bladeLen * 1.08, 4, 16);
  const auraPlaneA = new THREE.Mesh(auraGeo, auraMat);
  auraPlaneA.position.set(0, 0.04 + bladeLen * 0.5, -0.018);
  auraPlaneA.rotation.y = Math.PI * 0.5;
  pivot.add(auraPlaneA);

  const auraPlaneB = new THREE.Mesh(auraGeo, auraMat);
  auraPlaneB.position.set(0, 0.04 + bladeLen * 0.5, -0.018);
  pivot.add(auraPlaneB);

  // 5. ZORO'S FIRST-PERSON ARTICULATED HAND, WRIST BANDAGES, SCARRED FOREARM & WANO GREEN COAT!
  if (withArm !== 'none') {
    const isSpectral = type === 'ashura';
    const skinMat = new THREE.MeshStandardMaterial({
      color: isSpectral ? '#ff2a55' : '#d69e78',
      roughness: 0.68,
      metalness: 0.05,
      emissive: isSpectral ? '#be123c' : '#29150b',
      emissiveIntensity: isSpectral ? 0.95 : 0.2,
      transparent: isSpectral,
      opacity: isSpectral ? 0.82 : 1,
    });
    const coatMat = new THREE.MeshStandardMaterial({
      color: isSpectral ? '#4c0519' : '#0b3b24', // Zoro's signature deep hunter green coat!
      roughness: 0.78,
      emissive: isSpectral ? '#881337' : '#041a10',
      emissiveIntensity: 0.35,
    });
    const crimsonSashMat = new THREE.MeshStandardMaterial({
      color: '#9f1239',
      roughness: 0.65,
    });
    const bandageMat = new THREE.MeshStandardMaterial({
      color: type === 'enma' ? '#18181b' : '#e2e8f0', // Black bandana wrap on left arm / wrist wrap on right
      roughness: 0.82,
    });

    const handGroup = new THREE.Group();
    handGroup.position.set(0, -0.11, -0.005);
    pivot.add(handGroup);

    const sideSign = withArm === 'left' ? 1 : -1;

    // Palm & back of hand gripping hilt firmly
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.095, 0.068), skinMat);
    palm.position.set(-sideSign * 0.012, 0, -0.014);
    handGroup.add(palm);

    // 4 Articulated curled fingers wrapping firmly around the tsuka ito
    for (let f = 0; f < 4; f++) {
      const fy = 0.032 - f * 0.022;
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0105, 0.036, 4, 8), skinMat);
      finger.position.set(sideSign * 0.017, fy, 0.012);
      finger.rotation.z = Math.PI * 0.5;
      finger.rotation.y = sideSign * 0.25;
      handGroup.add(finger);

      // Knuckle ridge
      const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), skinMat);
      knuckle.position.set(-sideSign * 0.012, fy, 0.022);
      handGroup.add(knuckle);
    }

    // Opposing Thumb locked near the golden tsuba
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.038, 4, 8), skinMat);
    thumb.position.set(sideSign * 0.016, 0.052, -0.014);
    thumb.rotation.set(0.55, 0, -sideSign * 0.5);
    handGroup.add(thumb);

    // Muscular Zoro forearm extending anatomically back (-Y, +Z) into camera shoulder!
    const armGroup = new THREE.Group();
    armGroup.position.set(-sideSign * 0.014, -0.04, 0.012);
    armGroup.rotation.set(-0.52, 0, -sideSign * 0.22);
    handGroup.add(armGroup);

    // Wrist wrap (black bandana wrap on left wrist, battle bandage on right)
    const wristWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.041, 0.075, 12), bandageMat);
    wristWrap.position.y = -0.045;
    armGroup.add(wristWrap);

    // Muscular bare forearm with subtle battle scar & Enma Haki siphon glow on left arm
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.055, 0.23, 14), skinMat);
    forearm.position.y = -0.185;
    armGroup.add(forearm);

    if (type === 'enma') {
      // Glowing violet-emerald Enma Haki siphon vein pulsing up Zoro's left forearm!
      const hakiVein = new THREE.Mesh(
        new THREE.BoxGeometry(0.006, 0.19, 0.008),
        new THREE.MeshBasicMaterial({
          color: '#c084fc',
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
        })
      );
      hakiVein.position.set(0.015, -0.175, 0.044);
      hakiVein.rotation.z = 0.14;
      armGroup.add(hakiVein);
    }

    // Zoro's iconic pushed-up dark green Wano coat cuff + crimson sash trim
    const cuffTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.061, 0.064, 0.032, 14), crimsonSashMat);
    cuffTrim.position.y = -0.295;
    armGroup.add(cuffTrim);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.084, 0.36, 14), coatMat);
    sleeve.position.y = -0.47;
    armGroup.add(sleeve);
  }

  // World-space trail trackers
  const baseMarker = new THREE.Object3D();
  baseMarker.position.set(0, 0.14, 0);
  pivot.add(baseMarker);

  const tipMarker = new THREE.Object3D();
  tipMarker.position.set(0, 0.035 + bladeLen, -0.055);
  pivot.add(tipMarker);

  const tsubaMarker = new THREE.Object3D();
  tsubaMarker.position.set(0, 0.02, 0.02);
  pivot.add(tsubaMarker);

  return { root, pivot, bladeMat, edgeGlowMat, auraMat, baseMarker, tipMarker, tsubaMarker };
}

/** Build White Lacquer Saya (Scabbard) for Ittoryu Iai: Shi Shishi Sonson */
function buildWadoSaya(): THREE.Group {
  const g = new THREE.Group();
  const whiteMat = new THREE.MeshStandardMaterial({
    color: '#f8fafc',
    roughness: 0.24,
    metalness: 0.15,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    metalness: 0.9,
    roughness: 0.2,
  });

  // Scabbard body extending downward along -Y from koiguchi mouth (Y=0)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.02, 0.96, 14), whiteMat);
  body.scale.set(0.62, 1, 1.25);
  body.position.y = -0.48;
  g.add(body);

  // Golden Koiguchi mouth collar
  const koiguchi = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.023, 0.032, 14), goldMat);
  koiguchi.scale.set(0.66, 1, 1.28);
  koiguchi.position.y = -0.01;
  g.add(koiguchi);

  // Left hand fingers gripping scabbard throat (thumb ready to pop tsuba!)
  const skinMat = new THREE.MeshStandardMaterial({ color: '#d69e78', roughness: 0.68 });
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.065), skinMat);
  grip.position.set(-0.014, -0.075, 0);
  g.add(grip);

  return g;
}

/** Build anime 4-point star glint sprite on Wado's tsuba for KACHIN! */
function buildTsubaStarGlint(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 58);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(125,211,252,0.85)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  // Sharp 4-point cross star spikes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(64, 0);
  ctx.lineTo(70, 56);
  ctx.lineTo(128, 64);
  ctx.lineTo(70, 72);
  ctx.lineTo(64, 128);
  ctx.lineTo(58, 72);
  ctx.lineTo(0, 64);
  ctx.lineTo(58, 56);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.38), mat);
  mesh.renderOrder = 999;
  return mesh;
}

function createRibbonTrail(scene: THREE.Scene, colorHex: string, maxPoints = 18): RibbonTrail {
  const geo = new THREE.BufferGeometry();
  const vertCount = maxPoints * 2;
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices: number[] = [];
  for (let i = 0; i < maxPoints - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);

  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(colorHex),
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  return { mesh, geo, mat, history: [], maxPoints };
}

/** Canonical Idle Santoryu First-Person Stance (carefully framed above bottom HUD!) */
export const IDLE_SANTORYU_POSE: RigTargetPose = {
  // Left Hand: ENMA — purple diamond tsuka, golden trefoil tsuba, scarred arm & violet-emerald blade clearly framed!
  left: {
    pos: [-0.48, -0.19, -0.68],
    rot: [-0.72, -0.24, -0.26],
    visible: true,
  },
  // Right Hand: SANDAI KITETSU — crimson tsuka, golden cross tsuba, bandaged arm & red-hamon blade symmetrically framed!
  right: {
    pos: [0.48, -0.19, -0.68],
    rot: [-0.72, 0.24, 0.26],
    visible: true,
  },
  // Mouth Blade: WADO ICHIMONJI — clamped horizontally in Zoro's jaw across lower view, white hilt right, gold oval tsuba gleaming, razor edge facing forward!
  mouth: {
    pos: [0.32, -0.205, -0.52],
    rot: [-0.08, Math.PI - 0.06, -Math.PI * 0.5 + 0.025],
    visible: true,
  },
  saya: {
    pos: [-0.4, -0.9, -0.5],
    rot: [0, 0, 0],
    visible: false,
  },
  spinAngle: 0,
  ashuraFan: 0,
  bandanaSweep: 0,
  tsubaGlint: 0,
};

export class ZoroFirstPersonRig {
  public readonly container: THREE.Group;
  private readonly swayGroup: THREE.Group;
  public readonly enma: BuiltKatana;
  public readonly sandai: BuiltKatana;
  public readonly wado: BuiltKatana;
  private readonly saya: THREE.Group;
  private readonly bandanaCloth: THREE.Mesh;
  private readonly tsubaStar: THREE.Mesh;
  private readonly ashuraBlades: BuiltKatana[] = [];
  private readonly trails: RibbonTrail[] = [];

  private normalTexEnma: THREE.CanvasTexture;
  private hakiTexEnma: THREE.CanvasTexture;
  private normalTexSandai: THREE.CanvasTexture;
  private hakiTexSandai: THREE.CanvasTexture;
  private normalTexWado: THREE.CanvasTexture;
  private hakiTexWado: THREE.CanvasTexture;

  private isBlackBlade = false;
  private swayOffset = new THREE.Vector2(0, 0);
  private targetPose: RigTargetPose = IDLE_SANTORYU_POSE;
  private lerpSpeed = 14;
  private trailIntensity = 0.25;
  private tmpBase = new THREE.Vector3();
  private tmpTip = new THREE.Vector3();
  private tmpEuler = new THREE.Euler();
  private tmpQuat = new THREE.Quaternion();

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.container = new THREE.Group();
    this.swayGroup = new THREE.Group();
    this.container.add(this.swayGroup);
    camera.add(this.container);

    // Dedicated crisp FP key & rim lights so gold tsubas, tsuka wraps, and blade hamons gleam richly!
    const fpLight = new THREE.PointLight('#e0f2fe', 1.45, 3.2);
    fpLight.position.set(0, 0.35, 0.15);
    this.container.add(fpLight);

    const fpWarmLight = new THREE.PointLight('#fde68a', 0.65, 2.2);
    fpWarmLight.position.set(0.35, -0.25, -0.2);
    this.container.add(fpWarmLight);

    // Build Zoro's 3 canonical legendary katanas
    this.enma = buildLegendaryKatana('enma', 'left');
    this.sandai = buildLegendaryKatana('sandai', 'right');
    this.wado = buildLegendaryKatana('wado', 'none');

    this.normalTexEnma = this.enma.bladeMat.map as THREE.CanvasTexture;
    this.hakiTexEnma = createBladeHamonTexture('enma', true);
    this.normalTexSandai = this.sandai.bladeMat.map as THREE.CanvasTexture;
    this.hakiTexSandai = createBladeHamonTexture('sandai', true);
    this.normalTexWado = this.wado.bladeMat.map as THREE.CanvasTexture;
    this.hakiTexWado = createBladeHamonTexture('wado', true);

    this.swayGroup.add(this.enma.root);
    this.swayGroup.add(this.sandai.root);
    this.swayGroup.add(this.wado.root);

    // Wado Ichimonji White Lacquer Saya for Iai draw/resheath
    this.saya = buildWadoSaya();
    this.saya.visible = false;
    this.swayGroup.add(this.saya);

    // Anime star glint on Wado's tsuba
    this.tsubaStar = buildTsubaStarGlint();
    this.wado.tsubaMarker.add(this.tsubaStar);

    // Black Bandana cloth pulled over forehead during King of Hell tie animation
    const bandanaGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.14, 24, 1, true, Math.PI * 0.65, Math.PI * 0.7);
    bandanaGeo.scale(-1, 1, 1);
    this.bandanaCloth = new THREE.Mesh(
      bandanaGeo,
      new THREE.MeshStandardMaterial({ color: '#09090b', roughness: 0.9, side: THREE.DoubleSide })
    );
    this.bandanaCloth.position.set(0, 0.42, -0.05);
    this.bandanaCloth.visible = false;
    this.container.add(this.bandanaCloth);

    // Build 6 Spectral Kyutoryu: Ashura Phantom Blades (3 left fan, 3 right fan = 9 Swords total in POV!)
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? 'left' : 'right';
      const phantom = buildLegendaryKatana('ashura', i % 3 === 1 ? side : 'none');
      phantom.root.visible = false;
      this.swayGroup.add(phantom.root);
      this.ashuraBlades.push(phantom);
    }

    // Real-time world-space ribbon trails for Enma, Sandai, Wado
    this.trails.push(
      createRibbonTrail(scene, '#c084fc', 18), // Enma violet-emerald
      createRibbonTrail(scene, '#10ff96', 18), // Sandai emerald-crimson
      createRibbonTrail(scene, '#e0f2fe', 16) // Wado silver-emerald
    );

    this.snapToPose(IDLE_SANTORYU_POSE);
  }

  public setPose(pose: RigTargetPose, lerpSpeed = 16): void {
    this.targetPose = pose;
    this.lerpSpeed = lerpSpeed;
  }

  public snapToPose(pose: RigTargetPose): void {
    this.targetPose = pose;
    this.applySwordImmediate(this.enma.root, pose.left);
    this.applySwordImmediate(this.sandai.root, pose.right);
    this.applySwordImmediate(this.wado.root, pose.mouth);
    if (pose.saya) {
      this.applySwordImmediate(this.saya, pose.saya);
    }
  }

  private applySwordImmediate(obj: THREE.Group, p: SwordPose): void {
    obj.position.set(p.pos[0], p.pos[1], p.pos[2]);
    obj.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    obj.visible = p.visible !== false;
  }

  private lerpSword(obj: THREE.Group, p: SwordPose, alpha: number): void {
    const visible = p.visible !== false;
    obj.visible = visible;
    if (!visible) return;
    obj.position.x = THREE.MathUtils.lerp(obj.position.x, p.pos[0], alpha);
    obj.position.y = THREE.MathUtils.lerp(obj.position.y, p.pos[1], alpha);
    obj.position.z = THREE.MathUtils.lerp(obj.position.z, p.pos[2], alpha);
    this.tmpEuler.set(p.rot[0], p.rot[1], p.rot[2], 'XYZ');
    this.tmpQuat.setFromEuler(this.tmpEuler);
    obj.quaternion.slerp(this.tmpQuat, alpha);
  }

  /** Activate/deactivate Busoshoku Black Blade + King of Hell spectral flames */
  public setBladeHakiState(
    blackBlade: boolean,
    auraIntensity: number,
    palette?: { inner: string; mid: string; tip: string; trail: string }
  ): void {
    if (this.isBlackBlade !== blackBlade) {
      this.isBlackBlade = blackBlade;
      this.enma.bladeMat.map = blackBlade ? this.hakiTexEnma : this.normalTexEnma;
      this.sandai.bladeMat.map = blackBlade ? this.hakiTexSandai : this.normalTexSandai;
      this.wado.bladeMat.map = blackBlade ? this.hakiTexWado : this.normalTexWado;
      this.enma.bladeMat.needsUpdate = true;
      this.sandai.bladeMat.needsUpdate = true;
      this.wado.bladeMat.needsUpdate = true;
    }

    [this.enma, this.sandai, this.wado].forEach((sword, idx) => {
      sword.auraMat.uniforms.uIntensity.value = auraIntensity;
      sword.bladeMat.emissiveIntensity = blackBlade ? 0.95 : 0.32;
      sword.edgeGlowMat.opacity = blackBlade ? 0.95 : 0.55;
      if (palette) {
        sword.auraMat.uniforms.uColorInner.value.set(idx === 0 ? '#d8b4fe' : palette.inner);
        sword.auraMat.uniforms.uColorMid.value.set(palette.mid);
        sword.auraMat.uniforms.uColorTip.value.set(palette.tip);
      }
    });

    if (palette) {
      this.trails[0].mat.color.set(palette.mid);
      this.trails[1].mat.color.set(palette.trail);
      this.trails[2].mat.color.set(palette.inner);
    }
  }

  public setTrailIntensity(intensity: number): void {
    this.trailIntensity = intensity;
  }

  public clearTrails(): void {
    this.trails.forEach((t) => {
      t.history.length = 0;
    });
  }

  public getSwordTipWorld(which: 'enma' | 'sandai' | 'wado', out = new THREE.Vector3()): THREE.Vector3 {
    const s = which === 'enma' ? this.enma : which === 'sandai' ? this.sandai : this.wado;
    return s.tipMarker.getWorldPosition(out);
  }

  public getTsubaWorld(which: 'enma' | 'sandai' | 'wado', out = new THREE.Vector3()): THREE.Vector3 {
    const s = which === 'enma' ? this.enma : which === 'sandai' ? this.sandai : this.wado;
    return s.tsubaMarker.getWorldPosition(out);
  }

  public update(
    dt: number,
    elapsed: number,
    mouseVelX: number,
    mouseVelY: number,
    isIdle: boolean,
    hitStopTremor: number
  ): void {
    const alpha = Math.min(1, dt * this.lerpSpeed);

    // Smooth FPS weapon inertia & breathing
    this.swayOffset.x = THREE.MathUtils.lerp(this.swayOffset.x, -mouseVelX * 0.045, Math.min(1, dt * 10));
    this.swayOffset.y = THREE.MathUtils.lerp(this.swayOffset.y, -mouseVelY * 0.035, Math.min(1, dt * 10));

    const breathY = isIdle ? Math.sin(elapsed * 2.15) * 0.0085 : 0;
    const breathX = isIdle ? Math.cos(elapsed * 1.07) * 0.004 : 0;
    const tremorX = hitStopTremor > 0 ? (Math.random() - 0.5) * 0.028 * hitStopTremor : 0;
    const tremorY = hitStopTremor > 0 ? (Math.random() - 0.5) * 0.028 * hitStopTremor : 0;

    this.swayGroup.position.set(
      this.swayOffset.x + breathX + tremorX,
      this.swayOffset.y + breathY + tremorY,
      0
    );
    this.swayGroup.rotation.z = this.swayOffset.x * 0.45;

    // Interpolate sword poses
    this.lerpSword(this.enma.root, this.targetPose.left, alpha);
    this.lerpSword(this.sandai.root, this.targetPose.right, alpha);
    this.lerpSword(this.wado.root, this.targetPose.mouth, alpha);
    if (this.targetPose.saya) {
      this.lerpSword(this.saya, this.targetPose.saya, alpha);
    } else {
      this.saya.visible = false;
    }

    // Subtle jaw bite bob on Wado Ichimonji in idle
    if (isIdle && this.wado.root.visible) {
      this.wado.root.position.y += Math.sin(elapsed * 2.15 + 0.4) * 0.0025;
    }

    // Sanzen Sekai twin-turbine 360° vertical windmill blade spin right in front of POV!
    const spin = this.targetPose.spinAngle ?? 0;
    if (Math.abs(spin) > 0.001) {
      this.enma.pivot.rotation.set(0, 0, spin);
      this.sandai.pivot.rotation.set(0, 0, -spin + Math.PI * 0.5);
    } else {
      this.enma.pivot.rotation.set(0, 0, 0);
      this.sandai.pivot.rotation.set(0, 0, 0);
    }

    // Bandana sweep cloth overhead
    const bSweep = this.targetPose.bandanaSweep ?? 0;
    this.bandanaCloth.visible = bSweep > 0.02;
    if (this.bandanaCloth.visible) {
      this.bandanaCloth.position.y = THREE.MathUtils.lerp(0.42, 0.14, bSweep);
    }

    // Tsuba KACHIN! anime 4-point star glint
    const glint = this.targetPose.tsubaGlint ?? 0;
    const starMat = this.tsubaStar.material as THREE.MeshBasicMaterial;
    starMat.opacity = glint;
    if (glint > 0.01) {
      const s = 0.5 + glint * 1.15;
      this.tsubaStar.scale.set(s, s, 1);
      this.tsubaStar.rotation.z = elapsed * 5.0;
    }

    // Kyutoryu: Ashura 6 spectral demon blades fanning out in first person!
    const fan = this.targetPose.ashuraFan ?? 0;
    for (let i = 0; i < this.ashuraBlades.length; i++) {
      const pb = this.ashuraBlades[i];
      pb.root.visible = fan > 0.03;
      if (pb.root.visible) {
        const isLeft = i < 3;
        const idx = i % 3; // 0=upper, 1=mid, 2=lower
        const sign = isLeft ? -1 : 1;
        const spread = THREE.MathUtils.lerp(0.25, 1.0, fan);
        const flutter = Math.sin(elapsed * 9.0 + i * 1.3) * 0.025;

        pb.root.position.set(
          sign * (0.56 + idx * 0.16) * spread,
          (0.18 - idx * 0.24) * spread + flutter,
          -0.78 - idx * 0.06
        );
        pb.root.rotation.set(
          -0.55 - idx * 0.12,
          sign * (0.22 + idx * 0.12),
          sign * (0.38 + idx * 0.36) * spread + flutter
        );
        pb.auraMat.uniforms.uTime.value = elapsed;
        pb.auraMat.uniforms.uIntensity.value = fan * 1.45;
      }
    }

    // Update spectral aura shader times
    this.enma.auraMat.uniforms.uTime.value = elapsed;
    this.sandai.auraMat.uniforms.uTime.value = elapsed;
    this.wado.auraMat.uniforms.uTime.value = elapsed;

    // Update real-time world-space sword light ribbons
    const swords = [this.enma, this.sandai, this.wado];
    for (let s = 0; s < 3; s++) {
      const sword = swords[s];
      const trail = this.trails[s];

      if (!sword.root.visible || this.trailIntensity < 0.05) {
        if (trail.history.length > 0) trail.history.shift();
      } else {
        sword.baseMarker.getWorldPosition(this.tmpBase);
        sword.tipMarker.getWorldPosition(this.tmpTip);
        trail.history.push({
          base: this.tmpBase.clone(),
          tip: this.tmpTip.clone(),
        });
        while (trail.history.length > trail.maxPoints) {
          trail.history.shift();
        }
      }

      const hLen = trail.history.length;
      trail.mesh.visible = hLen >= 2 && this.trailIntensity >= 0.05;
      if (!trail.mesh.visible) continue;

      trail.mat.opacity = Math.min(0.88, this.trailIntensity);
      const posArr = (trail.geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
      const colArr = (trail.geo.attributes.color as THREE.BufferAttribute).array as Float32Array;

      for (let i = 0; i < trail.maxPoints; i++) {
        const sample = trail.history[Math.min(i, hLen - 1)];
        const ageFactor = i < hLen ? Math.pow(i / Math.max(1, hLen - 1), 1.8) : 0;

        const bIdx = i * 6;
        posArr[bIdx] = sample.base.x;
        posArr[bIdx + 1] = sample.base.y;
        posArr[bIdx + 2] = sample.base.z;
        posArr[bIdx + 3] = sample.tip.x;
        posArr[bIdx + 4] = sample.tip.y;
        posArr[bIdx + 5] = sample.tip.z;

        // Fade tail to black (invisible under AdditiveBlending), bright tip!
        colArr[bIdx] = ageFactor * 0.25;
        colArr[bIdx + 1] = ageFactor * 0.25;
        colArr[bIdx + 2] = ageFactor * 0.25;
        colArr[bIdx + 3] = ageFactor * 1.4;
        colArr[bIdx + 4] = ageFactor * 1.4;
        colArr[bIdx + 5] = ageFactor * 1.4;
      }
      trail.geo.attributes.position.needsUpdate = true;
      trail.geo.attributes.color.needsUpdate = true;
    }
  }
}
