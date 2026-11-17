# First-Person POV — One Piece Characters

Bộ sưu tập 7 ứng dụng web **góc nhìn thứ nhất (first-person POV)** mô phỏng tuyệt chiêu
của các nhân vật trong *One Piece*. Mỗi nhân vật là một dự án độc lập, hoàn chỉnh
(React 19 + TypeScript + Vite + Three.js) và **không dùng chung mã nguồn** với nhau.

> Mỗi nhân vật được phát triển trên **một nhánh Git riêng**, đặt tên theo tên nhân vật.

---

## Danh mục nhân vật

| # | Nhân vật | Nhánh | Năng lực | Số chiêu | Dung lượng |
|---|---|---|---|---|---|
| 1 | Boa Hancock | [`boa-hancock`](characters/boa-hancock) | Mero Mero no Mi | 5 | ~276 KB |
| 2 | Eustass "Captain" Kid | [`captain-kid`](characters/captain-kid) | Jiki Jiki no Mi | 6 | ~324 KB |
| 3 | Donquixote Doflamingo | [`doflamingo`](characters/doflamingo) | Ito Ito no Mi | 8 | ~312 KB |
| 4 | Imu | [`imu`](characters/imu) | Quyền năng Hư Vô | 5 | ~304 KB |
| 5 | Borsalino "Kizaru" | [`kizaru`](characters/kizaru) | Pika Pika no Mi | 5 | ~584 KB |
| 6 | Monkey D. Luffy | [`luffy`](characters/luffy) | Gomu Gomu no Mi | 6 | ~292 KB |
| 7 | Roronoa Zoro | [`zoro`](characters/zoro) | Santōryū (3 kiếm) | 6 | ~16 MB |

Tổng cộng **41 tuyệt chiêu** trên 7 ứng dụng.

---

## Cấu trúc kho lưu trữ

```
.
├── README.md                 # Bạn đang đọc — danh mục & hướng dẫn chung
├── characters/               # Danh mục dự án (trên nhánh main của bộ sưu tập)
│   ├── boa-hancock/          # ├─ mỗi thư mục = 1 dự án độc lập, tự chạy được
│   ├── captain-kid/
│   ├── doflamingo/
│   ├── imu/
│   ├── kizaru/
│   ├── luffy/
│   └── zoro/
└── .gitignore
```

Trên nhánh `main` mỗi nhánh nhân vật được **vendor** vào `characters/<tên>` để tra cứu
nhanh. Nguồn chính thức của từng nhân vật nằm ở **nhánh cùng tên**.

```bash
git branch -a                 # liệt kê toàn bộ nhánh nhân vật
git switch zoro               # xem nhánh nhân vật
git switch main               # quay lại danh mục
```

---

## Chạy một nhân vật

```bash
cd characters/<tên-nhân-vật>
npm install
npm run dev        # http://localhost:5173
```

Nếu chạy trên nhánh nhân vật (repo root chính là dự án):

```bash
git switch kizaru
npm install
npm run dev
```

### Scripts dùng chung

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | Dev server (Vite, HMR) |
| `npm run build` | Build production → `dist/` (một file HTML duy nhất nhờ `vite-plugin-singlefile`) |
| `npm run preview` | Xem trước bản build |
| `npm run typecheck` | Kiểm tra kiểu TypeScript (`tsc --noEmit`) |

---

## Điều khiển chung

Hầu hết dự án dùng cùng một hệ điều khiển:

| Phím | Tác dụng |
|---|---|
| `WASD` | Di chuyển |
| `Shift` | Chạy nhanh |
| `Space` | Nhảy / dịch chuyển |
| `1` – `8` | Kích hoạt tuyệt chiêu (số lượng tuỳ nhân vật) |
| Chuột trái / phải | Đòn cơ bản (Boa Hancock, Kizaru) |
| `ESC` | Giải phóng chuột / tạm dừng |

Chi tiết từng nhân vật xem trong `characters/<tên>/README.md`.

---

## Đặc điểm kỹ thuật chung

- **Không có asset 3D bên ngoài** — toàn bộ mô hình, texture và âm thanh được **sinh
  bằng code** (canvas texture, WebAudio tổng hợp), nên repo nhẹ và chạy offline.
  Ngoại lệ: Kizaru dùng normal map `waternormals.jpg` cho mặt biển, Zoro dùng 4 artwork
  trong `public/images/`.
- **Một file build duy nhất** — `vite-plugin-singlefile` nhúng toàn bộ JS/CSS vào
  `dist/index.html`, tiện chia sẻ và nhúng iframe.
- **Vòng lặp game thuần Three.js** (không dùng R3F) để kiểm soát hiệu năng & hậu kỳ.
- **Giao diện tiếng Việt** + nhật ngữ cho tên chiêu thức, font Google Fonts.

## Yêu cầu hệ thống

- Node.js ≥ 20 (khuyến nghị 22)
- Trình duyệt hỗ trợ WebGL2 (Chrome / Edge / Firefox / Safari bản mới)

## Ghi chú bản quyền

Đây là dự án **fan-made phi thương mại**, lấy cảm hứng từ *One Piece* của Eiichiro Oda.
Nhân vật và tên chiêu thức thuộc bản quyền của tác giả và nhà xuất bản.
