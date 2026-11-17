# Donquixote Doflamingo — Ito Ito no Mi (FPV)

> **天夜叉 · Doflamingo — Ito Ito no Mi First-Person**

Trải nghiệm góc nhìn thứ nhất các tuyệt chiêu sợi chỉ của **Donquixote Doflamingo** —
Thiên Dạ Xoa, cựu Shichibukai, người sở hữu **Ito Ito no Mi** (Trái Sợi Chỉ).

---

## Thông tin nhân vật

| | |
|---|---|
| **Nhân vật** | Donquixote Doflamingo (ドンキホーテ・ドフラミンゴ) |
| **Biệt danh** | 天夜叉 — Thiên Dạ Xoa / Joker |
| **Trái Ác Quỷ** | Ito Ito no Mi (糸糸の実) — Điều khiển sợi chỉ, đã thức tỉnh |
| **Phe** | Donquixote Pirates (thuyền trưởng) / Dressrosa (cựu vương) |
| **Năng lực triển khai** | 8 tuyệt chiêu: từ đòn cơ bản đến Torikago & Awakening |

## Bộ chiêu thức & phím điều khiển

| Phím | Tuyệt chiêu | Nhật ngữ | Mô tả |
|---|---|---|---|
| `1` | Tamaito — Bullet String | 弾糸 | Sợi chỉ bắn như đạn từ đầu ngón tay |
| `2` | Overheat | 超過鞭糸 | Roi chỉ nung đỏ quét ngang thành phố |
| `3` | Goshikito — Five-Colored String | 五色糸 | Năm sợi chỉ ngũ sắc xé toạc mặt đất |
| `4` | Parasite | 寄生糸 | Điều khiển cơ thể kẻ địch như con rối |
| `5` | Fulbright | 降無頼糸 | Mưa chỉ trút xuống từ tầng mây |
| `6` | Torikago — Birdcage | 鳥カゴ | Lồng chim khổng lồ nhốt trọn hòn đảo |
| `7` | Kamichūsatsu — God Thread | 神誅殺 | Mũi giáo chỉ xoắn — đòn kết liễu |
| `8` | Nami Shiraito — Awakening | 覚醒・波白糸 | Thức tỉnh — mặt đất hoá chỉ, sóng thần trắng |

## Điều khiển chung

- `Space` — nhảy
- `1 – 8` — ra chiêu theo bảng trên

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
├── App.tsx              # Khung React: title card, callout SFX, HUD
├── main.tsx             # Entry point
├── index.css            # Tailwind 4 + design tokens
├── engine/
│   ├── Engine.ts        # Vòng lặp render, camera, input, registry chiêu
│   ├── World.ts         # Dựng cảnh Dressrosa
│   ├── Hands.ts         # Đôi tay điều khiển sợi chỉ (FPV rig)
│   ├── Post.ts          # Hậu kỳ
│   ├── Audio.ts         # SFX tổng hợp WebAudio
│   ├── fx/              # Hiệu ứng: Effects, Particles, Strings
│   └── moves/
│       ├── base.ts      # Interface MoveDef + MOVE_LIST + class Move
│       ├── basic.ts     # 4 đòn cơ bản
│       ├── ultimate.ts  # 4 tuyệt chiêu / thức tỉnh
│       └── index.ts     # Registry createMove()
└── utils/cn.ts          # Helper gộp className
```

## Công nghệ

React 19 · TypeScript 5.9 · Vite 7 · Three.js 0.187 · Tailwind CSS 4 · vite-plugin-singlefile
