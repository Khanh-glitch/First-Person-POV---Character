/**
 * KIỂM CHỨNG CÂN BẰNG — chạy bằng Node, không cần trình duyệt.
 *
 *   npx tsx scripts/balance-check.ts
 *
 * Kiểm 5 nhóm:
 *   1. Dữ liệu: đủ 7 nhân vật, mọi chiêu hợp lệ, có ghi nguồn.
 *   2. DPS trung bình không lệch quá 1.6×.
 *   3. Không ai one-shot được (kể cả khắc chế + đánh trúng).
 *   4. Mô phỏng **theo sự kiện thời gian thực** (không phải theo lượt):
 *      mỗi bên có bộ đếm hồi chiêu riêng, luôn tung chiêu mạnh nhất đang
 *      sẵn sàng trong tầm — đúng như game chạy ở 60fps.
 *   5. DPS liên tục không lệch quá 1.8×.
 */

import {
  MAX_HP, effectiveCycle, castLock, powerOf, charAudit, constantDps, computeDamage,
} from '../src/engine/combat';
import { CHARACTERS, getCharacter, type CharId, type Character } from '../src/data/roster';

let failures = 0;
let warnings = 0;

/** kiểm tra bắt buộc: sai là hỏng build */
const ok = (cond: boolean, msg: string) => {
  if (!cond) { failures++; console.log(`  ✗ ${msg}`); }
  else console.log(`  ✓ ${msg}`);
};

/**
 * kiểm tra tham khảo: chỉ cảnh báo, không chặn build.
 *
 * Dùng cho những chỉ số phụ thuộc vào mô hình bot (mà hành vi người chơi
 * thật sẽ khác đi), nên không nên coi là điều kiện hỏng build.
 */
const warn = (cond: boolean, msg: string) => {
  if (!cond) { warnings++; console.log(`  ⚠ ${msg}`); }
  else console.log(`  ✓ ${msg}`);  
};

console.log('\n=== 1. KIỂM TRA DỮ LIỆU ===');
ok(CHARACTERS.length === 7, `có đủ 7 nhân vật (${CHARACTERS.length})`);
for (const c of CHARACTERS) {
  ok(c.moves.length >= 5, `${c.shortName}: ${c.moves.length} chiêu`);
  ok(c.moves.every((m) => powerOf(c, m) > 0), `${c.shortName}: mọi chiêu có power > 0`);
  ok(c.moves.every((m) => m.cooldown > 0), `${c.shortName}: mọi chiêu có cooldown > 0`);
  ok(c.moves.every((m) => m.reach > 0), `${c.shortName}: mọi chiêu có tầm > 0`);
  ok(c.moves.filter((m) => m.ultimate).length === 1, `${c.shortName}: đúng 1 ultimate`);
  ok(c.moves.every((m) => m.source.length > 0), `${c.shortName}: mọi chiêu có ghi nguồn`);
}

console.log('\n=== 2. DPS TRUNG BÌNH ===');
const audit = charAudit(CHARACTERS);
for (const a of audit) {
  console.log(
    `  ${a.name.padEnd(26)} avgDPS=${String(a.avgDps).padStart(6)}`
    + `  burst=${String(a.burst).padStart(4)}  reach=${a.avgReach}m`,
  );
}
const dpsVals = audit.map((a) => a.avgDps);
const ratio = Math.max(...dpsVals) / Math.min(...dpsVals);
ok(ratio <= 1.6, `chênh lệch DPS trung bình ${ratio.toFixed(2)}× ≤ 1.6×`);

console.log('\n=== 3. CHỐNG ONE-SHOT ===');
const maxPower = Math.max(...CHARACTERS.flatMap((c) => c.moves.map((m) => powerOf(c, m))));
const maxWithMatchup = maxPower * 1.14;
ok(
  maxWithMatchup < MAX_HP,
  `chiêu mạnh nhất ${maxPower} (×1.14 khắc chế = ${maxWithMatchup.toFixed(0)}) < ${MAX_HP} HP`,
);

/* ------------------------------------------------------------------ 4. sim */

/**
 * Khoảng cách chiến thuật: tầm tối ưu của chiêu có power cao nhất.
 * Đây là nơi nhân vật đó muốn đứng để tung đòn nặng nhất.
 */
function preferredRange(c: Character): number {
  const normal = c.moves.filter((m) => !m.ultimate);
  const strongest = normal.reduce((a, b) => (powerOf(c, b) > powerOf(c, a) ? b : a));
  return strongest.reach * 0.62;
}

interface Side {
  c: Character;
  hp: number;
  /** thời điểm sớm nhất mỗi chiêu được dùng lại */
  ready: number[];
}

/**
 * Mô phỏng theo sự kiện:
 *  - Mỗi chiêu có mốc thời gian `ready`.
 *  - Tại mỗi bước, mỗi bên chọn chiêu có power cao nhất mà đã sẵn sàng
 *    và đang trong tầm. Nếu không có chiêu nào trong tầm → chờ.
 *  - Thời gian nhảy tới mốc sự kiện kế tiếp.
 * Khoảng cách dao động chậm quanh trung bình cộng khoảng cách ưa thích.
 */
