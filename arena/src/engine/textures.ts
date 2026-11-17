/**
 * TEXTURE — port nguyên văn từ 7 dự án gốc.
 *
 * Mỗi dự án vẽ texture hạt bằng canvas 2D với hình dạng rất riêng: trái tim
 * bezier của Hancock, mảnh sắt vụn của Kid, sợi chỉ của Doflamingo, màn hắc
 * ám của Imu, tia sáng của Kizaru, chấm truyện tranh của Luffy, kiếm khí của
 * Zoro. Dùng sprite tròn chung chung sẽ làm mọi nhân vật trông giống nhau —
 * nên texture phải chép từng đường vẽ.
 *
 * Nguồn:
 *   boa-hancock  src/game/textures.ts   (makeHeartTexture, heartPath, makeSparkTexture)
 *   captain-kid  src/game/FX.ts         (createRadialGradient shard)
 *   doflamingo   src/engine/fx/Particles.ts
 *   imu          src/engine/textures.ts
 *   kizaru       src/game/gfx.ts
 *   luffy        src/game/effects.ts
 *   zoro         src/engine/vfxSystem.ts
 */

import * as THREE from 'three';
import type { CharId } from '../data/roster';

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d')!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------- boa-hancock (nguyên văn) */

/** characters/boa-hancock/src/game/textures.ts — heartPath chép nguyên văn */
export function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.35);
  ctx.bezierCurveTo(cx - s * 0.05, cy + s * 0.28, cx - s * 0.5, cy + s * 0.02, cx - s * 0.5, cy - s * 0.18);
  ctx.bezierCurveTo(cx - s * 0.5, cy - s * 0.42, cx - s * 0.18, cy - s * 0.5, cx, cy - s * 0.26);
  ctx.bezierCurveTo(cx + s * 0.18, cy - s * 0.5, cx + s * 0.5, cy - s * 0.42, cx + s * 0.5, cy - s * 0.18);
  ctx.bezierCurveTo(cx + s * 0.5, cy + s * 0.02, cx + s * 0.05, cy + s * 0.28, cx, cy + s * 0.35);
  ctx.closePath();
}

export const makeHeartTexture = () =>
  canvasTex(128, (c, s) => {
    c.shadowColor = 'rgba(255,255,255,0.9)';
    c.shadowBlur = s * 0.12;
    const g = c.createRadialGradient(s / 2, s * 0.42, 0, s / 2, s / 2, s * 0.5);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, '#ffffff');
    g.addColorStop(1, '#dddddd');
    c.fillStyle = g;
    heartPath(c, s / 2, s / 2 + s * 0.04, s * 0.78);
    c.fill();
  });

/** characters/boa-hancock/src/game/textures.ts — makeSparkTexture (rút gọn phần sao) */
export const makeSparkTexture = () =>
  canvasTex(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [w, h] of [[s, s * 0.04], [s * 0.04, s]]) {
      c.fillRect(s / 2 - w / 2, s / 2 - h / 2, w, h);
    }
  });

/* ------------------------------------------------ captain-kid (mảnh sắt vụn) */

/**
 * characters/captain-kid/src/game/FX.ts — texture hạt dạng mảnh vỡ.
 * Bản gốc dùng radial gradient cứng ở giữa 64,64 bán kính 64.
 */
export const makeScrapTexture = () =>
  canvasTex(128, (c, s) => {
    const gr = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(210,190,255,0.85)');
    gr.addColorStop(0.75, 'rgba(120,90,190,0.35)');
    gr.addColorStop(1, 'rgba(90,60,150,0)');
    c.fillStyle = gr;
    // mảnh vỡ vuông vắn, không phải hình tròn — đúng chất sắt vụn
    c.beginPath();
    c.moveTo(s * 0.5, s * 0.08);
    c.lineTo(s * 0.72, s * 0.42);
    c.lineTo(s * 0.62, s * 0.9);
    c.lineTo(s * 0.34, s * 0.78);
    c.lineTo(s * 0.24, s * 0.36);
    c.closePath();
    c.fill();
  });

/* ---------------------------------------------- doflamingo (sợi chỉ) */

/**
 * characters/doflamingo/src/engine/fx/Particles.ts — hạt là sợi chỉ mảnh,
 * vẽ thành vệt dài chứ không phải chấm.
 */
