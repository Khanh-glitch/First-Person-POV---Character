/**
 * ROSTER — dữ liệu chiêu thức port nguyên văn từ 7 nhánh nhân vật.
 *
 * Mỗi mục ghi rõ nguồn (`source`) để truy vết ngược về nhánh gốc.
 * Tên chiêu / kanji / romaji / màu / thời lượng / cooldown được giữ y nguyên
 * như trong source gốc — không diễn giải lại.
 */

export type CharId =
  | 'boa-hancock'
  | 'captain-kid'
  | 'doflamingo'
  | 'imu'
  | 'kizaru'
  | 'luffy'
  | 'zoro';

export type FxKind =
  | 'heart'      // Boa Hancock — hoa hồng/kiss, hoá đá
  | 'magnet'     // Captain Kid — sắt vụn, tia từ trường
  | 'string'     // Doflamingo — sợi chỉ
  | 'void'       // Imu — hắc ám, vực thẳm
  | 'light'      // Kizaru — ánh sáng, laser
  | 'rubber'     // Luffy — cao su, nắm đấm
  | 'blade';     // Zoro — kiếm khí, slash

export interface Move {
  id: string;
  key: string;
  /** Tên hiển thị chính (ngôn ngữ gốc của dự án: EN / VI / romaji) */
  name: string;
  /** Nhật ngữ / kanji */
  kanji: string;
  /** Phiên âm romaji nếu có */
  romaji?: string;
  /** Phụ đề tiếng Việt nếu dự án gốc là tiếng Anh */
  vi?: string;
  desc: string;
  color: string;
  /** Thời lượng animation (giây) — lấy từ `duration`/`dur` gốc */
  duration: number;
  /** Cooldown (giây) — lấy từ `cd` gốc, hoặc suy ra từ nhịp ra đòn */
  cooldown: number;
  /** Bán kính ảnh hưởng / tầm với (mét) */
  reach: number;
  /** Hình thái hiệu ứng để engine vẽ */
  fx: FxKind;
  /** Đòn kết liễu (ultimate) */
  ultimate?: boolean;
  /** Ghi chú nguồn: tên biến / file gốc */
  source: string;
}

export interface Character {
  id: CharId;
  name: string;
  shortName: string;
  epithet: string;
  fruit: string;
  fruitKanji: string;
  branch: string;
  /** Bảng màu chủ đạo lấy từ source gốc */
  color: string;
  accent: string;
  /** FOV camera gốc của dự án đó */
  fov: number;
  /** tone mapping exposure gốc */
  exposure: number;
  /** Mô tả ngắn về phong cách chiến đấu */
  style: string;
  moves: Move[];
}

/* ------------------------------------------------------------------ 1. BOA HANCOCK
 * Nguồn: characters/boa-hancock
 *   - src/App.tsx  → SKILLS (id, key, name, jp)
 *   - src/game/Game.ts:17 → CD_MAX { kiss: 0.12, arrow: 1.4, mellow: 9, kick: 2.6, haki: 0 }
 *   - camera FOV 72, exposure 1.05
 */
