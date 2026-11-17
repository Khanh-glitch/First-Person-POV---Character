# Roronoa Zoro — Santōryū / Sakuga POV (FPV)

> **三刀流 • RORONOA ZORO — Góc Nhìn Thứ Nhất (Santōryū Sakuga POV)**

Trải nghiệm góc nhìn thứ nhất phong cách "sakuga" các tuyệt kỹ Tam Đao Lưu của
**Roronoa Zoro** — Thợ Săn Hải Tặc, cánh tay phải của Vua Hải Tặc.

---

## Thông tin nhân vật

| | |
|---|---|
| **Nhân vật** | Roronoa Zoro (ロロノア・ゾロ) |
| **Biệt danh** | 海賊狩り — Thợ Săn Hải Tặc / Pirate Hunter |
| **Vũ khí** | Sandai Kitetsu · Wado Ichimonji · Enma (3 thanh katana) |
| **Phe** | Straw Hat Pirates (kiếm sĩ) · Worst Generation |
| **Bối cảnh** | Onigashima — trận chiến trên không |
| **Năng lực triển khai** | 6 tuyệt kỹ Santōryū, gồm Ashura & King of Hell (Hiryū) |

## Bộ chiêu thức & phím điều khiển

| Phím | Tuyệt kỹ | Nhật ngữ | Mô tả |
|---|---|---|---|
| `1` | Rengoku Oni Giri | 煉獄鬼斬り | Tam đao chém chữ thập rực lửa |
| `2` | Shi Shishi Sonson | 死・獅子歌歌 | Nhất đao siêu tốc |
| `3` | Ichidai Sanzen Daisen Sekai | 一大・三千・大千・世界 | Càn quét toàn diện |
| `4` | Kokujō Ō Tatsumaki | 黒縄・大龍巻 | Long quyển đen |
| `5` | Ashura Bakkei: Mōja no Tawamure | 阿修羅抜剣・亡者戯 | Ashura — phân thân chiến đấu |
| `6` | Ippyakusanjō Hiryū Jigoku | 一百三情飛龍侍極 | Đòn kết liễu — Phi Long |

## Điều khiển chung

- `Space` — nhảy
- `1 – 6` — ra chiêu theo bảng trên
- Toggle Cut-in / Chế độ xem Sakuga trên HUD
- `ESC` — đóng overlay / thoát chế độ cut-in

## Tài nguyên hình ảnh

Thư mục `public/images/` chứa artwork dùng cho cut-in & bầu trời:

| File | Dùng cho |
|---|---|
| `zoro-eye-cutin.png` | Cut-in mắt Zoro trong `SakugaOverlay` |
| `onigashima-sky.jpg` | Skybox cảnh Onigashima (`arenaBuilder`) |
| `ashura-spirit.png` | Hiệu ứng Ashura (`vfxSystem`) |
| `hiryu-dragon.png` | Rồng bay trong đòn Hiryū (`vfxSystem`) |

> Lưu ý: `public/images/` ~16 MB — đây là dự án nặng nhất trong bộ sưu tập.

## Chạy dự án

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build 1 file duy nhất -> dist/
npm run typecheck  # tsc --noEmit
```

## Cấu trúc mã nguồn

```
public/
└── images/                  # Artwork cut-in & texture cảnh
src/
├── App.tsx                  # Khung React: HUD, chọn chiêu, điều khiển overlay
├── main.tsx                 # Entry point
├── index.css                # Tailwind 4 + design tokens
├── data/
│   └── techniques.ts        # Metadata 6 tuyệt kỹ (kanji/romaji/màu)
├── audio/
│   └── sakugaAudio.ts       # SFX tổng hợp WebAudio
├── components/
│   └── SakugaOverlay.tsx    # Cut-in, calligraphy, swipe vector
├── engine/
│   ├── zoroEngine.ts        # Engine chính (~75 KB logic gameplay)
│   ├── firstPersonRig.ts    # Rig 3 kiếm + tay góc nhìn thứ nhất
│   ├── vfxSystem.ts         # Hệ VFX (Ashura, Hiryū, lửa, khói)
│   ├── arenaBuilder.ts      # Dựng đấu trường Onigashima
│   └── shaders.ts           # Shader tuỳ biến (GLSL)
└── utils/cn.ts              # Helper gộp className
```

## Công nghệ

React 19 · TypeScript 5.9 · Vite 7 · Three.js 0.187 · Tailwind CSS 4 ·
lucide-react 1.73 · vite-plugin-singlefile
