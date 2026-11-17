import * as THREE from "three";

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return c;
}

function toTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** organic soft puff used for fire + smoke particles */
export function puffTexture(seed = 1) {
  const s = 128;
  const c = canvas(s);
  const g = c.getContext("2d")!;
  let r = seed * 9301;
  const rnd = () => {
    r = (r * 9301 + 49297) % 233280;
    return r / 233280;
  };
  g.clearRect(0, 0, s, s);
  const base = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  base.addColorStop(0, "rgba(255,255,255,0.9)");
  base.addColorStop(0.45, "rgba(255,255,255,0.45)");
  base.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * s * 0.22;
    const x = s / 2 + Math.cos(a) * d;
    const y = s / 2 + Math.sin(a) * d;
    const rad = s * (0.12 + rnd() * 0.17);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(255,255,255,${0.25 + rnd() * 0.3})`);
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }
  // fade edges hard so nothing clips the quad
  g.globalCompositeOperation = "destination-in";
  const mask = g.createRadialGradient(s / 2, s / 2, s * 0.15, s / 2, s / 2, s / 2);
  mask.addColorStop(0, "rgba(0,0,0,1)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = mask;
  g.fillRect(0, 0, s, s);
  return toTex(c);
}

/** crisp glowing dot for sparks/embers */
export function dotTexture() {
  const s = 64;
  const c = canvas(s);
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.2, "rgba(255,255,255,0.85)");
  gr.addColorStop(0.5, "rgba(255,255,255,0.18)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
  return toTex(c);
}

const RUNES = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ";

function ringText(g: CanvasRenderingContext2D, cx: number, cy: number, radius: number, size: number, count: number, offset = 0) {
  g.save();
  g.font = `${size}px serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + offset;
    g.save();
    g.translate(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
    g.rotate(a + Math.PI / 2);
    g.fillText(RUNES[(i * 7 + 3) % RUNES.length], 0, 0);
    g.restore();
  }
  g.restore();
}

function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, points: number, skip: number) {
  g.beginPath();
  for (let i = 0; i <= points; i++) {
    const a = ((i * skip) / points) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.stroke();
}

/** large ritual circle: rings, runes, pentagram, ticks */
export function magicCircleTexture(variant = 0) {
  const s = 1024;
  const c = canvas(s);
  const g = c.getContext("2d")!;
  const cx = s / 2;
  const cy = s / 2;
  g.clearRect(0, 0, s, s);
  g.strokeStyle = "#fff";
  g.fillStyle = "#fff";
  g.lineCap = "round";
  g.shadowColor = "#fff";
  g.shadowBlur = 8;

  const ring = (r: number, w: number) => {
    g.lineWidth = w;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  };
  ring(490, 6);
  ring(470, 2);
  ring(400, 3);
  ring(385, 1.5);
  ring(300, 4);
  ring(180, 3);
  ring(60, 3);

  // tick marks
  g.lineWidth = 2;
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const l = i % 5 === 0 ? 24 : 10;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 470, cy + Math.sin(a) * 470);
    g.lineTo(cx + Math.cos(a) * (470 - l), cy + Math.sin(a) * (470 - l));
    g.stroke();
  }

  ringText(g, cx, cy, 435, 36, 36, variant);
  ringText(g, cx, cy, 342, 30, 28, variant * 2);

  g.lineWidth = 3;
  if (variant === 0) {
    star(g, cx, cy, 300, 5, 2);
    star(g, cx, cy, 180, 6, 2);
    // hexagon inside
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.lineTo(cx + Math.cos(a) * 180, cy + Math.sin(a) * 180);
    }
    g.closePath();
    g.stroke();
  } else {
    star(g, cx, cy, 300, 7, 3);
    star(g, cx, cy, 190, 8, 3);
    g.beginPath();
    g.rect(cx - 130, cy - 130, 260, 260);
    g.stroke();
    g.save();
    g.translate(cx, cy);
    g.rotate(Math.PI / 4);
    g.beginPath();
    g.rect(-130, -130, 260, 260);
    g.stroke();
    g.restore();
  }

  // central eye
  g.beginPath();
  g.moveTo(cx - 70, cy);
  g.quadraticCurveTo(cx, cy - 55, cx + 70, cy);
  g.quadraticCurveTo(cx, cy + 55, cx - 70, cy);
  g.stroke();
  g.beginPath();
  g.arc(cx, cy, 18, 0, Math.PI * 2);
  g.fill();

  // nodes at star tips
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.beginPath();
    g.arc(cx + Math.cos(a) * 300, cy + Math.sin(a) * 300, 14, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(cx + Math.cos(a) * 300, cy + Math.sin(a) * 300, 5, 0, Math.PI * 2);
    g.fill();
  }
  return toTex(c);
}

/** floor mosaic for the Pangaea Castle balcony */
export function floorTexture() {
  const s = 1024;
  const c = canvas(s);
  const g = c.getContext("2d")!;
  g.fillStyle = "#07060a";
  g.fillRect(0, 0, s, s);
  const n = 8;
  const t = s / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = (x + y) % 2 === 0 ? 14 : 8;
      g.fillStyle = `rgb(${v + 4},${v},${v + 8})`;
      g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
    }
  }
  g.strokeStyle = "#a8812f";
  g.lineWidth = 3;
  g.shadowColor = "#d9a43a";
  g.shadowBlur = 4;
  for (let i = 0; i <= n; i++) {
    g.beginPath();
    g.moveTo(i * t, 0);
    g.lineTo(i * t, s);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * t);
    g.lineTo(s, i * t);
    g.stroke();
  }
  g.strokeStyle = "#6e1626";
  g.lineWidth = 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cx = x * t + t / 2;
      const cy = y * t + t / 2;
      g.beginPath();
      g.moveTo(cx, cy - t * 0.32);
      g.lineTo(cx + t * 0.32, cy);
      g.lineTo(cx, cy + t * 0.32);
      g.lineTo(cx - t * 0.32, cy);
      g.closePath();
      g.stroke();
    }
  }
  const tex = toTex(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
}

/** pentagram grimoire cover */
export function grimoireTexture() {
  const s = 512;
  const c = canvas(s);
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0610";
  g.fillRect(0, 0, s, s);
  g.strokeStyle = "#b08a3a";
  g.lineWidth = 6;
  g.strokeRect(14, 14, s - 28, s - 28);
  g.lineWidth = 2;
  g.strokeRect(30, 30, s - 60, s - 60);
  g.strokeStyle = "#ff3b5c";
  g.shadowColor = "#ff3b5c";
  g.shadowBlur = 14;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(s / 2, s / 2, 150, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  g.beginPath();
  g.arc(s / 2, s / 2, 175, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 5;
  star(g, s / 2, s / 2, 150, 5, 2);
  g.fillStyle = "#ff3b5c";
  ringText(g, s / 2, s / 2, 205, 22, 24);
  return toTex(c);
}

/** jagged crack used for sky tears */
export function noiseTexture() {
  const s = 256;
  const c = canvas(s);
  const g = c.getContext("2d")!;
  const img = g.createImageData(s, s);
  for (let i = 0; i < s * s; i++) {
    const v = Math.random() * 255;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