const boaHancock: Character = {
  id: 'boa-hancock',
  name: 'Boa Hancock',
  shortName: 'Hancock',
  epithet: 'Nữ Đế Hải Tặc',
  fruit: 'Mero Mero no Mi',
  fruitKanji: 'メロメロの実',
  branch: 'boa-hancock',
  color: '#ff5c9e',
  accent: '#ffd1ec',
  fov: 72,
  exposure: 1.05,
  style: 'Hoá đá bằng mê hoặc — kiểm soát tầm trung, hồi chiêu cực nhanh',
  moves: [
    {
      id: 'kiss', key: 'LMB', name: 'Pistol Kiss', kanji: 'ピストルキス',
      desc: 'Hôn gió hoá đá tầm gần', color: '#ffd1ec',
      duration: 0.85, cooldown: 0.12, reach: 28, fx: 'heart',
      source: 'boa-hancock/src/App.tsx SKILLS[0] · Game.ts CD_MAX.kiss',
    },
    {
      id: 'arrow', key: 'RMB', name: 'Slave Arrow', kanji: '虜の矢',
      desc: 'Cung tên hoá đá, sạc rồi nhả', color: '#ff7bb0',
      duration: 1.6, cooldown: 1.4, reach: 40, fx: 'heart',
      source: 'boa-hancock/src/App.tsx SKILLS[1] · Game.ts CD_MAX.arrow',
    },
    {
      id: 'mellow', key: 'Q', name: 'Mero Mero Mellow', kanji: 'メロメロ甘風',
      desc: 'Luồng sóng mê hoặc diện rộng', color: '#ff4fa3',
      duration: 2.4, cooldown: 9, reach: 35, fx: 'heart',
      source: 'boa-hancock/src/App.tsx SKILLS[2] · Game.ts CD_MAX.mellow',
    },
    {
      id: 'kick', key: 'E', name: 'Perfume Femur', kanji: '芳香脚',
      desc: 'Cước hoá đá', color: '#ffb3d4',
      duration: 1.3, cooldown: 2.6, reach: 30, fx: 'heart',
      source: 'boa-hancock/src/App.tsx SKILLS[3] · Game.ts CD_MAX.kick',
    },
    {
      id: 'haki', key: 'R', name: 'Haoshoku Haki', kanji: '覇王色',
      desc: 'Bá vương sắc chấn nhiếp', color: '#ffe066',
      duration: 3.0, cooldown: 14, reach: 38, fx: 'heart', ultimate: true,
      source: 'boa-hancock/src/App.tsx SKILLS[4] · Game.ts CD_MAX.haki',
    },
  ],
};

/* ------------------------------------------------------------------ 2. CAPTAIN KID
 * Nguồn: characters/captain-kid
 *   - src/game/Moves.ts:15 MOVES (id, key, name, jp, vi, cd, duration)
 *   - camera FOV 70, exposure 0.92
 */
const captainKid: Character = {
  id: 'captain-kid',
  name: 'Eustass "Captain" Kid',
  shortName: 'Kid',
  epithet: 'Captain · Kid Pirates',
  fruit: 'Jiki Jiki no Mi',
  fruitKanji: '磁気の実',
  branch: 'captain-kid',
  color: '#7cc4ff',
  accent: '#cfe4ff',
  fov: 70,
  exposure: 0.92,
  style: 'Từ trường & sắt vụn — dồn sát thương lớn, hồi chiêu lâu',
  moves: [
    {
      id: 'repel', key: '1', name: 'REPEL', kanji: '反発', romaji: 'リペル',
      vi: 'Sóng đẩy từ trường', desc: 'Sóng xung kích từ trường đẩy lùi',
      color: '#8fb8ff', duration: 2.4, cooldown: 3.2, reach: 28, fx: 'magnet',
      source: 'captain-kid/src/game/Moves.ts MOVES[0]',
    },
    {
      id: 'gibson', key: '2', name: 'PUNK GIBSON', kanji: '磁気弦', romaji: 'パンクギブソン',
      vi: 'Cánh tay sắt vụn khổng lồ', desc: 'Cánh tay sắt vụn khổng lồ đập xuống',
      color: '#a8c8ff', duration: 5.4, cooldown: 7, reach: 30, fx: 'magnet',
      source: 'captain-kid/src/game/Moves.ts MOVES[1]',
    },
    {
      id: 'vise', key: '3', name: 'PUNK VISE', kanji: '磁気万力', romaji: 'パンクヴァイス',
      vi: 'Gọng kìm từ tính', desc: 'Gọng kìm từ tính kẹp địch',
      color: '#7cc4ff', duration: 5.6, cooldown: 8, reach: 29, fx: 'magnet',
      source: 'captain-kid/src/game/Moves.ts MOVES[2]',
    },
    {
      id: 'corna', key: '4', name: 'PUNK CORNA DIO', kanji: '磁気大魔牛', romaji: 'パンク・コルナ・ディオ',
      vi: 'Đại ma ngưu từ tính', desc: 'Đại ma ngưu từ tính húc thẳng',
      color: '#5aa8ff', duration: 6.4, cooldown: 9, reach: 32, fx: 'magnet',
      source: 'captain-kid/src/game/Moves.ts MOVES[3]',
    },
    {
      id: 'assign', key: '5', name: 'ASSIGN · PUNK CLASH', kanji: '付与・磁気激突', romaji: 'アサイン・パンククラッシュ',
      vi: 'Thức tỉnh — gán cực từ', desc: 'Gán cực từ rồi va chạm',
      color: '#4d8dff', duration: 6.0, cooldown: 9, reach: 33, fx: 'magnet',
      source: 'captain-kid/src/game/Moves.ts MOVES[4]',
    },
    {
      id: 'damned', key: '6', name: 'DAMNED PUNK', kanji: '電磁砲', romaji: 'ダムド・パンク',
      vi: 'Pháo điện từ tối thượng', desc: 'Pháo điện từ tối thượng',
      color: '#3f7dff', duration: 8.8, cooldown: 12, reach: 40, fx: 'magnet', ultimate: true,
      source: 'captain-kid/src/game/Moves.ts MOVES[5]',
    },
  ],
};

