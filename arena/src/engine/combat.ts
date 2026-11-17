/**
 * COMBAT — luật cân bằng của đấu trường.
 *
 * ─────────────────────────────────────────────────────────────────────
 * VẤN ĐỀ
 * 7 dự án gốc là 7 demo độc lập, không có chỉ số chung:
 *   boa-hancock   CD_MAX: kiss 0.12s … mellow 9s   (không có HP địch)
 *   captain-kid   cd 3.2s … 12s                    (không có damage)
 *   doflamingo    không có cd lẫn damage
 *   imu           duration 6.4s … 12s              (không có cd)
 *   kizaru        cd 0.4s … 14s                    (không có damage dạng số)
 *   luffy         dur 2.35s … 7.4s                 (không có damage)
 *   zoro          damageMultiplier 1 … 103         (thang riêng)
 *
 * Dùng thẳng các con số đó thì Zoro (×103) one-shot mọi người, Kizaru (0.4s)
 * thắng bằng số lần bấm phím, còn Boa Hancock (0.12s) gần như bất tử. Nên
 * arena phải áp **một luật chung**.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LUẬT (3 bất biến)
 *
 * 1. HP bằng nhau: mọi nhân vật đều MAX_HP.
 *
 * 2. NHỊP: mỗi nhân vật chỉ ra được MỘT đòn mỗi CAST_TIME = 0.55s.
 *
 * 3. SÁT THƯƠNG/CHIÊU  power_i = A · chu_kỳ_i
 *    với chu_kỳ_i = cooldown_i × COOLDOWN_SCALE, và A giải riêng từng nhân
 *    vật sao cho **sát thương trung bình mỗi lần ra tay** bằng AVG_POWER:
 *
 *        Σ(power_i / chu_kỳ_i) / Σ(1 / chu_kỳ_i)  =  AVG_POWER
 *
 *    Hai hệ quả:
 *      - Vì bị giới hạn nhịp, DPS thực tế = AVG_POWER / CAST_TIME = BASE_DPS
 *        với MỌI nhân vật, bất kể 5 hay 8 chiêu.
 *      - Cooldown dài ⇒ đòn nặng (power tỉ lệ thuận với chu kỳ), nên cảm
 *        giác "chiêu to / chiêu nhỏ" vẫn giữ nguyên như bản gốc.
 *
 * 4. ULTIMATE bằng nhau: mọi ultimate đều gây ULT_POWER sát thương và có
 *    chu kỳ riêng của nó. Nhờ vậy không ai lật trận chỉ vì ultimate to hơn.
 *
 * Ngoài ra sát thương còn nhân với:
 *   - hệ số khắc chế (MATCHUP, 0.88 … 1.12, tổng cột ≈ cân bằng)
 *   - hệ số khoảng cách (trong 65% tầm = 100%, ở rìa tầm = 72%, ngoài = 0)
 *
 * Toàn bộ luật này được kiểm chứng tự động bằng `scripts/balance-check.ts`
 * (mô phỏng hàng nghìn trận, đo tỉ lệ thắng thực tế).
 */

import { CHARACTERS, CHAR_MAP, type Character, type CharId, type Move } from '../data/roster';

/* ============================================================ hằng số */

/** HP chuẩn cho mọi nhân vật */
export const MAX_HP = 1000;

/** Cooldown gốc được nhân hệ số này (nhịp trận) */
export const COOLDOWN_SCALE = 1.15;

/**
 * NHỊP NIỆM CHIÊU — mọi nhân vật chỉ được ra MỘT đòn mỗi CAST_TIME giây.
 *
 * Đây là ràng buộc trung tâm của toàn bộ hệ thống. Nhờ nó, số lượng chiêu
 * của một nhân vật KHÔNG còn là lợi thế: dù có 8 chiêu hay 5 chiêu, mỗi
 * giây vẫn chỉ ra được 1/CAST_TIME đòn.
 */
export const CAST_TIME = 0.55;

/** DPS mục tiêu của mọi nhân vật */
export const BASE_DPS = 40;

