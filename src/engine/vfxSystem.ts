import * as THREE from 'three';
import {
  createGroundScarMaterial,
  createSlashArcMaterial,
  createSpiritBillboardMaterial,
  createTornadoMaterial,
} from './shaders';

interface ActiveSlashArc {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  velocity: THREE.Vector3;
  age: number;
  maxAge: number;
  growRate: number;
  baseScale: number;
}

interface ActiveLightning {
  group: THREE.Group;
  age: number;
  maxAge: number;
  outerMat: THREE.MeshBasicMaterial;
  coreMat: THREE.MeshBasicMaterial;
}

interface ActiveShockwave {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  rotSpeed: number;
}

interface ActiveGroundScar {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  age: number;
  maxAge: number;
}

interface ActivePillar {
  group: THREE.Group;
  coreMat: THREE.MeshBasicMaterial;
  outerMat: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
  maxRadius: number;
}

interface ActiveTornado {
  group: THREE.Group;
  outerMat: THREE.ShaderMaterial;
  innerMat: THREE.ShaderMaterial;
  debris: Array<{ mesh: THREE.Mesh; angle: number; radius: number; height: number; speed: number }>;
  age: number;
  maxAge: number;
}

interface ActiveDragon {
  group: THREE.Group;
  headMat: THREE.ShaderMaterial;
  bodyRings: THREE.Mesh[];
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  age: number;
  flightDuration: number;
  impacted: boolean;
  onImpact?: () => void;
}

interface RockChunk {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  age: number;
  maxAge: number;
}

interface SparkItem {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  age: number;
  maxAge: number;
  size: number;
}

export interface MonolithTarget {
  id: number;
  root: THREE.Group;
  basePos: THREE.Vector3;
  lowerGroup: THREE.Group;
  upperGroup: THREE.Group;
  coreMat: THREE.MeshBasicMaterial;
  cutPlanesGroup: THREE.Group;
  state: 'intact' | 'sliced_hold' | 'sliding' | 'respawning';
  slideVel: THREE.Vector3;
  slideRot: THREE.Vector3;
  timer: number;
  lastColor: string;
  height: number;
}

