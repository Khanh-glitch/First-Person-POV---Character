# Boa Hancock — Mero Mero no Mi (FPV)

> **Nữ Đế Hải Tặc — Mero Mero: First-Person Boa Hancock Experience**

Trải nghiệm góc nhìn thứ nhất (first-person POV) các tuyệt chiêu của Boa Hancock —
Nữ hoàng đảo Amazon Lily, người sở hữu **Mero Mero no Mi** (Trái Ác Quỷ Hoá Đá).

---

## Thông tin nhân vật

| | |
|---|---|
| **Nhân vật** | Boa Hancock (ボア・ハンコック) |
| **Biệt danh** | Nữ Đế Hải Tặc / Pirate Empress |
| **Trái Ác Quỷ** | Mero Mero no Mi (メロメロの実) — Hoá đá mọi kẻ si mê |
| **Phe** | Shichibukai (cựu) / Kuja Pirates |
| **Năng lực triển khai** | Pistol Kiss · Slave Arrow · Mero Mero Mellow · Perfume Femur · Haoshoku Haki |

## Bộ chiêu thức & phím điều khiển

| Phím | Tuyệt chiêu | Nhật ngữ | Mô tả |
|---|---|---|---|
| `LMB` (chuột trái) | Pistol Kiss | ピストルキス | Hôn gió hoá đá tầm gần |
| `RMB` (chuột phải) | Slave Arrow | 虜の矢 | Cung tên hoá đá, sạc rồi nhả |
| `Q` | Mero Mero Mellow | メロメロ甘風 | Luồng sóng mê hoặc diện rộng |
| `E` | Perfume Femur | 芳香脚 | Cước hoá đá |
| `R` | Haoshoku Haki | 覇王色 | Bá vương sắc chấn nhiếp |

## Điều khiển chung

- `WASD` — di chuyển
- `Shift` — chạy nhanh
- `Space` — nhảy
- `ESC` — giải phóng chuột / tạm dừng

## Chạy dự án

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build 1 file duy nhất (vite-plugin-singlefile) -> dist/
npm run typecheck  # tsc --noEmit
```

## Cấu trúc mã nguồn

```
src/
├── App.tsx              # Khung React: menu → chơi → kết thúc, HUD, callout
├── main.tsx             # Entry point
├── index.css            # Tailwind 4 + design tokens
├── game/
│   ├── Game.ts          # Vòng lặp game, state máy trạng thái, kỹ năng
│   ├── enemy.ts         # Kẻ địch, AI, va chạm
│   ├── env.ts           # Dựng cảnh Amazon Lily (địa hình, ánh sáng)
│   ├── viewmodel.ts     # Mô hình tay/nhân vật góc nhìn thứ nhất
│   ├── particles.ts     # Hệ hạt (hoa hồng, đá, khói)
│   ├── post.ts          # Hậu kỳ (bloom, vignette)
│   ├── textures.ts      # Sinh texture bằng canvas
│   └── audio.ts         # SFX/BGM tổng hợp bằng WebAudio
├── ui/icons.tsx         # Bộ icon SVG + emblem
└── utils/cn.ts          # Helper gộp className (clsx + tailwind-merge)
```

## Công nghệ

React 19 · TypeScript 5.9 · Vite 7 · Three.js 0.187 · Tailwind CSS 4 · vite-plugin-singlefile
