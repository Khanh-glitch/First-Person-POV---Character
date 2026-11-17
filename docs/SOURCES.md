# Nhật ký nhập liệu nguồn (Source manifest)

Ghi lại việc giải nén 7 gói ZIP từ Google Drive vào kho lưu trữ, để truy vết
(file nào → nhân vật nào → nhánh nào).

## Nguồn

- **Thư mục Drive:** `1MXy733rB6itAPks_Q2mqgcH0oZYR6cfl`
- **Số gói:** 7 file `.zip`, mỗi gói là một source code độc lập
- **Ngày nhập:** 2026-11-17

## Ánh xạ gói ZIP → nhân vật → nhánh

| # | File ZIP gốc | MD5 | Kích thước | Nhân vật (theo nội dung file) | Nhánh | Thư mục |
|---|---|---|---|---|---|---|
| 1 | `boa-hancock-aaa-special-effects (1).zip` | `bed7efaf…` | 227 KB | Boa Hancock | `boa-hancock` | `characters/boa-hancock` |
| 2 | `captain-kid-fpp-motion-effects (1).zip` | `5db51558…` | 268 KB | Eustass "Captain" Kid | `captain-kid` | `characters/captain-kid` |
| 3 | `doflamingo-special-move-effects (3).zip` | `55ab6e5e…` | 261 KB | Donquixote Doflamingo | `doflamingo` | `characters/doflamingo` |
| 4 | `imu-first-person-motion.zip` | `424bff53…` | 249 KB | Imu | `imu` | `characters/imu` |
| 5 | `kizaru-first-person-motion (2).zip` | `72b4b91f…` | 519 KB | Borsalino "Kizaru" | `kizaru` | `characters/kizaru` |
| 6 | `luffy-first-person-motion-effects.zip` | `8230ae45…` | 239 KB | Monkey D. Luffy | `luffy` | `characters/luffy` |
| 7 | `zoro-special-move-motion-effect (2).zip` | `8c4e607e…` | 15.7 MB | Roronoa Zoro | `zoro` | `characters/zoro` |

## Cách xác định tên nhân vật

Tên nhân vật được đọc **từ nội dung bên trong gói**, không chỉ từ tên ZIP:

1. `<title>` trong `index.html` — vd. `三刀流 • RORONOA ZORO — Góc Nhìn Thứ Nhất`
2. Metadata chiêu thức trong `src/**` — vd. `romaji: 'RENGOKU ONI GIRI'`, `kanji: '三刀流'`
3. Tên Trái Ác Quỷ / phong cách chiến đấu — vd. `Mero Mero`, `Jiki Jiki`, `Ito Ito`, `Pika Pika`

Cả 7 gói cho kết quả **duy nhất, không trùng lặp** → không cần hậu tố `v2`.
(Quy ước nếu có trùng: gói đầu tiên giữ `<tên>`, các gói sau thành `<tên>-v2`, `<tên>-v3`…)

## Thay đổi so với bản gốc

Mỗi dự án được giữ **nguyên vẹn mã nguồn**. Chỉ có:

1. `package.json` → `name` đổi thành `onepiece-fpv-<tên>`; thêm script `typecheck`.
2. Thêm `README.md` mô tả nhân vật, chiêu thức, cấu trúc mã nguồn.

Không sửa file `.ts`/`.tsx`/`.css`/`.html` nào.

## Kiểm chứng

Toàn bộ 7 dự án đã được cài đặt, typecheck và build thành công:

| Nhân vật | `tsc --noEmit` | `npm run build` | Bundle (`dist/index.html`) |
|---|---|---|---|
| boa-hancock | ✅ 0 lỗi | ✅ | 923 KB |
| captain-kid | ✅ 0 lỗi | ✅ | 915 KB |
| doflamingo | ✅ 0 lỗi | ✅ | 941 KB |
| imu | ✅ 0 lỗi | ✅ | 872 KB |
| kizaru | ✅ 0 lỗi | ✅ | 1 239 KB |
| luffy | ✅ 0 lỗi | ✅ | 869 KB |
| zoro | ✅ 0 lỗi | ✅ | 933 KB |

Gallery (`scripts/build_gallery.sh`) đã được phục vụ thử: 8 URL (trang chủ + 7 app)
+ artwork Zoro đều trả về HTTP 200.

## Lịch sử Git

Mỗi nhánh nhân vật là **một commit duy nhất có cha là `4a3a8e0` (main)**, chứa đúng
cây thư mục của dự án đó ở gốc (không kèm `characters/`, `docs/`, `scripts/`).
Cây thư mục của mỗi nhánh đã được đối chiếu khớp tuyệt đối với
`characters/<tên>` trên nhánh danh mục (`git diff --quiet` → không khác biệt).