/* ------------------------------------------------------------------ 3. DOFLAMINGO
 * Nguồn: characters/doflamingo
 *   - src/engine/moves/base.ts MOVE_LIST (id, key, kanji, romaji, en, desc, color)
 *   - exposure 0.95
 */
const doflamingo: Character = {
  id: 'doflamingo',
  name: 'Donquixote Doflamingo',
  shortName: 'Doflamingo',
  epithet: '天夜叉 · Joker',
  fruit: 'Ito Ito no Mi',
  fruitKanji: '糸糸の実',
  branch: 'doflamingo',
  color: '#ff7bb0',
  accent: '#ffd1ec',
  fov: 72,
  exposure: 0.95,
  style: 'Sợi chỉ diện rộng — nhiều chiêu, kiểm soát cả đấu trường',
  moves: [
    {
      id: 'tamaito', key: '1', name: 'Tamaito — Bullet String', kanji: '弾糸', romaji: 'Tamaito',
      desc: 'Sợi chỉ bắn ra như đạn từ đầu ngón tay', color: '#ffd1ec',
      duration: 1.1, cooldown: 1.6, reach: 29, fx: 'string',
      source: 'doflamingo/src/engine/moves/base.ts MOVE_LIST[0]',
    },
    {
      id: 'overheat', key: '2', name: 'Overheat', kanji: '超過鞭糸', romaji: 'Ōbāhīto',
      desc: 'Dây roi chỉ nung đỏ quét ngang cả thành phố', color: '#ff6a2a',
      duration: 2.0, cooldown: 5, reach: 33, fx: 'string',
      source: 'doflamingo/src/engine/moves/base.ts MOVE_LIST[1]',
    },
    {
      id: 'goshikito', key: '3', name: 'Goshikito — Five-Colored String', kanji: '五色糸', romaji: 'Goshikito',
      desc: 'Năm sợi chỉ ngũ sắc xé toạc mặt đất', color: '#b98cff',
      duration: 1.8, cooldown: 4.5, reach: 28, fx: 'string',
      source: 'doflamingo/src/engine/moves/base.ts MOVE_LIST[2]',
    },
    {
      id: 'parasite', key: '4', name: 'Parasite', kanji: '寄生糸', romaji: 'Parasaito',
      desc: 'Điều khiển cơ thể kẻ địch như con rối', color: '#e45cff',
      duration: 2.2, cooldown: 7, reach: 31, fx: 'string',
      source: 'doflamingo/src/engine/moves/base.ts MOVE_LIST[3]',
    },
    {
      id: 'fulbright', key: '5', name: 'Fulbright', kanji: '降無頼糸', romaji: 'Furuburaito',
      desc: 'Mưa chỉ trút xuống từ tầng mây', color: '#9fd8ff',
      duration: 2.6, cooldown: 6, reach: 30, fx: 'string',
      source: 'doflamingo/src/engine/moves/base.ts MOVE_LIST[4]',
    },
    {
      id: 'torikago', key: '6', name: 'Torikago — Birdcage', kanji: '鳥カゴ', romaji: 'Torikago',
      desc: 'Lồng chim khổng lồ nhốt trọn hòn đảo', color: '#ff4fa3',
      duration: 3.4, cooldown: 10, reach: 37, fx: 'string',
      source: 'doflamingo/src/engine/moves/base.ts MOVE_LIST[5]',
    },
    {
      id: 'kamichusatsu', key: '7', name: 'Kamichūsatsu — God Thread', kanji: '神誅殺', romaji: 'Kamichūsatsu',
      desc: 'Mũi giáo chỉ xoắn — đòn kết liễu', color: '#ff2a55',
      duration: 3.0, cooldown: 11, reach: 34, fx: 'string',
      source: 'doflamingo/src/engine/moves/base.ts MOVE_LIST[6]',
    },
    {
      id: 'nami', key: '8', name: 'Nami Shiraito — Awakening', kanji: '覚醒・波白糸', romaji: 'Nami Shiraito',
      desc: 'Thức tỉnh — mặt đất hoá chỉ, sóng thần trắng', color: '#ffffff',
      duration: 3.8, cooldown: 13, reach: 40, fx: 'string', ultimate: true,
      source: 'doflamingo/src/engine/moves/base.ts MOVE_LIST[7]',
    },
  ],
};