export const makeStringTexture = () =>
  canvasTex(128, (c, s) => {
    const gr = c.createLinearGradient(0, 0, s, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.15, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.85, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(s * 0.06, s * 0.47, s * 0.88, s * 0.06);
  });

/* --------------------------------------------------- imu (màn hắc ám) */

/**
 * characters/imu/src/engine/textures.ts — hạt khói đen, tâm đặc rìa tan,
 * cộng thêm lớp mask radial để tan mềm.
 */
export const makeVoidTexture = () =>
  canvasTex(128, (c, s) => {
    const base = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    base.addColorStop(0, 'rgba(255,255,255,0.95)');
    base.addColorStop(0.35, 'rgba(180,140,255,0.5)');
    base.addColorStop(0.7, 'rgba(70,30,120,0.2)');
    base.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    // mask radial mềm — đúng như gốc
    const mask = c.createRadialGradient(s / 2, s / 2, s * 0.15, s / 2, s / 2, s / 2);
    mask.addColorStop(0, 'rgba(255,255,255,1)');
    mask.addColorStop(1, 'rgba(255,255,255,0)');
    c.globalCompositeOperation = 'destination-in';
    c.fillStyle = mask;
    c.fillRect(0, 0, s, s);
  });

/* -------------------------------------------------- kizaru (tia sáng) */

/**
 * characters/kizaru/src/game/gfx.ts — hạt ánh sáng là vệt dài có lõi sáng,
 * dùng gradient dọc.
 */
export const makeLightTexture = () =>
  canvasTex(128, (c, s) => {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.4, 'rgba(255,248,200,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,248,200,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(s * 0.44, 0, s * 0.12, s);
    // lõi sáng tròn ở giữa
    const core = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.22);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(1, 'rgba(255,240,180,0)');
    c.fillStyle = core;
    c.fillRect(0, 0, s, s);
  });

/* ------------------------------------------------- luffy (chấm truyện tranh) */

/**
 * characters/luffy/src/game/effects.ts — hạt là chấm halftone truyện tranh,
 * viền đậm tâm trong.
 */
export const makeRubberTexture = () =>
  canvasTex(128, (c, s) => {
    const grd = c.createRadialGradient(s / 2, s / 2, s * 0.06, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.86, 'rgba(255,255,255,0.25)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grd;
    c.beginPath();
    c.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
    c.fill();
    // vành ngoài đậm — chất mực in
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = s * 0.045;
    c.beginPath();
    c.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
    c.stroke();
  });

/* --------------------------------------------------- zoro (kiếm khí) */

/**
 * characters/zoro/src/engine/vfxSystem.ts — hạt là vệt chém hình lưỡi liềm
 * mảnh, nhọn hai đầu.
 */
export const makeBladeTexture = () =>
  canvasTex(128, (c, s) => {
    c.translate(s / 2, s / 2);
    c.rotate(-0.35);
    const grd = c.createLinearGradient(-s * 0.46, 0, s * 0.46, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.3, 'rgba(220,255,240,0.95)');
    grd.addColorStop(0.5, 'rgba(255,255,255,1)');
    grd.addColorStop(0.7, 'rgba(220,255,240,0.95)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grd;
    c.beginPath();
    c.ellipse(0, 0, s * 0.46, s * 0.045, 0, 0, Math.PI * 2);
    c.fill();
  });

/* ------------------------------------------------------------ registry */

export interface TextureSet {
  primary: THREE.Texture;
  spark: THREE.Texture;
}

const CACHE = new Map<CharId, TextureSet>();

/** Bộ texture của từng nhân vật — dựng một lần, dùng lại */
export function texturesFor(id: CharId): TextureSet {
  let t = CACHE.get(id);
  if (t) return t;
  t = {
    primary:
      id === 'boa-hancock' ? makeHeartTexture()
      : id === 'captain-kid' ? makeScrapTexture()
      : id === 'doflamingo' ? makeStringTexture()
      : id === 'imu' ? makeVoidTexture()
      : id === 'kizaru' ? makeLightTexture()
      : id === 'luffy' ? makeRubberTexture()
      : makeBladeTexture(),
    spark: id === 'boa-hancock' ? makeSparkTexture() : makeSparkTexture(),
  };
  CACHE.set(id, t);
  return t;
}
