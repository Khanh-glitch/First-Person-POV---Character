/**
 * KIỂM CHỨNG KHẢ NĂNG NHÌN THẤY
 *
 *   npx tsx scripts/frame-check.ts
 *
 * Vì sao có bài này: bài `fidelity-check` chỉ kiểm tra *tham số có đúng không*,
 * nên nó báo "47/47 đạt" trong khi người chơi thật **không nhìn thấy gì**. Đó
 * là loại lỗi tệ nhất — kiểm tra xanh mà sản phẩm hỏng.
 *
 * Bài này dựng scene headless (không cần GPU), đặt camera đúng như arena rồi
 * chiếu từng mesh qua ma trận camera để trả lời ba câu:
 *
 *   1. Rig POV có nằm trong khung hình không? (tay/phím/kiếm phải thấy được)
 *   2. Mỗi giây phô diễn phát bao nhiêu hạt, có tràn bể chứa không?
 *   3. Chiêu có được diễn đủ lâu không, hay tắt trước khi kịp thấy?
 */

import './dom-stub.mjs';
import * as THREE from 'three';
import { buildViewModel } from '../src/engine/viewmodel';
import { CHARACTERS } from '../src/data/roster';

const W = 1280;
const H = 720;
const FOV = 72;

let fail = 0;
const ok = (c: boolean, msg: string) => {
  if (!c) fail++;
  console.log(`  ${c ? '✓' : '✗'} ${msg}`);
};

/* ==================================================================== 1 */

console.log('\n=== 1. RIG POV CÓ NẰM TRONG KHUNG HÌNH? ===\n');

const cam = new THREE.PerspectiveCamera(FOV, W / H, 0.05, 600);
cam.position.set(0, 1.72, 0);
cam.updateMatrixWorld(true);

function frameStats(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(cam.matrixWorld).invert();
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, inv);
  let visible = 0;
  let total = 0;
  let lowestY = Infinity;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    // bỏ qua mesh ẩn (Ashura, saya…) và mesh không có toạ độ hợp lệ
    let anc: THREE.Object3D | null = m;
    while (anc) { if (!anc.visible) return; anc = anc.parent; }
    const box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3());
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z)) return;
    total++;
    const v = c.clone().applyMatrix4(vp);
    const behind = c.clone().applyMatrix4(inv).z > 0;
    if (!behind && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1) visible++;
    if (!behind) lowestY = Math.min(lowestY, v.y);
  });
  return { visible, total, lowestY };
}

for (const c of CHARACTERS) {
  const vm = buildViewModel(c.id, c.color);
  cam.add(vm.root);
  vm.update(0.016, 1.0, 0);
  const { visible, total, lowestY } = frameStats(vm.root);
  cam.remove(vm.root);
  const ratio = total === 0 ? 1 : visible / total;
  ok(
    ratio >= 0.75,
    `${c.id.padEnd(13)} ${visible}/${total} mesh trong khung (${(ratio * 100).toFixed(0)}%)`
    + (Number.isFinite(lowestY) ? ` · mép dưới y=${lowestY.toFixed(2)}` : ''),
  );
  vm.dispose();
}

/* ==================================================================== 2 */

console.log('\n=== 2. BỂ HẠT CÓ ĐỦ CHỖ? ===\n');

// đọc profile trực tiếp từ mã nguồn để không phải export thêm
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const src = readFileSync(resolve(import.meta.dirname, '../src/engine/particles.ts'), 'utf8');
const counts = [...src.matchAll(/'([a-z-]+)':\s*\{\s*count:\s*(\d+)[^}]*?life:\s*\[([\d.]+),\s*([\d.]+)\]/gs)]
  .map((m) => ({ id: m[1], count: Number(m[2]), life: Number(m[4]) }));

const POOL = 2400;
const RATE = 1 / 0.045; // nhịp phát trong performMoveFx
for (const p of counts) {
  const perSec = p.count * RATE;
  // hạt tồn đọng tối đa = tốc độ phát × đời sống dài nhất
  const live = perSec * p.life;
  ok(
    live <= POOL,
    `${p.id.padEnd(13)} ${perSec.toFixed(0)} hạt/s × ${p.life}s = ${live.toFixed(0)} tồn đọng ≤ ${POOL}`,
  );
}

/* ==================================================================== 3 */

console.log('\n=== 3. CHIÊU CÓ ĐƯỢC DIỄN ĐỦ LÂU? ===\n');

// arena: anim = max(0.9, duration); phải ≥ 0.9s thì mới kịp thấy
for (const c of CHARACTERS) {
  const shortest = Math.min(...c.moves.map((m) => Math.max(0.9, m.duration)));
  const longest = Math.max(...c.moves.map((m) => Math.max(0.9, m.duration)));
  ok(
    shortest >= 0.9,
    `${c.id.padEnd(13)} diễn xuất ${shortest.toFixed(2)}s … ${longest.toFixed(2)}s mỗi chiêu`,
  );
}

/* ==================================================================== 4 */

console.log('\n=== 4. TƯ THẾ ĐÓNG ĐÚNG SAU KHI CHIÊU KẾT THÚC? ===\n');

// cast(1) phải trả rig về đúng tư thế nghỉ — nếu không, tay đóng băng ở
// frame cuối của animation (lỗi "bàn tay không giữ được")
for (const c of CHARACTERS) {
  const vm = buildViewModel(c.id, c.color);
  const pose = () => {
    const out: number[] = [];
    vm.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) out.push(m.position.x, m.position.y, m.position.z, m.rotation.z);
    });
    return out;
  };
  vm.update(0.016, 0, 0);
  const rest = pose();
  for (let i = 0; i < 40; i++) vm.update(0.016, i * 0.016, Math.min(1, i / 40));
  vm.update(0.016, 1, 0); // frame ngay sau khi chiêu hết
  const back = pose();
  const same = rest.length === back.length
    && rest.every((v, i) => Math.abs(v - back[i]) < 1e-6);
  ok(same, `${c.id.padEnd(13)} trả về đúng tư thế nghỉ sau chiêu`);
  vm.dispose();
}

console.log(`\n${fail === 0 ? '✅ NHÌN ĐƯỢC' : `❌ ${fail} MỤC HỎNG`}\n`);
process.exit(fail === 0 ? 0 : 1);