/* ------------------------------------------------------------------ 4. IMU
 * Nguồn: characters/imu
 *   - src/engine/moves.ts MOVES + CHAIN (id, key, name, sub, kanji, desc, color, duration)
 */
const imu: Character = {
  id: 'imu',
  name: 'Imu',
  shortName: 'Imu',
  epithet: 'Hư Vô Chi Vương',
  fruit: 'Quyền năng Hư Vô',
  fruitKanji: '無',
  branch: 'imu',
  color: '#b48cff',
  accent: '#e3d4ff',
  fov: 72,
  exposure: 1.0,
  style: 'Quyền năng tối thượng — chiêu lâu nhất, sát thương lớn nhất',
  moves: [
    {
      id: 'omen', key: '1', name: 'HẮC VIÊM', kanji: '黒炎', romaji: 'Omen · Điềm Gở',
      desc: 'Ngọn lửa đen tối thượng — búng tay là nổ tung.', color: '#a855f7',
      duration: 8.8, cooldown: 8, reach: 28, fx: 'void',
      source: 'imu/src/engine/moves.ts MOVES[0]',
    },
    {
      id: 'mother', key: '2', name: 'THIÊN PHẠT', kanji: '天罰', romaji: 'Mother Flame · Lulusia',
      desc: 'Triệu hồi ngọn lửa mẹ — xoá sổ cả một vương quốc.', color: '#ff3b4e',
      duration: 10.8, cooldown: 11, reach: 37, fx: 'void',
      source: 'imu/src/engine/moves.ts MOVES[1]',
    },
    {
      id: 'abyss', key: '3', name: 'KHẾ ƯỚC VỰC THẲM', kanji: '深淵', romaji: 'Abyss · Ma Đạo Thư',
      desc: 'Ma đạo thư mở ấn — ngàn mũi giáo và đinh ba từ vực sâu.', color: '#d946ef',
      duration: 8.9, cooldown: 9, reach: 31, fx: 'void',
      source: 'imu/src/engine/moves.ts MOVES[2]',
    },
    {
      id: 'haki', key: '4', name: 'BÁ VƯƠNG KHÍ', kanji: '覇王色', romaji: 'Supreme King Haki',
      desc: 'Uy áp thống trị — trời đất nứt toác, vạn vật khuỵu gối.', color: '#ff6b3d',
      duration: 6.4, cooldown: 7, reach: 33, fx: 'void',
      source: 'imu/src/engine/moves.ts MOVES[3]',
    },
    {
      id: 'chain', key: '5', name: 'HƯ VÔ CHI VƯƠNG', kanji: '無', romaji: 'Mu · Chuỗi Tận Thế',
      desc: 'Bá Vương Khí → Hắc Viêm → Vực Thẳm → Thiên Phạt.', color: '#f5d061',
      duration: 12.0, cooldown: 16, reach: 40, fx: 'void', ultimate: true,
      source: 'imu/src/engine/moves.ts CHAIN',
    },
  ],
};

