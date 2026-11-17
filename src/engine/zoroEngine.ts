import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { TECHNIQUE_MAP, TechniqueId, TechniqueSpec } from '../data/techniques';
import { sakugaAudio } from '../audio/sakugaAudio';
import { AnimeSakugaPostShader } from './shaders';
import { ArenaHandle, buildOnigashimaArena } from './arenaBuilder';
import { IDLE_SANTORYU_POSE, ZoroFirstPersonRig } from './firstPersonRig';
import { SakugaVfxSystem } from './vfxSystem';

export interface EngineHudSnapshot {
  activeTechnique: TechniqueSpec | null;
  progress: number;
  phaseLabel: string;
  kingOfHell: boolean;
  slowMo: boolean;
  showcaseMode: boolean;
  comboCount: number;
  totalCleaves: number;
  letterbox: boolean;
}

export interface EngineCallbacks {
  onHudUpdate: (snapshot: EngineHudSnapshot) => void;
  onTriggerCutIn: (accentHex: string) => void;
  onTriggerCalligraphy: (tech: TechniqueSpec) => void;
  onTriggerKachin: () => void;
}

interface ImpactFrameStep {
  mode: 1 | 2 | 3;
  duration: number;
  tint: string;
}

const HOME_POS = new THREE.Vector3(0, 1.82, 2.4);
const SHOWCASE_ORDER: TechniqueId[] = [
  'rengoku_onigiri',
  'shishi_sonson',
  'sanzen_sekai',
  'tatsumaki',
  'ashura_bakkei',
  'hiryu_jigoku',
];

export class ZoroSakugaEngine {
  private readonly container: HTMLElement;
  private readonly callbacks: EngineCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;
  private readonly sakugaPass: ShaderPass;
  private readonly arena: ArenaHandle;
  private readonly rig: ZoroFirstPersonRig;
  private readonly vfx: SakugaVfxSystem;

  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private disposed = false;

  // Player & Camera cinematic state
  private camBasePos = HOME_POS.clone();
  private camTargetPos = HOME_POS.clone();
  private camPosLerp = 12;
  private camTargetFov = 65;
  private camScriptYaw = 0;
  private camScriptPitch = -0.02;
  private camScriptRoll = 0;
  private spinExtraYaw = 0;

  // Smooth mouse look & inertia
  private mouseNorm = new THREE.Vector2(0, 0);
  private smoothMouse = new THREE.Vector2(0, 0);
  private mouseVel = new THREE.Vector2(0, 0);

  // Camera shake, hit-stop & Toei Wano impact frames
  private shakeAmp = 0;
  private hitStopTimer = 0;
  private impactQueue: ImpactFrameStep[] = [];
  private currentImpactTimer = 0;
  private shockwaveProgress = -1;
  private shockwaveStrength = 0;
  private flashAlpha = 0;
  private chromaticTarget = 0;
  private speedLinesTarget = 0;
  private focusDesatTarget = 0;
  private hakiChargeLevel = 0;
  private ashuraEclipseLevel = 0;
  private freezeWorldPetals = false;

  // Active technique state machine
  private activeTech: TechniqueSpec | null = null;
  private techTime = 0;
  private firedEvents = new Set<string>();
  private currentPhaseLabel = '';
  private spinAccumulator = 0;

  // Awakening (Bandana Tie), Charge Slash (1080 Pound Ho) & Free Mouse Slash state
  private kingOfHell = false;
  private awakeningTimer = -1;
  private freeSlashTimer = -1;
  private freeSlashAngle = 0;
  private freeSlashComboStep = 0;
  private isChargingSlash = false;
  private chargeSlashTime = 0;

  // Modes & metrics
  private slowMo = false;
  private cutInEnabled = true;
  private showcaseMode = false;
  private showcaseIndex = 0;
  private showcaseGapTimer = 0;
  private comboCount = 0;
  private comboDecayTimer = 0;
  private totalCleaves = 0;
  private hudEmitTimer = 0;

  constructor(container: HTMLElement, callbacks: EngineCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, w / h, 0.08, 280);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.copy(HOME_POS);
    this.scene.add(this.camera);

    const loader = new THREE.TextureLoader();
    this.arena = buildOnigashimaArena(this.scene, loader);
    this.rig = new ZoroFirstPersonRig(this.camera, this.scene);
    this.vfx = new SakugaVfxSystem(this.scene, loader);

