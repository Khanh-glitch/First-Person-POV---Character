import * as THREE from "three";

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d")!;
  draw(ctx, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

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
    c.shadowColor = "rgba(255,255,255,0.9)";
    c.shadowBlur = s * 0.12;
    const g = c.createRadialGradient(s / 2, s * 0.42, 0, s / 2, s / 2, s * 0.5);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.45, "#ffffff");
    g.addColorStop(1, "#dddddd");
    c.fillStyle = g;
    heartPath(c, s / 2, s / 2 + s * 0.04, s * 0.78);
    c.fill();
  });

export const makeGlowTexture = () =>
  canvasTex(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.2, "rgba(255,255,255,0.75)");
    g.addColorStop(0.5, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });

export const makeSparkTexture = () =>
  canvasTex(128, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.15, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.globalCompositeOperation = "lighter";
    c.fillStyle = "rgba(255,255,255,0.9)";
    for (const [w, h] of [
      [s, s * 0.04],
      [s * 0.04, s],
    ]) {
      const lg = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      lg.addColorStop(0, "rgba(255,255,255,1)");
      lg.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = lg;
      c.fillRect(s / 2 - w / 2, s / 2 - h / 2, w, h);
    }
  });

export const makePetalTexture = () =>
  canvasTex(64, (c, s) => {
    c.translate(s / 2, s / 2);
    c.rotate(0.6);
    const g = c.createLinearGradient(-s / 2, 0, s / 2, 0);
    g.addColorStop(0, "#ffd1e3");
    g.addColorStop(1, "#ff7fb0");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, s * 0.42, s * 0.22, 0, 0, Math.PI * 2);
    c.fill();
    c.globalCompositeOperation = "destination-out";
    c.beginPath();
    c.arc(s * 0.42, 0, s * 0.08, 0, Math.PI * 2);
    c.fill();
  });

export const makeRingTexture = () =>
  canvasTex(256, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.7, "rgba(255,255,255,0.15)");
    g.addColorStop(0.9, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });

export function heartShape(size = 1) {
  const s = size;
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.35 * s);
  sh.bezierCurveTo(-0.05 * s, -0.28 * s, -0.5 * s, -0.02 * s, -0.5 * s, 0.18 * s);
  sh.bezierCurveTo(-0.5 * s, 0.42 * s, -0.18 * s, 0.5 * s, 0, 0.26 * s);
  sh.bezierCurveTo(0.18 * s, 0.5 * s, 0.5 * s, 0.42 * s, 0.5 * s, 0.18 * s);
  sh.bezierCurveTo(0.5 * s, -0.02 * s, 0.05 * s, -0.28 * s, 0, -0.35 * s);
  return sh;
}

export function heartGeometry(size = 1, depth = 0.12) {
  const g = new THREE.ExtrudeGeometry(heartShape(size), {
    depth: depth * size,
    bevelEnabled: true,
    bevelThickness: 0.06 * size,
    bevelSize: 0.05 * size,
    bevelSegments: 4,
    curveSegments: 18,
  });
  g.center();
  return g;
}