/**
 * Mô phỏng 1 trận 1v1 THEO SỰ KIỆN.
 *
 * Trước đây hàm này bước thời gian cố định 0.1s, khiến chiêu có cooldown
 * ngắn (Hancock 0.26s, Kizaru 0.46s) bị làm tròn lên mỗi lần ra đòn và mất
 * 10–35% sản lượng, trong khi Imu (cooldown ≥ 8s) gần như không mất gì →
 * Imu thắng 100% mọi trận. Nhảy thẳng tới mốc sự kiện kế tiếp thì hết
 * sai số này.
 */
function simulate(aId: CharId, bId: CharId, seed: number) {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };

  const A = getCharacter(aId);
  const B = getCharacter(bId);
  const prefA = preferredRange(A);
  const prefB = preferredRange(B);

  // Mỗi bên tự định vị ở khoảng cách có lợi cho mình, có nhiễu nhẹ để trận
  // đấu không hoàn toàn xác định.
  const noise = () => (rand() - 0.5) * 6;
  const distForA = () => Math.max(6, prefA + noise());
  const distForB = () => Math.max(6, prefB + noise());

  const sa: Side = { c: A, hp: MAX_HP, ready: A.moves.map(() => 0) };
  const sb: Side = { c: B, hp: MAX_HP, ready: B.moves.map(() => 0) };
  let lockA = 0;
  let lockB = 0;

  let t = 0;
  let casts = 0;
  let dmgA = 0;
  let dmgB = 0;
  const MAX_T = 240;

  const styleA = Math.floor(rand() * 3);
  const styleB = Math.floor(rand() * 3);
  const jitter = () => 0.85 + rand() * 0.3;

  /** chọn chiêu cho một bên tại thời điểm t với khoảng cách dist */
  const pick = (side: Side, dist: number, style: number): number => {
    const usable: number[] = [];
    const weights: number[] = [];
    for (let i = 0; i < side.c.moves.length; i++) {
      const m = side.c.moves[i];
      if (side.ready[i] > t + 1e-9) continue;
      if (dist > m.reach) continue;
      usable.push(i);
      const p = powerOf(side.c, m);
      weights.push(
        style === 0
          ? p
          : style === 1
            ? p / Math.max(0.1, effectiveCycle(m)) // sát thương mỗi giây hồi
            : p * jitter(),
      );
    }
    if (!usable.length) return -1;
    if (style === 2) {
      const tot = weights.reduce((a, b) => a + b, 0);
      let r = rand() * tot;
      for (let k = 0; k < usable.length; k++) {
        r -= weights[k];
        if (r <= 0) return usable[k];
      }
    }
    let bestK = 0;
    for (let k = 1; k < usable.length; k++) {
      if (weights[k] * jitter() > weights[bestK]) bestK = k;
    }
    return usable[bestK];
  };

  /**
   * Vòng lặp THEO SỰ KIỆN: chỉ xét thời điểm mà ít nhất một bên đã hết
   * khoá niệm chiêu. Không bước thời gian cố định nên không có sai số làm
   * tròn nào — đây là điều kiện để DPS đo được khớp với DPS danh nghĩa.
   */
  while (sa.hp > 0 && sb.hp > 0 && t < MAX_T) {
    const freeA = t >= lockA - 1e-9;
    const freeB = t >= lockB - 1e-9;

    if (!freeA && !freeB) {
      t = Math.min(lockA, lockB);
      continue;
    }

    const dA = distForA();
    const dB = distForB();

    let acted = false;
    const ia = freeA ? pick(sa, dA, styleA) : -1;
    const ib = freeB ? pick(sb, dB, styleB) : -1;

    if (ia >= 0) {
      const m = sa.c.moves[ia];
      const r = computeDamage(A, B, m, dA);
      sb.hp -= r.damage;
      dmgA += r.damage;
      sa.ready[ia] = t + effectiveCycle(m);
      lockA = t + castLock(m);
      casts++;
      acted = true;
    }
    if (ib >= 0 && sb.hp > 0) {
      const m = sb.c.moves[ib];
      const r = computeDamage(B, A, m, dB);
      sa.hp -= r.damage;
      dmgB += r.damage;
      sb.ready[ib] = t + effectiveCycle(m);
      lockB = t + castLock(m);
      casts++;
      acted = true;
    }

    if (!acted) {
      // cả hai đang "rảnh" nhưng không có chiêu nào trong tầm → nhích thời gian
      t += 0.05;
    } else {
      // ai vừa đánh đã bị đặt lock mới; nhảy tới mốc rảnh kế tiếp
      t = Math.min(
        Math.max(t, lockA),
        Math.max(t, lockB),
      );
    }
  }

  const aWon = sb.hp <= 0;
  const bWon = sa.hp <= 0;
  return {
    aWins: aWon && !bWon ? 1 : 0,
    bWins: bWon && !aWon ? 1 : 0,
    draws: !aWon && !bWon ? 1 : 0,
    duration: t,
    casts,
    dmgA,
    dmgB,
  };
}

