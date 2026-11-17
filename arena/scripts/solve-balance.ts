/**
 * GIẢI HỆ SỐ CÂN BẰNG
 *
 *   npx tsx scripts/solve-balance.ts
 *
 * Vì sao cần script riêng thay vì một công thức: sát thương thực tế của một
 * nhân vật phụ thuộc vào cách bot chọn chiêu, tầm với từng chiêu, nhịp khoá
 * niệm chiêu, và cả đối thủ. Không có công thức khép kín nào tính đúng.
 *
 * Cách duy nhất chắc chắn đúng: ĐO bằng chính mô phỏng trận đấu mà bài kiểm
 * chứng dùng (`src/engine/sim.ts`), rồi chỉnh hệ số K cho tới khi mọi nhân
 * vật gây ra lượng sát thương như nhau.
 *
 * Thuật toán: lặp điểm bất định
 *      K_mới = K_cũ × (trung bình / đo_được)
 * hội tụ sau ~4 vòng vì quan hệ gần như tuyến tính.
 *
 * Kết quả được in ra dạng khối `SOLVED_K` để dán vào `src/engine/combat.ts`.
 */

import { simulate } from '../src/engine/sim';
import { CHARACTERS, type CharId } from '../src/data/roster';
import { applyK } from '../src/engine/combat';

/* --------------------------------------------------------------- phép đo */

const SEEDS = 40;

/**
 * Đo "thế trận" của từng nhân vật, đấu vòng tròn với tất cả nhân vật khác.
 *
 * Chỉ số dùng để cân bằng KHÔNG phải tổng sát thương, mà là **tỉ lệ sát
 * thương gây ra / sát thương nhận vào**. Lý do: trận đấu là một cuộc đua
 * thời gian — ai hạ đối thủ trước thì thắng, nên một nhân vật "burst" có
 * thể thắng dù tổng sát thương thấp hơn. Tỉ lệ gây/nhận phản ánh đúng
 * thế trận đó, và trung hoà luôn bảng khắc chế nhờ đấu vòng tròn.
 *
 * Trả về log của tỉ lệ (0 = cân bằng).
 */
function measureAll(K: Partial<Record<CharId, number>>): Record<string, number> {
  applyK(K);
  const acc: Record<string, { n: number; logRatio: number }> = {};
  for (const c of CHARACTERS) acc[c.id] = { n: 0, logRatio: 0 };

  for (const a of CHARACTERS) {
    for (const b of CHARACTERS) {
      if (a.id === b.id) continue;
      for (let s = 1; s <= SEEDS; s++) {
        const r = simulate(a.id, b.id, s * 7919);
        const ra = Math.log(Math.max(1, r.dmgA) / Math.max(1, r.dmgB));
        acc[a.id].logRatio += ra;
        acc[a.id].n++;
        acc[b.id].logRatio -= ra;
        acc[b.id].n++;
      }
    }
  }

  const out: Record<string, number> = {};
  for (const c of CHARACTERS) out[c.id] = acc[c.id].logRatio / acc[c.id].n;
  return out;
}

/* ------------------------------------------------------- lặp điểm bất định */

const K: Partial<Record<CharId, number>> = {};
for (const c of CHARACTERS) K[c.id] = 1;

console.log('Lặp để tìm hệ số cân bằng (mỗi vòng đo lại toàn bộ vòng tròn):\n');

for (let iter = 0; iter < 30; iter++) {
  const measured = measureAll(K);
  const vals = Object.values(measured);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

  process.stdout.write(`  vòng ${String(iter + 1).padStart(2)}  `);
  for (const c of CHARACTERS) {
    const dev = measured[c.id] - avg; // > 0 = đang mạnh hơn mức trung bình
    process.stdout.write(`${c.shortName.slice(0, 6)}=${String(Math.round(dev * 100)).padStart(4)} `);
    // dev là log-tỉ lệ ⇒ hệ số hiệu chỉnh chính là exp(-dev)
    K[c.id] = (K[c.id] ?? 1) * Math.exp(-dev);
  }
  console.log('');
}

/* --------------------------------------------------------------- kết quả */

const final = measureAll(K);
const vals = Object.values(final);

console.log('\n--- Thế trận sau khi cân bằng (log tỉ lệ gây/nhận, 0 = cân bằng) ---\n');
for (const c of CHARACTERS) {
  const dev = final[c.id];
  const n = Math.round(Math.abs(dev) * 100);
  const bar = dev > 0 ? ' '.repeat(20) + '░'.repeat(Math.min(20, n)) : '░'.repeat(Math.max(0, 20 - Math.min(20, n))) + '█'.repeat(Math.min(20, n));
  console.log(`  ${c.shortName.padEnd(13)} ${String(Math.round(dev * 100)).padStart(4)}  ${bar}`);
}
console.log(`\n  lệch chuẩn: ${Math.sqrt(vals.reduce((a, v) => a + v * v, 0) / vals.length).toFixed(3)}`);

console.log('\n--- Dán khối này vào src/engine/combat.ts ---\n');
console.log('const SOLVED_K: Partial<Record<CharId, number>> = {');
for (const c of CHARACTERS) {
  console.log(`  '${c.id}': ${(K[c.id] ?? 1).toFixed(5)},`);
}
console.log('};\n');
