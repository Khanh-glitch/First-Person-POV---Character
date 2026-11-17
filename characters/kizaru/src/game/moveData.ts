export type MoveId = 'magatama' | 'murakumo' | 'kagami' | 'amaterasu' | 'iwato';

export interface MoveInfo {
  id: MoveId;
  key: string;
  kanji: string;
  romaji: string;
  vi: string;
  desc: string;
  quoteJa: string;
  quoteVi: string;
  cooldown: number;
  color: string;
  tag: string;
}

export const MOVES: MoveInfo[] = [
  {
    id: 'magatama',
    key: '1',
    kanji: '八尺瓊曲玉',
    romaji: 'Yasakani no Magatama',
    vi: 'Bát Xích Quỳnh Khúc Ngọc',
    desc: 'Mưa đạn ánh sáng từ đầu ngón tay',
    quoteJa: 'おォ〜 怖いねェ〜',
    quoteVi: 'Ồ~ đáng sợ quá nhỉ~',
    cooldown: 0.4,
    color: '#ffd24a',
    tag: 'GIỮ CHUỘT TRÁI',
  },
  {
    id: 'murakumo',
    key: '2',
    kanji: '天叢雲劍',
    romaji: 'Ama no Murakumo',
    vi: 'Thiên Tùng Vân Kiếm',
    desc: 'Kiếm ánh sáng — chém chữ X',
    quoteJa: 'ちょいと 斬らせてもらうよォ〜',
    quoteVi: 'Cho tôi chém một nhát nhé~',
    cooldown: 3.5,
    color: '#fff0a8',
    tag: 'CHUỘT PHẢI',
  },
  {
    id: 'kagami',
    key: '3',
    kanji: '八咫鏡',
    romaji: 'Yata no Kagami',
    vi: 'Bát Chỉ Kính',
    desc: 'Phản chiếu ánh sáng — cước tốc độ ánh sáng',
    quoteJa: '光の速さに ついて来れるかい？',
    quoteVi: 'Theo kịp tốc độ ánh sáng chứ?',
    cooldown: 6,
    color: '#7fe3ff',
    tag: 'SPACE',
  },
  {
    id: 'amaterasu',
    key: '4',
    kanji: '天照',
    romaji: 'Amaterasu',
    vi: 'Thiên Chiếu',
    desc: 'Chớp sáng mù lòa — mưa cột sáng phán xét',
    quoteJa: '眩しいだろォ〜？',
    quoteVi: 'Chói mắt lắm đúng không~?',
    cooldown: 9,
    color: '#ffb347',
    tag: 'PHÍM 4',
  },
  {
    id: 'iwato',
    key: '5',
    kanji: '天岩戸',
    romaji: 'Ama no Iwato',
    vi: 'Thiên Nham Hộ',
    desc: 'Laser tối thượng — xóa sổ cả hạm đội',
    quoteJa: '終わりに しようかねェ〜',
    quoteVi: 'Kết thúc thôi nhỉ~',
    cooldown: 14,
    color: '#ff7a3d',
    tag: 'ULTIMATE',
  },
];

export interface HudState {
  cd: number[]; // 0 = ready … 1 = just used
  active: MoveId | null;
  sunk: number;
  combo: number;
  locked: boolean;
  fps: number;
}
