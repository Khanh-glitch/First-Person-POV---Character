/**
 * ARENA ENGINE — vòng lặp trận đấu 1v1.
 *
 * Trách nhiệm:
 *   - Renderer + camera POV (FOV lấy đúng theo nhân vật đang chọn)
 *   - Di chuyển WASD + chuột (pointer lock)
 *   - Ra chiêu, cooldown, tính sát thương qua combat.ts
 *   - Phát hiệu ứng đúng "chữ ký" của nhân vật lên đối thủ (fx.ts)
 *   - AI đối thủ: tiếp cận, niệm chiêu, né, phản đòn
 *
 * Engine này KHÔNG import gì từ 7 dự án gốc — nó là một engine độc lập,
 * nhưng port dữ liệu và phong cách hiệu ứng từ đó (xem data/roster.ts).
 */

import * as THREE from 'three';
import { getCharacter, type CharId, type Move } from '../data/roster';
import {
  computeDamage, effectiveCooldown, castLock, powerOf, MAX_HP, type DamageResult,
} from './combat';
import { BeamSystem, SlashSystem } from './fx';
import { CharFx } from './particles';
import { buildPost, type PostRig } from './post';
import { buildViewModel, type ViewModel } from './viewmodel';
import { World, ARENA, PLAYER_RADIUS, ENEMY_RADIUS } from './world';

/** ngẫu nhiên trong khoảng — dùng cho hiệu ứng, không ảnh hưởng mô phỏng */
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
import { Enemy, type StatusEffect } from './enemy';

export interface HudSnapshot {
  playerHp: number;
  playerMaxHp: number;
  enemyHp: number;
  enemyMaxHp: number;
  enemyName: string;
  enemyColor: string;
  cooldowns: { id: string; name: string; key: string; remaining: number; total: number; color: string; ready: boolean; ultimate: boolean }[];
  combo: number;
  comboTimer: number;
  distance: number;
  statuses: { label: string; remaining: number; total: number; color: string }[];
  enemyStatuses: { label: string; remaining: number; total: number; color: string }[];
  lastHit: { damage: number; moveName: string; color: string; id: number } | null;
  enemyWindup: { moveName: string; remaining: number; total: number; color: string } | null;
  state: 'fighting' | 'won' | 'lost';
  fps: number;
  locked: boolean;
  castBar: { name: string; kanji: string; k: number; color: string } | null;
}

export interface ArenaCallbacks {
  onHud: (s: HudSnapshot) => void;
  onLog: (text: string, color: string, kind: 'hit' | 'status' | 'info' | 'ult') => void;
}

