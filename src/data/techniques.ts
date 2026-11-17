export type TechniqueId =
  | 'rengoku_onigiri'
  | 'shishi_sonson'
  | 'sanzen_sekai'
  | 'tatsumaki'
  | 'ashura_bakkei'
  | 'hiryu_jigoku';

export interface TechniqueSpec {
  id: TechniqueId;
  key: string;
  styleKanji: string;
  styleRomaji: string;
  kanji: string;
  romaji: string;
  viName: string;
  shortName: string;
  duration: number;
  primaryHex: string;
  secondaryHex: string;
  coreHex: string;
  lightningHex: string;
  accentCss: string;
  glowRgba: string;
  useEyeCutIn: boolean;
  damageMultiplier: number;
  phases: {
    stanceLabel: string;
    releaseLabel: string;
    finishLabel: string;
  };
}

export const TECHNIQUES: TechniqueSpec[] = [
  {
    id: 'rengoku_onigiri',
    key: '1',
    styleKanji: '三刀流',
    styleRomaji: 'SANTŌRYŪ',
    kanji: '煉獄鬼斬り',
    romaji: 'RENGOKU ONI GIRI',
    viName: 'Luyện Ngục Quỷ Trảm',
    shortName: 'Rengoku Oni Giri',
    duration: 3.15,
    primaryHex: '#10ff96',
    secondaryHex: '#9333ea',
    coreHex: '#f0fff8',
    lightningHex: '#ff1e4d',
    accentCss: '#10b981',
    glowRgba: 'rgba(16, 255, 150, 0.55)',
    useEyeCutIn: true,
    damageMultiplier: 3,
    phases: {
      stanceLabel: 'TỤ KHÍ LUYỆN NGỤC',
      releaseLabel: 'TAM ĐAO QUỶ TRẢM',
      finishLabel: 'ĐỊA NGỤC BẠO PHÁ',
    },
  },
  {
    id: 'shishi_sonson',
    key: '2',
    styleKanji: '一刀流居合',
    styleRomaji: 'ITTŌRYŪ IAI',
    kanji: '死・獅子歌歌',
    romaji: 'SHI SHISHI SONSON',
    viName: 'Tử Sư Tử Ca Ca',
    shortName: 'Shi Shishi Sonson',
    duration: 3.55,
    primaryHex: '#38bdf8',
    secondaryHex: '#818cf8',
    coreHex: '#ffffff',
    lightningHex: '#e0f2fe',
    accentCss: '#38bdf8',
    glowRgba: 'rgba(56, 189, 248, 0.6)',
    useEyeCutIn: false,
    damageMultiplier: 1,
    phases: {
      stanceLabel: 'HƠI THỞ VẠN VẬT',
      releaseLabel: 'NHẤT THIỂM BẠT KIẾM',
      finishLabel: 'NẠP ĐAO • KACHIN!',
    },
  },
  {
    id: 'sanzen_sekai',
    key: '3',
    styleKanji: '三刀流奥義',
    styleRomaji: 'SANTŌRYŪ ŌGI',
    kanji: '一大・三千・大千・世界',
    romaji: 'ICHIDAI SANZEN DAISEN SEKAI',
    viName: 'Nhất Đại Tam Thiên Đại Thiên Thế Giới',
    shortName: 'Sanzen Sekai',
    duration: 3.85,
    primaryHex: '#22ffb2',
    secondaryHex: '#facc15',
    coreHex: '#ffffff',
    lightningHex: '#a855f7',
    accentCss: '#eab308',
    glowRgba: 'rgba(250, 204, 21, 0.55)',
    useEyeCutIn: true,
    damageMultiplier: 6,
    phases: {
      stanceLabel: 'SONG LUÂN HẮC ĐAO',
      releaseLabel: 'ĐẠI THIÊN THẾ GIỚI TRẢM',
      finishLabel: 'THIÊN ĐỊA PHÂN LIỆT',
    },
  },
  {
    id: 'tatsumaki',
    key: '4',
    styleKanji: '三刀流',
    styleRomaji: 'SANTŌRYŪ',
    kanji: '黒縄・大龍巻',
    romaji: 'KOKUJŌ Ō TATSU MAKI',
    viName: 'Hắc Thằng Đại Long Quyển',
    shortName: 'Ō Tatsu Maki',
    duration: 4.15,
    primaryHex: '#00f5a0',
    secondaryHex: '#f43f5e',
    coreHex: '#ecfeff',
    lightningHex: '#fb7185',
    accentCss: '#f43f5e',
    glowRgba: 'rgba(244, 63, 94, 0.55)',
    useEyeCutIn: false,
    damageMultiplier: 12,
    phases: {
      stanceLabel: 'NGHỊCH LÂN TỤ PHONG',
      releaseLabel: 'HẮC THẰNG LONG QUYỂN',
      finishLabel: 'VÔ TẬN PHONG NHẪN',
    },
  },
  {
    id: 'ashura_bakkei',
    key: '5',
    styleKanji: '鬼気九刀流',
    styleRomaji: 'KIKI KYŪTŌRYŪ',
    kanji: '阿修羅抜剣・亡者戯',
    romaji: 'ASHURA BAKKEI: MŌJA NO TAWAMURE',
    viName: 'A Tu La Bạt Kiếm: Vọng Giả Hí',
    shortName: 'Ashura Bakkei',
    duration: 4.65,
    primaryHex: '#ff2a55',
    secondaryHex: '#ffb703',
    coreHex: '#fff7ed',
    lightningHex: '#ff0a3c',
    accentCss: '#ff2a55',
    glowRgba: 'rgba(255, 42, 85, 0.65)',
    useEyeCutIn: true,
    damageMultiplier: 9,
    phases: {
      stanceLabel: 'QUỶ KHÍ CỬU KIẾM HIỆN THÂN',
      releaseLabel: 'CỬU ĐAO LIÊN TRẢM BÁ VƯƠNG',
      finishLabel: 'VỌNG GIẢ HÍ TUYỆT SÁT',
    },
  },
  {
    id: 'hiryu_jigoku',
    key: '6',
    styleKanji: '閻王三刀流',
    styleRomaji: 'EN-Ō SANTŌRYŪ',
    kanji: '一百三情飛龍侍極',
    romaji: 'IPPYAKUSANJŌ HIRYŪ JIGOKU',
    viName: 'Nhất Bách Tam Tình Phi Long Thị Cực',
    shortName: 'Hiryū Jigoku',
    duration: 5.15,
    primaryHex: '#00ff88',
    secondaryHex: '#fde047',
    coreHex: '#ffffff',
    lightningHex: '#ff1744',
    accentCss: '#00ff88',
    glowRgba: 'rgba(0, 255, 136, 0.72)',
    useEyeCutIn: true,
    damageMultiplier: 103,
    phases: {
      stanceLabel: 'DIÊM VƯƠNG ĐẠP KHÔNG',
      releaseLabel: 'BÁ VƯƠNG PHI LONG TRẢM',
      finishLabel: 'ĐỊA NGỤC CHI VƯƠNG',
    },
  },
];

export const TECHNIQUE_MAP: Record<TechniqueId, TechniqueSpec> = TECHNIQUES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<TechniqueId, TechniqueSpec>
);
