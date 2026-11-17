# Danh mục dự án nhân vật

Mỗi thư mục con là một ứng dụng **first-person POV** độc lập, tự chứa (self-contained):
có `package.json`, `index.html`, `vite.config.ts` và `src/` riêng.

| Thư mục | Nhân vật | Năng lực | Nhật ngữ | Số chiêu | Có asset ngoài |
|---|---|---|---|---|---|
| `boa-hancock/` | Boa Hancock | Mero Mero no Mi | メロメロの実 | 5 | — |
| `captain-kid/` | Eustass "Captain" Kid | Jiki Jiki no Mi | 磁気の実 | 6 | — |
| `doflamingo/` | Donquixote Doflamingo | Ito Ito no Mi | 糸糸の実 | 8 | — |
| `imu/` | Imu | Quyền năng Hư Vô | 無 | 5 | — |
| `kizaru/` | Borsalino "Kizaru" | Pika Pika no Mi | ピカピカの実 | 5 | `src/assets/waternormals.jpg` |
| `luffy/` | Monkey D. Luffy | Gomu Gomu no Mi | ゴムゴムの実 | 6 | — |
| `zoro/` | Roronoa Zoro | Santōryū | 三刀流 | 6 | `public/images/*` (4 file) |

## Chạy nhanh

```bash
cd <thư-mục>
npm install && npm run dev
```

## Quy ước

- **Tên thư mục = tên nhân vật** (kebab-case), trùng với tên nhánh Git của nhân vật đó.
- Mỗi dự án giữ **nguyên vẹn cấu trúc gốc** từ bản phát hành; chỉ thay đổi duy nhất là
  trường `name` trong `package.json` (`onepiece-fpv-<tên>`) và bổ sung script `typecheck`.
- Không có thư mục dùng chung: các dự án **cố tình độc lập** để có thể tách/nhân bản
  từng nhân vật mà không ảnh hưởng lẫn nhau.

## Quan hệ với các nhánh

Thư mục ở đây là **bản vendor để tra cứu**. Bản chính thức của mỗi nhân vật là nhánh Git
cùng tên, nơi dự án nằm ở thư mục gốc:

```bash
git switch kizaru && npm install && npm run dev
```

Hai bên luôn đồng bộ nội dung — được kiểm bằng `git diff --quiet characters/<tên> <nhánh>`.
Khi cập nhật, sửa trên nhánh nhân vật rồi chạy lại `./scripts/import_characters.sh`
hoặc `./scripts/publish_branch.sh` để đồng bộ ngược lại.
