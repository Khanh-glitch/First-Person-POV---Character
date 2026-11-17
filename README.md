# Eustass "Captain" Kid — Jiki Jiki no Mi (FPV)

> **Captain Kid — Jiki Jiki FPV · 磁気**

Trải nghiệm góc nhìn thứ nhất các tuyệt chiêu từ tính của **Eustass "Captain" Kid** —
thuyền trưởng Kid Pirates, người sở hữu **Jiki Jiki no Mi** (Trái Từ Tính).

---

## Thông tin nhân vật

| | |
|---|---|
| **Nhân vật** | Eustass "Captain" Kid (ユースタス・"キャプテン"・キッド) |
| **Biệt danh** | Captain Kid |
| **Trái Ác Quỷ** | Jiki Jiki no Mi (磁気の実) — Điều khiển từ trường, hút/kết kim loại |
| **Phe** | Kid Pirates (thuyền trưởng) · Worst Generation |
| **Năng lực triển khai** | Repel · Punk Gibson · Punk Vise · Punk Corna Dio · Assign · Damned Punk |

## Bộ chiêu thức & phím điều khiển

| Phím | Tuyệt chiêu | Nhật ngữ | Mô tả |
|---|---|---|---|
| `1` | Repel | 反発 | Sóng xung kích từ trường đẩy lùi |
| `2` | Punk Gibson | 磁気弦 | Cánh tay sắt vụn khổng lồ đập xuống |
| `3` | Punk Vise | 磁気万力 | Gọng kìm từ tính kẹp địch |
| `4` | Punk Corna Dio | 磁気大魔牛 | Đại ma ngưu từ tính húc thẳng |
| `5` | Assign · Punk Clash | 付与・磁気激突 | Thức tỉnh — gán cực từ rồi va chạm |
| `6` | Damned Punk | 電磁砲 | Pháo điện từ tối thượng |

## Điều khiển chung

- `Space` — nhảy
- `1 – 6` — ra chiêu theo bảng trên
- `?demo` trên URL — chế độ auto-demo (bỏ qua màn hình Intro)

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
├── App.tsx              # Khung React: Intro, HUD, cooldown, damage pop
├── main.tsx             # Entry point
├── index.css            # Tailwind 4 + design tokens
├── components/
│   └── HUD.tsx          # HUD + màn hình Intro
├── game/
│   ├── Engine.ts        # Vòng lặp render, camera FPV, input
│   ├── Moves.ts         # Định nghĩa & thực thi 6 tuyệt chiêu
│   ├── Arms.ts          # Cánh tay từ tính góc nhìn thứ nhất
│   ├── Scrap.ts         # Mảnh kim loại/sắt vụn bay theo từ trường
│   ├── Environment.ts   # Dựng cảnh & ánh sáng
│   ├── FX.ts            # Hiệu ứng (tia lửa, xung điện, nổ)
│   ├── PostFX.ts        # Hậu kỳ (bloom, chromatic aberration)
│   ├── Audio.ts         # SFX tổng hợp WebAudio
│   └── util.ts          # Tiện ích toán học
└── utils/cn.ts          # Helper gộp className
```

## Công nghệ

React 19 · TypeScript 5.9 · Vite 7 · Three.js 0.187 · Tailwind CSS 4 · vite-plugin-singlefile