    // HDR Post-Processing Pipeline: Scene -> UnrealBloom -> Toei Wano Sakuga Shader -> Output
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.92, 0.52, 0.36);
    this.composer.addPass(this.bloomPass);

    this.sakugaPass = new ShaderPass(AnimeSakugaPostShader);
    this.composer.addPass(this.sakugaPass);

    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', this.handleResize);

    // Subtle idle Enma spectral breath
    this.applyIdleBladePalette();

    this.lastTime = performance.now();
    this.emitHud();
    this.loop(this.lastTime);
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
  };

  public onMouseMove(normX: number, normY: number): void {
    this.mouseNorm.set(THREE.MathUtils.clamp(normX, -1, 1), THREE.MathUtils.clamp(normY, -1, 1));
  }

  public setCutInEnabled(enabled: boolean): void {
    this.cutInEnabled = enabled;
  }

  public setSlowMo(enabled: boolean): void {
    this.slowMo = enabled;
    this.emitHud();
  }

  public toggleSlowMo(): boolean {
    this.slowMo = !this.slowMo;
    this.emitHud();
    return this.slowMo;
  }

  public startShowcase(enable: boolean): void {
    sakugaAudio.unlock();
    this.showcaseMode = enable;
    if (enable) {
      this.showcaseIndex = 0;
      this.showcaseGapTimer = 0.05;
      if (!this.activeTech) {
        this.triggerTechnique(SHOWCASE_ORDER[0]);
        this.showcaseIndex = 1;
      }
    }
    this.emitHud();
  }

  public resetArena(): void {
    sakugaAudio.unlock();
    this.showcaseMode = false;
    this.activeTech = null;
    this.awakeningTimer = -1;
    this.freeSlashTimer = -1;
    this.resetCinematicTargets();
    this.vfx.resetAllMonoliths();
    this.vfx.setAshuraManifestation(0);
    this.rig.setPose(IDLE_SANTORYU_POSE, 14);
    this.applyIdleBladePalette();
    sakugaAudio.playSheathDraw(1.05);
    this.emitHud();
  }

  /** Toggle King of Hell (En-O Santoryu) with First-Person Black Bandana Tie Motion! */
  public toggleKingOfHell(): boolean {
    sakugaAudio.unlock();
    if (this.activeTech) {
      this.kingOfHell = !this.kingOfHell;
      sakugaAudio.setKingOfHellHum(this.kingOfHell);
      this.emitHud();
      return this.kingOfHell;
    }

    this.kingOfHell = !this.kingOfHell;
    sakugaAudio.setKingOfHellHum(this.kingOfHell);

    if (this.kingOfHell) {
      this.awakeningTimer = 0;
      this.firedEvents.clear();
      sakugaAudio.playBandanaSnap();
    } else {
      this.awakeningTimer = -1;
      this.applyIdleBladePalette();
      this.hakiChargeLevel = 0;
      sakugaAudio.playTsubaClink();
    }

    this.emitHud();
    return this.kingOfHell;
  }

  /** Begin coiling blades when player holds mouse button (charges 1080 Pound Phoenix!) */
  public startSlashCharge(): void {
    sakugaAudio.unlock();
    if (this.activeTech || this.awakeningTimer >= 0) return;
    this.isChargingSlash = true;
    this.chargeSlashTime = 0;
  }

  public cancelSlashCharge(): void {
    this.isChargingSlash = false;
    this.chargeSlashTime = 0;
  }

  /** Instant Directional Free First-Person Slash OR Charged 1080 Pound Phoenix along Mouse Swipe! */
  public triggerFreeSlash(angleRad?: number): void {
    sakugaAudio.unlock();
    const charged = this.isChargingSlash && this.chargeSlashTime >= 0.4;
    this.isChargingSlash = false;
    this.chargeSlashTime = 0;

    if (this.activeTech || this.awakeningTimer >= 0) return;

    // Ensure at least one target monolith is ready
    if (!this.vfx.monoliths.some((m) => m.state === 'intact' || m.state === 'sliced_hold')) {
      this.vfx.resetAllMonoliths();
    }

    const defaultAngles = [-0.48, 0.52, 0.04];
    const step = charged ? 2 : this.freeSlashComboStep % 3;
    this.freeSlashAngle = angleRad !== undefined ? angleRad : defaultAngles[step];
    this.freeSlashComboStep = charged ? 0 : this.freeSlashComboStep + 1;
    this.freeSlashTimer = 0;

    const isFinisher = step === 2 || charged;
    const isKoh = this.kingOfHell;
    const primary = charged
      ? '#22d3ee'
      : isKoh
      ? '#00ff88'
      : step === 0
      ? '#c084fc'
      : step === 1
      ? '#fb7185'
      : '#10ff96';
    const secondary = charged
      ? '#00ff88'
      : isKoh
      ? '#fde047'
      : step === 0
      ? '#10ff96'
      : '#9333ea';

    sakugaAudio.playSwordSlash(charged ? 0.78 : 0.92 + step * 0.14, isFinisher || isKoh);
    if (charged) {
      sakugaAudio.playHakiBurst(0.95);
    } else if (isKoh || isFinisher) {
      sakugaAudio.playLightningSnap(undefined, 0.75);
    }

    // Launch flying 3D Haki crescent straight from Zoro's POV toward the Onigashima monolith!
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const spawnPos = this.camera.position.clone().addScaledVector(forward, 2.8);
    spawnPos.y -= 0.05;

    this.vfx.spawnSlashArc({
      position: spawnPos,
      rotation: [0, this.camera.rotation.y, this.freeSlashAngle],
      radius: charged ? 6.4 : isFinisher ? 4.5 : 3.3,
      thickness: charged ? 2.6 : isFinisher ? 1.85 : 1.35,
      arcAngle: Math.PI * 1.25,
      primaryHex: primary,
      secondaryHex: secondary,
      velocity: forward.clone().multiplyScalar(charged ? 48 : 42),
      duration: charged ? 0.68 : 0.52,
      growRate: charged ? 1.15 : 0.85,
      intensity: charged ? 3.8 : isKoh ? 3.4 : 2.7,
    });

    if (isFinisher) {
      // Triple-sword 1080 Pound Phoenix spiraling crescents!
      const extraCount = charged ? 2 : 1;
      for (let e = 0; e < extraCount; e++) {
        this.vfx.spawnSlashArc({
          position: spawnPos.clone().addScaledVector(forward, e * 1.1),
          rotation: [0, this.camera.rotation.y, this.freeSlashAngle + (e === 0 ? 0.65 : -0.65)],
          radius: charged ? 5.8 : 4.1,
          thickness: 1.8,
          primaryHex: e === 0 ? '#00ff88' : '#fde047',
          secondaryHex: primary,
          velocity: forward.clone().multiplyScalar(45 + e * 3),
          duration: 0.6,
          growRate: 1.0,
          intensity: 3.3,
        });
      }
      this.vfx.spawnGroundScar(
        new THREE.Vector3(0, 0, -9),
        this.camera.rotation.y,
        24,
        1.8,
        primary,
        secondary,
        3.5
      );
    }

    if (isKoh || charged) {
      const tsuba = this.rig.getTsubaWorld(step % 2 === 0 ? 'enma' : 'sandai');
      this.vfx.spawnHakiLightning(
        tsuba,
        spawnPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 1.2, -3)),
        charged ? '#22d3ee' : '#ff1744',
        0.26,
        1.0
      );
    }

    // Carve glowing cut seam onto center monolith & shatter on finisher / charged phoenix!
    const targets = isFinisher ? [0, 1, 2] : [0];
    const hits = this.vfx.markMonolithSliced(
      targets,
      this.freeSlashAngle,
      primary,
      isFinisher ? 0.14 : 1.5
    );
    if (hits > 0) {
      this.registerHits(charged ? 6 : isFinisher ? 3 : 1, isFinisher ? hits : 0);
      if (isFinisher) {
        this.queueImpactFrames(
          charged
            ? [
                { mode: 1, duration: 0.038, tint: primary },
                { mode: 3, duration: 0.04, tint: '#00ff88' },
              ]
            : [{ mode: 1, duration: 0.034, tint: primary }],
          charged ? 0.065 : 0.042
        );
        this.triggerShockwave(charged ? 0.055 : 0.035, primary);
        this.triggerArenaLight(primary, charged ? 22 : 14, new THREE.Vector3(0, 3.5, -13));
        sakugaAudio.playImpactExplosion(charged ? 1.05 : 0.78);
      }
    }

    this.shakeAmp = Math.max(this.shakeAmp, charged ? 0.34 : isFinisher ? 0.22 : 0.1);
    this.chromaticTarget = charged ? 0.022 : isFinisher ? 0.016 : 0.008;
    this.speedLinesTarget = charged ? 0.65 : 0;
    this.rig.setTrailIntensity(0.92);
  }

  /** Unleash One of Zoro's 6 Legendary Ultimate Techniques in Full Choreographed First-Person POV! */
  public triggerTechnique(id: TechniqueId, fromUser = false): void {
    sakugaAudio.unlock();
    if (fromUser && this.showcaseMode) {
      this.showcaseMode = false;
    }

    const spec = TECHNIQUE_MAP[id];
    if (!spec) return;

    // Ensure monoliths are standing ready to be gloriously cleaved!
    const anyIntact = this.vfx.monoliths.some((m) => m.state === 'intact');
    if (!anyIntact) {
      this.vfx.resetAllMonoliths();
    }

    this.awakeningTimer = -1;
    this.freeSlashTimer = -1;
    this.resetCinematicTargets();
    this.vfx.setAshuraManifestation(0);
    this.rig.clearTrails();

    this.activeTech = spec;
    this.techTime = 0;
    this.spinAccumulator = 0;
    this.firedEvents.clear();
    this.currentPhaseLabel = spec.phases.stanceLabel;

    // Hiryu Jigoku automatically awakens King of Hell!
    if (id === 'hiryu_jigoku' && !this.kingOfHell) {
      this.kingOfHell = true;
      sakugaAudio.setKingOfHellHum(true);
    }

    this.emitHud();
  }

  private once(key: string, fn: () => void): void {
    if (this.firedEvents.has(key)) return;
    this.firedEvents.add(key);
    fn();
  }

  private registerHits(comboAdd: number, cleaveAdd: number): void {
    this.comboCount += comboAdd;
    this.comboDecayTimer = 5.5;
    this.totalCleaves += cleaveAdd;
    this.emitHud();
  }

  private queueImpactFrames(frames: ImpactFrameStep[], hitStopSeconds = 0.07): void {
    this.impactQueue = [...frames];
    this.currentImpactTimer = frames[0]?.duration ?? 0;
    this.hitStopTimer = Math.max(this.hitStopTimer, hitStopSeconds);
  }

  private triggerShockwave(strength: number, colorHex: string): void {
    this.shockwaveProgress = 0;
    this.shockwaveStrength = strength;
    (this.sakugaPass.uniforms.uSpeedColor.value as THREE.Color).set(colorHex);
  }

  private triggerFlash(alpha: number, colorHex: string): void {
    this.flashAlpha = Math.max(this.flashAlpha, alpha);
    (this.sakugaPass.uniforms.uFlashColor.value as THREE.Color).set(colorHex);
  }

  private triggerArenaLight(colorHex: string, intensity: number, pos?: THREE.Vector3): void {
    this.arena.hakiPointLight.color.set(colorHex);
    this.arena.hakiPointLight.intensity = intensity;
    if (pos) {
      this.arena.hakiPointLight.position.copy(pos);
    } else {
      this.arena.hakiPointLight.position.set(0, 4, -10);
    }
  }

  private applyIdleBladePalette(): void {
    if (this.kingOfHell) {
      this.rig.setBladeHakiState(true, 0.92, {
        inner: '#22d3ee',
        mid: '#00ff88',
        tip: '#fde047',
        trail: '#ff1744',
      });
      this.rig.setTrailIntensity(0.32);
    } else {
      this.rig.setBladeHakiState(false, 0.18, {
        inner: '#c084fc',
        mid: '#10ff96',
        tip: '#e0f2fe',
        trail: '#10ff96',
      });
      this.rig.setTrailIntensity(0.14);
    }
  }

  private resetCinematicTargets(): void {
    this.camTargetPos.copy(HOME_POS);
    this.camPosLerp = 9;
    this.camTargetFov = 65;
    this.camScriptYaw = 0;
    this.camScriptPitch = -0.02;
    this.camScriptRoll = 0;
    this.spinExtraYaw = 0;
    this.speedLinesTarget = 0;
    this.focusDesatTarget = 0;
    this.chromaticTarget = 0;
    this.freezeWorldPetals = false;
    this.ashuraEclipseLevel = 0;
    this.hakiChargeLevel = this.kingOfHell ? 0.35 : 0;
    this.bloomPass.strength = this.kingOfHell ? 1.05 : 0.9;
  }

  // ============================================================================
  // CHOREOGRAPHY FOR ALL 6 LEGENDARY RORONOA ZORO FIRST-PERSON TECHNIQUES
  // ============================================================================

  private updateActiveTechnique(dt: number): void {
    if (!this.activeTech) return;
    this.techTime += dt;
    const t = this.techTime;
    const spec = this.activeTech;

    switch (spec.id) {
      case 'rengoku_onigiri':
        this.stepRengokuOniGiri(t, dt, spec);
        break;
      case 'shishi_sonson':
        this.stepShiShishiSonson(t, dt, spec);
        break;
      case 'sanzen_sekai':
        this.stepSanzenSekai(t, dt, spec);
        break;
      case 'tatsumaki':
        this.stepKokujoTatsumaki(t, dt, spec);
        break;
      case 'ashura_bakkei':
        this.stepAshuraBakkei(t, dt, spec);
        break;
      case 'hiryu_jigoku':
        this.stepHiryuJigoku(t, dt, spec);
        break;
    }

    // Complete technique and return seamlessly to Santoryu guard
    if (t >= spec.duration) {
      this.activeTech = null;
      this.currentPhaseLabel = '';
      this.resetCinematicTargets();
      this.vfx.setAshuraManifestation(0);
      this.rig.setPose(IDLE_SANTORYU_POSE, 11);
      this.applyIdleBladePalette();
      if (this.showcaseMode) {
        this.showcaseGapTimer = 0.85;
      }
      this.emitHud();
    }
  }

  /** [1] SANTORYU: RENGOKU ONI GIRI (Purgatory Demon Slash) */
  private stepRengokuOniGiri(t: number, dt: number, spec: TechniqueSpec): void {
    if (t < 1.05) {
      // PHASE 1: Deep coiled predator crouch + Iconic X-Crossed Enma & Sandai across chest + horizontal Wado!
      this.once('p1_start', () => {
        sakugaAudio.playSheathDraw(0.92);
        sakugaAudio.playHakiBurst(0.95);
        this.rig.setBladeHakiState(true, 1.25, {
          inner: '#c084fc',
          mid: '#10ff96',
          tip: '#a855f7',
          trail: '#9333ea',
        });
        this.rig.setTrailIntensity(0.8);
        this.triggerArenaLight('#9333ea', 12, new THREE.Vector3(0, 2, 0));
      });

      this.camTargetPos.set(0, 1.15, 3.0); // Crouch low & pull back tension
      this.camPosLerp = 8;
      this.camTargetFov = 52;
      this.camScriptPitch = 0.04;
      this.camScriptRoll = Math.sin(t * 28) * 0.012;
      this.hakiChargeLevel = Math.min(1, t * 1.2);
      this.bloomPass.strength = 1.18;

      // Canonical ONI GIRI X-Cross right in front of your POV: wrists cross center, blades flare into glowing X over horizontal Wado!
      const tremble = Math.sin(t * 55) * 0.008;
      this.rig.setPose(
        {
          left: {
            pos: [0.15 + tremble, -0.18, -0.56],
            rot: [-0.24, -0.14, -0.82],
            visible: true,
          },
          right: {
            pos: [-0.15 - tremble, -0.2, -0.6],
            rot: [-0.24, 0.14, 0.82],
            visible: true,
          },
          mouth: {
            pos: [0.32, -0.21, -0.5],
            rot: [-0.06, Math.PI, -Math.PI * 0.5 + 0.02],
            visible: true,
          },
        },
        14
      );

      // Purgatory Haki lightning arcing around Zoro during stance
      if (Math.random() < dt * 14) {
        const p1 = this.camBasePos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, -0.8, -1.8));
        const p2 = p1.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3.5, 2.6, -1.2));
        this.vfx.spawnHakiLightning(p1, p2, Math.random() > 0.5 ? '#a855f7' : '#10ff96', 0.2, 0.95);
      }

      if (t >= 0.62) {
        this.once('p1_cutin', () => {
          if (this.cutInEnabled) this.callbacks.onTriggerCutIn('#10ff96');
          this.callbacks.onTriggerCalligraphy(spec);
          sakugaAudio.playLightningSnap(undefined, 0.9);
        });
      }
    } else if (t < 1.78) {
      // PHASE 2: SUPERSONIC BLITZ & SIMULTANEOUS 3-BLADE UNCROSS SNAP!
      this.currentPhaseLabel = spec.phases.releaseLabel;
      this.camTargetPos.set(0, 1.32, -8.8);
      this.camPosLerp = 24;
      this.camTargetFov = 102;
      this.camScriptRoll = -0.11;
      this.speedLinesTarget = 0.95;
      this.chromaticTarget = 0.024;
      this.bloomPass.strength = 1.45;
      (this.sakugaPass.uniforms.uSpeedColor.value as THREE.Color).set('#10ff96');

      // Violent uncrossing snap: arms whip wide outward left & right like Oni horns + jaw whips Wado!
      this.rig.setPose(
        {
          left: {
            pos: [-0.78, -0.02, -0.54],
            rot: [-0.38, 0.35, 1.15],
            visible: true,
          },
          right: {
            pos: [0.78, -0.02, -0.54],
            rot: [-0.38, -0.35, -1.15],
            visible: true,
          },
          mouth: {
            pos: [0.18, -0.21, -0.5],
            rot: [-0.08, Math.PI + 0.28, -Math.PI * 0.5 - 0.04],
            visible: true,
          },
        },
        28
      );

      this.once('p2_impact', () => {
        sakugaAudio.playSwordSlash(0.85, true);
        sakugaAudio.playSwordSlash(1.18, true);
        sakugaAudio.playHakiBurst(1.25);

        // TRUE TOEI WANO IMPACT FRAMES!
        this.queueImpactFrames(
          [
            { mode: 1, duration: 0.042, tint: '#10ff96' },
            { mode: 2, duration: 0.038, tint: '#9333ea' },
            { mode: 3, duration: 0.045, tint: '#10ff96' },
          ],
          0.085
        );
        this.shakeAmp = 0.42;
        this.triggerShockwave(0.065, '#10ff96');
        this.triggerArenaLight('#10ff96', 28, new THREE.Vector3(0, 4, -14));

        const targetCenter = new THREE.Vector3(0, 3.1, -13.8);
        // Slash 1: Enma massive diagonal violet-emerald cleave
        this.vfx.spawnSlashArc({
          position: targetCenter,
          rotation: [0.12, 0, 0.68],
          radius: 9.5,
          thickness: 3.8,
          arcAngle: Math.PI * 1.4,
          primaryHex: '#10ff96',
          secondaryHex: '#9333ea',
          duration: 0.92,
          growRate: 0.55,
          intensity: 3.5,
        });
        // Slash 2: Sandai massive opposing diagonal cleave (forming giant Oni X!)
        this.vfx.spawnSlashArc({
          position: targetCenter,
          rotation: [-0.12, 0, -0.68],
          radius: 9.5,
          thickness: 3.8,
          arcAngle: Math.PI * 1.4,
          primaryHex: '#a855f7',
          secondaryHex: '#ff1e56',
          duration: 0.92,
          growRate: 0.55,
          intensity: 3.4,
        });
        // Slash 3: Wado Ichimonji razor horizontal cleave bisecting the X!
        this.vfx.spawnSlashArc({
          position: targetCenter,
          rotation: [Math.PI * 0.44, 0, 0],
          radius: 11.2,
          thickness: 3.2,
          arcAngle: Math.PI * 1.5,
          primaryHex: '#e0f2fe',
          secondaryHex: '#10ff96',
          duration: 0.95,
          growRate: 0.65,
          intensity: 3.6,
        });

        // Cross-shaped molten Purgatory fissure across Onigashima rooftop!
        this.vfx.spawnGroundScar(new THREE.Vector3(0, 0, -13), 0.48, 34, 2.8, '#10ff96', '#9333ea', 6);
        this.vfx.spawnGroundScar(new THREE.Vector3(0, 0, -13), -0.48, 34, 2.8, '#a855f7', '#ff1744', 6);

        // Slice all 3 Onigashima monoliths in X-pattern and hold for dramatic Purgatory burst!
        this.vfx.markMonolithSliced([0, 1, 2], 0.65, '#10ff96');
        this.vfx.markMonolithSliced([0, 1, 2], -0.65, '#a855f7');
        this.vfx.markMonolithSliced([0], 0.0, '#ffffff');
        this.vfx.spawnSparks(targetCenter, 140, '#10ff96', '#c084fc', 26);
      });
    } else {
      // PHASE 3: DELAYED PURGATORY SHOCKWAVE ERUPTION & RETURN!
      this.currentPhaseLabel = spec.phases.finishLabel;
      this.speedLinesTarget = 0;
      this.camTargetFov = THREE.MathUtils.lerp(72, 65, (t - 1.78) / 1.37);
      this.camScriptRoll = 0;

      this.once('p3_detonate', () => {
        sakugaAudio.playImpactExplosion(1.3);
        const count = this.vfx.detonateSlicedMonoliths(1.35);
        this.registerHits(3, count);
        this.vfx.spawnSkyPillar(new THREE.Vector3(0, 0, -14.5), '#10ff96', '#e9d5ff', 3.4, 0.95);
        for (let i = 0; i < 6; i++) {
          const base = new THREE.Vector3((i - 2.5) * 4.2, 0.2, -14.5 + (Math.random() - 0.5) * 4);
          this.vfx.spawnHakiLightning(
            base,
            base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 12, (Math.random() - 0.5) * 4)),
            i % 2 === 0 ? '#ff1744' : '#a855f7',
            0.42,
            1.4
          );
        }
        this.shakeAmp = 0.36;
        this.triggerShockwave(0.05, '#a855f7');
      });

      if (t > 2.35) {
        this.camTargetPos.copy(HOME_POS);
        this.camPosLerp = 7;
        this.rig.setPose(IDLE_SANTORYU_POSE, 8);
      }
    }
  }

  /** [2] ITTORYU IAI: SHI SHISHI SONSON (Death Lion's Song — Breath of All Things + KACHIN!) */
  private stepShiShishiSonson(t: number, _dt: number, spec: TechniqueSpec): void {
    if (t < 1.32) {
      // PHASE 1: Hushed "Breath of All Things" Indigo Focus + Wado sheathed on left side of POV!
      this.once('iai_focus', () => {
        sakugaAudio.playHeartbeat();
        this.rig.setBladeHakiState(true, 0.55, {
          inner: '#e0f2fe',
          mid: '#38bdf8',
          tip: '#818cf8',
          trail: '#38bdf8',
        });
        this.rig.setTrailIntensity(0.05);
      });

      this.focusDesatTarget = 0.92;
      this.freezeWorldPetals = true;
      this.camTargetPos.set(0, 1.42, 2.2);
      this.camTargetFov = 48; // Razor tunnel focus!
      this.camScriptPitch = -0.01;
      this.bloomPass.strength = 1.05;

      // Thumb pops tsuba slightly at t = 0.92s (*CHINK!* + gleaming 4-point star glint!)
      const popped = t >= 0.92;
      if (popped) {
        this.once('iai_clink', () => {
          sakugaAudio.playTsubaClink();
          this.callbacks.onTriggerCalligraphy(spec);
        });
      }

      const sayaRz = -0.32;
      const drawGap = popped ? 0.082 : 0.0;
      const axisX = -Math.sin(sayaRz);
      const axisY = Math.cos(sayaRz);
      // Co-axial millimeter-exact Iai stance: Wado blade seated inside white lacquer saya, thumb pops golden tsuba!
      this.rig.setPose(
        {
          left: { pos: [-0.8, -1.2, -0.5], rot: [0, 0, 0], visible: false },
          right: { pos: [0.8, -1.2, -0.5], rot: [0, 0, 0], visible: false },
          saya: {
            pos: [-0.3, -0.1, -0.6],
            rot: [0.12, 0.22, sayaRz],
            visible: true,
          },
          mouth: {
            pos: [-0.3 + axisX * drawGap, -0.095 + axisY * drawGap, -0.6],
            rot: [0.12, 0.22, sayaRz + Math.PI],
            visible: true,
          },
          tsubaGlint: popped ? 1.0 : 0,
        },
        16
      );
    } else if (t < 1.78) {
      // PHASE 2: 1-FRAME GODSPEED TELEPORT UNSHEATH BLITZ!
      this.currentPhaseLabel = spec.phases.releaseLabel;
      this.camTargetPos.set(0, 1.5, -7.8);
      this.camPosLerp = 38; // Instantaneous teleport flash-step!
      this.camTargetFov = 98;
      this.camScriptRoll = 0.09;
      this.speedLinesTarget = 1.0;
      this.rig.setTrailIntensity(0.95);
      (this.sakugaPass.uniforms.uSpeedColor.value as THREE.Color).set('#e0f2fe');

      // Wado whipped lightning-fast completely across viewport to far right!
      this.rig.setPose(
        {
          left: { pos: [-0.8, -1.2, -0.5], rot: [0, 0, 0], visible: false },
          right: { pos: [0.8, -1.2, -0.5], rot: [0, 0, 0], visible: false },
          saya: {
            pos: [-0.46, -0.26, -0.62],
            rot: [0.25, 0.4, -0.52],
            visible: true,
          },
          mouth: {
            pos: [0.62, -0.06, -0.54],
            rot: [-0.32, 0.45, -1.48],
            visible: true,
          },
          tsubaGlint: 0,
        },
        36
      );

      this.once('iai_flash', () => {
        sakugaAudio.playSheathDraw(1.42);
        sakugaAudio.playSwordSlash(1.38, true);

        // Pure Kurosawa/Wano stark Black & White impact frames!
        this.queueImpactFrames(
          [
            { mode: 1, duration: 0.045, tint: '#38bdf8' },
            { mode: 2, duration: 0.04, tint: '#ffffff' },
          ],
          0.075
        );
        this.triggerFlash(0.65, '#e0f2fe');
        this.shakeAmp = 0.25;

        // Single ultra-wide razor horizontal Lion's Song plasma crescent spanning entire arena!
        const cutPos = new THREE.Vector3(0, 2.95, -14.2);
        this.vfx.spawnSlashArc({
          position: cutPos,
          rotation: [Math.PI * 0.48, 0, 0.04],
          radius: 14.5,
          thickness: 2.6,
          arcAngle: Math.PI * 1.65,
          primaryHex: '#38bdf8',
          secondaryHex: '#818cf8',
          coreHex: '#ffffff',
          duration: 1.05,
          growRate: 0.45,
          intensity: 4.0,
        });

        // Mark all 3 monoliths with a single surgical horizontal razor seam — FROZEN UNTIL KACHIN!
        this.vfx.markMonolithSliced([0, 1, 2], 0.03, '#38bdf8');
      });
    } else {
      // PHASE 3: ICONIC FIRST-PERSON RESHEATH -> *KA-CHIN!!* -> DELAYED GLASS-SHATTER DETONATION!
      this.currentPhaseLabel = spec.phases.finishLabel;
      this.speedLinesTarget = 0;
      this.camScriptRoll = 0;
      this.camTargetFov = 62;

      const sayaRz = -0.28;
      const axisX = -Math.sin(sayaRz);
      const axisY = Math.cos(sayaRz);
      const slideProgress = THREE.MathUtils.clamp((t - 1.78) / 0.52, 0, 1);
      const locked = t >= 2.32;
      const gap = locked ? 0 : (1 - slideProgress) * 0.34;

      this.rig.setPose(
        {
          left: { pos: [-0.8, -1.2, -0.5], rot: [0, 0, 0], visible: false },
          right: { pos: [0.8, -1.2, -0.5], rot: [0, 0, 0], visible: false },
          saya: {
            pos: [-0.25, -0.09, -0.56],
            rot: [0.1, 0.2, sayaRz],
            visible: true,
          },
          mouth: {
            pos: [-0.25 + axisX * gap, -0.085 + axisY * gap, -0.56],
            rot: [0.1, 0.2, sayaRz + Math.PI],
            visible: true,
          },
          tsubaGlint: locked && t < 2.8 ? 1.0 - (t - 2.32) / 0.48 : 0,
        },
        18
      );

      if (locked) {
        this.once('iai_kachin', () => {
          sakugaAudio.playKachinResheath();
          this.callbacks.onTriggerKachin();
        });
      }

      if (t >= 2.42) {
        this.once('iai_shatter', () => {
          // World snaps back to full vivid color as all 3 monoliths SLIDE APART & DETONATE!
          this.focusDesatTarget = 0;
          this.freezeWorldPetals = false;
          this.bloomPass.strength = 1.5;
          sakugaAudio.playImpactExplosion(1.35);
          sakugaAudio.playLightningSnap(undefined, 1.0);

          const count = this.vfx.detonateSlicedMonoliths(1.45);
          this.registerHits(1, count);
          this.triggerShockwave(0.075, '#38bdf8');
          this.triggerArenaLight('#38bdf8', 32, new THREE.Vector3(0, 4, -14.5));
          this.vfx.spawnGroundScar(new THREE.Vector3(0, 0, -14.5), Math.PI * 0.5, 36, 2.2, '#38bdf8', '#818cf8', 5);
          this.vfx.spawnSparks(new THREE.Vector3(0, 3.2, -14.5), 160, '#38bdf8', '#ffffff', 28);
          this.shakeAmp = 0.4;
        });
      }

      if (t > 3.0) {
        this.camTargetPos.copy(HOME_POS);
        this.camPosLerp = 8;
        this.rig.setPose(IDLE_SANTORYU_POSE, 10);
      }
    }
  }

  /** [3] SANTORYU OGI: ICHIDAI SANZEN DAISEN SEKAI (Great Three Thousand Great Thousand Worlds) */
  private stepSanzenSekai(t: number, dt: number, spec: TechniqueSpec): void {
    if (t < 1.48) {
      // PHASE 1: Enma & Sandai spinning like twin black-Haki hurricane turbines right in front of your face!!
      this.once('sz_start', () => {
        sakugaAudio.playHakiBurst(1.1);
        this.rig.setBladeHakiState(true, 1.35, {
          inner: '#22ffb2',
          mid: '#facc15',
          tip: '#a855f7',
          trail: '#facc15',
        });
        this.rig.setTrailIntensity(0.92);
      });

      const accel = THREE.MathUtils.clamp(t / 1.48, 0, 1);
      const spinSpeed = 10 + accel * 34;
      this.spinAccumulator += spinSpeed * dt;
      this.hakiChargeLevel = accel;
      this.camTargetFov = THREE.MathUtils.lerp(64, 54, accel);
      this.camTargetPos.set(0, 1.65, 2.5);
      this.bloomPass.strength = 1.25;

      // Periodic turbine blade whoosh & golden-emerald vortex rings in front of POV!
      const beat = Math.floor(t * (4 + accel * 5));
      this.once(`sz_whoosh_${beat}`, () => {
        sakugaAudio.playSpinWhoosh(0.85 + accel * 0.7);
        const front = this.camBasePos.clone().add(new THREE.Vector3(0, -0.05, -1.6));
        this.vfx.spawnShockwave(front, beat % 2 === 0 ? '#22ffb2' : '#facc15', 0.35, 2.8, 0.28, [0, 0, this.spinAccumulator]);
        this.vfx.spawnSparks(front, 16, '#22ffb2', '#facc15', 11);
      });

      if (t >= 1.02) {
        this.once('sz_cutin', () => {
          if (this.cutInEnabled) this.callbacks.onTriggerCutIn('#facc15');
          this.callbacks.onTriggerCalligraphy(spec);
        });
      }

      // Enma & Sandai spin at 38 rad/s in a blazing vertical twin-windmill directly in front of your eyes!
      this.rig.setPose(
        {
          left: {
            pos: [-0.24, -0.02, -0.82],
            rot: [0, 0, 0],
            visible: true,
          },
          right: {
            pos: [0.24, -0.02, -0.82],
            rot: [0, 0, 0],
            visible: true,
          },
          mouth: {
            pos: [0.32, -0.21, -0.5],
            rot: [-0.08, Math.PI, -Math.PI * 0.5 + 0.02],
            visible: true,
          },
          spinAngle: this.spinAccumulator,
        },
        16
      );
    } else if (t < 2.38) {
      // PHASE 2: AIRBORNE COMET LEAP & COLOSSAL WORLD-CLEAVING TRIPLE ARCS!
      this.currentPhaseLabel = spec.phases.releaseLabel;
      this.camTargetPos.set(0, 4.8, -7.6);
      this.camPosLerp = 18;
      this.camScriptPitch = -0.18;
      this.camScriptRoll = -0.16;
      this.camTargetFov = 104;
      this.speedLinesTarget = 1.0;
      this.chromaticTarget = 0.026;
      this.bloomPass.strength = 1.55;

      // Iconic Sanzen Sekai finisher pose: one blade swept high-right, one swept low-left!
      this.rig.setPose(
        {
          left: {
            pos: [-0.78, -0.36, -0.54],
            rot: [-0.35, -0.5, -1.65],
            visible: true,
          },
          right: {
            pos: [0.72, 0.28, -0.54],
            rot: [-0.25, 0.45, 0.95],
            visible: true,
          },
          mouth: {
            pos: [0.28, -0.21, -0.5],
            rot: [-0.08, Math.PI + 0.16, -Math.PI * 0.5],
            visible: true,
          },
          spinAngle: 0,
        },
        24
      );

      this.once('sz_cleave', () => {
        sakugaAudio.playSwordSlash(0.75, true);
        sakugaAudio.playSwordSlash(1.1, true);
        sakugaAudio.playHakiBurst(1.4);
        sakugaAudio.playImpactExplosion(1.45);

        this.queueImpactFrames(
          [
            { mode: 1, duration: 0.044, tint: '#facc15' },
            { mode: 3, duration: 0.048, tint: '#22ffb2' },
            { mode: 2, duration: 0.038, tint: '#ffffff' },
          ],
          0.095
        );
        this.shakeAmp = 0.5;
        this.triggerShockwave(0.08, '#facc15');
        this.triggerArenaLight('#22ffb2', 36, new THREE.Vector3(0, 6, -15));

        const bossPos = new THREE.Vector3(0, 3.8, -14.5);
        // Three gargantuan 16-meter world-splitting Trichiliocosm arcs!
        [
          { rot: [0.08, 0, 0.52] as [number, number, number], c1: '#22ffb2', c2: '#facc15', r: 15.5 },
          { rot: [-0.1, 0, -0.82] as [number, number, number], c1: '#facc15', c2: '#a855f7', r: 14.8 },
          { rot: [Math.PI * 0.38, 0.2, 0.15] as [number, number, number], c1: '#ffffff', c2: '#22ffb2', r: 16.5 },
        ].forEach((arc) => {
          this.vfx.spawnSlashArc({
            position: bossPos,
            rotation: arc.rot,
            radius: arc.r,
            thickness: 5.2,
            arcAngle: Math.PI * 1.55,
            primaryHex: arc.c1,
            secondaryHex: arc.c2,
            duration: 1.15,
            growRate: 0.65,
            intensity: 3.8,
          });
        });

        // Colossal 48m chasm across Onigashima!
        this.vfx.spawnGroundScar(new THREE.Vector3(0, 0, -16), 0.18, 48, 3.8, '#22ffb2', '#facc15', 6.5);
        this.vfx.spawnGroundScar(new THREE.Vector3(0, 0, -15), -0.75, 38, 2.8, '#facc15', '#a855f7', 6.0);

        this.vfx.markMonolithSliced([0, 1, 2], 0.52, '#22ffb2');
        this.vfx.markMonolithSliced([0, 1, 2], -0.82, '#facc15');
        this.vfx.spawnSparks(bossPos, 200, '#facc15', '#22ffb2', 32);

        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          this.vfx.spawnHakiLightning(
            bossPos,
            bossPos.clone().add(new THREE.Vector3(Math.cos(a) * 14, Math.abs(Math.sin(a)) * 12, (Math.random() - 0.5) * 8)),
            i % 2 === 0 ? '#facc15' : '#a855f7',
            0.45,
            1.45
          );
        }
      });
    } else {
      // PHASE 3: HEROIC LANDING & MASSIVE MONOLITH SHATTER
      this.currentPhaseLabel = spec.phases.finishLabel;
      this.speedLinesTarget = 0;
      this.camScriptPitch = -0.02;
      this.camScriptRoll = 0;
      this.camTargetPos.set(0, 1.25, -4.5);
      this.camPosLerp = 9;
      this.camTargetFov = 66;

      this.once('sz_detonate', () => {
        sakugaAudio.playImpactExplosion(1.35);
        const count = this.vfx.detonateSlicedMonoliths(1.55);
        this.registerHits(6, count);
        this.shakeAmp = 0.38;
      });

      if (t > 3.15) {
        this.camTargetPos.copy(HOME_POS);
        this.rig.setPose(IDLE_SANTORYU_POSE, 9);
      }
    }
  }

  /** [4] SANTORYU: KOKUJO O TATSU MAKI (Black Rope Dragon Twister — Full 720° POV Spin + 36m Tornado!) */
  private stepKokujoTatsumaki(t: number, dt: number, spec: TechniqueSpec): void {
    if (t < 0.92) {
      // PHASE 1: Deep coiled torso twist left, gathering howling emerald-crimson dragon winds!
      this.once('tm_coil', () => {
        sakugaAudio.playHakiBurst(0.95);
        this.callbacks.onTriggerCalligraphy(spec);
        this.rig.setBladeHakiState(true, 1.3, {
          inner: '#00f5a0',
          mid: '#f43f5e',
          tip: '#fde047',
          trail: '#00f5a0',
        });
        this.rig.setTrailIntensity(0.95);
      });

      this.camTargetPos.set(0, 1.22, 1.6);
      this.camScriptYaw = 0.48; // Coiled torso twist!
      this.camScriptRoll = 0.14;
      this.camTargetFov = 58;
      this.hakiChargeLevel = 0.85;

      // Sweep both arms coiled far left ready to unleash 720° cyclone spin!
      this.rig.setPose(
        {
          left: { pos: [-0.64, -0.14, -0.54], rot: [-0.18, 0.28, 1.18], visible: true },
          right: { pos: [-0.14, -0.2, -0.58], rot: [-0.22, 0.36, 1.05], visible: true },
          mouth: { pos: [0.32, -0.21, -0.5], rot: [-0.08, Math.PI - 0.2, -Math.PI * 0.5], visible: true },
        },
        14
      );
    } else if (t < 1.62) {
      // PHASE 2: EXHILARATING 720° FIRST-PERSON CYCLONE WHIRL SLASH!
      this.currentPhaseLabel = spec.phases.releaseLabel;
      const p = (t - 0.92) / 0.7;
      const ease = 1 - Math.pow(1 - p, 2.4);
      this.spinExtraYaw = -ease * Math.PI * 4; // Full 720° razor spin!
      this.camScriptYaw = (1 - ease) * 0.48;
      this.camScriptRoll = -0.12 * Math.sin(p * Math.PI);
      this.camTargetFov = 96;
      this.camTargetPos.set(0, 1.55, -1.8);
      this.speedLinesTarget = 0.9;
      (this.sakugaPass.uniforms.uSpeedColor.value as THREE.Color).set('#00f5a0');

      // Outstretched whirling horizontal blades tearing a 360° wind cyclone!
      this.rig.setPose(
        {
          left: { pos: [-0.72, -0.08, -0.56], rot: [-0.2, 0, Math.PI * 0.46], visible: true },
          right: { pos: [0.72, -0.08, -0.56], rot: [-0.2, 0, -Math.PI * 0.46], visible: true },
          mouth: { pos: [0.32, -0.21, -0.5], rot: [-0.08, Math.PI, -Math.PI * 0.5], visible: true },
        },
        24
      );

      this.once('tm_unleash', () => {
        sakugaAudio.playSwordSlash(0.82, true);
        sakugaAudio.playSwordSlash(1.22, true);
        sakugaAudio.playTornadoVortex(2.75);
        this.queueImpactFrames(
          [
            { mode: 1, duration: 0.038, tint: '#00f5a0' },
            { mode: 3, duration: 0.042, tint: '#f43f5e' },
          ],
          0.065
        );
        this.triggerShockwave(0.065, '#00f5a0');
        this.shakeAmp = 0.35;

        // Summon the towering 36-meter Kokujo O Tatsu Maki Cyclone directly over the arena!
        this.vfx.spawnTatsumaki(new THREE.Vector3(0, 0, -14.5), 2.75);
        this.triggerArenaLight('#00f5a0', 30, new THREE.Vector3(0, 8, -14.5));

        // Concentric giant horizontal wind-blade rings wrapping the tornado!
        for (let h = 0; h < 5; h++) {
          this.vfx.spawnSlashArc({
            position: new THREE.Vector3(0, 1.5 + h * 3.8, -14.5),
            rotation: [Math.PI * 0.5, 0, h * 1.1],
            radius: 6.5 + h * 1.6,
            thickness: 2.8,
            arcAngle: Math.PI * 1.85,
            primaryHex: h % 2 === 0 ? '#00f5a0' : '#f43f5e',
            secondaryHex: '#e0f2fe',
            duration: 1.5,
            growRate: 0.5,
            intensity: 3.2,
          });
        }
      });
    } else {
      // PHASE 3: NEVER-ENDING DRAGON TWISTER SHREDDING ALL MONOLITHS IN MULTI-HIT FURY!
      this.currentPhaseLabel = spec.phases.finishLabel;
      this.spinExtraYaw = 0;
      this.camScriptYaw = 0;
      this.camScriptRoll = 0;
      this.camTargetFov = 74;
      this.camScriptPitch = 0.14; // Tilt slightly upward to admire the towering 36m cyclone!
      this.speedLinesTarget = 0.35;
      this.shakeAmp = Math.max(this.shakeAmp, 0.12);
      this.bloomPass.strength = 1.35;

      // Rapid never-ending wind cuts carving through all 3 monoliths!
      const cutTick = Math.floor((t - 1.62) * 5.5);
      if (t < 3.2) {
        this.once(`tm_slice_${cutTick}`, () => {
          const ang = (Math.random() - 0.5) * 1.8;
          const col = cutTick % 2 === 0 ? '#00f5a0' : '#f43f5e';
          sakugaAudio.playSwordSlash(1.1 + (cutTick % 4) * 0.15, false);
          this.vfx.markMonolithSliced([0, 1, 2], ang, col);
          this.registerHits(1, 0);
          this.vfx.spawnSlashArc({
            position: new THREE.Vector3((Math.random() - 0.5) * 6, 2 + Math.random() * 8, -14.5),
            rotation: [Math.PI * 0.42, 0, ang],
            radius: 9.2,
            thickness: 2.4,
            arcAngle: Math.PI * 1.6,
            primaryHex: col,
            secondaryHex: '#ffffff',
            duration: 0.55,
            growRate: 0.7,
            intensity: 3.1,
          });
        });
      }

      if (Math.random() < dt * 25) {
        this.vfx.spawnSparks(new THREE.Vector3(0, 3, -14.5), 8, '#00f5a0', '#f43f5e', 24);
      }

      if (t >= 3.22) {
        this.once('tm_finale', () => {
          sakugaAudio.playImpactExplosion(1.3);
          const count = this.vfx.detonateSlicedMonoliths(1.5);
          this.registerHits(3, count);
          this.shakeAmp = 0.38;
          this.triggerShockwave(0.06, '#f43f5e');
        });
        this.camScriptPitch = -0.02;
        this.camTargetPos.copy(HOME_POS);
        this.speedLinesTarget = 0;
        this.rig.setPose(IDLE_SANTORYU_POSE, 9);
      }
    }
  }

  /** [5] KIKI KYUTORYU: ASHURA BAKKEI — MOJA NO TAWAMURE (Nine-Sword Style: Dead Man's Game!) */
  private stepAshuraBakkei(t: number, dt: number, spec: TechniqueSpec): void {
    if (t < 1.65) {
      // PHASE 1: Blood Eclipse + Buddhist Bell + ALL 9 BLADES FAN OUT IN FIRST-PERSON + 29m ASHURA DEITY!
      this.once('ash_awaken', () => {
        sakugaAudio.playAshuraBell();
        sakugaAudio.playHakiBurst(1.45);
        this.rig.setBladeHakiState(true, 1.5, {
          inner: '#fff7ed',
          mid: '#ff2a55',
          tip: '#ffb703',
          trail: '#ff2a55',
        });
        this.rig.setTrailIntensity(0.95);
        this.vfx.setAshuraManifestation(0.96);
        this.triggerArenaLight('#ff2a55', 34, new THREE.Vector3(0, 8, -14));
      });

      const fan = THREE.MathUtils.smoothstep(t, 0.05, 0.95);
      this.ashuraEclipseLevel = fan;
      this.hakiChargeLevel = 1.0;
      this.camTargetPos.set(0, 1.52, 2.8);
      this.camTargetFov = THREE.MathUtils.lerp(65, 76, fan); // Widen FOV to showcase all 9 swords + Ashura god!
      this.camScriptPitch = 0.08 * fan;
      this.bloomPass.strength = 1.42;

      // 3 real blades + 6 spectral Asura blades = 9 SWORDS IN FIRST-PERSON MANDALA!
      this.rig.setPose(
        {
          left: { pos: [-0.44, -0.18, -0.66], rot: [-0.62, -0.2, -0.26], visible: true },
          right: { pos: [0.44, -0.18, -0.66], rot: [-0.62, 0.2, 0.26], visible: true },
          mouth: { pos: [0.32, -0.205, -0.5], rot: [-0.08, Math.PI, -Math.PI * 0.5 + 0.02], visible: true },
          ashuraFan: fan,
        },
        12
      );

      // Conqueror's Haki crimson-black lightning storm fracturing the rooftop!
      if (Math.random() < dt * 18) {
        const start = new THREE.Vector3((Math.random() - 0.5) * 18, 0.2, -4 - Math.random() * 16);
        const end = start.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 9 + Math.random() * 8, (Math.random() - 0.5) * 4));
        this.vfx.spawnHakiLightning(start, end, Math.random() > 0.35 ? '#ff0a3c' : '#ffb703', 0.25, 1.25);
      }

      if (t >= 1.12) {
        this.once('ash_cutin', () => {
          if (this.cutInEnabled) this.callbacks.onTriggerCutIn('#ff2a55');
          this.callbacks.onTriggerCalligraphy(spec);
          sakugaAudio.playHakiBurst(1.2);
        });
      }
    } else if (t < 3.05) {
      // PHASE 2: BLISTERING 9-SWORD CONQUEROR'S HAKI BLITZ (SCARRING KAIDO SEQUENCE!)
      this.currentPhaseLabel = spec.phases.releaseLabel;
      this.ashuraEclipseLevel = 1.0;
      this.camTargetPos.set(0, 1.75, -8.2);
      this.camPosLerp = 22;
      this.camTargetFov = 100;
      this.camScriptPitch = 0.02;
      this.speedLinesTarget = 1.0;
      this.chromaticTarget = 0.028;
      this.bloomPass.strength = 1.6;
      (this.sakugaPass.uniforms.uSpeedColor.value as THREE.Color).set('#ff2a55');

      // Fire 9 distinct ultra-fast directional slashes across 1.15s!
      const slashIdx = Math.min(8, Math.floor(((t - 1.65) / 1.15) * 9));
      const slashAngles = [0.62, -0.62, 0.05, 1.18, -1.18, 0.35, -0.35, 1.52, -0.78];
      const ang = slashAngles[slashIdx];
      const alternate = slashIdx % 2 === 0 ? 1 : -1;

      this.camScriptRoll = alternate * 0.13;
      this.rig.setPose(
        {
          left: {
            pos: [-0.45 * alternate, -0.05 + alternate * 0.14, -0.52],
            rot: [-0.4, -0.3 * alternate, -0.95 * alternate],
            visible: true,
          },
          right: {
            pos: [0.45 * alternate, -0.05 - alternate * 0.14, -0.52],
            rot: [-0.4, 0.3 * alternate, 0.95 * alternate],
            visible: true,
          },
          mouth: {
            pos: [0.28, -0.205, -0.5],
            rot: [-0.08, Math.PI + alternate * 0.2, -Math.PI * 0.5],
            visible: true,
          },
          ashuraFan: 1.0,
        },
        32
      );

      this.once(`ash_hit_${slashIdx}`, () => {
        const isFinal9th = slashIdx === 8;
        sakugaAudio.playSwordSlash(0.88 + slashIdx * 0.08, isFinal9th);
        sakugaAudio.playLightningSnap(undefined, isFinal9th ? 1.2 : 0.7);

        const targetPos = new THREE.Vector3(
          (Math.random() - 0.5) * 2.2,
          3.2 + (Math.random() - 0.5) * 1.6,
          -14.2
        );
        this.vfx.spawnSlashArc({
          position: targetPos,
          rotation: [(Math.random() - 0.5) * 0.3, 0, ang],
          radius: isFinal9th ? 16.5 : 9.8,
          thickness: isFinal9th ? 5.5 : 3.1,
          arcAngle: Math.PI * 1.48,
          primaryHex: slashIdx % 2 === 0 ? '#ff2a55' : '#ffb703',
          secondaryHex: '#ff0a3c',
          coreHex: '#fff7ed',
          duration: isFinal9th ? 1.2 : 0.65,
          growRate: 0.6,
          intensity: isFinal9th ? 4.2 : 3.3,
        });

        this.vfx.markMonolithSliced([0, 1, 2], ang, slashIdx % 2 === 0 ? '#ff2a55' : '#ffb703');
        this.vfx.spawnSparks(targetPos, isFinal9th ? 220 : 45, '#ff2a55', '#ffb703', 28);
        this.registerHits(1, 0);
        this.shakeAmp = isFinal9th ? 0.58 : 0.24;

        if (isFinal9th) {
          // 9TH FINAL CONQUEROR'S HAKI SCAR SLASH!
          sakugaAudio.playHakiBurst(1.6);
          sakugaAudio.playImpactExplosion(1.55);
          this.queueImpactFrames(
            [
              { mode: 1, duration: 0.045, tint: '#ff2a55' },
              { mode: 3, duration: 0.055, tint: '#ff0a3c' },
              { mode: 2, duration: 0.04, tint: '#ffb703' },
            ],
            0.105
          );
          this.triggerShockwave(0.09, '#ff2a55');
          this.vfx.spawnGroundScar(new THREE.Vector3(0, 0, -14.5), 0.72, 46, 3.6, '#ff2a55', '#ffb703', 6.5);
          this.vfx.spawnGroundScar(new THREE.Vector3(0, 0, -14.5), -0.72, 46, 3.6, '#ffb703', '#ff0a3c', 6.5);
        }
      });
    } else {
      // PHASE 3: DEAD MAN'S GAME CRIMSON-GOLD SKY PILLAR DETONATION!
      this.currentPhaseLabel = spec.phases.finishLabel;
      this.speedLinesTarget = 0;
      this.camScriptRoll = 0;
      this.camTargetFov = 68;

      this.once('ash_boom', () => {
        sakugaAudio.playKachinResheath();
        sakugaAudio.playImpactExplosion(1.65);
        const count = this.vfx.detonateSlicedMonoliths(1.75);
        this.registerHits(0, count);
        this.vfx.spawnSkyPillar(new THREE.Vector3(0, 0, -14.5), '#ff2a55', '#fde047', 5.2, 1.35);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const p = new THREE.Vector3(0, 2, -14.5);
          this.vfx.spawnHakiLightning(
            p,
            p.clone().add(new THREE.Vector3(Math.cos(a) * 18, 8 + Math.random() * 14, Math.sin(a) * 14)),
            i % 3 === 0 ? '#ffb703' : '#ff0a3c',
            0.52,
            1.65
          );
        }
        this.shakeAmp = 0.5;
        this.triggerShockwave(0.08, '#ffb703');
      });

      const fadeOut = THREE.MathUtils.clamp((t - 3.65) / 1.0, 0, 1);
      this.ashuraEclipseLevel = 1 - fadeOut;
      if (t > 3.65) {
        this.vfx.setAshuraManifestation(0);
        this.camTargetPos.copy(HOME_POS);
        this.camPosLerp = 7;
        this.rig.setPose({ ...IDLE_SANTORYU_POSE, ashuraFan: 0 }, 9);
      }
    }
  }

  /** [6] EN-O SANTORYU: IPPYAKUSANJO HIRYU JIGOKU (King of Hell Ultimate — Episode 1062 Masterpiece!) */
  private stepHiryuJigoku(t: number, dt: number, spec: TechniqueSpec): void {
    if (t < 1.85) {
      // PHASE 1: KING OF HELL OVERDRIVE + SKYWARD MOON LEAP 16.5m ABOVE ONIGASHIMA!!
      this.once('koh_ignite', () => {
        sakugaAudio.playHakiBurst(1.6);
        this.rig.setBladeHakiState(true, 1.65, {
          inner: '#22d3ee',
          mid: '#00ff88',
          tip: '#fde047',
          trail: '#00ff88',
        });
        this.rig.setTrailIntensity(1.0);
        this.triggerArenaLight('#00ff88', 36, new THREE.Vector3(0, 5, -6));

        // Emerald + Black-Red Haki shockwave beneath Zoro's feet as he launches skyward!
        this.vfx.spawnShockwave(new THREE.Vector3(0, 0.2, 2.0), '#00ff88', 0.8, 16, 0.55);
        this.vfx.spawnShockwave(new THREE.Vector3(0, 0.3, 2.0), '#ff1744', 0.5, 13, 0.45);
      });

      this.hakiChargeLevel = 1.35;
      this.bloomPass.strength = 1.48;

      if (t < 0.52) {
        // Low crouch gathering overwhelming King of Hell Haki
        this.camTargetPos.set(0, 1.08, 2.4);
        this.camTargetFov = 56;
        this.rig.setPose(IDLE_SANTORYU_POSE, 14);
      } else {
        // SKYWARD MOON LEAP! Soar 16.5m into the night sky looking down at Onigashima rooftop!
        this.once('koh_leap', () => {
          sakugaAudio.playSwordSlash(0.7, true);
          this.vfx.spawnSparks(new THREE.Vector3(0, 0.5, 2.0), 90, '#00ff88', '#fde047', 22);
        });

        this.camTargetPos.set(0, 15.8, 1.2);
        this.camPosLerp = 6.5;
        this.camScriptPitch = -0.56; // Breathtaking aerial POV looking down at the entire arena!
        this.camTargetFov = 78;

        // Iconic Hiryu Jigoku overhead Tora-Gari aerial stance: Enma & Sandai raised blazing overhead crossing over Wado!
        const tremor = Math.sin(t * 60) * 0.009;
        this.rig.setPose(
          {
            left: {
              pos: [-0.38 + tremor, 0.16, -0.62],
              rot: [-0.25, -0.2, -0.58],
              visible: true,
            },
            right: {
              pos: [0.38 - tremor, 0.16, -0.62],
              rot: [-0.25, 0.2, 0.58],
              visible: true,
            },
            mouth: {
              pos: [0.32, -0.2, -0.5],
              rot: [-0.08, Math.PI, -Math.PI * 0.5 + 0.02],
              visible: true,
            },
          },
          10
        );
      }

      // Massive black-red Conqueror's Haki lightning cracking off Zoro's raised blades in the sky!
      if (Math.random() < dt * 20) {
        const s1 = this.rig.getSwordTipWorld(Math.random() > 0.5 ? 'enma' : 'sandai');
        const e1 = s1.clone().add(
          new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.3) * 8, -3 - Math.random() * 8)
        );
        this.vfx.spawnHakiLightning(s1, e1, Math.random() > 0.3 ? '#ff1744' : '#00ff88', 0.24, 1.2);
      }

      if (t >= 1.28) {
        this.once('koh_cutin', () => {
          if (this.cutInEnabled) this.callbacks.onTriggerCutIn('#00ff88');
          this.callbacks.onTriggerCalligraphy(spec);
          sakugaAudio.playHakiBurst(1.4);
        });
      }
    } else if (t < 2.85) {
      // PHASE 2: TITANIC OVERHEAD DESCENDING SLASH -> UNLEASH FLYING EMERALD HAKI DRAGON!
      this.currentPhaseLabel = spec.phases.releaseLabel;
      this.camTargetPos.set(0, 9.2, -3.2);
      this.camPosLerp = 8;
      this.camScriptPitch = -0.44;
      this.camTargetFov = 96;
      this.speedLinesTarget = 0.95;
      this.chromaticTarget = 0.025;
      (this.sakugaPass.uniforms.uSpeedColor.value as THREE.Color).set('#00ff88');

      // Ferocious overhead downward dragon-cleave follow-through!
      this.rig.setPose(
        {
          left: { pos: [-0.62, -0.34, -0.56], rot: [-1.38, -0.32, -0.58], visible: true },
          right: { pos: [0.62, -0.34, -0.56], rot: [-1.38, 0.32, 0.58], visible: true },
          mouth: { pos: [0.3, -0.23, -0.5], rot: [-0.18, Math.PI, -Math.PI * 0.5], visible: true },
        },
        26
      );

      this.once('koh_dragon_launch', () => {
        sakugaAudio.playSwordSlash(0.68, true);
        sakugaAudio.playSwordSlash(1.05, true);
        sakugaAudio.playDragonRoar();

        this.queueImpactFrames(
          [
            { mode: 1, duration: 0.042, tint: '#00ff88' },
            { mode: 3, duration: 0.045, tint: '#ff1744' },
          ],
          0.075
        );
        this.shakeAmp = 0.45;

        const launchPos = this.camBasePos.clone().add(new THREE.Vector3(0, -0.8, -3.5));
        const impactPos = new THREE.Vector3(0, 1.8, -14.8);
        const dir = impactPos.clone().sub(launchPos).normalize();

        // Twin colossal descending emerald-gold & crimson-black flying crescents accompanying the dragon!
        this.vfx.spawnSlashArc({
          position: launchPos,
          rotation: [-0.35, 0, Math.PI * 0.5],
          radius: 11.5,
          thickness: 4.5,
          arcAngle: Math.PI * 1.45,
          primaryHex: '#00ff88',
          secondaryHex: '#fde047',
          velocity: dir.clone().multiplyScalar(24),
          duration: 0.95,
          growRate: 0.9,
          intensity: 4.0,
        });
        this.vfx.spawnSlashArc({
          position: launchPos,
          rotation: [-0.35, 0, Math.PI * 0.5 + 0.25],
          radius: 10.2,
          thickness: 3.6,
          arcAngle: Math.PI * 1.4,
          primaryHex: '#ff1744',
          secondaryHex: '#00ff88',
          velocity: dir.clone().multiplyScalar(25),
          duration: 0.95,
          growRate: 0.85,
          intensity: 3.6,
        });

        // COLOSSAL EMERALD-GOLD & BLACK-LIGHTNING FLYING DRAGON PLUNGING INTO ONIGASHIMA!
        this.vfx.spawnHiryuDragon(launchPos, impactPos, 0.78, () => {
          // APOCALYPTIC EPISODE 1062 KING OF HELL NUCLEAR DETONATION!!
          sakugaAudio.playImpactExplosion(1.9);
          sakugaAudio.playHakiBurst(1.85);

          this.queueImpactFrames(
            [
              { mode: 1, duration: 0.048, tint: '#ffffff' },
              { mode: 2, duration: 0.044, tint: '#00ff88' },
              { mode: 3, duration: 0.052, tint: '#ff1744' },
              { mode: 3, duration: 0.052, tint: '#00ff88' },
            ],
            0.12
          );

          this.bloomPass.strength = 1.85;
          this.shakeAmp = 0.78;
          this.chromaticTarget = 0.038;
          this.triggerFlash(0.55, '#d1fae5');
          this.triggerShockwave(0.11, '#00ff88');
          this.triggerArenaLight('#00ff88', 58, new THREE.Vector3(0, 8, -14.8));

          // 70-Meter Sky-Splitting Emerald-Gold Pillar + Triple Shockwave Domes!
          const groundZero = new THREE.Vector3(0, 0.2, -14.8);
          this.vfx.spawnSkyPillar(groundZero, '#00ff88', '#fef08a', 7.2, 1.85);
          this.vfx.spawnShockwave(groundZero, '#00ff88', 1.2, 38, 0.95, [Math.PI * 0.5, 0, 0]);
          this.vfx.spawnShockwave(groundZero, '#fde047', 1.0, 30, 0.78, [Math.PI * 0.42, 0.2, 0]);
          this.vfx.spawnShockwave(groundZero, '#ff1744', 0.8, 34, 0.88, [Math.PI * 0.58, -0.2, 0]);

          // 58-Meter Molten King of Hell Chasm splitting the entire Onigashima Skull Dome!
          this.vfx.spawnGroundScar(groundZero, 0.0, 58, 5.2, '#00ff88', '#fde047', 8.5);
          this.vfx.spawnGroundScar(groundZero, 0.58, 42, 3.2, '#ff1744', '#00ff88', 7.0);
          this.vfx.spawnGroundScar(groundZero, -0.58, 42, 3.2, '#22d3ee', '#00ff88', 7.0);

          // 14 Giant Conqueror's Haki Black-Red & Emerald Lightning Bolts spanning sky & earth!
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2;
            const end = new THREE.Vector3(
              Math.cos(a) * (14 + Math.random() * 14),
              6 + Math.random() * 24,
              -14.8 + Math.sin(a) * (12 + Math.random() * 12)
            );
            this.vfx.spawnHakiLightning(
              groundZero.clone().add(new THREE.Vector3(0, 2, 0)),
              end,
              i % 3 === 0 ? '#00ff88' : i % 3 === 1 ? '#ff1744' : '#fde047',
              0.68,
              1.85
            );
          }

          // Obliterate all 3 Onigashima monoliths simultaneously + 300 glowing sparks!
          this.vfx.markMonolithSliced([0, 1, 2], Math.PI * 0.48, '#00ff88');
          this.vfx.markMonolithSliced([0, 1, 2], -0.45, '#fde047');
          const count = this.vfx.detonateSlicedMonoliths(2.0);
          this.registerHits(103, count);
          this.vfx.spawnSparks(groundZero.clone().add(new THREE.Vector3(0, 3, 0)), 280, '#00ff88', '#fde047', 38);
        });
      });
    } else {
      // PHASE 3: KING OF HELL HEROIC LANDING AMIDST EMERALD HELLFIRE & BLACK LIGHTNING!
      this.currentPhaseLabel = spec.phases.finishLabel;
      this.speedLinesTarget = 0;
      const landT = (t - 2.85) / 2.3;

      if (landT < 0.55) {
        // Drop smoothly from sky to badass low one-knee King of Hell landing!
        this.camTargetPos.set(0, 1.18, 1.4);
        this.camPosLerp = 7.5;
        this.camScriptPitch = 0.06; // Look forward-up at the towering 70m emerald pillar!
        this.camTargetFov = 72;
      } else {
        // Rise calmly as the King of Hell!
        this.camTargetPos.copy(HOME_POS);
        this.camPosLerp = 6;
        this.camScriptPitch = -0.02;
        this.camTargetFov = 65;
        this.bloomPass.strength = THREE.MathUtils.lerp(this.bloomPass.strength, 1.08, dt * 3);
        this.rig.setPose(IDLE_SANTORYU_POSE, 8);
      }

      // Residual Conqueror's Haki aftershock lightning around arena
      if (Math.random() < dt * 7) {
        const p = new THREE.Vector3((Math.random() - 0.5) * 22, 0.2, -14 + (Math.random() - 0.5) * 10);
        this.vfx.spawnHakiLightning(
          p,
          p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 10, (Math.random() - 0.5) * 5)),
          Math.random() > 0.5 ? '#ff1744' : '#00ff88',
          0.3,
          1.2
        );
      }
    }
  }

  /** First-Person Black Bandana Tie + King of Hell Awakening Animation (`[R]`) */
  private updateAwakeningAnimation(dt: number): void {
    if (this.awakeningTimer < 0) return;
    this.awakeningTimer += dt;
    const t = this.awakeningTimer;

    if (t < 0.36) {
      // Both hands reach up across forehead pulling the iconic Black Bandana tight!
      const sweep = THREE.MathUtils.clamp(t / 0.32, 0, 1);
      this.camTargetFov = 58;
      this.rig.setPose(
        {
          left: { pos: [-0.32, 0.22, -0.48], rot: [-0.25, 0.3, -0.95], visible: true },
          right: { pos: [0.32, 0.22, -0.48], rot: [-0.25, -0.3, 0.95], visible: true },
          mouth: IDLE_SANTORYU_POSE.mouth,
          bandanaSweep: sweep,
        },
        18
      );
    } else if (t < 0.95) {
      // KING OF HELL ERUPTION! Hands snap wide, all 3 blades ignite in cyan-emerald-gold hellfire + black lightning!
      this.once('awk_burst', () => {
        sakugaAudio.playHakiBurst(1.45);
        sakugaAudio.playSheathDraw(0.95);
        if (this.cutInEnabled) this.callbacks.onTriggerCutIn('#00ff88');
        this.queueImpactFrames(
          [
            { mode: 1, duration: 0.038, tint: '#00ff88' },
            { mode: 3, duration: 0.044, tint: '#ff1744' },
          ],
          0.065
        );
        this.applyIdleBladePalette();
        this.rig.setBladeHakiState(true, 1.35, {
          inner: '#22d3ee',
          mid: '#00ff88',
          tip: '#fde047',
          trail: '#ff1744',
        });
        this.triggerShockwave(0.065, '#00ff88');
        this.triggerArenaLight('#00ff88', 28, new THREE.Vector3(0, 3, 0));
        this.shakeAmp = 0.34;
        this.hakiChargeLevel = 0.9;

        const front = this.camBasePos.clone().add(new THREE.Vector3(0, -1.5, -1.5));
        this.vfx.spawnShockwave(front, '#00ff88', 0.5, 16, 0.55);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          this.vfx.spawnHakiLightning(
            this.rig.getTsubaWorld(i % 2 === 0 ? 'enma' : 'sandai'),
            this.camBasePos.clone().add(new THREE.Vector3(Math.cos(a) * 6, 1 + Math.random() * 4, -3 - Math.random() * 5)),
            i % 2 === 0 ? '#ff1744' : '#00ff88',
            0.35,
            1.15
          );
        }
      });

      this.camTargetFov = 74;
      this.rig.setPose(
        {
          left: { pos: [-0.64, -0.18, -0.62], rot: [-0.62, 0.28, 0.68], visible: true },
          right: { pos: [0.64, -0.18, -0.62], rot: [-0.62, -0.28, -0.68], visible: true },
          mouth: IDLE_SANTORYU_POSE.mouth,
          bandanaSweep: 0,
        },
        20
      );
    } else {
      this.awakeningTimer = -1;
      this.camTargetFov = 65;
      this.hakiChargeLevel = 0.38;
      this.rig.setPose(IDLE_SANTORYU_POSE, 12);
      this.applyIdleBladePalette();
    }
  }

  /** First-Person Free Directional Mouse-Swipe Slash Motion */
  private updateFreeSlash(dt: number): void {
    if (this.freeSlashTimer < 0) return;
    this.freeSlashTimer += dt;
    const t = this.freeSlashTimer;
    const ca = Math.cos(this.freeSlashAngle);
    const sa = Math.sin(this.freeSlashAngle);
    const step = (this.freeSlashComboStep - 1) % 3;

    if (t < 0.22) {
      this.camTargetFov = 71;
      this.camScriptRoll = -ca * 0.055;
      if (step === 0) {
        // Left Enma whip across screen
        this.rig.setPose(
          {
            ...IDLE_SANTORYU_POSE,
            left: {
              pos: [0.42 * ca, -0.18 + 0.35 * sa, -0.52],
              rot: [-0.45, 0.45, this.freeSlashAngle - 1.1],
              visible: true,
            },
          },
          30
        );
      } else if (step === 1) {
        // Right Sandai whip across screen
        this.rig.setPose(
          {
            ...IDLE_SANTORYU_POSE,
            right: {
              pos: [-0.42 * ca, -0.18 + 0.35 * sa, -0.52],
              rot: [-0.45, -0.45, this.freeSlashAngle + 1.1],
              visible: true,
            },
          },
          30
        );
      } else {
        // 3rd Hit / Charged 1080 Pound Phoenix: Simultaneous Triple-Blade Santoryu Snap!
        this.rig.setPose(
          {
            left: { pos: [-0.78, -0.02, -0.54], rot: [-0.4, 0.35, 1.15], visible: true },
            right: { pos: [0.78, -0.02, -0.54], rot: [-0.4, -0.35, -1.15], visible: true },
            mouth: { pos: [0.2, -0.21, -0.5], rot: [-0.08, Math.PI + 0.24, -Math.PI * 0.5], visible: true },
          },
          32
        );
      }
    } else if (t < 0.46) {
      this.camTargetFov = 65;
      this.camScriptRoll = 0;
      this.speedLinesTarget = 0;
      this.rig.setPose(IDLE_SANTORYU_POSE, 14);
    } else {
      this.freeSlashTimer = -1;
      this.speedLinesTarget = 0;
      this.applyIdleBladePalette();
    }
  }

  // ============================================================================
  // MASTER 60FPS SAKUGA RENDER LOOP
  // ============================================================================

  private loop = (now: number): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);

    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) * 0.001));
    this.lastTime = now;

    // 1. Update Toei Wano Impact Frame Queue (runs in real/slow-mo time even during Hit-Stop!)
    const uiDt = rawDt * (this.slowMo ? 0.32 : 1.0);
    if (this.impactQueue.length > 0) {
      const head = this.impactQueue[0];
      this.sakugaPass.uniforms.uImpactMode.value = head.mode;
      (this.sakugaPass.uniforms.uImpactTint.value as THREE.Color).set(head.tint);
      this.currentImpactTimer -= uiDt;
      if (this.currentImpactTimer <= 0) {
        this.impactQueue.shift();
        this.currentImpactTimer = this.impactQueue[0]?.duration ?? 0;
      }
    } else {
      this.sakugaPass.uniforms.uImpactMode.value = 0;
    }

    // 2. Hit-Stop frame freeze for devastating tactile anime impact!
    let simDt = rawDt * (this.slowMo ? 0.25 : 1.0);
    let hitStopTremor = 0;
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= uiDt;
      simDt *= 0.05; // Near-frozen world during hit-stop!
      hitStopTremor = 1.0;
    }

    this.elapsed += simDt;

    // 3. Smooth Mouse Look & Weapon Sway velocity
    const prevX = this.smoothMouse.x;
    const prevY = this.smoothMouse.y;
    this.smoothMouse.lerp(this.mouseNorm, Math.min(1, rawDt * 9));
    this.mouseVel.set((this.smoothMouse.x - prevX) / rawDt, (this.smoothMouse.y - prevY) / rawDt);

    // 4. Advance Choreography / Free Slash / Awakening / Auto-Showcase
    if (this.activeTech) {
      this.updateActiveTechnique(simDt);
    } else if (this.awakeningTimer >= 0) {
      this.updateAwakeningAnimation(simDt);
    } else if (this.freeSlashTimer >= 0) {
      this.updateFreeSlash(simDt);
    } else {
      // Charged 1080 Pound Phoenix coiling animation when holding mouse down!
      if (this.isChargingSlash) {
        this.chargeSlashTime += rawDt;
        const chargeRatio = THREE.MathUtils.clamp(this.chargeSlashTime / 0.42, 0, 1);
        if (chargeRatio > 0.2) {
          const vib = Math.sin(this.elapsed * 65) * 0.01 * chargeRatio;
          this.camTargetFov = THREE.MathUtils.lerp(65, 57, chargeRatio);
          this.hakiChargeLevel = Math.max(this.hakiChargeLevel, chargeRatio * 0.75);
          this.rig.setPose(
            {
              left: {
                pos: [-0.56 + vib, -0.1 + chargeRatio * 0.12, -0.62],
                rot: [-0.45, -0.35, -0.52],
                visible: true,
              },
              right: {
                pos: [0.56 - vib, -0.1 + chargeRatio * 0.12, -0.62],
                rot: [-0.45, 0.35, 0.52],
                visible: true,
              },
              mouth: IDLE_SANTORYU_POSE.mouth,
            },
            14
          );
          if (chargeRatio >= 0.98 && Math.random() < simDt * 8) {
            const tip = this.rig.getTsubaWorld(Math.random() > 0.5 ? 'enma' : 'sandai');
            this.vfx.spawnSparks(tip, 6, '#22d3ee', '#00ff88', 7);
          }
        }
      } else {
        this.camTargetFov = 65;
        this.rig.setPose(IDLE_SANTORYU_POSE, 10);
      }

      // Idle King of Hell ambient black-red Haki lightning sparks right off Enma's golden trefoil tsuba!
      if (this.kingOfHell && Math.random() < simDt * 2.6) {
        const tsuba = this.rig.getTsubaWorld(Math.random() > 0.4 ? 'enma' : 'sandai');
        const end = tsuba
          .clone()
          .add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0.35 + Math.random() * 0.85, -0.5 - Math.random()));
        this.vfx.spawnHakiLightning(tsuba, end, '#ff1744', 0.16, 0.52);
      }

      // Ambient distant Onigashima thundercloud lightning forks arching near the Skull Horns!
      if (Math.random() < simDt * 0.45) {
        const side = Math.random() > 0.5 ? 1 : -1;
        const skyStart = new THREE.Vector3(side * (26 + Math.random() * 18), 44, -52);
        const skyEnd = new THREE.Vector3(side * (18 + Math.random() * 16), 14, -48);
        this.vfx.spawnHakiLightning(skyStart, skyEnd, side < 0 ? '#ff1e56' : '#10ff96', 0.24, 1.9);
      }

      // Auto-Showcase Sequence chain
      if (this.showcaseMode) {
        this.showcaseGapTimer -= rawDt;
        if (this.showcaseGapTimer <= 0) {
          const nextId = SHOWCASE_ORDER[this.showcaseIndex % SHOWCASE_ORDER.length];
          this.showcaseIndex++;
          this.triggerTechnique(nextId);
        }
      }
    }

    // Combo decay
    if (this.comboCount > 0 && !this.activeTech) {
      this.comboDecayTimer -= rawDt;
      if (this.comboDecayTimer <= 0) {
        this.comboCount = 0;
        this.emitHud();
      }
    }

    // 5. Update First-Person Camera Position, FOV, Dutch Roll & Micro-Shake
    this.camBasePos.lerp(this.camTargetPos, Math.min(1, simDt * this.camPosLerp));
    this.shakeAmp = Math.max(0, this.shakeAmp - rawDt * 1.35);
    const totalShake = this.shakeAmp + hitStopTremor * 0.08;
    const sx = totalShake > 0.001 ? (Math.random() - 0.5) * totalShake : 0;
    const sy = totalShake > 0.001 ? (Math.random() - 0.5) * totalShake : 0;

    this.camera.position.set(this.camBasePos.x + sx, this.camBasePos.y + sy, this.camBasePos.z);

    const mouseInfluence = this.activeTech ? 0.08 : 0.24;
    const targetYaw = this.camScriptYaw + this.spinExtraYaw - this.smoothMouse.x * mouseInfluence;
    const targetPitch = this.camScriptPitch - this.smoothMouse.y * (mouseInfluence * 0.65);

    this.camera.rotation.y =
      this.spinExtraYaw !== 0
        ? targetYaw
        : THREE.MathUtils.lerp(this.camera.rotation.y, targetYaw, Math.min(1, simDt * 14));
    this.camera.rotation.x = THREE.MathUtils.lerp(this.camera.rotation.x, targetPitch, Math.min(1, simDt * 12));
    this.camera.rotation.z = THREE.MathUtils.lerp(
      this.camera.rotation.z,
      this.camScriptRoll + sx * 0.14,
      Math.min(1, simDt * 14)
    );

    const nextFov = THREE.MathUtils.lerp(this.camera.fov, this.camTargetFov, Math.min(1, simDt * 14));
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    // 6. Update First-Person Rig, Onigashima Arena, and 3D VFX Simulation
    const isIdle = !this.activeTech && this.awakeningTimer < 0 && this.freeSlashTimer < 0;
    this.rig.update(simDt, this.elapsed, this.mouseVel.x, this.mouseVel.y, isIdle, hitStopTremor);
    this.arena.update(
      simDt,
      this.elapsed,
      this.hakiChargeLevel,
      this.freezeWorldPetals,
      this.ashuraEclipseLevel
    );
    this.vfx.update(simDt, this.elapsed, this.camera.position);

    // Decay dynamic Haki point light
    const minHakiLight = this.kingOfHell ? 5.5 : 0;
    this.arena.hakiPointLight.intensity = THREE.MathUtils.lerp(
      this.arena.hakiPointLight.intensity,
      minHakiLight,
      Math.min(1, simDt * 4.5)
    );

    // 7. Update Sakuga Post-Processing Uniforms
    const u = this.sakugaPass.uniforms;
    u.uTime.value = this.elapsed;

    this.chromaticTarget = THREE.MathUtils.lerp(this.chromaticTarget, 0, Math.min(1, simDt * 6));
    u.uChromatic.value = THREE.MathUtils.lerp(u.uChromatic.value, this.chromaticTarget, Math.min(1, rawDt * 16));
    u.uSpeedLines.value = THREE.MathUtils.lerp(u.uSpeedLines.value, this.speedLinesTarget, Math.min(1, rawDt * 14));
    u.uFocusDesat.value = THREE.MathUtils.lerp(u.uFocusDesat.value, this.focusDesatTarget, Math.min(1, rawDt * 10));
    u.uBandanaVignette.value = THREE.MathUtils.lerp(
      u.uBandanaVignette.value,
      this.kingOfHell || this.activeTech ? 0.85 : 0.0,
      Math.min(1, rawDt * 7)
    );

    if (this.shockwaveProgress >= 0) {
      this.shockwaveProgress += simDt * 2.15;
      u.uShockwaveProgress.value = this.shockwaveProgress;
      u.uShockwaveStrength.value = this.shockwaveStrength;
      if (this.shockwaveProgress > 1.35) {
        this.shockwaveProgress = -1;
        u.uShockwaveProgress.value = -1;
      }
    }

    if (this.flashAlpha > 0.001) {
      this.flashAlpha = Math.max(0, this.flashAlpha - rawDt * 2.8);
      u.uFlashAlpha.value = this.flashAlpha;
    } else {
      u.uFlashAlpha.value = 0;
    }

    // 8. Render Final HDR Sakuga Frame!
    this.composer.render();

    // Throttle React HUD progress updates smoothly (~20Hz)
    if (this.activeTech) {
      this.hudEmitTimer += rawDt;
      if (this.hudEmitTimer >= 0.05) {
        this.hudEmitTimer = 0;
        this.emitHud();
      }
    }
  };

  private emitHud(): void {
    this.callbacks.onHudUpdate({
      activeTechnique: this.activeTech,
      progress: this.activeTech ? Math.min(1, this.techTime / this.activeTech.duration) : 0,
      phaseLabel: this.currentPhaseLabel,
      kingOfHell: this.kingOfHell,
      slowMo: this.slowMo,
      showcaseMode: this.showcaseMode,
      comboCount: this.comboCount,
      totalCleaves: this.totalCleaves,
      letterbox: Boolean(this.activeTech),
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
