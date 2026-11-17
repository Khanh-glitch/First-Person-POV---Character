/**
 * GIẢI BẢNG KHẮC CHẾ
 *
 *   npx tsx scripts/solve-matchup.ts
 *
 * Hệ số K toàn cục chỉ cân được "sức mạnh tổng" của từng nhân vật. Nhưng
 * người chơi thực tế quan tâm tới TỪNG CẶP: Kid đấu Zoro ai thắng? Vì mỗi
 * nhân vật có hình dạng bộ chiêu khác nhau (tầm, nhịp, phân bố sát thương),
 * một cặp có thể lệch hẳn dù tổng thể cân.
 *
 * Bài toán này có đúng 21 ẩn số (số cặp) và 21 mục tiêu (mỗi cặp ~50/50),
 * nên giải được bằng lặp điểm bất định:
 *
 *      factor(A→B) ← factor(A→B) · exp(-(winRate_A - 0.5) · k)
 *      factor(B→A) ← 1 / factor(A→B)          ← giữ tính đối xứng nghịch
 *
 * Việc giữ factor(B→A) = 1/factor(A→B) đảm bảo bảng không thiên vị hệ
 * thống: cái A được thì B mất đúng chừng ấy.
 */

import { simulate } from '../src/engine/sim';
import { CHARACTERS, type CharId } from '../src/data/roster';
import { setMatchup, getMatchup } from '../src/engine/combat';

/* ------------------------------------------------------- khởi tạo bảng */

const factors = new Map<string, number>();
const pairs: [CharId, CharId][] = [];
for (let i = 0; i < CHARACTERS.length; i++) {
  for (let j = i + 1; j < CHARACTERS.length; j++) {
    const a = CHARACTERS[i].id;
    const b = CHARACTERS[j].id;
    pairs.push([a, b]);
    factors.set(`${a}|${b}`, 1);
  }
}

function push(): void {
  const table: Partial<Record<CharId, Partial<Record<CharId, number>>>> = {};
  for (const [a, b] of pairs) {
    const f = factors.get(`${a}|${b}`)!;
    (table[a] ??= {})[b] = f;
    (table[b] ??= {})[a] = 1 / f;
    setMatchup(a, b, f);
    setMatchup(b, a, 1 / f);
  }
  void getMatchup;
}

/* -------------------------------------------------- lặp điểm bất định */

/**
 * Giải bằng PHƯƠNG PHÁP ẢNH HƯỞNG TUYẾN TÍNH.
 *
 * Tỉ lệ thắng chỉ có 40 mẫu nên bị kẹp ở 0%/100% và không cho biết đang lệch
 * bao xa. Thay vào đó, với mỗi cặp ta đo:
 *   - log tỉ lệ sát thương gây/nhận tại factor = 1   → độ lệch ban đầu
 *   - độ nhạy: thay đổi của đại lượng đó khi factor ×2 → hệ số khuếch đại
 * rồi nhảy thẳng tới factor cần thiết:
 *
 *      factor = 2 ^ ( -logRatio / sensitivity )
 *
 * Vì log sát thương gần như tuyến tính theo log factor, một bước là đủ;
 * lặp 3 vòng để sửa sai số còn lại (do nhiễu và do hiệu ứng bão hoà).
 */

function probe(a: CharId, b: CharId, seeds = 24): { logRatio: number; winRate: number } {
  let dA = 0;
  let dB = 0;
  let w = 0;
  let decided = 0;
  for (let s = 1; s <= seeds; s++) {
    const r = simulate(a, b, s * 7919);
    dA += r.dmgA;
    dB += r.dmgB;
    w += r.aWins;
    decided += r.aWins + r.bWins;
  }
  return {
    logRatio: Math.log(Math.max(1, dA) / Math.max(1, dB)),
    winRate: decided ? w / decided : 0.5,
  };
}

console.log('Giải bảng khắc chế để mọi cặp về gần 50/50:\n');

for (let iter = 0; iter < 4; iter++) {
  let worst = 0;
  let sum = 0;

  for (const [a, b] of pairs) {
    const key = `${a}|${b}`;
    factors.set(key, 1);
    push();

    const base = probe(a, b);
    factors.set(key, 2);
    push();
    const doubled = probe(a, b);

    // log tỉ lệ thay đổi bao nhiêu khi factor ×2
    const sensitivity = (doubled.logRatio - base.logRatio) / Math.log(2);
    const f = Math.pow(2, -base.logRatio / Math.max(0.35, sensitivity));

    factors.set(key, Math.min(9, Math.max(1 / 9, f)));
    push();

    const after = probe(a, b);
    const dev = Math.abs(after.winRate - 0.5);
    worst = Math.max(worst, dev);
    sum += dev;
  }

  console.log(
    `  vòng ${iter + 1}  lệch lớn nhất ${(worst * 100).toFixed(1)} điểm`
    + `  trung bình ${((sum / pairs.length) * 100).toFixed(1)} điểm`,
  );
}

/* --------------------------------------------------------------- kết quả */

push();
console.log('\n--- Ma trận sau khi giải ---\n');
for (const [a, b] of pairs) {
  const f = factors.get(`${a}|${b}`)!;
  const wr = probe(a, b, 80).winRate;
  console.log(
    `  ${a.padEnd(14)} vs ${b.padEnd(14)}  ${(wr * 100).toFixed(0).padStart(3)}%`
    + `  hệ số ${f.toFixed(3)}`,
  );
}

console.log('\n--- Dán khối này vào src/engine/combat.ts ---\n');
const table: Partial<Record<CharId, Partial<Record<CharId, number>>>> = {};
for (const [a, b] of pairs) {
  const f = factors.get(`${a}|${b}`)!;
  (table[a] ??= {})[b] = f;
  (table[b] ??= {})[a] = 1 / f;
}
console.log('export const MATCHUP: Record<CharId, Partial<Record<CharId, number>>> = {');
for (const c of CHARACTERS) {
  console.log(`  '${c.id}': {`);
  for (const [k, v] of Object.entries(table[c.id] ?? {})) {
    console.log(`    '${k}': ${(v as number).toFixed(3)},`);
  }
  console.log('  },');
}
console.log('};\n');