/* ------------------------------------------------------------------ 5. KIZARU
 * Nguồn: characters/kizaru
 *   - src/game/moveData.ts MOVES (id, key, kanji, romaji, vi, desc, cooldown, color, tag)
 *   - camera FOV 72, exposure 0.42
 */
const kizaru: Character = {
  id: 'kizaru',
  name: 'Borsalino "Kizaru"',
  shortName: 'Kizaru',
  epithet: '黄猿 · Đô đốc Hải quân',
  fruit: 'Pika Pika no Mi',
  fruitKanji: 'ピカピカの実',
  branch: 'kizaru',
  color: '#ffd24a',
  accent: '#fff0a8',
  fov: 72,
  exposure: 0.42,
  style: 'Ánh sáng tốc độ — hồi chiêu thấp, đánh nhanh liên tục',
  moves: [
    {
      id: 'magatama', key: '1', name: 'Yasakani no Magatama', kanji: '八尺瓊曲玉',
      romaji: 'Bát Xích Quỳnh Khúc Ngọc', desc: 'Mưa đạn ánh sáng từ đầu ngón tay',
      color: '#ffd24a', duration: 2.0, cooldown: 0.4, reach: 33, fx: 'light',
      source: 'kizaru/src/game/moveData.ts MOVES[0]',
    },
    {
      id: 'murakumo', key: '2', name: 'Ama no Murakumo', kanji: '天叢雲劍',
      romaji: 'Thiên Tùng Vân Kiếm', desc: 'Kiếm ánh sáng — chém chữ X',
      color: '#fff0a8', duration: 1.4, cooldown: 3.5, reach: 28, fx: 'light',
      source: 'kizaru/src/game/moveData.ts MOVES[1]',
    },
    {
      id: 'kagami', key: '3', name: 'Yata no Kagami', kanji: '八咫鏡',
      romaji: 'Bát Chỉ Kính', desc: 'Phản chiếu ánh sáng — cước tốc độ ánh sáng',
      color: '#7fe3ff', duration: 1.6, cooldown: 6, reach: 35, fx: 'light',
      source: 'kizaru/src/game/moveData.ts MOVES[2]',
    },
    {
      id: 'amaterasu', key: '4', name: 'Amaterasu', kanji: '天照',
      romaji: 'Thiên Chiếu', desc: 'Chớp sáng mù loà — mưa cột sáng phán xét',
      color: '#ffb347', duration: 2.8, cooldown: 9, reach: 36, fx: 'light',
      source: 'kizaru/src/game/moveData.ts MOVES[3]',
    },
    {
      id: 'iwato', key: '5', name: 'Ama no Iwato', kanji: '天岩戸',
      romaji: 'Thiên Nham Hộ', desc: 'Laser tối thượng — xoá sổ cả hạm đội',
      color: '#ff7a3d', duration: 3.6, cooldown: 14, reach: 40, fx: 'light', ultimate: true,
      source: 'kizaru/src/game/moveData.ts MOVES[4]',
    },
  ],
};