/** Build flat curved anime crescent ribbon geometry */
function buildArcRibbonGeometry(
  innerR: number,
  outerR: number,
  arcAngle: number,
  segsArc = 42
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const startA = -arcAngle * 0.5;
  for (let i = 0; i <= segsArc; i++) {
    const u = i / segsArc;
    const a = startA + u * arcAngle;
    // Taper inner radius near tips for razor crescent silhouette!
    const tipPinch = Math.sin(u * Math.PI);
    const rIn = THREE.MathUtils.lerp(outerR * 0.94, innerR, Math.pow(tipPinch, 0.55));
    const rOut = outerR;

    const ca = Math.cos(a);
    const sa = Math.sin(a);

    // Inner vertex (v = 0)
    positions.push(ca * rIn, sa * rIn, 0);
    uvs.push(u, 0);

    // Outer cutting edge vertex (v = 1)
    positions.push(ca * rOut, sa * rOut, 0);
    uvs.push(u, 1);

    if (i < segsArc) {
      const idx = i * 2;
      indices.push(idx, idx + 1, idx + 2, idx + 1, idx + 3, idx + 2);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/** Generate jagged 3D lightning point chain between two points */
function buildJaggedPoints(
  start: THREE.Vector3,
  end: THREE.Vector3,
  segments: number,
  jitter: number
): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [start.clone()];
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const p = new THREE.Vector3().lerpVectors(start, end, t);
    const env = Math.sin(t * Math.PI);
    p.x += (Math.random() - 0.5) * jitter * env * 2;
    p.y += (Math.random() - 0.5) * jitter * env * 2;
    p.z += (Math.random() - 0.5) * jitter * env * 2;
    pts.push(p);
  }
  pts.push(end.clone());
  return pts;
}

export class SakugaVfxSystem {
  private readonly scene: THREE.Scene;
  private readonly slashes: ActiveSlashArc[] = [];
  private readonly lightnings: ActiveLightning[] = [];
  private readonly shockwaves: ActiveShockwave[] = [];
  private readonly scars: ActiveGroundScar[] = [];
  private readonly pillars: ActivePillar[] = [];
  private readonly tornados: ActiveTornado[] = [];
  private readonly dragons: ActiveDragon[] = [];
  private readonly rockChunks: RockChunk[] = [];
  public readonly monoliths: MonolithTarget[] = [];

  // Instanced high-speed anime spark pool (650 zero-GC velocity streaks!)
  private readonly maxSparks = 650;
  private readonly sparks: SparkItem[] = [];
  private readonly sparkInstanced: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly upVec = new THREE.Vector3(0, 1, 0);

  // Ashura 3D towering deity spirit
  private readonly ashuraMesh: THREE.Mesh;
  private readonly ashuraMat: THREE.ShaderMaterial;
  private readonly ashuraHalo: THREE.Mesh;
  private ashuraOpacityTarget = 0;

  // Hiryu flying dragon texture
  private readonly dragonTex: THREE.Texture;

  // Shared rock chunk geometry/material
  private readonly chunkGeo = new THREE.DodecahedronGeometry(0.45, 0);

  constructor(scene: THREE.Scene, loader: THREE.TextureLoader) {
    this.scene = scene;

    // Initialize Instanced Velocity Sparks
    const sparkGeo = new THREE.OctahedronGeometry(0.06, 0);
    sparkGeo.scale(0.55, 4.2, 0.55); // Sleek elongated anime streak!
    const sparkMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkInstanced = new THREE.InstancedMesh(sparkGeo, sparkMat, this.maxSparks);
    this.sparkInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparkInstanced.frustumCulled = false;

    const initColor = new THREE.Color('#10ff96');
    for (let i = 0; i < this.maxSparks; i++) {
      this.sparks.push({
        active: false,
        pos: new THREE.Vector3(0, -100, 0),
        vel: new THREE.Vector3(),
        color: initColor.clone(),
        age: 0,
        maxAge: 1,
        size: 1,
      });
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.sparkInstanced.setMatrixAt(i, this.dummy.matrix);
      this.sparkInstanced.setColorAt(i, initColor);
    }
    this.scene.add(this.sparkInstanced);

    // Load Ashura Wrathful 6-Armed Deity texture
    const ashuraTex = loader.load('/images/ashura-spirit.png');
    ashuraTex.colorSpace = THREE.SRGBColorSpace;
    this.ashuraMat = createSpiritBillboardMaterial(ashuraTex, 1.75);
    this.ashuraMesh = new THREE.Mesh(new THREE.PlaneGeometry(17, 29), this.ashuraMat);
    this.ashuraMesh.position.set(0, 13.5, -22);
    this.ashuraMesh.visible = false;
    this.scene.add(this.ashuraMesh);

    this.ashuraHalo = new THREE.Mesh(
      new THREE.RingGeometry(6.8, 7.6, 48),
      new THREE.MeshBasicMaterial({
        color: '#fbbf24',
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    this.ashuraHalo.position.set(0, 17.5, -22.5);
    this.scene.add(this.ashuraHalo);

    // Load Hiryu Jigoku Emerald Flying Dragon texture
    this.dragonTex = loader.load('/images/hiryu-dragon.png');
    this.dragonTex.colorSpace = THREE.SRGBColorSpace;

    // Build 3 Slicable Onigashima Oni-Dragon Basalt Monoliths
    this.monoliths.push(
      this.createMonolith(0, new THREE.Vector3(0, 0, -14.5), 1.25), // Center Boss Colossus
      this.createMonolith(1, new THREE.Vector3(-6.8, 0, -17.2), 0.92), // Left Oni Pillar
      this.createMonolith(2, new THREE.Vector3(6.8, 0, -17.2), 0.92) // Right Oni Pillar
    );
  }

  private createMonolith(id: number, pos: THREE.Vector3, scale: number): MonolithTarget {
    const root = new THREE.Group();
    root.position.copy(pos);
    this.scene.add(root);

    const armorMat = new THREE.MeshStandardMaterial({
      color: '#1b2030',
      roughness: 0.55,
      metalness: 0.38,
      emissive: '#090b14',
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: '#d97706',
      metalness: 0.85,
      roughness: 0.25,
      emissive: '#451a03',
      emissiveIntensity: 0.4,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: '#f43f5e',
    });

    // Pedestal + Lower Torso
    const lowerGroup = new THREE.Group();
    root.add(lowerGroup);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55 * scale, 1.85 * scale, 0.55 * scale, 8),
      armorMat
    );
    plinth.position.y = 0.275 * scale;
    lowerGroup.add(plinth);

    const lowerBody = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18 * scale, 1.38 * scale, 2.05 * scale, 7),
      armorMat
    );
    lowerBody.position.y = 1.55 * scale;
    lowerGroup.add(lowerBody);

    const goldBelt = new THREE.Mesh(
      new THREE.TorusGeometry(1.22 * scale, 0.08 * scale, 8, 16),
      goldMat
    );
    goldBelt.rotation.x = Math.PI * 0.5;
    goldBelt.position.y = 1.45 * scale;
    lowerGroup.add(goldBelt);

    // Upper Torso + Oni Horns + Glowing Heart Core (slides off when cleaved!)
    const upperGroup = new THREE.Group();
    upperGroup.position.set(0, 2.58 * scale, 0);
    root.add(upperGroup);

    const upperBody = new THREE.Mesh(
      new THREE.CylinderGeometry(1.32 * scale, 1.16 * scale, 2.35 * scale, 7),
      armorMat
    );
    upperBody.position.y = 1.15 * scale;
    upperGroup.add(upperBody);

    // Glowing "Breath of All Things" spirit core crystal on chest!
    const coreGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.36 * scale, 0), coreMat);
    coreGem.scale.set(0.8, 1.6, 0.5);
    coreGem.position.set(0, 0.95 * scale, 1.14 * scale);
    upperGroup.add(coreGem);

    // Twin Oni Horns crowning the monolith
    [-1, 1].forEach((side) => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.24 * scale, 1.45 * scale, 7), goldMat);
      horn.position.set(side * 0.95 * scale, 2.75 * scale, 0.15 * scale);
      horn.rotation.z = -side * 0.42;
      horn.rotation.x = 0.18;
      upperGroup.add(horn);
    });

    // Container for glowing Haki cut seams
    const cutPlanesGroup = new THREE.Group();
    cutPlanesGroup.position.set(0, 2.6 * scale, 0);
    root.add(cutPlanesGroup);

    return {
      id,
      root,
      basePos: pos.clone(),
      lowerGroup,
      upperGroup,
      coreMat,
      cutPlanesGroup,
      state: 'intact',
      slideVel: new THREE.Vector3(),
      slideRot: new THREE.Vector3(),
      timer: 0,
      lastColor: '#10ff96',
      height: 5.2 * scale,
    };
  }

  /** Slice monolith(s) with glowing razor seam across their body! */
  public markMonolithSliced(
    targetIds: number[],
    angleRad: number,
    colorHex: string,
    autoDetonateDelay = -1
  ): number {
    let hitCount = 0;
    for (const id of targetIds) {
      const m = this.monoliths[id];
      if (!m || m.state === 'respawning' || m.state === 'sliding') continue;

      m.state = 'sliced_hold';
      m.lastColor = colorHex;
      m.timer = autoDetonateDelay;
      m.coreMat.color.set('#ffffff');
      hitCount++;

      // Add blazing razor Haki cut seam disc + cross flare across the monolith!
      const seamDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(2.45, 2.45, 0.055, 24),
        new THREE.MeshBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: 0.95,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      seamDisc.rotation.z = angleRad;
      seamDisc.position.y = (Math.random() - 0.5) * 0.55;
      m.cutPlanesGroup.add(seamDisc);

      const whiteCoreLine = new THREE.Mesh(
        new THREE.BoxGeometry(5.6, 0.07, 0.07),
        new THREE.MeshBasicMaterial({
          color: '#ffffff',
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      whiteCoreLine.rotation.z = angleRad;
      whiteCoreLine.position.set(0, seamDisc.position.y, 1.35);
      m.cutPlanesGroup.add(whiteCoreLine);

      // Compute upper-half slide direction along the slash angle
      m.slideVel.set(
        Math.cos(angleRad) * 3.4 + (Math.random() - 0.5) * 1.2,
        1.45,
        -1.2
      );
      m.slideRot.set(-0.6, (Math.random() - 0.5) * 1.2, -Math.cos(angleRad) * 1.35);

      // Instant impact sparks on the monolith chest!
      const hitPos = m.basePos.clone().add(new THREE.Vector3(0, m.height * 0.52, 1.1));
      this.spawnSparks(hitPos, 42, colorHex, '#ffffff', 16);
    }
    return hitCount;
  }

  /** Trigger dramatic upper-half slide & violent boulder shatter on sliced monoliths! */
  public detonateSlicedMonoliths(explosionScale = 1.0): number {
    let detonated = 0;
    for (const m of this.monoliths) {
      if (m.state !== 'sliced_hold') continue;
      m.state = 'sliding';
      m.timer = 0.42; // Slides apart visibly for 0.42s then ERUPTS into boulders!
      detonated++;

      const center = m.basePos.clone().add(new THREE.Vector3(0, m.height * 0.52, 0));
      this.spawnShockwave(center, m.lastColor, 0.8, 12 * explosionScale, 0.48, [
        Math.PI * 0.45,
        0,
        (Math.random() - 0.5) * 0.6,
      ]);
      this.spawnSparks(center, Math.floor(65 * explosionScale), m.lastColor, '#fde047', 22);
      this.spawnHakiLightning(
        center,
        center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 7 + Math.random() * 5, (Math.random() - 0.5) * 4)),
        m.lastColor,
        0.34,
        1.3
      );
    }
    return detonated;
  }

  private shatterMonolith(m: MonolithTarget): void {
    const center = m.basePos.clone().add(new THREE.Vector3(0, m.height * 0.55, 0));
    // Clear cut seam planes
    while (m.cutPlanesGroup.children.length > 0) {
      const child = m.cutPlanesGroup.children[0] as THREE.Mesh;
      m.cutPlanesGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }

    // Spawn 20 tumbling glowing-edged rock chunks!
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: '#1e2436',
        roughness: 0.65,
        emissive: new THREE.Color(m.lastColor),
        emissiveIntensity: i % 3 === 0 ? 1.4 : 0.45,
      });
      const chunk = new THREE.Mesh(this.chunkGeo, mat);
      const s = 0.55 + Math.random() * 1.15;
      chunk.scale.set(s, s * 0.75, s * 0.9);
      chunk.position.copy(center).add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 2.4,
          (Math.random() - 0.5) * 2.8,
          (Math.random() - 0.5) * 2.0
        )
      );
      this.scene.add(chunk);
      this.rockChunks.push({
        mesh: chunk,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 18,
          5 + Math.random() * 13,
          (Math.random() - 0.5) * 16
        ),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9,
          (Math.random() - 0.5) * 9
        ),
        age: 0,
        maxAge: 1.55 + Math.random() * 0.7,
      });
    }

    this.spawnSparks(center, 70, m.lastColor, '#ffffff', 24);
    this.spawnShockwave(center, m.lastColor, 1.0, 15, 0.52, [Math.PI * 0.5, 0, 0]);

    // Begin underground respawn
    m.state = 'respawning';
    m.timer = 1.65;
    m.root.position.set(m.basePos.x, -m.height - 1.2, m.basePos.z);
    m.upperGroup.position.set(0, m.height * 0.496, 0);
    m.upperGroup.rotation.set(0, 0, 0);
    m.coreMat.color.set('#f43f5e');
  }

  public resetAllMonoliths(): void {
    for (const m of this.monoliths) {
      while (m.cutPlanesGroup.children.length > 0) {
        const c = m.cutPlanesGroup.children[0] as THREE.Mesh;
        m.cutPlanesGroup.remove(c);
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
      m.state = 'intact';
      m.timer = 0;
      m.root.position.copy(m.basePos);
      m.upperGroup.position.set(0, m.height * 0.496, 0);
      m.upperGroup.rotation.set(0, 0, 0);
      m.coreMat.color.set('#f43f5e');
    }
  }

  /** Spawn Volumetric Curved 3D Anime Sword Slash Arc! */
  public spawnSlashArc(opts: {
    position: THREE.Vector3;
    rotation: [number, number, number];
    radius?: number;
    thickness?: number;
    arcAngle?: number;
    primaryHex: string;
    secondaryHex: string;
    coreHex?: string;
    velocity?: THREE.Vector3;
    duration?: number;
    growRate?: number;
    intensity?: number;
  }): void {
    const r = opts.radius ?? 4.2;
    const thick = opts.thickness ?? r * 0.46;
    const arc = opts.arcAngle ?? Math.PI * 1.28;
    const geo = buildArcRibbonGeometry(Math.max(0.2, r - thick), r, arc, 44);
    const mat = createSlashArcMaterial(
      opts.primaryHex,
      opts.secondaryHex,
      opts.coreHex ?? '#ffffff'
    );
    mat.uniforms.uIntensity.value = opts.intensity ?? 2.8;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(opts.position);
    mesh.rotation.set(opts.rotation[0], opts.rotation[1], opts.rotation[2]);
    this.scene.add(mesh);

    this.slashes.push({
      mesh,
      mat,
      velocity: opts.velocity ? opts.velocity.clone() : new THREE.Vector3(),
      age: 0,
      maxAge: opts.duration ?? 0.62,
      growRate: opts.growRate ?? 0.55,
      baseScale: 1,
    });
  }

  /** Spawn Canonical One Piece Wano Black-Core + Crimson/Tinted Conqueror's Haki Lightning Bolt! */
  public spawnHakiLightning(
    start: THREE.Vector3,
    end: THREE.Vector3,
    outerHex = '#ff1744',
    duration = 0.28,
    thicknessScale = 1.0
  ): void {
    const group = new THREE.Group();
    const dist = start.distanceTo(end);
    const segs = Math.max(6, Math.min(18, Math.floor(dist * 1.1)));
    const jitter = Math.min(1.6, dist * 0.14);
    const pts = buildJaggedPoints(start, end, segs, jitter);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.12);

    const outerMat = new THREE.MeshBasicMaterial({
      color: outerHex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: '#050208', // Pitch-black Conqueror's Haki inner bolt core!
      transparent: true,
      opacity: 1.0,
    });

    const outerRadius = 0.085 * thicknessScale;
    const coreRadius = 0.042 * thicknessScale;

    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segs * 2, outerRadius, 6, false), outerMat));
    group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, segs * 2, coreRadius, 5, false), coreMat));

    // Add 1–2 jagged secondary forks!
    const forkCount = dist > 4 ? 2 : 1;
    for (let f = 0; f < forkCount; f++) {
      const idx = Math.floor(pts.length * (0.3 + f * 0.35));
      const fStart = pts[Math.min(idx, pts.length - 2)];
      const fEnd = fStart
        .clone()
        .add(
          new THREE.Vector3(
            (Math.random() - 0.5) * dist * 0.45,
            (Math.random() - 0.3) * dist * 0.4,
            (Math.random() - 0.5) * dist * 0.45
          )
        );
      const fPts = buildJaggedPoints(fStart, fEnd, 5, jitter * 0.55);
      const fCurve = new THREE.CatmullRomCurve3(fPts, false, 'catmullrom', 0.1);
      group.add(
        new THREE.Mesh(new THREE.TubeGeometry(fCurve, 8, outerRadius * 0.55, 5, false), outerMat)
      );
    }

    this.scene.add(group);
    this.lightnings.push({ group, age: 0, maxAge: duration, outerMat, coreMat });
  }

  /** Spawn Expanding 3D Shockwave Ring */
  public spawnShockwave(
    position: THREE.Vector3,
    colorHex: string,
    startScale = 0.6,
    endScale = 14,
    duration = 0.5,
    rotation: [number, number, number] = [Math.PI * 0.5, 0, 0]
  ): void {
    const geo = new THREE.RingGeometry(0.74, 1.0, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(position);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.scale.setScalar(startScale);
    this.scene.add(mesh);

    this.shockwaves.push({
      mesh,
      mat,
      age: 0,
      maxAge: duration,
      startScale,
      endScale,
      rotSpeed: (Math.random() - 0.5) * 6,
    });
  }

  /** Carve Glowing Molten Haki Fissure Trench into Onigashima Floor! */
  public spawnGroundScar(
    center: THREE.Vector3,
    yawAngle: number,
    length: number,
    width: number,
    primaryHex: string,
    secondaryHex: string,
    duration = 5.5
  ): void {
    const geo = new THREE.PlaneGeometry(width, length, 1, 1);
    const mat = createGroundScarMaterial(primaryHex, secondaryHex);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.order = 'YXZ';
    mesh.rotation.set(-Math.PI * 0.5, yawAngle, 0);
    mesh.position.set(center.x, 0.045, center.z);
    this.scene.add(mesh);

    this.scars.push({ mesh, mat, age: 0, maxAge: duration });
  }

  /** Spawn Apocalyptic Sky-Splitting Haki Energy Pillar! */
  public spawnSkyPillar(
    pos: THREE.Vector3,
    primaryHex: string,
    coreHex = '#ffffff',
    maxRadius = 5.5,
    duration = 1.45
  ): void {
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);

    const coreMat = new THREE.MeshBasicMaterial({
      color: coreHex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const outerMat = new THREE.MeshBasicMaterial({
      color: primaryHex,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 68, 20, 1, true), coreMat);
    core.position.y = 34;
    group.add(core);

    const outer = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 68, 28, 1, true), outerMat);
    outer.position.y = 34;
    group.add(outer);

    this.scene.add(group);
    this.pillars.push({ group, coreMat, outerMat, age: 0, maxAge: duration, maxRadius });
  }

  /** Spawn High-Velocity Anime Sparks from zero-GC Instanced Pool */
  public spawnSparks(
    origin: THREE.Vector3,
    count: number,
    primaryHex: string,
    secondaryHex = '#ffffff',
    speed = 16,
    directionalBias?: THREE.Vector3
  ): void {
    const c1 = new THREE.Color(primaryHex);
    const c2 = new THREE.Color(secondaryHex);
    let spawned = 0;

    for (let i = 0; i < this.maxSparks && spawned < count; i++) {
      const s = this.sparks[i];
      if (s.active) continue;

      s.active = true;
      s.pos.copy(origin);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const v = speed * (0.35 + Math.random() * 0.95);

      s.vel.set(
        Math.sin(phi) * Math.cos(theta) * v,
        Math.abs(Math.cos(phi)) * v * 0.85 + 2.2,
        Math.sin(phi) * Math.sin(theta) * v
      );
      if (directionalBias) {
        s.vel.add(directionalBias);
      }

      s.color.copy(Math.random() > 0.35 ? c1 : c2).multiplyScalar(1.8);
      this.sparkInstanced.setColorAt(i, s.color);
      s.age = 0;
      s.maxAge = 0.35 + Math.random() * 0.55;
      s.size = 0.65 + Math.random() * 1.25;
      spawned++;
    }
    if (this.sparkInstanced.instanceColor) {
      this.sparkInstanced.instanceColor.needsUpdate = true;
    }
  }

  /** Spawn Kokujo O Tatsu Maki — Towering 36-Meter Black-Rope Dragon Cyclone! */
  public spawnTatsumaki(center: THREE.Vector3, duration = 2.85): void {
    const group = new THREE.Group();
    group.position.set(center.x, 0, center.z);

    // Outer emerald-crimson funnel cone
    const outerGeo = new THREE.CylinderGeometry(9.8, 1.9, 36, 40, 28, true);
    const outerMat = createTornadoMaterial();
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.position.y = 18;
    group.add(outerMesh);

    // Inner blazing counter-spiral core funnel
    const innerGeo = new THREE.CylinderGeometry(5.2, 0.95, 36, 32, 20, true);
    const innerMat = createTornadoMaterial();
    innerMat.uniforms.uColorWind.value.set('#e0f2fe');
    innerMat.uniforms.uColorHaki.value.set('#00ff9d');
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.position.y = 18;
    group.add(innerMesh);

    // Spiraling levitated rocks whipped upward inside the cyclone!
    const debris: ActiveTornado['debris'] = [];
    const rockMat = new THREE.MeshStandardMaterial({
      color: '#1e293b',
      emissive: '#10b981',
      emissiveIntensity: 0.55,
    });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(this.chunkGeo, rockMat);
      const s = 0.5 + Math.random() * 1.1;
      m.scale.setScalar(s);
      group.add(m);
      debris.push({
        mesh: m,
        angle: Math.random() * Math.PI * 2,
        radius: 2.2 + Math.random() * 5.8,
        height: 1 + Math.random() * 24,
        speed: 6.5 + Math.random() * 5.5,
      });
    }

    this.scene.add(group);
    this.tornados.push({ group, outerMat, innerMat, debris, age: 0, maxAge: duration });
  }

  /** Show / Hide Towering 6-Armed Kyutoryu: Ashura Demon Deity in the arena! */
  public setAshuraManifestation(opacity: number): void {
    this.ashuraOpacityTarget = opacity;
  }

  /** Spawn En-O Santoryu: Ippyakusanjo Hiryu Jigoku — Colossal Plunging Emerald-Gold Flying Dragon! */
  public spawnHiryuDragon(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    flightDuration: number,
    onImpact: () => void
  ): void {
    const group = new THREE.Group();
    group.position.copy(startPos);

    // Roaring Emerald-Gold & Black-Lightning Dragon Head sprite
    const headMat = createSpiritBillboardMaterial(this.dragonTex, 2.15);
    headMat.uniforms.uOpacity.value = 1.0;
    const headMesh = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 11.5), headMat);
    group.add(headMesh);

    // Sinuous trailing 3D emerald-gold dragon flame coils
    const bodyRings: THREE.Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const r = THREE.MathUtils.lerp(3.2, 0.7, t);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.24 * (1 - t * 0.5), 8, 22),
        new THREE.MeshBasicMaterial({
          color: i % 3 === 0 ? '#fde047' : i % 2 === 0 ? '#00ff88' : '#22d3ee',
          transparent: true,
          opacity: 0.85 * (1 - t * 0.55),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      group.add(ring);
      bodyRings.push(ring);
    }

    this.scene.add(group);
    this.dragons.push({
      group,
      headMat,
      bodyRings,
      startPos: startPos.clone(),
      endPos: endPos.clone(),
      age: 0,
      flightDuration,
      impacted: false,
      onImpact,
    });
  }

  public update(dt: number, elapsed: number, cameraPos: THREE.Vector3): void {
    // 1. Update Volumetric Slash Arcs
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.age += dt;
      const p = s.age / s.maxAge;
      if (p >= 1) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mat.dispose();
        this.slashes.splice(i, 1);
        continue;
      }
      s.mesh.position.addScaledVector(s.velocity, dt);
      const sc = s.baseScale + p * s.growRate;
      s.mesh.scale.setScalar(sc);
      s.mat.uniforms.uTime.value = elapsed;
      s.mat.uniforms.uProgress.value = p;
    }

    // 2. Update Conqueror's Haki Black-Red Lightning
    for (let i = this.lightnings.length - 1; i >= 0; i--) {
      const l = this.lightnings[i];
      l.age += dt;
      const p = l.age / l.maxAge;
      if (p >= 1) {
        this.scene.remove(l.group);
        l.group.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            (obj as THREE.Mesh).geometry.dispose();
          }
        });
        l.outerMat.dispose();
        l.coreMat.dispose();
        this.lightnings.splice(i, 1);
        continue;
      }
      // Sharp anime strobe flicker!
      const flicker = Math.sin(elapsed * 95 + i * 3) > -0.25 ? 1 : 0.25;
      l.outerMat.opacity = (1 - p) * flicker;
      l.coreMat.opacity = (1 - p * 0.85) * flicker;
    }

    // 3. Update Shockwave Rings
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.age += dt;
      const p = sw.age / sw.maxAge;
      if (p >= 1) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mat.dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      const ease = 1 - Math.pow(1 - p, 3);
      sw.mesh.scale.setScalar(THREE.MathUtils.lerp(sw.startScale, sw.endScale, ease));
      sw.mesh.rotation.z += sw.rotSpeed * dt;
      sw.mat.opacity = Math.pow(1 - p, 1.6);
    }

    // 4. Update Ground Molten Haki Scars
    for (let i = this.scars.length - 1; i >= 0; i--) {
      const sc = this.scars[i];
      sc.age += dt;
      const p = sc.age / sc.maxAge;
      if (p >= 1) {
        this.scene.remove(sc.mesh);
        sc.mesh.geometry.dispose();
        sc.mat.dispose();
        this.scars.splice(i, 1);
        continue;
      }
      sc.mat.uniforms.uTime.value = elapsed;
      sc.mat.uniforms.uLife.value = Math.pow(1 - p, 1.35);
    }

    // 5. Update Sky-Splitting Haki Pillars
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const pl = this.pillars[i];
      pl.age += dt;
      const p = pl.age / pl.maxAge;
      if (p >= 1) {
        this.scene.remove(pl.group);
        pl.group.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
        });
        pl.coreMat.dispose();
        pl.outerMat.dispose();
        this.pillars.splice(i, 1);
        continue;
      }
      const expand = p < 0.14 ? p / 0.14 : Math.max(0.05, 1 - (p - 0.14) / 0.86);
      const r = pl.maxRadius * expand;
      pl.group.scale.set(r, 1, r);
      pl.group.rotation.y += dt * 8;
      pl.coreMat.opacity = expand;
      pl.outerMat.opacity = expand * 0.82;
    }

    // 6. Update Kokujo O Tatsu Maki Tornadoes
    for (let i = this.tornados.length - 1; i >= 0; i--) {
      const tn = this.tornados[i];
      tn.age += dt;
      const p = tn.age / tn.maxAge;
      if (p >= 1) {
        this.scene.remove(tn.group);
        tn.group.children.forEach((child) => {
          const m = child as THREE.Mesh;
          if (m.isMesh && m.geometry !== this.chunkGeo) {
            m.geometry.dispose();
          }
        });
        if (tn.debris[0]) {
          (tn.debris[0].mesh.material as THREE.Material).dispose();
        }
        tn.outerMat.dispose();
        tn.innerMat.dispose();
        this.tornados.splice(i, 1);
        continue;
      }
      const env = p < 0.12 ? p / 0.12 : p > 0.78 ? (1 - p) / 0.22 : 1;
      tn.group.scale.set(env, 0.35 + 0.65 * Math.min(1, p * 5), env);
      tn.outerMat.uniforms.uTime.value = elapsed;
      tn.outerMat.uniforms.uOpacity.value = env * 0.95;
      tn.innerMat.uniforms.uTime.value = elapsed * 1.35;
      tn.innerMat.uniforms.uOpacity.value = env * 0.85;

      // Whip boulders & lightning upward inside cyclone!
      for (const d of tn.debris) {
        d.angle += d.speed * dt;
        d.height = (d.height + 11 * dt) % 30;
        const funnelR = d.radius * (0.35 + (d.height / 30) * 0.95);
        d.mesh.position.set(Math.cos(d.angle) * funnelR, d.height, Math.sin(d.angle) * funnelR);
        d.mesh.rotation.x += dt * 7;
        d.mesh.rotation.y += dt * 9;
      }

      if (Math.random() < dt * 16) {
        const a = Math.random() * Math.PI * 2;
        const h = 2 + Math.random() * 22;
        const p1 = tn.group.position.clone().add(new THREE.Vector3(Math.cos(a) * 4.5, h, Math.sin(a) * 4.5));
        const p2 = tn.group.position
          .clone()
          .add(new THREE.Vector3(Math.cos(a + 1.4) * 5.8, h + 5, Math.sin(a + 1.4) * 5.8));
        this.spawnHakiLightning(p1, p2, Math.random() > 0.5 ? '#ff1e56' : '#00ff9d', 0.18, 1.1);
      }
    }

    // 7. Update Hiryu Jigoku Plunging Emerald Flying Dragon
    for (let i = this.dragons.length - 1; i >= 0; i--) {
      const dr = this.dragons[i];
      dr.age += dt;
      const p = dr.age / dr.flightDuration;
      dr.headMat.uniforms.uTime.value = elapsed;

      if (p < 1.0) {
        const pos = new THREE.Vector3().lerpVectors(dr.startPos, dr.endPos, Math.pow(p, 1.25));
        // Sinuous dragon slither wave
        pos.x += Math.sin(elapsed * 22) * 0.9 * (1 - p * 0.5);
        pos.y += Math.cos(elapsed * 18) * 0.5;
        dr.group.position.copy(pos);
        dr.group.children[0].lookAt(cameraPos);

        const backDir = dr.startPos.clone().sub(dr.endPos).normalize();
        dr.bodyRings.forEach((ring, idx) => {
          const dist = (idx + 1) * 1.15;
          ring.position
            .copy(backDir)
            .multiplyScalar(dist)
            .add(
              new THREE.Vector3(
                Math.sin(elapsed * 24 - idx * 0.65) * 1.1,
                Math.cos(elapsed * 20 - idx * 0.55) * 0.7,
                0
              )
            );
          ring.lookAt(ring.position.clone().add(backDir));
        });

        // Trail Conqueror's Haki black-red lightning & emerald hellfire sparks!
        this.spawnSparks(pos, 10, '#00ff88', '#fde047', 14);
        if (Math.random() < dt * 28) {
          this.spawnHakiLightning(
            pos,
            pos.clone().add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 9,
                (Math.random() - 0.5) * 9,
                (Math.random() - 0.5) * 9
              )
            ),
            '#ff1744',
            0.22,
            1.35
          );
        }
      } else if (!dr.impacted) {
        dr.impacted = true;
        dr.onImpact?.();
      } else {
        const fade = Math.max(0, 1 - (dr.age - dr.flightDuration) / 0.35);
        dr.headMat.uniforms.uOpacity.value = fade;
        dr.group.scale.setScalar(1 + (1 - fade) * 1.5);
        if (fade <= 0.01) {
          this.scene.remove(dr.group);
          dr.group.children.forEach((child) => {
            const m = child as THREE.Mesh;
            if (m.isMesh) {
              m.geometry.dispose();
              if (m.material !== dr.headMat) {
                (m.material as THREE.Material).dispose();
              }
            }
          });
          dr.headMat.dispose();
          this.dragons.splice(i, 1);
        }
      }
    }

    // 8. Update Ashura Towering Deity Manifestation
    const curAshura = this.ashuraMat.uniforms.uOpacity.value as number;
    const nextAshura = THREE.MathUtils.lerp(curAshura, this.ashuraOpacityTarget, Math.min(1, dt * 6));
    this.ashuraMat.uniforms.uOpacity.value = nextAshura;
    this.ashuraMat.uniforms.uTime.value = elapsed;
    this.ashuraMesh.visible = nextAshura > 0.01;
    this.ashuraHalo.visible = nextAshura > 0.01;
    if (this.ashuraMesh.visible) {
      const s = 0.92 + nextAshura * 0.16 + Math.sin(elapsed * 4) * 0.02;
      this.ashuraMesh.scale.setScalar(s);
      (this.ashuraHalo.material as THREE.MeshBasicMaterial).opacity = nextAshura * 0.65;
      this.ashuraHalo.rotation.z = elapsed * 0.9;
    }

    // 9. Update Shattered Tumbling Rock Boulders
    for (let i = this.rockChunks.length - 1; i >= 0; i--) {
      const rc = this.rockChunks[i];
      rc.age += dt;
      if (rc.age >= rc.maxAge) {
        this.scene.remove(rc.mesh);
        (rc.mesh.material as THREE.Material).dispose();
        this.rockChunks.splice(i, 1);
        continue;
      }
      rc.vel.y -= 26 * dt;
      rc.mesh.position.addScaledVector(rc.vel, dt);
      if (rc.mesh.position.y < 0.25) {
        rc.mesh.position.y = 0.25;
        rc.vel.y *= -0.42;
        rc.vel.x *= 0.72;
        rc.vel.z *= 0.72;
      }
      rc.mesh.rotation.x += rc.rotVel.x * dt;
      rc.mesh.rotation.y += rc.rotVel.y * dt;
      const shrink = rc.age > rc.maxAge * 0.7 ? 1 - (rc.age - rc.maxAge * 0.7) / (rc.maxAge * 0.3) : 1;
      rc.mesh.scale.multiplyScalar(shrink < 0.99 ? 0.94 : 1);
    }

    // 10. Update Slicable Oni Monoliths
    for (const m of this.monoliths) {
      if (m.state === 'intact') {
        // Subtle pulsing spirit core
        const pulse = 0.8 + Math.sin(elapsed * 3.5 + m.id) * 0.2;
        m.coreMat.color.setRGB(pulse, 0.16, 0.32);
      } else if (m.state === 'sliced_hold') {
        // Vibrate intensely while held by Haki cut seam!
        m.upperGroup.position.x = (Math.random() - 0.5) * 0.08;
        if (m.timer > 0) {
          m.timer -= dt;
          if (m.timer <= 0) {
            m.state = 'sliding';
            m.timer = 0.36;
          }
        }
      } else if (m.state === 'sliding') {
        // Upper half physically slides off diagonally along Zoro's blade cut!
        m.slideVel.y -= 8.5 * dt;
        m.upperGroup.position.addScaledVector(m.slideVel, dt);
        m.upperGroup.rotation.x += m.slideRot.x * dt;
        m.upperGroup.rotation.z += m.slideRot.z * dt;
        m.timer -= dt;
        if (m.timer <= 0) {
          this.shatterMonolith(m);
        }
      } else if (m.state === 'respawning') {
        m.timer -= dt;
        if (m.timer <= 0) {
          // Rise dramatically out of the Onigashima rooftop!
          m.root.position.y = THREE.MathUtils.lerp(m.root.position.y, m.basePos.y, Math.min(1, dt * 6.5));
          if (Math.abs(m.root.position.y - m.basePos.y) < 0.04) {
            m.root.position.copy(m.basePos);
            m.state = 'intact';
          }
        }
      }
    }

    // 11. Update 650 Instanced Velocity-Stretched Anime Sparks
    let anySparkUpdated = false;
    for (let i = 0; i < this.maxSparks; i++) {
      const s = this.sparks[i];
      if (!s.active) continue;
      anySparkUpdated = true;

      s.age += dt;
      if (s.age >= s.maxAge) {
        s.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.sparkInstanced.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      s.vel.y -= 18 * dt;
      s.vel.multiplyScalar(1 - dt * 1.4);
      s.pos.addScaledVector(s.vel, dt);

      // Sparks ricochet crisply off the Onigashima stone floor!
      if (s.pos.y < 0.06) {
        s.pos.y = 0.06;
        s.vel.y = Math.abs(s.vel.y) * 0.52;
      }

      const life = 1 - s.age / s.maxAge;
      const spd = s.vel.length();
      this.dummy.position.copy(s.pos);
      if (spd > 0.1) {
        this.dummy.quaternion.setFromUnitVectors(this.upVec, s.vel.clone().divideScalar(spd));
      }
      this.dummy.scale.set(
        s.size * life,
        s.size * life * Math.min(2.6, 0.5 + spd * 0.09),
        s.size * life
      );
      this.dummy.updateMatrix();
      this.sparkInstanced.setMatrixAt(i, this.dummy.matrix);
    }
    if (anySparkUpdated) {
      this.sparkInstanced.instanceMatrix.needsUpdate = true;
    }
  }
}