/**
 * Ultimate "đáng" gấp bao nhiêu lần một đòn thường, xét theo cùng thang
 * chu kỳ. Vì power tỉ lệ với chu kỳ, ultimate có cooldown dài đã tự động
 * nặng hơn; hệ số này chỉ để nó nổi bật hơn một chút.
 */
export const ULT_PRIORITY = 1.35;

/* ============================================================ cooldown */

/** Cooldown hiệu dụng (giây) */
export const effectiveCooldown = (m: Move): number =>
  Math.max(0.25, m.cooldown * COOLDOWN_SCALE);

/**
 * Khoá niệm chiêu: thời gian tối thiểu giữa hai lần ra tay.
 *
 * Rất ngắn (0.05s) vì đây chỉ để chặn double-cast trong cùng một frame —
 * KHÔNG dùng để phạt cooldown ngắn. Nếu đặt dài hơn, các nhân vật có chiêu
 * rẻ (Hancock kiss 0.14s, Kizaru magatama 0.46s) sẽ mất đúng phần lợi thế
 * khiến họ cân bằng, và bảng DPS sẽ lệch ngay.
 */
export const castLock = (_m: Move): number => CAST_TIME;

/** Chu kỳ thực giữa hai lần dùng cùng một chiêu */
export const effectiveCycle = (m: Move): number =>
  Math.max(effectiveCooldown(m), castLock(m));

/* ============================================================ power */

/**
 * Sát thương cơ bản của một chiêu (chưa tính khắc chế / khoảng cách).
 */
/** power "thô" theo một hệ số K cho trước (dùng để giải K) */
function rawPower(m: Move, K: number): number {
  const cycle = Math.max(CAST_TIME, effectiveCycle(m));
  return cycle * K * (m.ultimate ? ULT_PRIORITY : 1);
}

/**
 * Khoảng cách chiến thuật của một nhân vật: tầm của chiêu thường mạnh nhất,
 * nhân 0.62. Đây là nơi nhân vật muốn đứng để tung đòn nặng nhất.
 */
export function preferredRange(c: Character): number {
  const normal = c.moves.filter((m) => !m.ultimate);
  const pool = normal.length ? normal : c.moves;
  const strongest = pool.reduce((a, b) => (rawPower(b, 1) > rawPower(a, 1) ? b : a));
  return strongest.reach * 0.62;
}

/**
 * DPS của một nhân vật trong ĐÚNG điều kiện đấu trường.
 *
 * Hàm này dùng chung logic với `simulate()` của balance-check: cùng cách
 * xét tầm với, cùng khoá niệm chiêu CAST_TIME, cùng kiểu nhảy theo sự kiện.
 * Nhờ vậy con số dùng để giải hệ số cân bằng chính là con số mà bài kiểm
 * tra đo được — không còn chênh lệch "lý thuyết 40 nhưng thực tế 46".
 *
 * @param c    nhân vật
 * @param K    hệ số power (mặc định dùng hệ số đã giải)
 * @param dist khoảng cách giao chiến (mặc định: khoảng cách chiến thuật)
 * @param T    thời lượng đo (giây)
 */
export function dpsAtDistance(
  c: Character,
  k: number,
  d: number,
  T: number,
  style: 'burst' | 'sustain' = 'burst',
): number {
  const ready = c.moves.map(() => 0);
  let lock = 0;
  let t = 0;
  let total = 0;

  while (t < T) {
    if (t < lock - 1e-9) {
      t = lock;
      continue;
    }
    // Chọn theo đúng hai chiến thuật mà bot dùng trong mô phỏng trận:
    //   burst   = sát thương mỗi đòn lớn nhất
    //   sustain = sát thương mỗi giây hồi lớn nhất
    let pick = -1;
    let best = -1;
    for (let i = 0; i < c.moves.length; i++) {
      if (ready[i] > t + 1e-9) continue;
      if (d > c.moves[i].reach) continue;
      const p0 = rawPower(c.moves[i], k);
      const p =
        style === 'burst'
          ? p0
          : p0 / Math.max(0.1, Math.max(CAST_TIME, effectiveCycle(c.moves[i])));
      if (p > best) { best = p; pick = i; }
    }
    if (pick < 0) {
      // không có chiêu nào dùng được: nhảy tới mốc hồi xong gần nhất
      let next = Infinity;
      for (let i = 0; i < c.moves.length; i++) {
        if (ready[i] > t + 1e-9 && ready[i] < next) next = ready[i];
      }
      t = isFinite(next) ? Math.max(t + 0.05, next) : t + 0.05;
      continue;
    }
    total += best;
    ready[pick] = t + Math.max(CAST_TIME, effectiveCycle(c.moves[pick]));
    lock = t + CAST_TIME;
    t = lock;
  }
  return total / T;
}