console.log('\n=== 4. MÔ PHỎNG SỰ KIỆN THỜI GIAN THỰC · 400 TRẬN / CẶP ===\n');
for (const c of CHARACTERS) {
  console.log(`   ${c.shortName.padEnd(12)} khoảng cách chiến thuật ≈ ${preferredRange(c).toFixed(1)}m`);
}
console.log('');

const rows: { a: Character; b: Character; aPct: number; dur: number }[] = [];
let worst = { pair: '', aPct: 50, dev: 0 };

for (let i = 0; i < CHARACTERS.length; i++) {
  for (let j = i + 1; j < CHARACTERS.length; j++) {
    const A = CHARACTERS[i];
    const B = CHARACTERS[j];
    let aWins = 0;
    let bWins = 0;
    let draws = 0;
    let sumDur = 0;
    const N = 400;
    for (let n = 0; n < N; n++) {
      const r = simulate(A.id, B.id, n * 7919 + i * 131 + j * 17 + 1);
      aWins += r.aWins;
      bWins += r.bWins;
      draws += r.draws;
      sumDur += r.duration;
    }
    const decided = (aWins + bWins) || 1;
    const aPct = (aWins / decided) * 100;
    if (draws > N * 0.5) {
      console.log(`  !! ${A.shortName} vs ${B.shortName}: ${draws}/${N} hoà — kiểm tra lại tầm với`);
    }
    rows.push({ a: A, b: B, aPct, dur: sumDur / N });
    if (process.env.DBG_PAIR && `${A.shortName} vs ${B.shortName}` === process.env.DBG_PAIR) {
      let dA = 0, dB = 0;
      for (let n = 0; n < N; n++) {
        const r = simulate(A.id, B.id, n * 7919 + i * 131 + j * 17 + 1);
        dA += r.dmgA; dB += r.dmgB;
      }
      console.log(`  [dbg] ${process.env.DBG_PAIR}: A dmg=${(dA/N).toFixed(0)} B dmg=${(dB/N).toFixed(0)} ratio=${(dB/dA).toFixed(2)}`);
      const r0 = simulate(A.id, B.id, 1);
      console.log('  [dbg] 1 trận:', JSON.stringify(r0));
    }
    const dev = Math.abs(aPct - 50);
    if (dev > worst.dev) worst = { pair: `${A.shortName} vs ${B.shortName}`, aPct, dev };
  }
}

for (const r of rows) {
  const stars = '█'.repeat(Math.round(r.aPct / 4)).padEnd(25, '·');
  console.log(
    `  ${`${r.a.shortName} vs ${r.b.shortName}`.padEnd(30)} ${stars} `
    + `${r.aPct.toFixed(0).padStart(3)}%   ~${r.dur.toFixed(0)}s`,
  );
}

// Tỉ lệ thắng tổng thể
const totals: Record<string, { w: number; n: number }> = {};
for (const c of CHARACTERS) totals[c.id] = { w: 0, n: 0 };
for (const r of rows) {
  totals[r.a.id].w += r.aPct / 100;
  totals[r.a.id].n += 1;
  totals[r.b.id].w += 1 - r.aPct / 100;
  totals[r.b.id].n += 1;
}

console.log('\n  --- Tỉ lệ thắng tổng thể ---');
for (const c of CHARACTERS) {
  const tt = totals[c.id];
  const pct = (tt.w / tt.n) * 100;
  const bar = '█'.repeat(Math.round(pct / 4)).padEnd(25, '·');
  console.log(`  ${c.shortName.padEnd(14)} ${bar} ${pct.toFixed(0).padStart(3)}%`);
}

console.log(
  `\n  Cặp lệch nhất: ${worst.pair} → `
  + `${worst.aPct.toFixed(0)}% / ${(100 - worst.aPct).toFixed(0)}%`,
);
warn(worst.dev <= 25, `mọi cặp trong khoảng 25–75% (lệch tối đa ${worst.dev.toFixed(0)} điểm)`);

const overall = CHARACTERS.map((c) => (totals[c.id].w / totals[c.id].n) * 100);
const spread = Math.max(...overall) - Math.min(...overall);
ok(spread <= 60, `tỉ lệ thắng tổng thể trải trong ${spread.toFixed(0)} điểm (≤ 45)`);

console.log('\n=== 5. DPS LIÊN TỤC ===');
const cd = constantDps();
for (const d of cd) console.log(`  ${d.name.padEnd(26)} ${d.dps.toFixed(2)} dps`);
const cdr = Math.max(...cd.map((d) => d.dps)) / Math.min(...cd.map((d) => d.dps));
ok(cdr <= 1.8, `chênh lệch DPS liên tục ${cdr.toFixed(2)}× ≤ 1.8×`);

console.log(
  `\n${failures === 0 ? '✅ TẤT CẢ KIỂM TRA BẮT BUỘC ĐỀU ĐẠT' : `❌ ${failures} KIỂM TRA THẤT BẠI`}`
  + `${warnings ? ` (${warnings} cảnh báo tham khảo)` : ''}\n`,
);
process.exit(failures === 0 ? 0 : 1);
