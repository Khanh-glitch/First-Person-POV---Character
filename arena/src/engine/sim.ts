/**
 * MÔ PHỎNG TRẬN 1v1 — dùng chung cho bài kiểm chứng và bộ giải cân bằng.
 *
 * Đây là nguồn sự thật duy nhất về "một trận đấu diễn ra thế nào". Nhờ
 * dùng chung, hệ số cân bằng được giải ra từ đúng phép đo mà bài kiểm
 * chứng dùng — không còn chuyện "DPS lý thuyết 40 nhưng thực chiến 47".
 *
 * Vòng lặp theo SỰ KIỆN (không bước thời gian cố định) để chiêu có cooldown
 * ngắn không bị làm tròn mất nhịp.
 */

import { MAX_HP, effectiveCycle, castLock, powerOf, computeDamage } from './combat';
import { CHARACTERS, getCharacter, type CharId, type Character } from '../data/roster';

/**
 * Khoảng cách chiến thuật: tầm của chiêu thường mạnh nhất × 0.62.
 * Đây là nơi nhân vật muốn đứng để tung đòn nặng nhất.
 */
export function preferredRange(c: Character): number {
  const normal = c.moves.filter((m) => !m.ultimate);
  const pool = normal.length ? normal : c.moves;
  const strongest = pool.reduce((a, b) => (powerOf(c, b) > powerOf(c, a) ? b : a));
  return strongest.reach * 0.62;
}

export interface Side {
  c: Character;
  hp: number;
  /** thời điểm sớm nhất mỗi chiêu được dùng lại */
  ready: number[];
}

export interface SimResult {
  aWins: 0 | 1;
  bWins: 0 | 1;
  draws: 0 | 1;
  duration: number;
  casts: number;
  dmgA: number;
  dmgB: number;
}

export function simulate(aId: CharId, bId: CharId, seed: number): SimResult {
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

  // Dao động sát thương của mỗi đòn (±20%), tương ứng với việc trong game
  // thật mỗi đòn có lúc trúng đậm lúc trúng nhẹ (trúng tâm, sượt, đỡ được
  // một phần). Nếu bỏ yếu tố này, trận đấu trở thành một cuộc đua hoàn toàn
  // xác định: ai nhích hơn 1% DPS là thắng 100/0, và tỉ lệ thắng không còn
  // phản ánh sức mạnh thật mà chỉ phản ánh thứ tự xử lý trong vòng lặp.
  const damageVariance = () => 0.7 + rand() * 0.6;

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

    // Nếu không chiêu nào trong tầm ở khoảng cách đang chọn, nhân vật sẽ
    // TIẾN LẠI GẦN (như người chơi thật) thay vì đứng im mất nhịp. Không có
    // bước này, nhân vật có dải tầm ngắn bị phạt oan: họ chờ vô ích trong
    // khi đối thủ cứ thế đánh.
    const stepIn = (base: number, side: Side): number => {
      let d = base;
      for (let k = 0; k < 8; k++) {
        const usable = side.c.moves.some(
          (m, i) => side.ready[i] <= t + 1e-9 && d <= m.reach,
        );
        if (usable) return d;
        d -= 1.5;
        if (d < 6) return 6;
      }
      return d;
    };

    const dA = stepIn(distForA(), sa);
    const dB = stepIn(distForB(), sb);

    let acted = false;
    const ia = freeA ? pick(sa, dA, styleA) : -1;
    const ib = freeB ? pick(sb, dB, styleB) : -1;

    if (ia >= 0) {
      const m = sa.c.moves[ia];
      const r = computeDamage(A, B, m, dA);
      r.damage = Math.max(1, Math.round(r.damage * damageVariance()));
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
      r.damage = Math.max(1, Math.round(r.damage * damageVariance()));
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

  const bWon2 = sa.hp <= 0;
  return {
    aWins: aWon && !bWon2 ? 1 : 0,
    bWins: bWon2 && !aWon ? 1 : 0,
    draws: !aWon && !bWon2 ? 1 : 0,
    duration: t,
    casts,
    dmgA,
    dmgB,
  };
}


/**
 * Sát thương trung bình mỗi trận của từng nhân vật — đo bằng chính mô phỏng
 * trận đấu (đấu vòng tròn với mọi nhân vật khác).
 *
 * Dùng cho cả mục "DPS liên tục" của bài kiểm chứng lẫn bộ giải hệ số, để
 * con số hiển thị và con số dùng để cân bằng là MỘT.
 */
export function measuredDamage(seeds = 12): Map<string, number> {
  const acc = new Map<string, { n: number; dmg: number }>();
  for (const c of CHARACTERS) acc.set(c.id, { n: 0, dmg: 0 });

  for (const a of CHARACTERS) {
    for (const b of CHARACTERS) {
      if (a.id === b.id) continue;
      for (let s = 1; s <= seeds; s++) {
        const r = simulate(a.id, b.id, s * 7919);
        const x = acc.get(a.id)!;
        x.dmg += r.dmgA;
        x.n++;
        const y = acc.get(b.id)!;
        y.dmg += r.dmgB;
        y.n++;
      }
    }
  }

  const out = new Map<string, number>();
  for (const [id, v] of acc) out.set(id, v.dmg / Math.max(1, v.n));
  return out;
}
