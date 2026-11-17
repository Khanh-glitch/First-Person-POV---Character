# Kizaru — Pika Pika no Mi (FPV)

> **KIZARU 黄猿 — Ánh Sáng Tối Thượng | Trải nghiệm góc nhìn thứ nhất**

Trải nghiệm góc nhìn thứ nhất tốc độ ánh sáng của **Borsalino "Kizaru"** —
Đô đốc Hải quân, người sở hữu **Pika Pika no Mi** (Trái Ánh Sáng).

---

## Thông tin nhân vật

| | |
|---|---|
| **Nhân vật** | Borsalino "Kizaru" (ボルサリーノ / 黄猿 — Hoàng Viên) |
| **Chức vụ** | Đô đốc Hải quân (Marine Admiral) |
| **Trái Ác Quỷ** | Pika Pika no Mi (ピカピカの実) — Ánh sáng, tốc độ & laser |
| **Phe** | Hải quân (Marine Headquarters) |
| **Năng lực triển khai** | 5 tuyệt chiêu lấy cảm hứng từ thần thoại Nhật Bản |

## Bộ chiêu thức & phím điều khiển

| Phím | Tuyệt chiêu | Nhật ngữ | Mô tả |
|---|---|---|---|
| `1` (giữ chuột trái) | Yasakani no Magatama | 八尺瓊曲玉 | Mưa đạn ánh sáng từ đầu ngón tay |
| `2` (chuột phải) | Ama no Murakumo | 天叢雲劍 | Kiếm ánh sáng — chém chữ X |
| `3` (`SPACE`) | Yata no Kagami | 八咫鏡 | Phản chiếu ánh sáng — cước tốc độ ánh sáng |
| `4` | Amaterasu | 天照 | Chớp sáng mù loà — mưa cột sáng phán xét |
| `5` | Ama no Iwato | 天岩戸 | Laser tối thượng — xoá sổ cả hạm đội |

## Điều khiển chung

- `Shift` — tăng tốc
- `Space` — Yata no Kagami (dịch chuyển ánh sáng)
- `1 – 5` — ra chiêu theo bảng trên

## Chạy dự án

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build 1 file duy nhất -> dist/
npm run typecheck  # tsc --noEmit
```

## Cấu trúc mã nguồn

```
src/
├── App.tsx                 # Khung React: loading → intro → play, HUD
├── main.tsx                # Entry point
├── index.css               # Tailwind 4 + design tokens
├── vite-env.d.ts           # Khai báo kiểu asset (?inline)
├── assets/
│   └── waternormals.jpg    # Normal map cho mặt biển (import ?inline)
├── components/
│   ├── Hud.tsx             # HUD cooldown, combo, FPS
│   └── Intro.tsx           # Màn hình giới thiệu
├── game/
│   ├── engine.ts           # Vòng lặp render, camera FPV, input
│   ├── moveData.ts         # Metadata 5 tuyệt chiêu (kanji/romaji/quote)
│   ├── moves.ts            # Thực thi hiệu ứng từng tuyệt chiêu
│   ├── world.ts            # Mặt biển, bầu trời, hạm đội
│   ├── ships.ts            # Tàu chiến Hải quân
│   ├── hands.ts            # Đôi tay góc nhìn thứ nhất
│   ├── fx.ts               # Hiệu ứng (tia laser, chớp, nổ)
│   ├── gfx.ts              # Tiện ích đồ hoạ dùng chung
│   ├── post.ts             # Hậu kỳ (bloom, god rays)
│   ├── audio.ts            # SFX tổng hợp WebAudio
│   └── util.ts             # Tiện ích toán học
└── utils/cn.ts             # Helper gộp className
```

## Công nghệ

React 19 · TypeScript 5.9 · Vite 7 · Three.js 0.187 · Tailwind CSS 4 · vite-plugin-singlefile