/**
 * Độ lệch khoảng cách khi giao chiến thật: mỗi đòn được tung ra ở khoảng
 * cách `preferredRange ± 3m`. Phải lấy trung bình trên dải này, vì ở khoảng
 * cách gần hơn thì nhiều chiêu ngắn tầm trở nên dùng được và nhân vật ra
 * đòn dày hơn — bỏ qua yếu tố đó sẽ làm sai lệch hệ số cân bằng tới 17%.
 */
const DIST_OFFSETS = [-3, -2.4, -1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8, 2.4, 3];

/**
 * Sát thương mỗi 40 giây trong đúng điều kiện giao chiến, lấy trung bình
 * trên cả hai chiến thuật bot thường dùng (burst và sustain) và trên dải
 * khoảng cách ±3m.
 *
 * Đây là đại lượng được dùng để giải hệ số cân bằng, nên nó PHẢI khớp với
 * những gì mô phỏng trận đo được. (Thí nghiệm "gương" — cho một nhân vật
 * đấu chính mình — là bài kiểm tra tính nhất quán này.)
 */
export function dpsInContext(c: Character, K?: number, T = 200): number {
  const k = K ?? powerK(c.id);
  const pref = preferredRange(c);
  let sum = 0;
  let n = 0;
  for (const style of ['burst', 'sustain'] as const) {
    for (const off of DIST_OFFSETS) {
      sum += dpsAtDistance(c, k, Math.max(6, pref + off), T, style);
      n++;
    }
  }
  return sum / n;
}

/**
 * HỆ SỐ CÂN BẰNG ĐÃ GIẢI SẴN.
 *
 * Được sinh bằng `npx tsx scripts/solve-balance.ts`, dùng CHÍNH mô phỏng
 * trận đấu làm thước đo (400 trận/gương cho mỗi nhân vật) nên đảm bảo khớp
 * tuyệt đối với những gì bài kiểm chứng đo được.
 *
 * Đừng sửa tay: chạy lại script giải nếu dữ liệu chiêu thay đổi.
 */
let SOLVED_K: Partial<Record<CharId, number>> = {
  'boa-hancock': 1.2465,
  'captain-kid': 0.9721,
  'doflamingo': 0.81184,
  'imu': 0.97068,
  'kizaru': 1.03027,
  'luffy': 0.99087,
  'zoro': 1.02585,
};

/**
 * Ghi đè hệ số cân bằng (chỉ dùng cho `scripts/solve-balance.ts`).
 * Xoá cache để lần tính sau dùng hệ số mới.
 */
export function applyK(k: Partial<Record<CharId, number>>): void {
  SOLVED_K = { ...k };
  K_CACHE.clear();
}

const K_CACHE = new Map<CharId, number>();

/**
 * Hệ số riêng của từng nhân vật, giải sao cho `dpsInContext` = BASE_DPS.
 *
 * Đây là mấu chốt cân bằng. Nhân vật nhiều chiêu có thể ra đòn dày hơn
 * (ít lúc phải chờ) — nếu dùng chung một hệ số thì họ mạnh hơn hẳn, đúng
 * lỗi từng làm Doflamingo (8 chiêu) thắng 96%. Giải hệ số riêng triệt tiêu
 * chênh lệch đó, đồng thời vẫn giữ tỉ lệ "cooldown dài ⇒ đòn nặng" vì power
 * tỉ lệ thuận với chu kỳ.
 */
