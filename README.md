# Imu — Hư Vô Chi Vương (FPV)

> **IMU · Hư Vô Chi Vương — Trải nghiệm tuyệt chiêu góc nhìn thứ nhất**

Trải nghiệm góc nhìn thứ nhất quyền năng của **Imu** — Nhân vật bí ẩn đứng đầu
Chính quyền Thế giới, kẻ ngự trên Ngai Sắt Trống (Empty Throne).

---

## Thông tin nhân vật

| | |
|---|---|
| **Nhân vật** | Imu (イム) — Nerona Imu |
| **Danh hiệu** | Hư Vô Chi Vương / King of the Void |
| **Năng lực** | Quyền năng tối thượng của Chính quyền Thế giới — Hắc Viêm, Thiên Phạt, Vực Thẳm |
| **Phe** | Chính quyền Thế giới (World Government) — Ngũ Lão Tinh phục tùng |
| **Bối cảnh** | Mary Geoise · Ngai Sắt Trống |

## Bộ chiêu thức & phím điều khiển

| Phím | Tuyệt chiêu | Nhật ngữ | Mô tả |
|---|---|---|---|
| `1` | Hắc Viêm | 黒炎 | Ngọn lửa đen thiêu rụi |
| `2` | Thiên Phạt | 天罰 | Trừng phạt từ thiên đình giáng xuống |
| `3` | Khế Ước Vực Thẳm | 深淵 | Vực thẳm nuốt chửng kẻ phạm thượng |
| `4` | Bá Vương Khí | 覇王色 | Haoshoku Haki tối thượng |
| `5` | Hư Vô Chi Vương | 無 | Chuỗi liên hoàn tuyệt chiêu (chain) |

## Điều khiển chung

- `Space` — nhảy
- `1 – 5` — ra chiêu theo bảng trên
- Yêu cầu trình duyệt hỗ trợ WebGL tốt (khuyến nghị Chrome / Edge bản mới)

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
├── App.tsx              # Khung React: casting bar, slot chiêu, mute
├── main.tsx             # Entry point
├── index.css            # Tailwind 4 + design tokens
├── engine/
│   ├── engine.ts        # Vòng lặp render, camera FPV, input
│   ├── moves.ts         # MOVES + CHAIN — định nghĩa & thực thi chiêu
│   ├── world.ts         # Dựng cảnh Mary Geoise / Ngai Sắt Trống
│   ├── actors.ts        # Nhân vật phụ, Ngũ Lão Tinh
│   ├── hands.ts         # Đôi tay góc nhìn thứ nhất
│   ├── fxlib.ts         # Thư viện hiệu ứng dùng chung
│   ├── particles.ts     # Hệ hạt
│   ├── post.ts          # Hậu kỳ
│   ├── textures.ts      # Sinh texture bằng canvas
│   ├── audio.ts         # SFX tổng hợp WebAudio
│   └── util.ts          # Tiện ích toán học
└── utils/cn.ts          # Helper gộp className
```

## Công nghệ

React 19 · TypeScript 5.9 · Vite 7 · Three.js 0.187 · Tailwind CSS 4 · vite-plugin-singlefile