/* ------------------------------------------------------------------ 6. LUFFY
 * Nguồn: characters/luffy
 *   - src/game/moves.ts MoveDef (id, key, jp, en, gear, color, dur)
 *   - exposure 1.05
 */
const luffy: Character = {
  id: 'luffy',
  name: 'Monkey D. Luffy',
  shortName: 'Luffy',
  epithet: 'Mugiwara · Gear 5',
  fruit: 'Gomu Gomu no Mi',
  fruitKanji: 'ゴムゴムの実',
  branch: 'luffy',
  color: '#ff6b4a',
  accent: '#ffd0c0',
  fov: 72,
  exposure: 1.05,
  style: 'Cao su & Gear — sát thương leo thang theo Gear',
  moves: [
    {
      id: 'pistol', key: '1', name: 'GOMU GOMU NO PISTOL', kanji: 'ゴムゴムの銃',
      vi: 'Nắm đấm cao su bắn thẳng', desc: 'Nắm đấm cao su bắn thẳng',
      color: '#ff5a3a', duration: 2.35, cooldown: 1.2, reach: 31, fx: 'rubber',
      source: 'luffy/src/game/moves.ts MoveDef id:0',
    },
    {
      id: 'gatling', key: '2', name: 'GOMU GOMU NO JET GATLING', kanji: 'ゴムゴムの JET 銃乱打',
      vi: 'GEAR 2 — Mưa đấm tốc độ cao', desc: 'Mưa đấm tốc độ cao',
      color: '#ff3b6b', duration: 4.7, cooldown: 5, reach: 30, fx: 'rubber',
      source: 'luffy/src/game/moves.ts MoveDef id:1',
    },
    {
      id: 'bazooka', key: '3', name: 'GOMU GOMU NO BAZOOKA', kanji: 'ゴムゴムの回転弾',
      vi: 'Song chưởng nén bắn', desc: 'Song chưởng nén bắn',
      color: '#ffb02a', duration: 2.9, cooldown: 3.4, reach: 28, fx: 'rubber',
      source: 'luffy/src/game/moves.ts MoveDef id:2',
    },
    {
      id: 'elephant', key: '4', name: 'GOMU GOMU NO ELEPHANT GUN', kanji: 'ゴムゴムの象銃',
      vi: 'GEAR 3 — Cú đấm khổng lồ', desc: 'Cú đấm khổng lồ',
      color: '#ff8a2a', duration: 4.4, cooldown: 6.5, reach: 31, fx: 'rubber',
      source: 'luffy/src/game/moves.ts MoveDef id:3',
    },
    {
      id: 'kong', key: '5', name: 'GEAR FOURTH — KONG GUN', kanji: 'ギア４ 猿王銃',
      vi: 'GEAR 4 — Hoả lực', desc: 'Hoả lực Gear 4',
      color: '#ff1f3a', duration: 5.2, cooldown: 8.5, reach: 33, fx: 'rubber',
      source: 'luffy/src/game/moves.ts MoveDef id:4',
    },
    {
      id: 'bajrang', key: '6', name: 'GEAR 5 — BAJRANG GUN', kanji: 'ギア５ 猿神銃',
      vi: 'GEAR 5 — Nika', desc: 'Đòn kết liễu Nika',
      color: '#8ec8ff', duration: 7.4, cooldown: 13, reach: 40, fx: 'rubber', ultimate: true,
      source: 'luffy/src/game/moves.ts MoveDef id:5',
    },
  ],
};

/* ------------------------------------------------------------------ 7. ZORO
 * Nguồn: characters/zoro
 *   - src/data/techniques.ts TECHNIQUES (id, key, kanji, romaji, viName,
 *     duration, primaryHex, damageMultiplier, useEyeCutIn)
 *   - camera FOV 65, exposure 1.12
 */