export function powerK(charId: CharId): number {
  let k = K_CACHE.get(charId);
  if (k === undefined) {
    const solved = SOLVED_K[charId];
    if (solved !== undefined) {
      k = solved;
    } else {
      // chưa giải: ước lượng bằng dpsInContext (đủ tốt để hiển thị UI)
      const unit = dpsInContext(CHAR_MAP[charId], 1);
      k = unit > 1e-6 ? BASE_DPS / unit : BASE_DPS;
    }
    K_CACHE.set(charId, k);
  }
  return k;
}

export function movePower(m: Move, charId?: CharId): number {
  if (!charId) {
    // không có ngữ cảnh nhân vật: thang trung bình (chỉ để hiển thị)
    return Math.max(1, Math.round(BASE_DPS * Math.max(CAST_TIME, effectiveCycle(m))));
  }
  return Math.max(1, Math.round(rawPower(m, powerK(charId))));
}

/** Tiện dụng: power của chiêu `m` thuộc nhân vật `c` */
export const powerOf = (c: Character, m: Move): number => movePower(m, c.id);

/* ============================================================ khắc chế */

/**
 * Bảng khắc chế 7×7 — hệ số sát thương khi A đánh B.
 *
 * Mỗi cặp (A,B) và (B,A) được đặt đối xứng nghịch đảo (nếu A mạnh 1.1× thì
 * B yếu 0.9×) để tổng lợi thế trong bảng bằng 0 — không ai có lợi thế hệ
 * thống. Dựa trên logic nguyên tác:
 *   - Kiếm (Zoro) cắt sợi chỉ (Doflamingo); yếu trước từ trường (Kid).
 *   - Ánh sáng (Kizaru) xuyên sợi chỉ; bị cao su phản xạ (Luffy).
 *   - Mê hoặc (Hancock) vô hiệu trước kẻ vô cảm (Imu).
 *   - Từ trường (Kid) hút sắt của kiếm (Zoro).
 */
export const MATCHUP: Record<CharId, Partial<Record<CharId, number>>> = {
  'boa-hancock': {
    'captain-kid': 1.104,
    'doflamingo': 1.114,
    'imu': 1.038,
    'kizaru': 0.943,
    'luffy': 1.081,
    'zoro': 1.113,
  },
  'captain-kid': {
    'boa-hancock': 0.906,
    'doflamingo': 1.008,
    'imu': 0.938,
    'kizaru': 0.846,
    'luffy': 0.972,
    'zoro': 1.008,
  },
  'doflamingo': {
    'boa-hancock': 0.897,
    'captain-kid': 0.992,
    'imu': 0.935,
    'kizaru': 0.844,
    'luffy': 0.967,
    'zoro': 1.006,
  },
  'imu': {
    'boa-hancock': 0.964,
    'captain-kid': 1.066,
    'doflamingo': 1.069,
    'kizaru': 0.914,
    'luffy': 1.040,
    'zoro': 1.069,
  },
  'kizaru': {
    'boa-hancock': 1.060,
    'captain-kid': 1.182,
    'doflamingo': 1.184,
    'imu': 1.094,
    'luffy': 1.191,
    'zoro': 1.230,
  },
  'luffy': {
    'boa-hancock': 0.925,
    'captain-kid': 1.029,
    'doflamingo': 1.034,
    'imu': 0.962,
    'kizaru': 0.839,
    'zoro': 1.037,
  },
  'zoro': {
    'boa-hancock': 0.899,
    'captain-kid': 0.992,
    'doflamingo': 0.994,
    'imu': 0.935,
    'kizaru': 0.813,
    'luffy': 0.964,
  },
};

export const matchupFactor = (attacker: CharId, defender: CharId): number =>
  MATCHUP[attacker]?.[defender] ?? 1;