export interface ArenaOptions {
  playerChar: CharId;
  enemyChar: CharId;
  onHud: (s: HudSnapshot) => void;
  onLog: (text: string, color: string, kind: 'hit' | 'status' | 'info' | 'ult') => void;
  onEnd: (result: 'won' | 'lost') => void;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export class Arena {
  private world = new World();
  private renderer: THREE.WebGLRenderer;
  private post: PostRig;
  private camera: THREE.PerspectiveCamera;
  private scene: THREE.Scene;

  /** hệ hạt của người chơi và của đối thủ — mỗi bên dùng đúng texture của mình */
  private fxP: CharFx;
  private fxE: CharFx;
  private beams: BeamSystem;
  private slashes: SlashSystem;
  private viewModel: ViewModel;
  private enemy: Enemy;

  private playerChar: CharId;
  private enemyChar: CharId;

  /* ------------------------------------------------------- player state */
  private playerPos = new THREE.Vector3(0, 0, 12);
  private playerVel = new THREE.Vector3();
  private yaw = Math.PI;
  private pitch = 0;
  private hp = MAX_HP;
  private cooldowns: Record<string, number> = {};
  /**
   * Trạng thái đang niệm chiêu.
   *
   * `anim` là thời lượng DIỄN XUẤT — tách khỏi `move.duration` (thời lượng
   * hoạt ảnh gốc, có chiêu tới 5 giây). Bản gốc chạy `m.update(...)` suốt
   * `m.dur`, và arena giữ đúng điều đó: hiệu ứng phải sống trọn chiêu, không
   * phải tắt sau một nhịp 0.55s.
   */
  private casting: { move: Move; t: number; fired: boolean; anim: number } | null = null;
  private combo = 0;
  private comboTimer = 0;
  private invuln = 0;
  /** thời điểm được phép ra chiêu tiếp theo (khoá niệm) */
  private lockUntil = 0;
  /** tích luỹ thời gian phát hiệu ứng trong lúc niệm chiêu */
  private fxAcc = 0;
  /** tương tự cho hiệu ứng của đối thủ */
  private enemyFxAcc = 0;
  private playerStatuses: StatusEffect[] = [];

  /* ------------------------------------------------------- enemy AI */
  private enemyWindup: { move: Move; t: number; total: number; anim: number; shown: number } | null = null;
  private enemyCooldowns: Record<string, number> = {};
  private aiTimer = 0;
  private aiStrafeDir = 1;

  /* ------------------------------------------------------- loop */
  private clock = new THREE.Clock();
  private raf = 0;
  private time = 0;
  private frameCount = 0;
  private fpsAccum = 0;
  private fps = 60;
  private hudAccum = 0;
  private lastHit: HudSnapshot['lastHit'] = null;
  private hitId = 0;
  private state: 'fighting' | 'won' | 'lost' = 'fighting';
  private ended = false;
  private disposed = false;

  private keys = new Set<string>();
  private pointerLocked = false;

  private opts: ArenaOptions;

  constructor(canvas: HTMLCanvasElement, opts: ArenaOptions) {
    this.opts = opts;
    this.playerChar = opts.playerChar;
    this.enemyChar = opts.enemyChar;

    const pc = getCharacter(this.playerChar);
    const ec = getCharacter(this.enemyChar);

    /* ------------------------------------------------------ renderer */
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = pc.exposure; // exposure đúng của nhân vật
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = this.world.scene;
    this.world.setTheme(pc.color);

    /* ------------------------------------------------------ camera */
    // FOV lấy đúng theo nhân vật đang chơi
    this.camera = new THREE.PerspectiveCamera(pc.fov, window.innerWidth / window.innerHeight, 0.05, 600);
    this.scene.add(this.camera);

    /* ------------------------------------------------------ hệ hiệu ứng */
    // 2400 hạt mỗi bên: đủ chứa 1080 hạt/giây với đời sống tới 2 giây (Imu).
    // Trước đây 700 nên hạt mới sinh bị hạt sau ghi đè ngay lập tức.
    this.fxP = new CharFx(this.playerChar, 2400);
    this.scene.add(this.fxP.group);
    this.fxE = new CharFx(this.enemyChar, 2400);
    this.scene.add(this.fxE.group);

    this.beams = new BeamSystem();
    this.scene.add(this.beams.group);

    this.slashes = new SlashSystem();
    this.scene.add(this.slashes.group);

    /* ------------------------------------------------------ viewmodel */
    this.viewModel = buildViewModel(this.playerChar, pc.color);
    this.camera.add(this.viewModel.root);

    /* ------------------------------------------------------ hậu kỳ */
    // Pipeline hậu kỳ riêng của từng nhân vật (port nguyên văn từ dự án gốc)
    this.post = buildPost(
      this.playerChar,
      this.renderer,
      this.scene,
      this.camera,
      window.innerWidth,
      window.innerHeight,
    );

    /* ------------------------------------------------------ đối thủ */
    this.enemy = new Enemy(this.enemyChar, ec.color);
    this.enemy.maxHp = MAX_HP;
    this.enemy.hp = MAX_HP;
    this.scene.add(this.enemy.root);
    this.enemy.captureOriginalColors();

    this.bindEvents();
    this.start();
  }

  /* ==================================================== events */

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.post?.resize(w, h);
    this.fxP?.resize();
    this.fxE?.resize();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (this.state !== 'fighting') return;

    const pc = getCharacter(this.playerChar);
    // ra chiêu theo phím
    for (const m of pc.moves) {
      const keyMatch =
        m.key.toLowerCase() === k ||
        (m.key === 'LMB' && (k === 'l' )) ||
        (m.key === 'RMB' && k === 'r' && false);
      if (keyMatch) {
        e.preventDefault();
        this.tryCast(m);
        return;
      }
    }
    // chiêu gán phím số cho nhân vật dùng LMB/RMB/Q/E/R (Boa Hancock)
    const idx = ['1', '2', '3', '4', '5', '6', '7', '8'].indexOf(k);
    if (idx >= 0 && idx < pc.moves.length) {
      e.preventDefault();
      this.tryCast(pc.moves[idx]);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.state !== 'fighting') return;
    if (!this.pointerLocked) {
      this.requestLock();
      return;
    }
    const pc = getCharacter(this.playerChar);
    if (e.button === 0) {
      // ưu tiên chiêu gán LMB, không thì chiêu đầu
      const m = pc.moves.find((x) => x.key === 'LMB') ?? pc.moves[0];
      this.tryCast(m);
    } else if (e.button === 2) {
      const m = pc.moves.find((x) => x.key === 'RMB');
      if (m) this.tryCast(m);
      e.preventDefault();
    }
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    const sens = 0.0022;
    this.yaw -= e.movementX * sens;
    this.pitch = clamp(this.pitch - e.movementY * sens, -1.15, 1.15);
  };

  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
  };

  private onContextMenu = (e: Event) => e.preventDefault();

  private requestLock() {
    this.renderer.domElement.requestPointerLock?.();
  }

  private bindEvents() {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    const el = this.renderer.domElement;
    el.addEventListener('mousedown', this.onMouseDown);
    el.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('mousemove', this.onMouseMove);
  }

  /* ==================================================== casting */

  private tryCast(move: Move) {
    if (this.state !== 'fighting') return;
    if (this.casting) return;
    if ((this.cooldowns[move.id] ?? 0) > 0) return;
    // khoá niệm: không ra chiêu khác khi vừa bắt đầu 1 chiêu
    if (this.time < this.lockUntil) return;
    // choáng / hoá đá thì không ra chiêu
    if (this.playerStatuses.some((s) => s.kind === 'stun' || s.kind === 'petrify' || s.kind === 'bind')) return;

    const pc = getCharacter(this.playerChar);
    // Diễn xuất kéo dài đúng `duration` gốc (0.85s…5.15s), không cắt ngắn.
    // Sàn 0.9s để chiêu ngắn nhất cũng kịp phô diễn.
    const anim = Math.max(0.9, move.duration);
    this.casting = { move, t: 0, fired: false, anim };
    // cooldown thực = lớn hơn giữa cooldown gốc và khoá niệm chiêu
    this.cooldowns[move.id] = Math.max(effectiveCooldown(move), castLock(move));
    this.lockUntil = this.time + castLock(move);

    // hiệu ứng khởi phát tại tay + camera kick
    const chest = this.playerChest();
    const dir = this.forward();
    this.fxP.emit(chest, dir, new THREE.Color(move.color), move.ultimate ? 1.4 : 0.6);
    if (move.ultimate) {
      this.beams.ring(new THREE.Vector3(this.playerPos.x, 0.2, this.playerPos.z),
        new THREE.Color(move.color), 2, 0.7, 22);
    }
    this.post.onCastStart(move, powerOf(pc, move));
    this.opts.onLog(`${pc.shortName} → ${move.name}`, move.color, move.ultimate ? 'ult' : 'info');
  }

  private forward(): THREE.Vector3 {
    return new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    ).normalize();
  }

  private playerChest(): THREE.Vector3 {
    return new THREE.Vector3(this.playerPos.x, 1.65, this.playerPos.z);
  }

  /* ==================================================== resolve hit */

  /**
   * PHÔ DIỄN CHIÊU — chạy MỖI FRAME trong lúc niệm, suốt `duration` gốc.
   *
   * Đây là phần làm nên "màn phô diễn" của bản gốc. Trước đây arena chỉ phát
   * một cụm hạt ở thời điểm trúng đòn rồi thôi, nên người chơi gần như không
   * thấy gì ngoài tia sáng nhấp nháy.
   *
   * Mỗi hệ chiêu có nhịp phát riêng, lấy theo chỗ gọi trong game gốc:
   *   heart   → tim bay lên quanh tay (Game.ts:1068)
   *   light   → vệt sáng dọc đường ngắm (gfx.ts Streaks)
   *   blade   → vệt chém quét qua (zoro slash)
   *   string  → chỉ căng từ tay tới địch (Effects.ts)
   *   magnet  → mảnh sắt xoáy quanh tay + tia sét (FX.ts:420/458)
   *   void    → khói đen cuộn lên từ dưới (fxlib.ts:34)
   *   rubber  → chấm halftone bung ra (effects.ts Bursts)
   */
  private performMoveFx(move: Move, k: number, dt: number) {
    const fc = getCharacter(this.playerChar);
    const col = new THREE.Color(move.color);
    const chest = this.playerChest();
    const fwd = this.forward();
    const power = clamp(powerOf(fc, move) / 60, 0.3, 1.6);

    // tích luỹ thời gian để phát theo nhịp, không phát mỗi frame (nổ pool)
    this.fxAcc += dt;
    const interval = 0.045 / power;
    if (this.fxAcc < interval) return;
    this.fxAcc = 0;

    // cường độ tăng dần tới đỉnh rồi giảm — "vào chiêu" rồi "bung"
    const envelope = Math.sin(Math.min(1, k) * Math.PI);

    switch (move.fx) {
      case 'heart': {
        // tim bay lên quanh bàn tay, toả rộng dần
        const p = chest.clone().addScaledVector(fwd, 0.5);
        p.x += rnd(-0.5, 0.5);
        p.y += rnd(-0.3, 0.4);
        this.fxP.emit(p, fwd.clone().add(new THREE.Vector3(0, 0.4, 0)).normalize(),
          col, 0.5 + envelope);
        if (k > 0.25 && k < 0.75) {
          this.beams.ring(p, col, 0.7 + envelope * 1.5, 0.5, 12);
        }
        break;
      }
      case 'light': {
        // vệt sáng bắn dọc đường ngắm
        const far = chest.clone().addScaledVector(fwd, move.reach * (0.5 + envelope * 0.5));
        this.fxP.stream(chest, far, col, 0.6 + envelope);
        this.beams.beam(chest, far, col, 0.05 + envelope * 0.14, 0.14);
        break;
      }
      case 'blade': {
        // vệt chém quét qua trước mặt
        const target = chest.clone().addScaledVector(fwd, move.reach * 0.7);
        this.fxP.emit(target, fwd, col, 0.6 + envelope);
        this.slashes.slash(target, fwd, col, 2.4 + envelope * 2.4,
          Math.PI * 0.85, 0.22, (k * 2 + Math.random() * 0.4) * Math.PI);
        break;
      }
      case 'string': {
        // chỉ căng từ tay toả ra nhiều hướng
        for (let i = 0; i < 3; i++) {
          const off = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.4);
          const to = chest.clone().addScaledVector(fwd, move.reach * 0.5).add(off);
          this.beams.beam(chest, to, col, 0.025 + envelope * 0.03, 0.25);
        }
        this.fxP.emit(chest, fwd, col, 0.5 + envelope);
        break;
      }
      case 'magnet': {
        // mảnh sắt xoáy quanh tay + tia sét
        const a = k * Math.PI * 6;
        const p = chest.clone().add(new THREE.Vector3(Math.cos(a) * 0.9, Math.sin(a * 1.3) * 0.5, Math.sin(a) * 0.9));
        this.fxP.emit(p, p.clone().sub(chest).normalize(), col, 0.6 + envelope);
        if (Math.random() < 0.3) this.beams.ring(p, col, 0.6 + envelope, 0.35, 10);
        break;
      }
      case 'void': {
        // khói đen cuộn lên từ mặt đất quanh người chơi
        const a = Math.random() * Math.PI * 2;
        const r = 0.5 + Math.random() * 1.5;
        const p = new THREE.Vector3(
          this.playerPos.x + Math.cos(a) * r, 0.1, this.playerPos.z + Math.sin(a) * r,
        );
        this.fxP.emit(p, new THREE.Vector3(0, 1, 0), col, 0.7 + envelope);
        if (k > 0.4 && Math.random() < 0.25) {
          this.beams.ring(new THREE.Vector3(p.x, 0.15, p.z), col, 1 + envelope, 0.6, 16);
        }
        break;
      }
      case 'rubber': {
        // chấm halftone bung ra từ nắm đấm
        const p = chest.clone().addScaledVector(fwd, 0.9);
        this.fxP.emit(p, fwd, col, 0.5 + envelope);
        break;
      }
    }

    // đòn ultimate: thêm cột sáng + sóng xung kích mỗi nhịp
    if (move.ultimate && Math.random() < 0.12) {
      this.beams.ring(new THREE.Vector3(this.playerPos.x, 0.2, this.playerPos.z),
        col, 1.5 + envelope * 1.5, 0.55, 20);
    }
  }

  private resolveCast(move: Move): DamageResult {
    const pc = getCharacter(this.playerChar);
    const ec = getCharacter(this.enemyChar);
    const dist = this.enemy.distanceTo(this.playerPos);
    const res = computeDamage(pc, ec, move, dist);

    if (res.inRange) {
      this.enemy.damage(res.damage, move.color);
      this.combo += 1;
      this.comboTimer = 2.6;
      this.lastHit = { damage: res.damage, moveName: move.name, color: move.color, id: ++this.hitId };

      // ---- hiệu ứng lên ĐỐI THỦ (đúng chữ ký nhân vật) ----
      const target = this.enemy.chestPoint();
      const dir = target.clone().sub(this.playerChest()).normalize();
      const col = new THREE.Color(move.color);
      const power = clamp(powerOf(pc, move) / 60, 0.3, 1.6);

      this.fxP.emit(target, dir, col, power);

      // tia / chém nối từ tay tới địch cho các hệ phù hợp
      switch (move.fx) {
        case 'light':
          this.beams.beam(this.playerChest(), target, col, 0.13 + power * 0.16, 0.24);
          break;
        case 'blade': {
          this.slashes.slash(target, dir, col, 3.2 + power * 2.2, Math.PI * 0.9, 0.26, Math.random() * Math.PI);
          if (move.ultimate) {
            this.slashes.slash(target, dir, col, 4.4, Math.PI * 1.1, 0.34, Math.PI / 2);
          }
          this.beams.beam(this.playerChest(), target, col, 0.06, 0.16);
          break;
        }
        case 'string':
          for (let i = 0; i < 5; i++) {
            const off = new THREE.Vector3(
              (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2, (Math.random() - 0.5) * 2.2,
            );
            this.beams.beam(this.playerChest().add(off.clone().multiplyScalar(0.2)), target.clone().add(off), col, 0.035, 0.3);
          }
          break;
        case 'magnet': {
          this.beams.ring(target, col, 1.2, 0.42, 16);
          this.beams.beam(this.playerChest(), target, col, 0.2 + power * 0.2, 0.2);
          break;
        }
        case 'void': {
          this.beams.ring(new THREE.Vector3(target.x, 0.2, target.z), col, 1.6 + power * 2, 0.8, 20);
          if (move.ultimate) {
            this.beams.pillar(target, col, 2.2 + power, 46, 1.1);
          }
          break;
        }
        case 'rubber': {
          this.beams.beam(this.playerChest(), target, col, 0.16 + power * 0.2, 0.22);
          this.beams.ring(target, col, 1.0, 0.35, 12);
          break;
        }
        case 'heart': {
          this.beams.ring(target, col, 0.9 + power, 0.6, 10);
          break;
        }
      }

      // ---- hậu kỳ: đòn trúng đích ----
      this.post.onHit(move, powerOf(getCharacter(this.playerChar), move));

      // ---- status effect theo hệ chiêu ----
      this.applyStatusToEnemy(move, res.damage);

      if (res.isUltimate) {
        this.shakeScreen(0.42, 0.16);
        this.beams.ring(new THREE.Vector3(this.enemy.pos.x, 0.2, this.enemy.pos.z),
          col, 3, 0.9, 28);
      } else {
        this.shakeScreen(0.16 + power * 0.1, 0.05);
      }

      if (this.enemy.hp <= 0) this.finish('won');
    } else {
      // trượt — vẫn phát hiệu ứng ở khoảng trống để thấy được tầm với
      const far = this.playerChest().addScaledVector(this.forward(), Math.min(move.reach, dist + 6));
      this.fxP.emit(far, this.forward(), new THREE.Color(move.color), 0.4);
      if (move.fx === 'light') {
        this.beams.beam(this.playerChest(), far, new THREE.Color(move.color), 0.1, 0.2);
      }
    }
    return res;
  }

  private applyStatusToEnemy(move: Move, dmg: number) {
    const c = new THREE.Color(move.color).getHexString();
    const push = (st: StatusEffect) => this.enemy.applyStatus(st);
    const power = powerOf(getCharacter(this.playerChar), move);

    switch (move.fx) {
      case 'heart':
        if (power >= 30) push({ kind: 'petrify', remaining: 1.6 + power / 40, total: 1.6 + power / 40, label: 'HOÁ ĐÁ', color: move.color });
        break;
      case 'magnet':
        if (power >= 38) push({ kind: 'stun', remaining: 0.7 + power / 90, total: 0.7 + power / 90, label: 'TÊ LIỆT TỪ', color: move.color });
        break;
      case 'string':
        if (power >= 26) push({ kind: 'bind', remaining: 1.2 + power / 50, total: 1.2 + power / 50, label: 'TRÓI CHỈ', color: move.color });
        break;
      case 'void':
        push({ kind: 'mark', remaining: 2.0, total: 2.0, label: 'HẮC ẤN', color: move.color });
        if (power >= 60) push({ kind: 'burn', remaining: 1.8 + power / 40, total: 1.8 + power / 40, label: 'THIÊU ĐỐT', color: '#ff6a2a' });
        break;
      case 'light':
        push({ kind: 'mark', remaining: 1.4, total: 1.4, label: 'BỎNG SÁNG', color: move.color });
        break;
      case 'rubber':
        if (power >= 40) this.enemy.stagger(0.55);
        break;
      case 'blade':
        if (power >= 44) push({ kind: 'bind', remaining: 0.5, total: 0.5, label: 'TÊ CỨNG', color: move.color });
        break;
    }
    if (dmg > 0) {
      // Dùng chính nhãn của trạng thái vừa gắn, KHÔNG qua bảng tra theo `kind`:
      // `kind: 'mark'` là dùng chung cho Hắc Ấn của Imu và Bỏng Sáng của Kizaru,
      // nên bảng tra cũ in sai tên cho Kizaru.
      const st = this.enemy.statuses[this.enemy.statuses.length - 1];
      if (st) this.opts.onLog(`${st.label} · ${c}`, move.color, 'status');
    }
  }

  /* ==================================================== camera shake */

  private shakeAmp = 0;
  private shakeTime = 0;
  private shakeScreen(amp: number, time: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  /* ==================================================== enemy AI */

  private updateEnemyAI(dt: number) {
    const ec = getCharacter(this.enemyChar);
    const dist = this.enemy.distanceTo(this.playerPos);

    // giảm cooldown
    for (const k of Object.keys(this.enemyCooldowns)) {
      this.enemyCooldowns[k] = Math.max(0, this.enemyCooldowns[k] - dt);
    }

    if (this.enemy.state === 'ko') return;

    // bị hoá đá / trói / choáng → không hành động
    const locked = this.enemy.hasStatus('petrify') || this.enemy.hasStatus('bind') || this.enemy.state === 'stagger';

    /* --- đang niệm chiêu --- */
    if (this.enemyWindup) {
      const w = this.enemyWindup;
      if (w.t > 0) {
        // ---- giai đoạn niệm: hiệu ứng dày dần quanh đối thủ ----
        w.t -= dt;
        w.shown += dt;
        const k = clamp(1 - w.t / w.total, 0, 1);
        this.performEnemyFx(w.move, k, dt);
        if (w.t <= 0) {
          this.executeEnemyAttack(w.move);
        }
        return;
      }
      // ---- giai đoạn diễn xuất sau khi đánh: hiệu ứng vẫn tiếp tục ----
      w.shown += dt;
      const k2 = clamp(w.shown / w.anim, 0, 1);
      this.performEnemyFx(w.move, k2, dt);
      if (w.shown >= w.anim) this.enemyWindup = null;
      return;
    }

    if (locked) return;

    /* --- chọn hành động --- */
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = 0.35 + Math.random() * 0.5;
      this.aiStrafeDir = Math.random() < 0.5 ? -1 : 1;

      // chọn chiêu trong tầm
      const usable = ec.moves.filter((m) => (this.enemyCooldowns[m.id] ?? 0) <= 0);
      const inRange = usable.filter((m) => dist <= m.reach);
      if (inRange.length > 0 && Math.random() < 0.72) {
        // ưu tiên chiêu mạnh nếu máu người chơi thấp
        const sorted = [...inRange].sort(
          (a, b) => powerOf(ec, b) - powerOf(ec, a),
        );
        const pick = Math.random() < 0.4 ? sorted[0] : inRange[Math.floor(Math.random() * inRange.length)];
        this.startEnemyWindup(pick);
        return;
      }
    }

    /* --- di chuyển: tiến lại gần nếu quá xa, giữ khoảng nếu gần --- */
    const desired = 9; // khoảng cách ưu thích
    const speed = 4.6;
    const toPlayer = this.playerPos.clone().sub(this.enemy.pos);
    toPlayer.y = 0;
    const dirNorm = toPlayer.clone().normalize();

    let move = new THREE.Vector3();
    if (dist > desired + 2) {
      move.copy(dirNorm);
    } else if (dist < desired - 3) {
      move.copy(dirNorm).multiplyScalar(-0.7);
    } else {
      // lượn vòng
      move.set(-dirNorm.z, 0, dirNorm.x).multiplyScalar(this.aiStrafeDir * 0.8);
    }
    this.enemy.pos.addScaledVector(move, speed * dt);

    // giữ trong đấu trường
    const r = Math.hypot(this.enemy.pos.x, this.enemy.pos.z);
    if (r > ARENA.radius - 2) {
      this.enemy.pos.multiplyScalar((ARENA.radius - 2) / r);
    }
  }

  private startEnemyWindup(move: Move) {
    // Đối thủ cũng phô diễn đủ lâu như bản gốc: windup + diễn xuất = duration.
    // Trước đây bóp còn tối đa 1.15s nên đòn 5 giây của Zoro trôi qua trong
    // tích tắc, người chơi không kịp thấy gì.
    const windup = clamp(0.35 + powerOf(getCharacter(this.enemyChar), move) / 200, 0.5, 1.4);
    this.enemyWindup = { move, t: windup, total: windup, anim: Math.max(0.9, move.duration), shown: 0 };
    this.enemyCooldowns[move.id] = Math.max(effectiveCooldown(move), castLock(move)) * 1.15;
    this.enemy.state = 'windup';
    this.enemy.windupT = windup;
    this.opts.onLog(`⚠ ${getCharacter(this.enemyChar).shortName} niệm ${move.name}`, move.color, 'info');
  }

  /**
   * PHÔ DIỄN CỦA ĐỐI THỦ — chạy mỗi frame, suốt cả windup lẫn lúc ra đòn.
   *
   * Đây là phần "hiệu ứng đó lên đối thủ": mỗi nhân vật phải phô ra đúng
   * chữ ký của mình khi ĐÁNH, không chỉ khi bị đánh. Trước đây đối thủ chỉ
   * phát vài hạt lẻ tẻ nên nhìn như khúc gỗ biết bay.
   */
  private performEnemyFx(move: Move, k: number, dt: number) {
    const ec = getCharacter(this.enemyChar);
    const col = new THREE.Color(move.color);
    const chest = this.enemy.chestPoint();
    const toPlayer = this.playerChest().sub(chest).normalize();
    const power = clamp(powerOf(ec, move) / 60, 0.3, 1.6);

    this.enemyFxAcc += dt;
    const interval = 0.05 / power;
    if (this.enemyFxAcc < interval) return;
    this.enemyFxAcc = 0;

    const envelope = Math.sin(clamp(k, 0, 1) * Math.PI);

    switch (move.fx) {
      case 'heart': {
        // tim bay lên quanh đối thủ
        const p = chest.clone();
        p.x += rnd(-0.6, 0.6); p.y += rnd(-0.2, 0.6); p.z += rnd(-0.6, 0.6);
        this.fxE.emit(p, new THREE.Vector3(0, 1, 0), col, 0.5 + envelope);
        break;
      }
      case 'light': {
        const far = chest.clone().addScaledVector(toPlayer, move.reach * 0.6);
        this.fxE.stream(chest, far, col, 0.6 + envelope);
        this.beams.beam(chest, far, col, 0.05 + envelope * 0.12, 0.14);
        break;
      }
      case 'blade': {
        const target = chest.clone().addScaledVector(toPlayer, 2.2);
        this.fxE.emit(target, toPlayer, col, 0.6 + envelope);
        this.slashes.slash(target, toPlayer, col, 2.6 + envelope * 2.2, Math.PI * 0.85, 0.22, Math.random() * Math.PI);
        break;
      }
      case 'string': {
        for (let i = 0; i < 2; i++) {
          const off = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(0.5);
          this.beams.beam(chest, this.playerChest().add(off), col, 0.025 + envelope * 0.03, 0.22);
        }
        this.fxE.emit(chest, toPlayer, col, 0.5 + envelope);
        break;
      }
      case 'magnet': {
        const a = k * Math.PI * 6;
        const p = chest.clone().add(
          new THREE.Vector3(Math.cos(a) * 1.0, Math.sin(a * 1.3) * 0.6, Math.sin(a) * 1.0),
        );
        this.fxE.emit(p, p.clone().sub(chest).normalize(), col, 0.6 + envelope);
        if (Math.random() < 0.3) this.beams.ring(p, col, 0.7 + envelope, 0.4, 10);
        break;
      }
      case 'void': {
        const a = Math.random() * Math.PI * 2;
        const r = 0.5 + Math.random() * 1.6;
        const p = new THREE.Vector3(
          this.enemy.pos.x + Math.cos(a) * r, 0.1, this.enemy.pos.z + Math.sin(a) * r,
        );
        this.fxE.emit(p, new THREE.Vector3(0, 1, 0), col, 0.7 + envelope);
        if (Math.random() < 0.25) {
          this.beams.ring(new THREE.Vector3(p.x, 0.15, p.z), col, 1 + envelope, 0.6, 16);
        }
        break;
      }
      case 'rubber': {
        const p = chest.clone().addScaledVector(toPlayer, 1.0);
        this.fxE.emit(p, toPlayer, col, 0.5 + envelope);
        break;
      }
    }

    // ultimate của đối thủ: cột sáng dưới chân
    if (move.ultimate && Math.random() < 0.1) {
      this.beams.ring(new THREE.Vector3(this.enemy.pos.x, 0.2, this.enemy.pos.z),
        col, 1.5 + envelope * 1.5, 0.6, 20);
    }
  }

  private executeEnemyAttack(move: Move) {
    this.enemy.state = 'attack';
    this.enemy.actionT = clamp(move.duration * 0.35, 0.35, 1.2);
    this.enemy.actionDuration = this.enemy.actionT;
    this.enemy.actionMoveId = move.id;
    this.enemy.windupT = 0;

    const pc = getCharacter(this.playerChar);
    const ec = getCharacter(this.enemyChar);
    const dist = this.enemy.distanceTo(this.playerPos);
    const res = computeDamage(ec, pc, move, dist);

    const from = this.enemy.chestPoint();
    const to = this.playerChest();
    const col = new THREE.Color(move.color);

    // hiệu ứng bay về phía NGƯỜI CHƠI
    // dùng texture + tham số của CHÍNH đối thủ, và kéo thành vệt từ địch tới người chơi
    this.fxE.stream(from, to, col, clamp(powerOf(getCharacter(this.enemyChar), move) / 60, 0.3, 1.4));
    if (move.fx === 'light' || move.fx === 'magnet' || move.fx === 'rubber' || move.fx === 'blade') {
      this.beams.beam(from, to, col, 0.12, 0.24);
    }
    if (move.fx === 'blade') {
      this.slashes.slash(to, from.clone().sub(to).normalize(), col, 3.4, Math.PI * 0.9, 0.24, Math.random() * Math.PI);
    }

    if (res.inRange && this.invuln <= 0) {
      this.hp = Math.max(0, this.hp - res.damage);
      this.shakeScreen(0.3 + res.damage / 260, 0.2);
      this.post.onHurt(Math.min(1, res.damage / MAX_HP));
      this.opts.onLog(`${move.name} → -${res.damage}`, move.color, 'hit');

      // status lên người chơi
      this.applyStatusToPlayer(move);
      this.combo = 0; // bị đánh thì mất combo

      if (this.hp <= 0) this.finish('lost');
    } else if (!res.inRange) {
      this.opts.onLog(`${this.enemyChar} đánh trượt`, '#8899aa', 'info');
    }
    // hết đòn thì về idle
    setTimeout(() => { if (this.enemy.state === 'attack') this.enemy.state = 'idle'; }, this.enemy.actionT * 1000);
  }

  private applyStatusToPlayer(move: Move) {
    const dur = powerOf(getCharacter(this.enemyChar), move) >= 60 ? 0.9 : 0.45;
    let st: StatusEffect | null = null;
    switch (move.fx) {
      case 'heart': st = { kind: 'petrify', remaining: dur + 0.5, total: dur + 0.5, label: 'HOÁ ĐÁ', color: move.color }; break;
      case 'magnet': st = { kind: 'stun', remaining: dur, total: dur, label: 'TÊ LIỆT', color: move.color }; break;
      case 'string': st = { kind: 'bind', remaining: dur + 0.4, total: dur + 0.4, label: 'TRÓI CHỈ', color: move.color }; break;
      case 'void': st = { kind: 'mark', remaining: dur + 0.6, total: dur + 0.6, label: 'HẮC ẤN', color: move.color }; break;
      case 'light': st = { kind: 'mark', remaining: dur, total: dur, label: 'BỎNG SÁNG', color: move.color }; break;
      case 'blade': st = { kind: 'stun', remaining: dur * 0.6, total: dur * 0.6, label: 'TÊ CỨNG', color: move.color }; break;
      case 'rubber': st = null; break;
    }
    if (st) {
      const existing = this.playerStatuses.find((s) => s.kind === st!.kind);
      if (existing) {
        existing.remaining = Math.max(existing.remaining, st.remaining);
        existing.total = Math.max(existing.total, st.total);
      } else {
        this.playerStatuses.push(st);
      }
      this.opts.onLog(`BẠN BỊ ${st.label}`, move.color, 'status');
    }
  }

  /* ==================================================== loop */

  private start() {
    const tick = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, this.clock.getDelta());
      this.time += dt;
      this.frameCount++;
      this.fpsAccum += dt;
      if (this.fpsAccum >= 0.5) {
        this.fps = Math.round(this.frameCount / this.fpsAccum);
        this.frameCount = 0;
        this.fpsAccum = 0;
      }
      this.update(dt);
      this.render();
      this.hudAccum += dt;
      if (this.hudAccum >= 0.08) {
        this.hudAccum = 0;
        this.opts.onHud(this.snapshot());
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  private update(dt: number) {
    /* --- cooldown --- */
    for (const k of Object.keys(this.cooldowns)) {
      this.cooldowns[k] = Math.max(0, this.cooldowns[k] - dt);
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.invuln > 0) this.invuln -= dt;

    /* --- status người chơi --- */
    for (let i = this.playerStatuses.length - 1; i >= 0; i--) {
      this.playerStatuses[i].remaining -= dt;
      if (this.playerStatuses[i].remaining <= 0) this.playerStatuses.splice(i, 1);
    }
    const playerLocked = this.playerStatuses.some(
      (s) => s.kind === 'petrify' || s.kind === 'bind' || s.kind === 'stun',
    );

    /* --- di chuyển --- */
    if (this.state === 'fighting' && !playerLocked) {
      const speed = 9.2;
      const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
      const want = new THREE.Vector3();
      if (this.keys.has('w') || this.keys.has('arrowup')) want.add(fwd);
      if (this.keys.has('s') || this.keys.has('arrowdown')) want.sub(fwd);
      if (this.keys.has('d') || this.keys.has('arrowright')) want.add(right);
      if (this.keys.has('a') || this.keys.has('arrowleft')) want.sub(right);
      if (want.lengthSq() > 0) want.normalize().multiplyScalar(speed);
      this.playerVel.lerp(want, Math.min(1, dt * 14));
      this.playerPos.addScaledVector(this.playerVel, dt);
    } else {
      this.playerVel.multiplyScalar(Math.pow(0.02, dt));
    }

    // giới hạn trong đấu trường
    const r = Math.hypot(this.playerPos.x, this.playerPos.z);
    const maxR = ARENA.radius - PLAYER_RADIUS;
    if (r > maxR) {
      const s = maxR / r;
      this.playerPos.x *= s;
      this.playerPos.z *= s;
    }

    /* --- casting --- */
    if (this.casting) {
      const k = Math.min(1, this.casting.t / this.casting.anim);
      const fireAt = Math.min(
        0.62, 0.3 + powerOf(getCharacter(this.playerChar), this.casting.move) / 200,
      );
      if (!this.casting.fired && k >= fireAt) {
        this.casting.fired = true;
        this.resolveCast(this.casting.move);
      }
      // ---- phô diễn LIÊN TỤC suốt chiêu, đúng như bản gốc ----
      // Bản gốc gọi hiệu ứng mỗi frame trong `m.update()`, không phải một
      // lần rồi thôi. Đây chính là lý do arena trước đây trông trống trơn.
      this.performMoveFx(this.casting.move, k, dt);
      this.casting.t += dt;
      if (this.casting.t >= this.casting.anim) this.casting = null;
    }

    /* --- viewmodel --- */
    const castT = this.casting
      ? Math.min(1, this.casting.t / this.casting.anim)
      : 0;
    this.viewModel.update(dt, this.time, castT);
    // trạng thái đặc biệt của rig (Ashura của Zoro…). Trả về 0 khi không niệm.
    if (this.viewModel.special) {
      this.viewModel.special(this.casting ? this.casting.move.id : '', castT);
    }

    /* --- enemy --- */
    this.updateEnemyAI(dt);
    this.enemy.update(dt, this.time, this.playerPos);

    /* --- va chạm: không cho xuyên qua đối thủ --- */
    const d = this.enemy.distanceTo(this.playerPos);
    const minDist = PLAYER_RADIUS + ENEMY_RADIUS;
    if (d < minDist && d > 1e-4) {
      const push = (minDist - d);
      const dir = this.playerPos.clone().sub(this.enemy.pos).setY(0).normalize();
      this.playerPos.addScaledVector(dir, push);
      this.enemy.pos.addScaledVector(dir, -push * 0.5);
    }

    /* --- camera --- */
    const bob = this.playerVel.lengthSq() > 1 ? Math.sin(this.time * 11) * 0.035 : 0;
    this.camera.position.set(
      this.playerPos.x,
      1.72 + bob,
      this.playerPos.z,
    );
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotateY(this.yaw);
    this.camera.rotateX(this.pitch);

    // shake
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const k = Math.max(0, this.shakeTime / 0.3);
      const a = this.shakeAmp * k;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
      this.camera.rotateZ((Math.random() - 0.5) * a * 0.12);
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }

    /* --- hậu kỳ --- */
    this.post.tick({
      hpRatio: this.hp / MAX_HP,
      moving: this.playerVel.lengthSq() > 1,
      casting: !!this.casting,
      castK: this.casting ? Math.min(1, this.casting.t / Math.max(0.01, this.casting.anim)) : 0,
    });

    /* --- fx --- */
    this.fxP.update(dt, this.camera);
    this.fxE.update(dt, this.camera);
    this.beams.update(dt);
    this.slashes.update(dt);
    this.world.update(dt, this.time);
  }

  private render() {
    this.post.render(0, this.time);
  }

  /* ==================================================== end */

  private finish(result: 'won' | 'lost') {
    if (this.ended) return;
    this.ended = true;
    this.state = result;
    document.exitPointerLock?.();
    this.opts.onEnd(result);
    this.opts.onHud(this.snapshot());
  }

  /* ==================================================== hud */

  private snapshot(): HudSnapshot {
    const pc = getCharacter(this.playerChar);
    const ec = getCharacter(this.enemyChar);
    const castK = this.casting ? Math.min(1, this.casting.t / this.casting.anim) : 0;
    return {
      playerHp: this.hp,
      playerMaxHp: MAX_HP,
      enemyHp: this.enemy.hp,
      enemyMaxHp: this.enemy.maxHp,
      enemyName: ec.name,
      enemyColor: ec.color,
      cooldowns: pc.moves.map((m) => {
        const total = effectiveCooldown(m);
        const remaining = this.cooldowns[m.id] ?? 0;
        return {
          id: m.id,
          name: m.name,
          key: m.key,
          remaining,
          total,
          color: m.color,
          ready: remaining <= 0,
          ultimate: !!m.ultimate,
        };
      }),
      combo: this.combo,
      comboTimer: Math.max(0, this.comboTimer),
      distance: this.enemy.distanceTo(this.playerPos),
      statuses: this.playerStatuses.map((s) => ({
        label: s.label, remaining: s.remaining, total: s.total, color: s.color,
      })),
      enemyStatuses: this.enemy.statuses.map((s) => ({
        label: s.label, remaining: s.remaining, total: s.total, color: s.color,
      })),
      lastHit: this.lastHit,
      enemyWindup: this.enemyWindup
        ? {
            moveName: this.enemyWindup.move.name,
            remaining: this.enemyWindup.t,
            total: this.enemyWindup.total,
            color: this.enemyWindup.move.color,
          }
        : null,
      state: this.state,
      fps: this.fps,
      locked: this.pointerLocked,
      castBar: this.casting
        ? {
            name: this.casting.move.name,
            kanji: this.casting.move.kanji,
            k: castK,
            color: this.casting.move.color,
          }
        : null,
    };
  }

  /* ==================================================== control */

  pause() {
    this.keys.clear();
  }

  resume() {
    this.keys.clear();
  }

  requestPointerLock() {
    this.requestLock();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMove);
    const el = this.renderer.domElement;
    el.removeEventListener('mousedown', this.onMouseDown);
    el.removeEventListener('contextmenu', this.onContextMenu);
    document.exitPointerLock?.();

    this.viewModel.dispose();
    this.enemy.dispose();
    this.fxP.dispose();
    this.fxE.dispose();
    this.beams.dispose();
    this.slashes.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }
}