const zoro: Character = {
  id: 'zoro',
  name: 'Roronoa Zoro',
  shortName: 'Zoro',
  epithet: 'Thợ Săn Hải Tặc · Santōryū',
  fruit: 'Santōryū (3 kiếm)',
  fruitKanji: '三刀流',
  branch: 'zoro',
  color: '#10ff96',
  accent: '#d1ffe9',
  fov: 65,
  exposure: 1.12,
  style: 'Tam đao lưu — slash chính xác, sát thương theo damageMultiplier gốc',
  moves: [
    {
      id: 'rengoku_onigiri', key: '1', name: 'RENGOKU ONI GIRI', kanji: '煉獄鬼斬り',
      romaji: 'Luyện Ngục Quỷ Trảm', desc: 'Tam đao chém chữ thập rực lửa',
      color: '#10ff96', duration: 3.15, cooldown: 3.2, reach: 28, fx: 'blade',
      source: 'zoro/src/data/techniques.ts TECHNIQUES[0] (damageMultiplier 3)',
    },
    {
      id: 'shishi_sonson', key: '2', name: 'SHI SHISHI SONSON', kanji: '死・獅子歌歌',
      romaji: 'Tử Sư Tử Ca Ca', desc: 'Nhất đao siêu tốc',
      color: '#38bdf8', duration: 3.55, cooldown: 2.4, reach: 30, fx: 'blade',
      source: 'zoro/src/data/techniques.ts TECHNIQUES[1] (damageMultiplier 1)',
    },
    {
      id: 'sanzen_sekai', key: '3', name: 'ICHIDAI SANZEN DAISEN SEKAI', kanji: '一大・三千・大千・世界',
      romaji: 'Nhất Đại Tam Thiên Đại Thiên Thế Giới', desc: 'Càn quét toàn diện',
      color: '#22ffb2', duration: 3.85, cooldown: 5.5, reach: 31, fx: 'blade',
      source: 'zoro/src/data/techniques.ts TECHNIQUES[2] (damageMultiplier 6)',
    },
    {
      id: 'tatsumaki', key: '4', name: 'KOKUJŌ Ō TATSU MAKI', kanji: '黒縄・大龍巻',
      romaji: 'Hắc Thằng Đại Long Quyển', desc: 'Long quyển đen',
      color: '#00f5a0', duration: 4.15, cooldown: 7, reach: 33, fx: 'blade',
      source: 'zoro/src/data/techniques.ts TECHNIQUES[3] (damageMultiplier 12)',
    },
    {
      id: 'ashura_bakkei', key: '5', name: 'ASHURA BAKKEI: MŌJA NO TAWAMURE', kanji: '阿修羅抜剣・亡者戯',
      romaji: 'A Tu La Bạt Kiếm: Vọng Giả Hí', desc: 'Ashura — phân thân chiến đấu',
      color: '#ff2a55', duration: 4.65, cooldown: 9, reach: 32, fx: 'blade',
      source: 'zoro/src/data/techniques.ts TECHNIQUES[4] (damageMultiplier 9)',
    },
    {
      id: 'hiryu_jigoku', key: '6', name: 'IPPYAKUSANJŌ HIRYŪ JIGOKU', kanji: '一百三情飛龍侍極',
      romaji: 'Nhất Bách Tam Tình Phi Long Thị Cực', desc: 'Đòn kết liễu — Phi Long',
      color: '#00ff88', duration: 5.15, cooldown: 13, reach: 40, fx: 'blade', ultimate: true,
      source: 'zoro/src/data/techniques.ts TECHNIQUES[5] (damageMultiplier 103)',
    },
  ],
};

export const CHARACTERS: Character[] = [
  boaHancock,
  captainKid,
  doflamingo,
  imu,
  kizaru,
  luffy,
  zoro,
];

export const CHAR_MAP: Record<CharId, Character> = CHARACTERS.reduce(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {} as Record<CharId, Character>,
);

export const getCharacter = (id: CharId): Character => CHAR_MAP[id];
export const getMove = (charId: CharId, moveId: string): Move | undefined =>
  CHAR_MAP[charId].moves.find((m) => m.id === moveId);
