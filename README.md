# Monkey D. Luffy — Gomu Gomu no Mi (FPV)

> **GUM-GUM FURY — Luffy First-Person Special Moves**

Trải nghiệm góc nhìn thứ nhất các tuyệt chiêu cao su của **Monkey D. Luffy** —
Vua Hải Tặc tương lai, người sở hữu **Gomu Gomu no Mi** (thực chất là **Hito Hito no Mi,
Mẫu: Nika**).

---

## Thông tin nhân vật

| | |
|---|---|
| **Nhân vật** | Monkey D. Luffy (モンキー・D・ルフィ) |
| **Biệt danh** | Mugiwara / Straw Hat — Vua Hải Tặc tương lai |
| **Trái Ác Quỷ** | Gomu Gomu no Mi → Hito Hito no Mi, Model: Nika (Nhân Nhân, Mẫu: Nika) |
| **Phe** | Straw Hat Pirates (thuyền trưởng) · Worst Generation · Tứ Hoàng |
| **Năng lực triển khai** | 6 tuyệt chiêu, bao gồm Gear 4 & Gear 5 (Nika) |

## Bộ chiêu thức & phím điều khiển

| Phím | Tuyệt chiêu | Nhật ngữ | Mô tả |
|---|---|---|---|
| `1` | Gomu Gomu no Pistol | ゴムゴムの銃 | Nắm đấm cao su bắn tới |
| `2` | Gomu Gomu no Jet Gatling | ゴムゴムの JET 銃乱打 | Mưa đấm tốc độ cao |
| `3` | Gomu Gomu no Bazooka | ゴムゴムの回転弾 | Song chưởng nén bắn |
| `4` | Gomu Gomu no Elephant Gun | ゴムゴムの象銃 | Cú đấm khổng lồ |
| `5` | Gear Fourth — Kong Gun | ギア４ 猿王銃 | Hoả lực Gear 4 |
| `6` | Gear 5 — Bajrang Gun | ギア５ 猿神銃 | Đòn kết liễu Nika |

## Điều khiển chung

- `Space` — nhảy
- `1 – 6` — ra chiêu theo bảng trên

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
├── App.tsx              # Khung React: overlay chiêu, reticle, chọn chiêu
├── main.tsx             # Entry point
├── index.css            # Tailwind 4 + design tokens
├── game/
│   ├── engine.ts        # Vòng lặp render, camera FPV, input
│   ├── moves.ts         # Định nghĩa & thực thi 6 tuyệt chiêu
│   ├── arm.ts           # Cánh tay cao su góc nhìn thứ nhất
│   ├── world.ts         # Dựng cảnh & địch
│   ├── effects.ts       # Hiệu ứng cao su, chấn động, Gear 5
│   ├── particles.ts     # Hệ hạt
│   ├── post.ts          # Hậu kỳ
│   └── audio.ts         # SFX tổng hợp WebAudio
└── utils/cn.ts          # Helper gộp className
```

## Công nghệ

React 19 · TypeScript 5.9 · Vite 7 · Three.js 0.187 · Tailwind CSS 4 · vite-plugin-singlefile