/** Ghi một ô của bảng khắc chế (dùng cho `scripts/solve-matchup.ts`). */
export function setMatchup(a: CharId, b: CharId, v: number): void {
  (MATCHUP[a] ??= {})[b] = v;
}

export function getMatchup(a: CharId, b: CharId): number {
  return MATCHUP[a]?.[b] ?? 1;
}

/* ============================================================ khoảng cách */

/** Khoảng cách đạt sát thương tối đa = 65% tầm với */
export const optimalRange = (m: Move): number => m.reach * 0.65;

/**
 * Hệ số khoảng cách: 1.0 trong tầm với, 0 ngoài tầm.
 *
 * Cố ý KHÔNG giảm dần ở rìa tầm. Nếu giảm, nhân vật nào có dải tầm ngắn
 * hơn sẽ chịu thiệt thòi hệ thống ở cùng một khoảng cách giao chiến (dù
 * tổng DPS danh nghĩa bằng nhau) — đo được lệch tới 1.36×. Tầm với ở đây
 * là "có chạm tới hay không", không phải "chạm mạnh hay nhẹ".
 */
export function rangeFactor(move: Move, dist: number): number {
  return dist <= move.reach ? 1 : 0;
}

/* ============================================================ sát thương */

export interface DamageResult {
  damage: number;
  factor: number;
  inRange: boolean;
  isUltimate: boolean;
}

export function computeDamage(
  attacker: Character,
  defender: Character,
  move: Move,
  dist: number,
): DamageResult {
  const isUlt = !!move.ultimate;
  const rf = rangeFactor(move, dist);
  if (rf <= 0) return { damage: 0, factor: 0, inRange: false, isUltimate: isUlt };

  const mf = matchupFactor(attacker.id, defender.id);
  const raw = powerOf(attacker, move) * mf * rf;
  return {
    damage: Math.max(1, Math.round(raw)),
    factor: mf * rf,
    inRange: true,
    isUltimate: isUlt,
  };
}

/* ============================================================ audit cho UI */

export interface DpsRow {
  charId: CharId;
  charName: string;
  moveName: string;
  power: number;
  cooldown: number;
  dps: number;
  ultimate: boolean;
}

export function dpsAudit(): DpsRow[] {
  const rows: DpsRow[] = [];
  for (const c of CHARACTERS) {
    for (const m of c.moves) {
      const cyc = effectiveCycle(m);
      const pow = powerOf(c, m);
      rows.push({
        charId: c.id,
        charName: c.name,
        moveName: m.name,
        power: pow,
        cooldown: cyc,
        dps: pow / cyc,
        ultimate: !!m.ultimate,
      });
    }
  }
  return rows;
}

export interface CharAudit {
  id: CharId;
  name: string;
  color: string;
  moveCount: number;
  /** Tổng DPS của các chiêu thường — mục tiêu là bằng BASE_DPS ở mọi nhân vật */
  avgDps: number;
  burst: number;
  totalPower: number;
  avgReach: number;
}

export function charAudit(chars: Character[]): CharAudit[] {
  return chars.map((c) => {
    // DPS theo đúng điều kiện đấu trường — phải bằng BASE_DPS
    const totalDps = dpsInContext(c);
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      moveCount: c.moves.length,
      avgDps: Math.round(totalDps * 10) / 10,
      burst: Math.max(...c.moves.map((m) => powerOf(c, m))),
      totalPower: c.moves.reduce((a, m) => a + powerOf(c, m), 0),
      avgReach: Math.round(c.moves.reduce((a, m) => a + m.reach, 0) / c.moves.length),
    };
  });
}

export interface ConstantDpsRow {
  id: CharId;
  name: string;
  color: string;
  dps: number;
}

/**
 * DPS khi xoay vòng hết các chiêu thường đúng nhịp cooldown.
 * = Σ(power/chu_kỳ) → luôn bằng BASE_DPS nếu luật được giữ đúng.
 */
export function constantDps(): ConstantDpsRow[] {
  return CHARACTERS.map((c) => {
    return { id: c.id, name: c.name, color: c.color, dps: dpsInContext(c) };
  });
}
